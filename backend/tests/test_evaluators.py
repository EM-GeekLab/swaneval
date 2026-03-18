import json
import tempfile
import textwrap
import unittest
from pathlib import Path
from typing import Any, cast
from unittest.mock import patch

from app.services.evaluators import (
    _extract_score_from_text,
    _normalize_endpoint_url,
    evaluate_contains,
    evaluate_exact_match,
    evaluate_numeric_closeness,
    evaluate_regex,
    evaluate_llm_judge,
    evaluate_script,
    run_criterion,
)


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict):
        self.status_code = status_code
        self._payload = payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        return self._payload


class _FakeClient:
    def __init__(self, response: _FakeResponse):
        self._response = response

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def post(self, url, json, headers):
        _ = (url, json, headers)
        return self._response


class TestEvaluators(unittest.TestCase):
    def test_basic_metric_helpers(self):
        self.assertEqual(evaluate_exact_match("A", "A"), 1.0)
        self.assertEqual(evaluate_exact_match("A", "B"), 0.0)
        self.assertEqual(evaluate_contains("bei", "Beijing"), 0.0)
        self.assertEqual(evaluate_contains("Bei", "Beijing"), 1.0)
        self.assertEqual(evaluate_regex(r"B.+g", "Beijing"), 1.0)
        self.assertEqual(evaluate_regex(r"x+", "Beijing"), 0.0)
        self.assertEqual(evaluate_numeric_closeness("4", "answer is 4.0", tolerance=0.01), 1.0)
        self.assertEqual(evaluate_numeric_closeness("4", "answer is 4.2", tolerance=0.01), 0.0)
        self.assertEqual(evaluate_numeric_closeness("x", "answer is 4", tolerance=0.01), 0.0)
        self.assertEqual(evaluate_numeric_closeness("4", "no number", tolerance=0.01), 0.0)

    def test_endpoint_and_score_helpers(self):
        self.assertEqual(_normalize_endpoint_url(""), "")
        self.assertEqual(
            _normalize_endpoint_url("https://coding.dashscope.aliyuncs.com/apps/anthropic"),
            "https://coding.dashscope.aliyuncs.com/apps/anthropic/v1/messages",
        )
        self.assertEqual(
            _normalize_endpoint_url("https://coding.dashscope.aliyuncs.com/apps/anthropic/v1/messages"),
            "https://coding.dashscope.aliyuncs.com/apps/anthropic/v1/messages",
        )
        self.assertEqual(_extract_score_from_text("score=0.7"), 0.7)
        self.assertEqual(_extract_score_from_text("1.8"), 1.0)
        self.assertEqual(_extract_score_from_text("-1"), 0.0)
        with self.assertRaises(ValueError):
            _extract_score_from_text("no score")

    def test_evaluate_script_by_kwargs_and_positional(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            p1 = Path(tmpdir) / "judge1.py"
            p1.write_text(
                textwrap.dedent(
                    """
                    def evaluate(expected, actual, config):
                        return 1.0 if expected.strip() == actual.strip() else 0.0
                    """
                ),
                encoding="utf-8",
            )
            score = evaluate_script(
                {"script_path": str(p1), "entrypoint": "evaluate"},
                expected="A",
                actual="A",
            )
            self.assertEqual(score, 1.0)

            p2 = Path(tmpdir) / "judge2.py"
            p2.write_text(
                textwrap.dedent(
                    """
                    def evaluate(expected, actual):
                        return 0.5
                    """
                ),
                encoding="utf-8",
            )
            score2 = evaluate_script(
                {"script_path": str(p2), "entrypoint": "evaluate"},
                expected="A",
                actual="B",
            )
            self.assertEqual(score2, 0.5)

            p3 = Path(tmpdir) / "judge3_alt.py"
            p3.write_text(
                textwrap.dedent(
                    """
                    def evaluate(a, b):
                        return 0.25
                    """
                ),
                encoding="utf-8",
            )
            score3 = evaluate_script(
                {"script_path": str(p3), "entrypoint": "evaluate"},
                expected="A",
                actual="B",
            )
            self.assertEqual(score3, 0.25)

    def test_evaluate_script_errors(self):
        with self.assertRaises(ValueError):
            evaluate_script({}, "x", "y")

        with self.assertRaises(FileNotFoundError):
            evaluate_script({"script_path": "/tmp/does-not-exist.py"}, "x", "y")

        with tempfile.TemporaryDirectory() as tmpdir:
            p = Path(tmpdir) / "judge3.py"
            p.write_text("x=1\n", encoding="utf-8")
            with self.assertRaises(AttributeError):
                evaluate_script({"script_path": str(p), "entrypoint": "evaluate"}, "x", "y")

            p_callable = Path(tmpdir) / "judge_non_callable.py"
            p_callable.write_text("evaluate=1\n", encoding="utf-8")
            with self.assertRaises(TypeError):
                evaluate_script({"script_path": str(p_callable), "entrypoint": "evaluate"}, "x", "y")

    def test_evaluate_script_module_load_failure(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            p = Path(tmpdir) / "judge_load_fail.py"
            p.write_text("def evaluate(expected, actual):\n    return 1.0\n", encoding="utf-8")
            with patch("app.services.evaluators.importlib.util.spec_from_file_location", return_value=None):
                with self.assertRaises(ValueError):
                    evaluate_script({"script_path": str(p), "entrypoint": "evaluate"}, "x", "y")

    def test_evaluate_llm_judge_openai_and_anthropic(self):
        openai_payload = {
            "choices": [{"message": {"content": "0.8"}}],
            "usage": {"completion_tokens": 3},
        }
        anthropic_payload = {
            "content": [{"type": "text", "text": "0.6"}],
            "usage": {"output_tokens": 5},
        }

        with patch("app.services.evaluators.httpx.Client", return_value=_FakeClient(_FakeResponse(200, openai_payload))):
            s1 = evaluate_llm_judge(
                {
                    "endpoint_url": "http://127.0.0.1:9999/v1/chat/completions",
                    "api_key": "k",
                    "model_name": "m",
                },
                expected="A",
                actual="B",
            )
            self.assertEqual(s1, 0.8)

        with patch("app.services.evaluators.httpx.Client", return_value=_FakeClient(_FakeResponse(200, anthropic_payload))):
            s2 = evaluate_llm_judge(
                {
                    "endpoint_url": "https://coding.dashscope.aliyuncs.com/apps/anthropic",
                    "api_key": "k",
                    "model_name": "m",
                },
                expected="A",
                actual="B",
            )
            self.assertEqual(s2, 0.6)

    def test_evaluate_llm_judge_validation_errors(self):
        with self.assertRaises(ValueError):
            evaluate_llm_judge({"endpoint_url": "   ", "model_name": "m", "api_key": "k"}, expected="A", actual="B")

        with self.assertRaises(ValueError):
            evaluate_llm_judge(
                {"endpoint_url": "http://127.0.0.1:9999/v1/chat/completions", "model_name": "   ", "api_key": "k"},
                expected="A",
                actual="B",
            )

        with self.assertRaises(ValueError):
            evaluate_llm_judge(
                {"endpoint_url": "http://127.0.0.1:9999/v1/chat/completions", "model_name": "m", "api_key": "   "},
                expected="A",
                actual="B",
            )

    def test_run_criterion_script_and_llm_judge_paths(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            p = Path(tmpdir) / "judge4.py"
            p.write_text(
                textwrap.dedent(
                    """
                    def evaluate(expected, actual):
                        return 1.0
                    """
                ),
                encoding="utf-8",
            )
            cfg = json.dumps({"script_path": str(p), "entrypoint": "evaluate"})
            self.assertEqual(run_criterion("script", cfg, "x", "y"), 1.0)

        payload = {"choices": [{"message": {"content": "0.4"}}]}
        with patch("app.services.evaluators.httpx.Client", return_value=_FakeClient(_FakeResponse(200, payload))):
            cfg2 = json.dumps(
                {
                    "endpoint_url": "http://127.0.0.1:9999/v1/chat/completions",
                    "api_key": "k",
                    "model_name": "m",
                }
            )
            self.assertEqual(run_criterion("llm_judge", cfg2, "x", "y"), 0.4)

        with self.assertRaises(ValueError):
            run_criterion("unknown", "{}", "x", "y")

    def test_run_criterion_preset_and_regex_branches(self):
        self.assertEqual(run_criterion("preset", json.dumps({"metric": "exact_match"}), "x", "x"), 1.0)
        self.assertEqual(run_criterion("preset", json.dumps({"metric": "contains"}), "x", "abc"), 0.0)
        self.assertEqual(run_criterion("preset", json.dumps({"metric": "numeric", "tolerance": 0.5}), "3", "3.4"), 1.0)
        self.assertEqual(run_criterion("preset", json.dumps({"metric": "other"}), "x", "x"), 1.0)
        self.assertEqual(run_criterion("regex", json.dumps({"pattern": "abc"}), "", "abc"), 1.0)
        self.assertEqual(run_criterion("regex", json.dumps({"pattern": ""}), "", "abc"), 0.0)


if __name__ == "__main__":
    unittest.main()
