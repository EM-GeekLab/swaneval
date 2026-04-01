import json
import tempfile
import unittest
from types import SimpleNamespace
from typing import Any, cast

from app.services.evalscope_adapter import (
    _find_numeric_score,
    _normalize_qa_row,
    build_evalscope_http_payload,
    convert_dataset_to_general_qa_jsonl,
    extract_primary_score,
    map_criteria_to_evalscope,
)
from app.services.storage.local import LocalFileStorage


class TestEvalscopeAdapter(unittest.IsolatedAsyncioTestCase):
    def test_normalize_qa_row_supported_fields(self):
        self.assertEqual(
            _normalize_qa_row({"query": "q", "response": "r"}),
            {"query": "q", "response": "r"},
        )
        self.assertEqual(
            _normalize_qa_row({"prompt": "p", "expected": 1}),
            {"query": "p", "response": "1"},
        )
        self.assertEqual(
            _normalize_qa_row({"input": "i", "output": "o"}),
            {"query": "i", "response": "o"},
        )
        self.assertEqual(
            _normalize_qa_row({"question": "who", "answer": "me"}),
            {"query": "who", "response": "me"},
        )
        self.assertEqual(
            _normalize_qa_row({"query": "only query"}), {"query": "only query"}
        )
        self.assertIsNone(_normalize_qa_row({"unknown": 1}))

    async def test_convert_jsonl_to_general_qa(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            storage = LocalFileStorage(root=tmpdir)

            rows = [
                {"prompt": "2+2=?", "expected": "4"},
                {"query": "capital of China", "response": "Beijing"},
                {"input": "no expected"},
                {"bad": "row without query"},
            ]
            src_key = "src/sample.jsonl"
            await storage.write_file(
                src_key,
                "\n".join(json.dumps(r) for r in rows).encode(),
            )
            src_uri = storage.resolve_uri(src_key)

            out_key = "out/sample.jsonl"
            converted = await convert_dataset_to_general_qa_jsonl(
                storage, src_uri, out_key
            )
            self.assertEqual(converted, 3)

            text = await storage.read_text(out_key)
            lines = [json.loads(ln) for ln in text.splitlines() if ln.strip()]
            self.assertEqual(lines[0], {"query": "2+2=?", "response": "4"})
            self.assertEqual(
                lines[1], {"query": "capital of China", "response": "Beijing"}
            )
            self.assertEqual(lines[2], {"query": "no expected"})

    async def test_convert_json_list(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            storage = LocalFileStorage(root=tmpdir)
            src_key = "src/list.json"
            data = [{"prompt": "a", "expected": "b"}, {"query": "c"}]
            await storage.write_file(src_key, json.dumps(data).encode())
            src_uri = storage.resolve_uri(src_key)

            out_key = "out/list.jsonl"
            converted = await convert_dataset_to_general_qa_jsonl(
                storage, src_uri, out_key
            )
            self.assertEqual(converted, 2)

    async def test_convert_json_dict(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            storage = LocalFileStorage(root=tmpdir)
            src_key = "src/single.json"
            await storage.write_file(
                src_key, json.dumps({"query": "q", "response": "r"}).encode()
            )
            src_uri = storage.resolve_uri(src_key)

            out_key = "out/single.jsonl"
            converted = await convert_dataset_to_general_qa_jsonl(
                storage, src_uri, out_key
            )
            self.assertEqual(converted, 1)

    async def test_convert_skips_blank_lines(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            storage = LocalFileStorage(root=tmpdir)
            src_key = "src/blanks.jsonl"
            content = (
                json.dumps({"query": "q1"})
                + "\n\n   \n"
                + json.dumps({"query": "q2"})
            )
            await storage.write_file(src_key, content.encode())
            src_uri = storage.resolve_uri(src_key)

            out_key = "out/blanks.jsonl"
            converted = await convert_dataset_to_general_qa_jsonl(
                storage, src_uri, out_key
            )
            self.assertEqual(converted, 2)

    def test_build_evalscope_http_payload_basic(self):
        model = cast(
            Any,
            SimpleNamespace(
                name="mock-model",
                model_name="mock-model",
                endpoint_url="http://127.0.0.1:8801/v1/chat/completions",
                api_key="real-key",
            ),
        )
        dataset = cast(
            Any,
            SimpleNamespace(
                id="ds-1",
                name="test-ds",
                source_uri="data/e2e_cases/sample.jsonl",
            ),
        )
        criterion = cast(
            Any,
            SimpleNamespace(
                id="c-1",
                name="em",
                type="preset",
                config_json='{"metric": "exact_match"}',
            ),
        )
        payload = build_evalscope_http_payload(
            model=model,
            datasets=[dataset],
            criteria=[criterion],
            params={"temperature": 0.2, "seed": 7},
            repeat_count=3,
            work_dir="/data/outputs/task-1",
            evalscope_input_root="/data/inputs",
        )
        self.assertEqual(payload["model"], "mock-model")
        self.assertEqual(payload["api_key"], "real-key")
        self.assertEqual(payload["generation_config"]["temperature"], 0.2)
        self.assertEqual(payload["seed"], 7)
        self.assertEqual(payload["repeats"], 3)
        self.assertIn("exact_match", payload["dataset_args"]["general_qa"]["metric_list"])

    def test_build_evalscope_http_payload_empty_api_key(self):
        model = cast(
            Any,
            SimpleNamespace(
                name="m", model_name="m",
                endpoint_url="http://api", api_key="",
            ),
        )
        dataset = cast(
            Any,
            SimpleNamespace(
                id="ds-1", name="ds", source_uri="a/b/case.json",
            ),
        )
        criterion = cast(
            Any,
            SimpleNamespace(
                id="c-1", name="em", type="preset",
                config_json='{"metric": "bleu"}',
            ),
        )
        payload = build_evalscope_http_payload(
            model=model, datasets=[dataset], criteria=[criterion],
            params={}, repeat_count=1, work_dir="w", evalscope_input_root="r",
        )
        self.assertEqual(payload["api_key"], "EMPTY")

    def test_map_criteria_to_evalscope_preset(self):
        criteria = [
            cast(Any, SimpleNamespace(
                id="1", type="preset",
                config_json='{"metric": "exact_match"}',
            )),
            cast(Any, SimpleNamespace(
                id="2", type="preset",
                config_json='{"metric": "bleu"}',
            )),
        ]
        result = map_criteria_to_evalscope(criteria)
        self.assertIn("exact_match", result["metric_list"])
        self.assertIn("bleu", result["metric_list"])

    def test_map_criteria_to_evalscope_regex(self):
        criteria = [
            cast(Any, SimpleNamespace(
                id="1", type="regex",
                config_json='{"pattern": "\\\\d+", "match_mode": "search"}',
            )),
        ]
        result = map_criteria_to_evalscope(criteria)
        self.assertIn("regex_match", result["metric_list"])
        self.assertEqual(result["extra_params"]["pattern"], "\\d+")

    def test_map_criteria_to_evalscope_llm_judge(self):
        criteria = [
            cast(Any, SimpleNamespace(
                id="1", type="llm_judge",
                config_json=json.dumps({
                    "endpoint_url": "http://judge:8000/v1",
                    "api_key": "key",
                    "model_name": "gpt-4",
                    "system_prompt": "You are a judge.",
                }),
            )),
        ]
        result = map_criteria_to_evalscope(criteria)
        self.assertEqual(result["judge_strategy"], "llm")
        self.assertEqual(result["judge_model_args"]["api_url"], "http://judge:8000/v1")
        self.assertEqual(result["judge_model_args"]["model_id"], "gpt-4")

    async def test_extract_primary_score_from_report(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            storage = LocalFileStorage(root=tmpdir)
            report_key = "work/reports/modelA/general_qa.json"
            payload = {
                "summary": {
                    "metrics": [{"name": "AverageAccuracy", "score": 0.875}],
                }
            }
            await storage.write_file(
                report_key, json.dumps(payload).encode()
            )

            score = await extract_primary_score(storage, "work")
            self.assertAlmostEqual(score, 0.875, places=6)

    async def test_extract_primary_score_no_reports(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            storage = LocalFileStorage(root=tmpdir)
            score = await extract_primary_score(storage, "empty_work")
            self.assertEqual(score, 0.0)

    async def test_extract_primary_score_invalid_json(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            storage = LocalFileStorage(root=tmpdir)
            await storage.write_file(
                "work/reports/broken.json", b"{not-json"
            )
            score = await extract_primary_score(storage, "work")
            self.assertEqual(score, 0.0)

    def test_find_numeric_score_variants(self):
        self.assertEqual(_find_numeric_score({"score": 0.1}), 0.1)
        self.assertEqual(_find_numeric_score({"Score": 0.2}), 0.2)
        self.assertEqual(_find_numeric_score({"avg_score": 0.3}), 0.3)
        self.assertEqual(_find_numeric_score({"AverageAccuracy": 0.4}), 0.4)
        self.assertEqual(
            _find_numeric_score([{"x": [{"y": 1}, {"score": 0.6}]}]), 0.6
        )
        self.assertIsNone(
            _find_numeric_score({"a": [{"b": "c"}], "d": {"e": "f"}})
        )


if __name__ == "__main__":
    unittest.main()
