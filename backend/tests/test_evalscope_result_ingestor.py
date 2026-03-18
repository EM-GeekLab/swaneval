import json
import tempfile
import unittest
from pathlib import Path

from app.services.evalscope_result_ingestor import (
    _candidate_artifact_files,
    _dedupe_rows,
    _extract_float,
    _extract_int,
    _extract_sample_from_row,
    _extract_text,
    _fallback_from_input,
    _iter_json_rows,
    _row_richness,
    _walk_dict_nodes,
    ingest_evalscope_results,
)


class TestEvalscopeResultIngestor(unittest.TestCase):
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
        self.assertEqual(_extract_text({"messages": [123, {"content": "ok"}]}, ("prompt",)), "ok")

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
        self.assertEqual(sample["score"], 0.0)
        self.assertEqual(sample["tokens_generated"], 7)

        self.assertIsNone(_extract_sample_from_row({"score": 1.0}))

    def test_iter_json_rows_and_walk_nodes(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            json_file = Path(tmpdir) / "rows.json"
            jsonl_file = Path(tmpdir) / "rows.jsonl"
            bad_file = Path(tmpdir) / "broken.json"
            unreadable_file = Path(tmpdir) / "unreadable.jsonl"

            json_file.write_text(
                json.dumps({"outer": [{"prompt": "p1", "prediction": "o1"}]}),
                encoding="utf-8",
            )
            jsonl_file.write_text(
                "\n".join(
                    [
                        json.dumps({"prompt": "p2", "prediction": "o2"}),
                        "",
                        "not-json",
                        json.dumps([{"prompt": "p3", "prediction": "o3"}]),
                    ]
                ),
                encoding="utf-8",
            )
            bad_file.write_text("{bad", encoding="utf-8")
            unreadable_file.write_bytes(b"\xff\xfe\x00")

            json_nodes = list(_iter_json_rows(json_file))
            jsonl_nodes = list(_iter_json_rows(jsonl_file))
            bad_nodes = list(_iter_json_rows(bad_file))
            unreadable_nodes = list(_iter_json_rows(unreadable_file))
            walked = list(_walk_dict_nodes([{"a": 1}, [2, {"b": 3}]]))

            self.assertTrue(any(node.get("prompt") == "p1" for node in json_nodes))
            self.assertTrue(any(node.get("prompt") == "p2" for node in jsonl_nodes))
            self.assertTrue(any(node.get("prompt") == "p3" for node in jsonl_nodes))
            self.assertEqual(bad_nodes, [])
            self.assertEqual(unreadable_nodes, [])
            self.assertEqual(len(walked), 2)

    def test_candidate_artifacts_and_dedupe(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            (root / "reports").mkdir(parents=True, exist_ok=True)
            (root / "input").mkdir(parents=True, exist_ok=True)
            (root / "configs").mkdir(parents=True, exist_ok=True)
            (root / "reports" / "pred.jsonl").write_text(
                json.dumps({"prompt": "q", "prediction": "a"}) + "\n",
                encoding="utf-8",
            )
            (root / "input" / "source.jsonl").write_text("", encoding="utf-8")
            (root / "configs" / "task_config.json").write_text("{}", encoding="utf-8")
            (root / "progress.json").write_text("{}", encoding="utf-8")

            files = _candidate_artifact_files(str(root))
            self.assertEqual([p.name for p in files], ["pred.jsonl"])

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
                    {"prompt_text": "q2", "expected_output": "", "model_output": "a2", "score": 0.0},
                ]
            )
            self.assertEqual(len(deduped), 2)
            first_q = [r for r in deduped if r["prompt_text"] == "q"][0]
            self.assertEqual(first_q["tokens_generated"], 5)
            self.assertEqual(_row_richness(first_q), 4)

    def test_ingest_prefers_artifacts_and_fallback(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            reports = root / "reports"
            reports.mkdir(parents=True, exist_ok=True)
            input_jsonl = root / "input.jsonl"

            input_jsonl.write_text(
                "\n".join(
                    [
                        json.dumps({"query": "q-input", "response": "a-input"}),
                        "",
                        "bad-json",
                        json.dumps(["not-a-dict"]),
                        json.dumps({"x": 1}),
                    ]
                ),
                encoding="utf-8",
            )

            # No artifact rows -> fallback to input rows
            fallback_rows = ingest_evalscope_results(str(root), str(input_jsonl), default_score=0.3)
            self.assertEqual(len(fallback_rows), 1)
            self.assertEqual(fallback_rows[0]["prompt_text"], "q-input")
            self.assertEqual(fallback_rows[0]["score"], 0.3)

            # Add artifact rows -> artifacts should win over fallback
            (reports / "samples.jsonl").write_text(
                "\n".join(
                    [
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
                        ),
                        json.dumps(
                            {
                                "prompt": "q-art",
                                "expected": "a-exp",
                                "prediction": "a-art",
                                "score": 0.9,
                            }
                        ),
                    ]
                ),
                encoding="utf-8",
            )
            artifact_rows = ingest_evalscope_results(str(root), str(input_jsonl), default_score=0.1)
            self.assertEqual(len(artifact_rows), 1)
            self.assertEqual(artifact_rows[0]["prompt_text"], "q-art")
            self.assertEqual(artifact_rows[0]["model_output"], "a-art")
            self.assertEqual(artifact_rows[0]["score"], 0.9)

            # Missing fallback path and missing work_dir should both return empty results.
            self.assertEqual(ingest_evalscope_results(str(Path(tmpdir) / "missing"), None), [])

    def test_fallback_missing_and_unreadable_input(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            missing = Path(tmpdir) / "missing.jsonl"
            self.assertEqual(_fallback_from_input(str(missing), default_score=0.0), [])

            broken = Path(tmpdir) / "broken.jsonl"
            broken.write_bytes(b"\xff\xfe\x00")
            self.assertEqual(_fallback_from_input(str(broken), default_score=0.0), [])


if __name__ == "__main__":
    unittest.main()
