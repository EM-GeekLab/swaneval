import json
import tempfile
import unittest

from app.services.evalscope_result_ingestor import (
    _dedupe_rows,
    _extract_float,
    _extract_int,
    _extract_sample_from_row,
    _extract_text,
    _row_richness,
    _walk_dict_nodes,
    ingest_evalscope_results,
)
from app.services.storage.local import LocalFileStorage


class TestEvalscopeResultIngestor(unittest.IsolatedAsyncioTestCase):
    def test_extract_helpers_cover_variants(self):
        row = {
            "messages": [{"role": "user", "content": "from-messages"}],
            "score": "0.75",
            "tokens_generated": "12",
        }
        self.assertEqual(_extract_text(row, ("prompt",)), "from-messages")
        self.assertAlmostEqual(_extract_float(row, ("score",)), 0.75)
        self.assertEqual(_extract_int(row, ("tokens_generated",)), 12)
        self.assertIsNone(_extract_float({"score": "x"}, ("score",)))
        self.assertEqual(_extract_text({"prompt": 42}, ("prompt",)), "42")
        self.assertEqual(
            _extract_text({"messages": [123, {"content": "ok"}]}, ("prompt",)), "ok"
        )

    def test_extract_sample_from_row_with_output_fallback(self):
        row = {
            "query": "What is 2+2?",
            "response": "4",
            "output": "4",
            "latency_ms": "12.5",
            "first_token_ms": 5,
            "completion_tokens": 7,
        }
        sample = _extract_sample_from_row(row)
        self.assertIsNotNone(sample)
        assert sample is not None
        self.assertEqual(sample["prompt_text"], "What is 2+2?")
        self.assertEqual(sample["expected_output"], "4")
        self.assertEqual(sample["model_output"], "4")
        self.assertIsNone(sample["score"])  # no score key → None (is_valid=False)
        self.assertEqual(sample["tokens_generated"], 7)

        self.assertIsNone(_extract_sample_from_row({"score": 1.0}))

    def test_walk_dict_nodes(self):
        walked = _walk_dict_nodes([{"a": 1}, [2, {"b": 3}]])
        self.assertEqual(len(walked), 2)

    def test_dedupe_rows_keeps_richest(self):
        deduped = _dedupe_rows(
            [
                {
                    "prompt_text": "q",
                    "expected_output": "",
                    "model_output": "a",
                    "score": 0.0,
                    "latency_ms": 0.0,
                    "first_token_ms": 0.0,
                    "tokens_generated": 0,
                },
                {
                    "prompt_text": "q",
                    "expected_output": "",
                    "model_output": "a",
                    "score": 0.8,
                    "latency_ms": 2.0,
                    "first_token_ms": 1.0,
                    "tokens_generated": 5,
                },
                {
                    "prompt_text": "q2",
                    "expected_output": "",
                    "model_output": "a2",
                    "score": 0.0,
                },
            ]
        )
        self.assertEqual(len(deduped), 2)
        first_q = [r for r in deduped if r["prompt_text"] == "q"][0]
        self.assertEqual(first_q["tokens_generated"], 5)
        self.assertEqual(_row_richness(first_q), 4)

    async def test_ingest_prefers_artifacts_over_fallback(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            storage = LocalFileStorage(root=tmpdir)

            # Write input JSONL
            input_key = "work/input.jsonl"
            await storage.write_file(
                input_key,
                (
                    json.dumps({"query": "q-input", "response": "a-input"})
                    + "\n"
                ).encode(),
            )

            # No artifacts → fallback to input
            fallback_rows = await ingest_evalscope_results(
                storage, "work", input_key, default_score=0.3
            )
            self.assertEqual(len(fallback_rows), 1)
            self.assertEqual(fallback_rows[0]["prompt_text"], "q-input")
            self.assertEqual(fallback_rows[0]["score"], 0.3)

            # Add artifacts → artifacts win
            artifact_key = "work/reports/samples.jsonl"
            await storage.write_file(
                artifact_key,
                (
                    json.dumps(
                        {
                            "prompt": "q-art",
                            "expected": "a-exp",
                            "prediction": "a-art",
                            "score": 0.9,
                            "latency_ms": 8,
                            "first_token_ms": 4,
                            "tokens_generated": 3,
                        }
                    )
                    + "\n"
                ).encode(),
            )
            artifact_rows = await ingest_evalscope_results(
                storage, "work", input_key, default_score=0.1
            )
            self.assertEqual(len(artifact_rows), 1)
            self.assertEqual(artifact_rows[0]["prompt_text"], "q-art")
            self.assertEqual(artifact_rows[0]["score"], 0.9)

    async def test_ingest_empty_work_dir(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            storage = LocalFileStorage(root=tmpdir)
            result = await ingest_evalscope_results(storage, "missing", None)
            self.assertEqual(result, [])

    async def test_fallback_from_input_handles_bad_data(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            storage = LocalFileStorage(root=tmpdir)
            input_key = "work/bad_input.jsonl"
            await storage.write_file(
                input_key,
                b"bad-json\n"
                + json.dumps(["not-a-dict"]).encode()
                + b"\n"
                + json.dumps({"x": 1}).encode()
                + b"\n"
                + json.dumps({"query": "q", "response": "r"}).encode()
                + b"\n",
            )

            # Only the last valid dict row should be returned
            result = await ingest_evalscope_results(
                storage, "nonexistent_work", input_key, default_score=0.5
            )
            self.assertEqual(len(result), 1)
            self.assertEqual(result[0]["prompt_text"], "q")

    async def test_candidate_filters_input_configs_progress(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            storage = LocalFileStorage(root=tmpdir)
            await storage.write_file("work/reports/pred.jsonl", b"{}\n")
            await storage.write_file("work/input/source.jsonl", b"")
            await storage.write_file("work/configs/task_config.json", b"{}")
            await storage.write_file("work/progress.json", b"{}")

            result = await ingest_evalscope_results(
                storage, "work", None, default_score=0.0
            )
            # pred.jsonl has {} which has no prompt/expected/output → no samples
            self.assertEqual(result, [])


if __name__ == "__main__":
    unittest.main()
