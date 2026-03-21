"""Tests for the unified error classification system."""

import unittest

from app.errors import (
    ConfigError,
    DataError,
    DatasetEmptyError,
    DatasetNotFoundError,
    DatasetParseError,
    EvalPipelineError,
    EvaluationError,
    EvaluatorConfigError,
    EvaluatorRuntimeError,
    InvalidEnvVarsError,
    JudgeModelError,
    ModelAuthError,
    ModelCallError,
    ModelRateLimitError,
    ModelTimeoutError,
    ResourceError,
    ResultIngestionError,
    TaskRecoveryError,
)


class TestErrorHierarchy(unittest.TestCase):
    """Verify that error classes have correct inheritance and attributes."""

    def test_all_errors_inherit_from_base(self):
        classes = [
            ModelCallError, ModelTimeoutError, ModelAuthError, ModelRateLimitError,
            EvaluationError, EvaluatorConfigError, EvaluatorRuntimeError, JudgeModelError,
            DataError, DatasetNotFoundError, DatasetParseError, DatasetEmptyError,
            ConfigError, InvalidEnvVarsError,
            ResultIngestionError, TaskRecoveryError, ResourceError,
        ]
        for cls in classes:
            err = cls("test")
            self.assertIsInstance(err, EvalPipelineError)
            self.assertIsInstance(err, Exception)

    def test_model_call_subtypes(self):
        self.assertIsInstance(ModelTimeoutError("t"), ModelCallError)
        self.assertIsInstance(ModelAuthError("a"), ModelCallError)
        self.assertIsInstance(ModelRateLimitError("r"), ModelCallError)

    def test_evaluation_subtypes(self):
        self.assertIsInstance(EvaluatorConfigError("c"), EvaluationError)
        self.assertIsInstance(EvaluatorRuntimeError("r"), EvaluationError)
        self.assertIsInstance(JudgeModelError("j"), EvaluationError)

    def test_data_subtypes(self):
        self.assertIsInstance(DatasetNotFoundError("n"), DataError)
        self.assertIsInstance(DatasetParseError("p"), DataError)
        self.assertIsInstance(DatasetEmptyError("e"), DataError)

    def test_error_codes_are_unique(self):
        classes = [
            ModelCallError, ModelTimeoutError, ModelAuthError, ModelRateLimitError,
            EvaluationError, EvaluatorConfigError, EvaluatorRuntimeError, JudgeModelError,
            DataError, DatasetNotFoundError, DatasetParseError, DatasetEmptyError,
            ConfigError, InvalidEnvVarsError,
            ResultIngestionError, TaskRecoveryError, ResourceError,
        ]
        codes = [cls.error_code for cls in classes]
        self.assertEqual(len(codes), len(set(codes)), f"Duplicate error codes: {codes}")

    def test_error_attributes(self):
        err = ModelTimeoutError("timed out after 30s")
        self.assertEqual(err.error_code, "MODEL_CALL_TIMEOUT")
        self.assertTrue(err.retryable)
        self.assertEqual(err.severity, "prompt")
        self.assertEqual(err.detail, "timed out after 30s")
        self.assertEqual(str(err), "timed out after 30s")

    def test_fatal_severity(self):
        self.assertEqual(ModelAuthError.severity, "fatal")
        self.assertEqual(EvaluatorConfigError.severity, "fatal")
        self.assertEqual(ConfigError.severity, "fatal")

    def test_retryable(self):
        self.assertTrue(ModelTimeoutError.retryable)
        self.assertTrue(ModelRateLimitError.retryable)
        self.assertTrue(EvaluatorRuntimeError.retryable)
        self.assertTrue(ResourceError.retryable)
        self.assertFalse(ModelAuthError.retryable)
        self.assertFalse(ConfigError.retryable)


if __name__ == "__main__":
    unittest.main()
