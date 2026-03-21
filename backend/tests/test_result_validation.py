"""Tests for the result validation guard in the task runner."""

import unittest
import uuid

from app.errors import ResultIngestionError
from app.models.eval_result import EvalResult
from app.services.task_runner import _validate_result


def _make_result(**overrides) -> EvalResult:
    """Create a minimal EvalResult for testing."""
    defaults = {
        "task_id": uuid.uuid4(),
        "subtask_id": uuid.uuid4(),
        "dataset_id": uuid.uuid4(),
        "criterion_id": uuid.uuid4(),
        "prompt_text": "what is 2+2?",
        "expected_output": "4",
        "model_output": "4",
        "score": 1.0,
        "latency_ms": 100.0,
        "tokens_generated": 5,
        "first_token_ms": 50.0,
        "is_valid": True,
        "error_category": None,
    }
    defaults.update(overrides)
    return EvalResult(**defaults)


class TestResultValidation(unittest.TestCase):
    def test_valid_result_passes(self):
        r = _make_result()
        _validate_result(r)  # should not raise

    def test_error_string_as_model_output_rejected(self):
        r = _make_result(model_output="[ERROR] Connection refused")
        with self.assertRaises(ResultIngestionError) as ctx:
            _validate_result(r)
        self.assertIn("dirty result", str(ctx.exception))

    def test_score_out_of_range_rejected(self):
        r = _make_result(score=1.5)
        with self.assertRaises(ResultIngestionError):
            _validate_result(r)

        r2 = _make_result(score=-0.1)
        with self.assertRaises(ResultIngestionError):
            _validate_result(r2)

    def test_invalid_without_error_category_rejected(self):
        r = _make_result(is_valid=False, error_category=None)
        with self.assertRaises(ResultIngestionError):
            _validate_result(r)

    def test_invalid_with_error_category_passes(self):
        r = _make_result(
            is_valid=False,
            error_category="MODEL_CALL_TIMEOUT",
            model_output="",
            score=0.0,
        )
        _validate_result(r)  # should not raise

    def test_boundary_scores_pass(self):
        _validate_result(_make_result(score=0.0))
        _validate_result(_make_result(score=1.0))
        _validate_result(_make_result(score=0.5))


if __name__ == "__main__":
    unittest.main()
