import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import patch

from app.services.evalscope_adapter import (
    _find_numeric_score,
    _normalize_qa_row,
    build_evalscope_task_config,
    convert_dataset_to_general_qa_jsonl,
    extract_primary_score,
    run_evalscope_task,
)


class TestEvalscopeAdapter(unittest.TestCase):
    def test_normalize_qa_row_supported_fields(self):
        self.assertEqual(_normalize_qa_row({"query": "q", "response": "r"}), {"query": "q", "response": "r"})
        self.assertEqual(_normalize_qa_row({"prompt": "p", "expected": 1}), {"query": "p", "response": "1"})
        self.assertEqual(_normalize_qa_row({"input": "i", "output": "o"}), {"query": "i", "response": "o"})
        self.assertEqual(_normalize_qa_row({"question": "who", "answer": "me"}), {"query": "who", "response": "me"})
        self.assertEqual(_normalize_qa_row({"query": "only query"}), {"query": "only query"})
        self.assertIsNone(_normalize_qa_row({"unknown": 1}))

    def test_convert_raises_when_source_missing(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            missing = Path(tmpdir) / "not_exists.jsonl"
            out = Path(tmpdir) / "out" / "x.jsonl"
            with self.assertRaises(FileNotFoundError):
                convert_dataset_to_general_qa_jsonl(str(missing), str(out))

    def test_convert_json_variants(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            src_list = Path(tmpdir) / "sample_list.json"
            src_dict = Path(tmpdir) / "sample_dict.json"
            src_bad = Path(tmpdir) / "sample_bad.json"
            out1 = Path(tmpdir) / "out" / "list.jsonl"
            out2 = Path(tmpdir) / "out" / "dict.jsonl"

            src_list.write_text(
                json.dumps([
                    {"prompt": "2+2", "expected": "4"},
                    {"query": "hello", "response": "world"},
                ]),
                encoding="utf-8",
            )
            src_dict.write_text(json.dumps({"query": "single", "response": "row"}), encoding="utf-8")
            src_bad.write_text(json.dumps("not a row object"), encoding="utf-8")

            converted1 = convert_dataset_to_general_qa_jsonl(str(src_list), str(out1))
            converted2 = convert_dataset_to_general_qa_jsonl(str(src_dict), str(out2))

            self.assertEqual(converted1, 2)
            self.assertEqual(converted2, 1)

            with self.assertRaises(ValueError):
                convert_dataset_to_general_qa_jsonl(str(src_bad), str(Path(tmpdir) / "out" / "bad.jsonl"))

    def test_convert_jsonl_to_general_qa(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            src = Path(tmpdir) / "sample.jsonl"
            out = Path(tmpdir) / "out" / "sample.jsonl"

            rows = [
                {"prompt": "2+2=?", "expected": "4"},
                {"query": "capital of China", "response": "Beijing"},
                {"input": "no expected"},
                {"bad": "row without query"},
            ]
            src.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows), encoding="utf-8")

            converted = convert_dataset_to_general_qa_jsonl(str(src), str(out))
            self.assertEqual(converted, 3)

            lines = [json.loads(line) for line in out.read_text(encoding="utf-8").splitlines()]
            self.assertEqual(lines[0], {"query": "2+2=?", "response": "4"})
            self.assertEqual(lines[1], {"query": "capital of China", "response": "Beijing"})
            self.assertEqual(lines[2], {"query": "no expected"})

    def test_convert_jsonl_skips_blank_lines(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            src = Path(tmpdir) / "sample.jsonl"
            out = Path(tmpdir) / "out" / "sample.jsonl"
            src.write_text(
                "\n".join(
                    [
                        json.dumps({"query": "q1", "response": "r1"}),
                        "",
                        "   ",
                        json.dumps({"query": "q2"}),
                    ]
                ),
                encoding="utf-8",
            )

            converted = convert_dataset_to_general_qa_jsonl(str(src), str(out))
            self.assertEqual(converted, 2)

    def test_build_evalscope_task_config_defaults_and_seed(self):
        fake_config_module = types.ModuleType("evalscope.config")

        class FakeTaskConfig:  # noqa: D401
            def __init__(self, **kwargs):
                self.kwargs = kwargs

        setattr(fake_config_module, "TaskConfig", FakeTaskConfig)

        with patch.dict(sys.modules, {"evalscope.config": fake_config_module}):
            model = cast(
                Any,
                SimpleNamespace(
                name="mock-model",
                endpoint_url="http://127.0.0.1:8801/v1/chat/completions",
                api_key="real-key",
                ),
            )
            dataset = cast(Any, SimpleNamespace(source_uri="data/e2e_cases/general_qa_sample.jsonl"))

            cfg = cast(
                Any,
                build_evalscope_task_config(
                model=model,
                dataset=dataset,
                evalscope_input_root="data/evalscope_input",
                params={"temperature": 0.2, "max_tokens": 32, "top_p": 0.9, "seed": 7},
                repeat_count=0,
                work_dir="data/evalscope_outputs/task-1",
                ),
            )

            self.assertEqual(cfg.kwargs["model"], "mock-model")
            self.assertEqual(cfg.kwargs["api_key"], "real-key")
            self.assertEqual(cfg.kwargs["eval_type"], "openai_api")
            self.assertEqual(cfg.kwargs["datasets"], ["general_qa"])
            self.assertEqual(cfg.kwargs["dataset_args"]["general_qa"]["subset_list"], ["general_qa_sample"])
            self.assertEqual(cfg.kwargs["generation_config"]["seed"], 7)
            self.assertEqual(cfg.kwargs["repeats"], 1)

    def test_build_evalscope_task_config_requires_api_key(self):
        fake_config_module = types.ModuleType("evalscope.config")

        class FakeTaskConfig:  # noqa: D401
            def __init__(self, **kwargs):
                self.kwargs = kwargs

        setattr(fake_config_module, "TaskConfig", FakeTaskConfig)

        with patch.dict(sys.modules, {"evalscope.config": fake_config_module}):
            model = cast(Any, SimpleNamespace(name="m", endpoint_url="http://api", api_key="  "))
            dataset = cast(Any, SimpleNamespace(source_uri="a/b/case.json"))

            with self.assertRaises(ValueError):
                build_evalscope_task_config(
                    model=model,
                    dataset=dataset,
                    evalscope_input_root="root",
                    params={},
                    repeat_count=1,
                    work_dir="work",
                )

    def test_build_evalscope_task_config_generation_defaults(self):
        fake_config_module = types.ModuleType("evalscope.config")

        class FakeTaskConfig:  # noqa: D401
            def __init__(self, **kwargs):
                self.kwargs = kwargs

        setattr(fake_config_module, "TaskConfig", FakeTaskConfig)

        with patch.dict(sys.modules, {"evalscope.config": fake_config_module}):
            model = cast(Any, SimpleNamespace(name="m", endpoint_url="http://api", api_key="k"))
            dataset = cast(Any, SimpleNamespace(source_uri="a/b/case.json"))

            cfg = cast(
                Any,
                build_evalscope_task_config(
                model=model,
                dataset=dataset,
                evalscope_input_root="root",
                params={},
                repeat_count=3,
                work_dir="work",
                ),
            )

            self.assertEqual(cfg.kwargs["generation_config"]["temperature"], 0.7)
            self.assertEqual(cfg.kwargs["generation_config"]["max_tokens"], 1024)
            self.assertEqual(cfg.kwargs["generation_config"]["top_p"], 1.0)
            self.assertNotIn("seed", cfg.kwargs["generation_config"])
            self.assertEqual(cfg.kwargs["repeats"], 3)

    def test_run_evalscope_task_returns_dict_or_wraps_result(self):
        fake_run_module = types.ModuleType("evalscope.run")

        def fake_run_dict(task_cfg):  # noqa: ARG001
            return {"ok": True}

        setattr(fake_run_module, "run_task", fake_run_dict)

        with patch.dict(sys.modules, {"evalscope.run": fake_run_module}):
            self.assertEqual(run_evalscope_task(task_cfg={"x": 1}), {"ok": True})

        def fake_run_non_dict(task_cfg):  # noqa: ARG001
            return "done"

        fake_run_module_2 = types.ModuleType("evalscope.run")
        setattr(fake_run_module_2, "run_task", fake_run_non_dict)

        with patch.dict(sys.modules, {"evalscope.run": fake_run_module_2}):
            self.assertEqual(run_evalscope_task(task_cfg={"x": 2}), {"result": "done"})

    def test_extract_primary_score_from_report(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            report_dir = Path(tmpdir) / "reports" / "modelA"
            report_dir.mkdir(parents=True, exist_ok=True)

            report_payload = {
                "summary": {
                    "dataset": "general_qa",
                    "metrics": [
                        {"name": "AverageAccuracy", "score": 0.875},
                    ],
                }
            }
            (report_dir / "general_qa.json").write_text(
                json.dumps(report_payload, ensure_ascii=False),
                encoding="utf-8",
            )

            score = extract_primary_score(tmpdir)
            self.assertAlmostEqual(score, 0.875, places=6)

    def test_extract_primary_score_no_reports_and_invalid_json(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            # No reports directory returns fallback 0.0
            self.assertEqual(extract_primary_score(tmpdir), 0.0)

            report_dir = Path(tmpdir) / "reports"
            report_dir.mkdir(parents=True, exist_ok=True)
            (report_dir / "broken.json").write_text("{not-json", encoding="utf-8")
            self.assertEqual(extract_primary_score(tmpdir), 0.0)

    def test_find_numeric_score_variants_and_none(self):
        self.assertEqual(_find_numeric_score({"score": 0.1}), 0.1)
        self.assertEqual(_find_numeric_score({"Score": 0.2}), 0.2)
        self.assertEqual(_find_numeric_score({"avg_score": 0.3}), 0.3)
        self.assertEqual(_find_numeric_score({"AverageAccuracy": 0.4}), 0.4)
        self.assertEqual(_find_numeric_score([{"x": [{"y": 1}, {"score": 0.6}]}]), 0.6)
        self.assertIsNone(_find_numeric_score({"a": [{"b": "c"}], "d": {"e": "f"}}))


if __name__ == "__main__":
    unittest.main()
