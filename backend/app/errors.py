"""Unified error classification for the SwanEVAL evaluation pipeline.

Every failure in the task execution chain MUST raise one of these exceptions
instead of silently returning default values or embedding error strings in results.
"""


class EvalPipelineError(Exception):
    """Base class for all evaluation pipeline errors."""

    error_code: str = "PIPELINE_ERROR"
    retryable: bool = False
    severity: str = "fatal"  # "fatal" = task must stop, "prompt" = skip this prompt

    def __init__(self, detail: str, **kwargs):
        self.detail = detail
        for k, v in kwargs.items():
            setattr(self, k, v)
        super().__init__(detail)


# ── Model Call Errors ──────────────────────────────────────────────


class ModelCallError(EvalPipelineError):
    """Model API call failed."""

    error_code = "MODEL_CALL_FAILED"
    severity = "prompt"


class ModelTimeoutError(ModelCallError):
    """Model API call timed out."""

    error_code = "MODEL_CALL_TIMEOUT"
    retryable = True


class ModelAuthError(ModelCallError):
    """Model API returned 401/403."""

    error_code = "MODEL_AUTH_FAILED"
    severity = "fatal"


class ModelRateLimitError(ModelCallError):
    """Model API returned 429."""

    error_code = "MODEL_RATE_LIMITED"
    retryable = True


# ── Evaluation Errors ──────────────────────────────────────────────


class EvaluationError(EvalPipelineError):
    """Criterion evaluation failed."""

    error_code = "EVALUATION_FAILED"
    severity = "prompt"


class EvaluatorConfigError(EvaluationError):
    """Criterion configuration is invalid (missing pattern, bad script path, etc.)."""

    error_code = "EVALUATOR_CONFIG_INVALID"
    severity = "fatal"


class EvaluatorRuntimeError(EvaluationError):
    """Evaluator code/API crashed at runtime."""

    error_code = "EVALUATOR_RUNTIME_ERROR"
    retryable = True


class JudgeModelError(EvaluationError):
    """LLM judge model call failed."""

    error_code = "JUDGE_MODEL_FAILED"
    retryable = True


# ── Data Errors ────────────────────────────────────────────────────


class DataError(EvalPipelineError):
    """Data pipeline failure."""

    error_code = "DATA_ERROR"


class DatasetNotFoundError(DataError):
    """Referenced dataset or its file does not exist."""

    error_code = "DATASET_NOT_FOUND"


class DatasetParseError(DataError):
    """Dataset file exists but cannot be parsed."""

    error_code = "DATASET_PARSE_ERROR"


class DatasetEmptyError(DataError):
    """All datasets resolved to zero rows."""

    error_code = "DATASET_EMPTY"


# ── Config Errors ──────────────────────────────────────────────────


class ConfigError(EvalPipelineError):
    """Task configuration is invalid."""

    error_code = "CONFIG_ERROR"


class InvalidEnvVarsError(ConfigError):
    """env_vars JSON could not be parsed."""

    error_code = "INVALID_ENV_VARS"


class MissingFieldMappingError(ConfigError):
    """Required field mapping is missing for a dataset."""

    error_code = "MISSING_FIELD_MAPPING"


# ── Result Ingestion Errors ────────────────────────────────────────


class ResultIngestionError(EvalPipelineError):
    """Failed to ingest or validate an evaluation result."""

    error_code = "RESULT_INGESTION_ERROR"


# ── Task Recovery Errors ───────────────────────────────────────────


class TaskRecoveryError(EvalPipelineError):
    """Failed to resume or recover a task from checkpoint."""

    error_code = "TASK_RECOVERY_ERROR"


# ── Permission Errors ──────────────────────────────────────────────


class PermissionError_(EvalPipelineError):
    """User lacks permission for the requested operation."""

    error_code = "PERMISSION_DENIED"


# ── Resource Errors ────────────────────────────────────────────────


class ResourceError(EvalPipelineError):
    """Infrastructure resource unavailable (GPU, cluster, storage)."""

    error_code = "RESOURCE_ERROR"
    retryable = True
