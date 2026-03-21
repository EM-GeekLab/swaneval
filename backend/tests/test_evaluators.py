import json
import tempfile
import textwrap
import unittest
from pathlib import Path
from unittest.mock import patch

from app.services.evaluators import (
    _extract_score_from_text,
    _normalize_endpoint_url,
    evaluate_contains,
    evaluate_exact_match,
    evaluate_llm_judge,
    evaluate_numeric_closeness,
    evaluate_regex,
    evaluate_sandbox_custom,
    run_criterion,
)

_ENDPOINT = "http://127.0.0.1:9999/v1/chat/completions"
_ANTHROPIC_ENDPOINT = "https://coding.dashscope.aliyuncs.com/apps/anthropic"
_HTTPX_CLIENT = "app.services.evaluators.httpx.Client"


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


def _fake(payload):
    return _FakeClient(_FakeResponse(200, payload))


class TestEvaluators(unittest.TestCase):
    def test_basic_metric_helpers(self):
        self.assertEqual(evaluate_exact_match("A", "A"), 1.0)
        self.assertEqual(evaluate_exact_match("A", "B"), 0.0)
        self.assertEqual(evaluate_contains("bei", "Beijing"), 0.0)
        self.assertEqual(evaluate_contains("Bei", "Beijing"), 1.0)
        self.assertEqual(evaluate_regex(r"B.+g", "Beijing"), 1.0)
        self.assertEqual(evaluate_regex(r"x+", "Beijing"), 0.0)
        self.assertEqual(
            evaluate_numeric_closeness("4", "answer is 4.0", tolerance=0.01),
            1.0,
        )
        self.assertEqual(
            evaluate_numeric_closeness("4", "answer is 4.2", tolerance=0.01),
            0.0,
        )
        # Non-numeric expected now raises instead of returning 0.0
        with self.assertRaises(ValueError):
            evaluate_numeric_closeness("x", "answer is 4", tolerance=0.01)
        self.assertEqual(
            evaluate_numeric_closeness("4", "no number", tolerance=0.01),
            0.0,
        )

    def test_endpoint_and_score_helpers(self):
        self.assertEqual(_normalize_endpoint_url(""), "")
        self.assertEqual(
            _normalize_endpoint_url(_ANTHROPIC_ENDPOINT),
            _ANTHROPIC_ENDPOINT + "/v1/messages",
        )
        self.assertEqual(
            _normalize_endpoint_url(_ANTHROPIC_ENDPOINT + "/v1/messages"),
            _ANTHROPIC_ENDPOINT + "/v1/messages",
        )
        self.assertEqual(_extract_score_from_text("score=0.7"), 0.7)
        self.assertEqual(_extract_score_from_text("1.8"), 1.0)
        self.assertEqual(_extract_score_from_text("-1"), 0.0)
        with self.assertRaises(ValueError):
            _extract_score_from_text("no score")

    def test_evaluate_sandbox_custom_basic(self):
        """Sandbox custom script: matching output -> 1.0."""
        with tempfile.TemporaryDirectory() as tmpdir:
            p1 = Path(tmpdir) / "judge1.py"
            p1.write_text(
                textwrap.dedent("""\
                    def evaluate(expected, actual):
                        return 1.0 if expected.strip() == actual.strip() else 0.0
                """),
                encoding="utf-8",
            )
            cfg = {"script_path": str(p1), "entrypoint": "evaluate"}
            self.assertEqual(
                evaluate_sandbox_custom(cfg, expected="A", actual="A"),
                1.0,
            )
            self.assertEqual(
                evaluate_sandbox_custom(cfg, expected="A", actual="B"),
                0.0,
            )

    def test_evaluate_sandbox_custom_errors(self):
        """Missing script or empty config must raise."""
        with self.assertRaises(ValueError):
            evaluate_sandbox_custom({}, "x", "y")
        with self.assertRaises(ValueError):
            evaluate_sandbox_custom(
                {"script_path": "/tmp/does-not-exist.py"}, "x", "y"
            )

    def test_evaluate_llm_judge_openai_and_anthropic(self):
        openai_payload = {
            "choices": [{"message": {"content": "0.8"}}],
            "usage": {"completion_tokens": 3},
        }
        anthropic_payload = {
            "content": [{"type": "text", "text": "0.6"}],
            "usage": {"output_tokens": 5},
        }

        with patch(_HTTPX_CLIENT, return_value=_fake(openai_payload)):
            s1 = evaluate_llm_judge(
                {
                    "endpoint_url": _ENDPOINT,
                    "api_key": "k",
                    "model_name": "m",
                },
                expected="A",
                actual="B",
            )
            self.assertEqual(s1, 0.8)

        with patch(_HTTPX_CLIENT, return_value=_fake(anthropic_payload)):
            s2 = evaluate_llm_judge(
                {
                    "endpoint_url": _ANTHROPIC_ENDPOINT,
                    "api_key": "k",
                    "model_name": "m",
                },
                expected="A",
                actual="B",
            )
            self.assertEqual(s2, 0.6)

    def test_evaluate_llm_judge_validation_errors(self):
        base = {"endpoint_url": _ENDPOINT, "model_name": "m", "api_key": "k"}

        with self.assertRaises(ValueError):
            evaluate_llm_judge(
                {**base, "endpoint_url": "   "},
                expected="A", actual="B",
            )
        with self.assertRaises(ValueError):
            evaluate_llm_judge(
                {**base, "model_name": "   "},
                expected="A", actual="B",
            )
        with self.assertRaises(ValueError):
            evaluate_llm_judge(
                {**base, "api_key": "   "},
                expected="A", actual="B",
            )

    def test_run_criterion_sandbox_and_llm_judge_paths(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            p = Path(tmpdir) / "judge4.py"
            p.write_text(
                textwrap.dedent("""\
                    def evaluate(expected, actual):
                        return 1.0
                """),
                encoding="utf-8",
            )
            cfg = json.dumps({
                "mode": "custom_script",
                "script_path": str(p),
                "entrypoint": "evaluate",
            })
            self.assertEqual(run_criterion("sandbox", cfg, "x", "y"), 1.0)

        payload = {"choices": [{"message": {"content": "0.4"}}]}
        with patch(_HTTPX_CLIENT, return_value=_fake(payload)):
            cfg2 = json.dumps({
                "endpoint_url": _ENDPOINT,
                "api_key": "k",
                "model_name": "m",
            })
            self.assertEqual(
                run_criterion("llm_judge", cfg2, "x", "y"), 0.4,
            )

        with self.assertRaises(ValueError):
            run_criterion("unknown", "{}", "x", "y")

    def test_run_criterion_preset_and_regex_branches(self):
        exact = json.dumps({"metric": "exact_match"})
        contains = json.dumps({"metric": "contains"})
        numeric = json.dumps({"metric": "numeric", "tolerance": 0.5})
        regex = json.dumps({"pattern": "abc"})

        self.assertEqual(run_criterion("preset", exact, "x", "x"), 1.0)
        self.assertEqual(run_criterion("preset", contains, "x", "abc"), 0.0)
        self.assertEqual(run_criterion("preset", numeric, "3", "3.4"), 1.0)
        self.assertEqual(run_criterion("regex", regex, "", "abc"), 1.0)

    def test_unknown_preset_metric_raises(self):
        """Unknown preset metric must raise, not fall back to exact_match."""
        with self.assertRaises(ValueError) as ctx:
            run_criterion("preset", json.dumps({"metric": "other"}), "x", "x")
        self.assertIn("Unknown preset metric", str(ctx.exception))

    def test_empty_regex_pattern_raises(self):
        """Empty regex pattern must raise, not return 0.0."""
        with self.assertRaises(ValueError) as ctx:
            run_criterion("regex", json.dumps({"pattern": ""}), "", "abc")
        self.assertIn("empty pattern", str(ctx.exception))

    def test_numeric_closeness_non_numeric_expected_raises(self):
        """Non-numeric expected value must raise ValueError."""
        with self.assertRaises(ValueError):
            evaluate_numeric_closeness("not_a_number", "42")


if __name__ == "__main__":
    unittest.main()
