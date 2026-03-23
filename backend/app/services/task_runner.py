"""In-process task runner for MVP. Runs eval tasks as asyncio background tasks."""

import asyncio
import json
import logging
import os
import random
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import httpx
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.config import settings
from app.database import engine
from app.errors import (
    ConfigError,
    DatasetEmptyError,
    DatasetNotFoundError,
    DatasetParseError,
    EvaluationError,
    EvaluatorConfigError,
    InvalidEnvVarsError,
    ModelAuthError,
    ModelCallError,
    ModelRateLimitError,
    ModelTimeoutError,
)
from app.metrics import (
    evaluation_score,
    evaluations_total,
    model_call_duration_seconds,
    model_calls_total,
    model_tokens_generated,
    task_duration_seconds,
    task_prompts_processed,
    tasks_running,
    tasks_total,
)
from app.models.criterion import Criterion
from app.models.dataset import Dataset
from app.models.eval_result import EvalResult
from app.models.eval_task import EvalSubtask, EvalTask, TaskStatus
from app.models.llm_model import LLMModel
from app.services.evalscope_adapter import (
    build_evalscope_task_config,
    convert_dataset_to_general_qa_jsonl,
    extract_primary_score,
    run_evalscope_task,
)
from app.services.evalscope_result_ingestor import ingest_evalscope_results
from app.services.evaluators import run_criterion
from app.services.storage import StorageBackend, get_storage
from app.services.storage.file_io import read_bytes as _raw_read_bytes
from app.services.storage.file_io import read_text as _raw_read_text
from app.services.storage.utils import uri_to_key


@dataclass
class ModelCallResult:
    """Typed result from a model API call. error is set on failure."""

    output: str
    latency_ms: float
    first_token_ms: float
    tokens_generated: int
    error: ModelCallError | None = None

logger = logging.getLogger(__name__)


def _is_anthropic_endpoint(endpoint_url: str) -> bool:
    path = (urlparse(endpoint_url).path or "").lower()
    return path.endswith("/v1/messages") or "/apps/anthropic" in path


def _normalize_model_endpoint(endpoint_url: str) -> str:
    if _is_anthropic_endpoint(endpoint_url):
        path = (urlparse(endpoint_url).path or "").lower()
        if not path.endswith("/v1/messages"):
            return endpoint_url.rstrip("/") + "/v1/messages"
    return endpoint_url


def _extract_model_text(data: dict, anthropic_mode: bool) -> tuple[str, int]:
    if not anthropic_mode:
        content = data["choices"][0]["message"]["content"]
        tokens = data.get("usage", {}).get("completion_tokens", 0)
        return content, tokens

    blocks = data.get("content", [])
    text_parts: list[str] = []
    if isinstance(blocks, list):
        for block in blocks:
            if not isinstance(block, dict):
                continue
            if block.get("type") == "text" and isinstance(
                block.get("text"), str
            ):
                text_parts.append(block["text"])
    if text_parts:
        output = "\n".join(part for part in text_parts if part)
    else:
        output = str(data.get("content", ""))
    tokens = data.get("usage", {}).get("output_tokens", 0)
    return output, tokens


def _should_use_evalscope(params: dict) -> bool:
    """Enable EvalScope runner only when explicitly requested in task params."""
    return bool(
        params.get("use_evalscope") or params.get("runner") == "evalscope"
    )


async def _load_dataset_rows(
    storage: StorageBackend, source_uri: str
) -> list[dict]:
    """Load dataset rows from any supported format (Parquet, JSON, JSONL, CSV).

    Raises DatasetNotFoundError if the file doesn't exist,
    DatasetParseError if it can't be parsed.
    """
    ext = os.path.splitext(source_uri)[1].lower()
    key = uri_to_key(source_uri)

    try:
        # ── Parquet — read as binary, convert via pyarrow ──
        if ext == ".parquet":
            import io

            import pyarrow.parquet as pq

            data = await _read_bytes(storage, source_uri, key)
            table = pq.read_table(io.BytesIO(data))
            return table.to_pandas().to_dict(orient="records")

        # ── CSV ──
        if ext == ".csv":
            import io

            import pandas as pd

            text = await _read_text(storage, source_uri, key)
            df = pd.read_csv(io.StringIO(text))
            return df.fillna("").to_dict(orient="records")

        # ── Text formats: JSON / JSONL ──
        text = await _read_text(storage, source_uri, key)

        if ext == ".json":
            data = json.loads(text)
            return data if isinstance(data, list) else [data]

        # JSONL (default)
        rows: list[dict] = []
        for i, line in enumerate(text.splitlines()):
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as e:
                raise DatasetParseError(
                    f"JSONL parse error at line {i + 1} in {source_uri}: {e}"
                ) from e
        return rows

    except (DatasetNotFoundError, DatasetParseError):
        raise
    except json.JSONDecodeError as e:
        raise DatasetParseError(f"JSON parse error in {source_uri}: {e}") from e
    except Exception as e:
        raise DatasetParseError(f"Failed to read {source_uri}: {e}") from e


async def _read_bytes(
    storage: StorageBackend,
    source_uri: str,
    key: str | None = None,
) -> bytes:
    """Read a file as bytes. Raises DatasetNotFoundError if missing."""
    try:
        return await _raw_read_bytes(storage, source_uri, key=key)
    except FileNotFoundError:
        raise DatasetNotFoundError(f"Dataset file not found: {source_uri}")


async def _read_text(
    storage: StorageBackend,
    source_uri: str,
    key: str | None = None,
) -> str:
    """Read a file as UTF-8 text. Raises DatasetNotFoundError if missing."""
    try:
        return await _raw_read_text(storage, source_uri, key=key)
    except FileNotFoundError:
        raise DatasetNotFoundError(f"Dataset file not found: {source_uri}")


async def _run_task_with_evalscope(
    session: AsyncSession,
    storage: StorageBackend,
    task_id: uuid.UUID,
    repeat_count: int,
    model: LLMModel,
    dataset_ids: list[uuid.UUID],
    criteria_ids: list[uuid.UUID],
    params: dict,
):
    """Minimal EvalScope integration for single-dataset task execution."""
    if not dataset_ids:
        raise ValueError("No datasets selected for task")
    if not criteria_ids:
        raise ValueError("No criteria selected for task")

    dataset = await session.get(Dataset, dataset_ids[0])
    if not dataset:
        raise ValueError(f"Dataset {dataset_ids[0]} not found")

    criterion = await session.get(Criterion, criteria_ids[0])
    if not criterion:
        raise ValueError(f"Criterion {criteria_ids[0]} not found")

    subtask = EvalSubtask(
        task_id=task_id,
        run_index=0,
        status=TaskStatus.running,
        progress_pct=0.0,
    )
    session.add(subtask)
    await session.commit()
    await session.refresh(subtask)

    # Build storage keys for work directory
    work_dir_key = f"evalscope_outputs/{task_id}"
    stem = Path(dataset.source_uri).stem
    input_key = f"{work_dir_key}/input/general_qa/{stem}.jsonl"

    converted_count = await convert_dataset_to_general_qa_jsonl(
        storage, dataset.source_uri, input_key
    )
    if converted_count == 0:
        raise ValueError(
            "No valid rows after converting dataset to EvalScope format"
        )

    # Resolve URIs — local paths or s3:// URIs
    input_dir_key = f"{work_dir_key}/input/general_qa"
    task_cfg = build_evalscope_task_config(
        model=model,
        dataset=dataset,
        evalscope_input_root=storage.resolve_uri(input_dir_key),
        params=params,
        repeat_count=repeat_count,
        work_dir=storage.resolve_uri(work_dir_key),
    )

    await asyncio.to_thread(run_evalscope_task, task_cfg)

    score = await extract_primary_score(storage, work_dir_key)
    ingested_results = await ingest_evalscope_results(
        storage=storage,
        work_dir_key=work_dir_key,
        input_jsonl_key=input_key,
        default_score=score,
    )
    for row in ingested_results:
        result = EvalResult(
            task_id=task_id,
            subtask_id=subtask.id,
            dataset_id=dataset.id,
            criterion_id=criterion.id,
            prompt_text=row["prompt_text"],
            expected_output=row["expected_output"],
            model_output=row["model_output"],
            score=row["score"],
            latency_ms=row["latency_ms"],
            tokens_generated=row["tokens_generated"],
            first_token_ms=row["first_token_ms"],
        )
        session.add(result)

    subtask.last_completed_index = (
        len(ingested_results) if ingested_results else converted_count
    )
    subtask.progress_pct = 100.0
    subtask.status = TaskStatus.completed
    session.add(subtask)
    await session.commit()


async def _call_model(
    client: httpx.AsyncClient,
    model: LLMModel,
    prompt: str,
    params: dict,
) -> ModelCallResult:
    """Call an OpenAI-compatible API endpoint.

    Returns ModelCallResult. On failure, result.error is set and
    result.output is empty — never an error string.
    """
    headers = {}
    api_key = model.api_key or settings.DEFAULT_MODEL_API_KEY
    if not api_key:
        raise ConfigError(
            "Missing api_key: set model.api_key or DEFAULT_MODEL_API_KEY"
        )
    headers["Authorization"] = f"Bearer {api_key}"

    endpoint_url = _normalize_model_endpoint(
        model.endpoint_url or settings.DEFAULT_MODEL_ENDPOINT_URL
    )
    if not endpoint_url:
        raise ConfigError(
            "Missing endpoint_url: set model.endpoint_url or DEFAULT_MODEL_ENDPOINT_URL"
        )
    anthropic_mode = getattr(model, "api_format", "openai") == "anthropic"
    if not anthropic_mode:
        anthropic_mode = _is_anthropic_endpoint(endpoint_url)
    if anthropic_mode:
        headers["anthropic-version"] = "2023-06-01"

    model_name = model.model_name or model.name or settings.DEFAULT_MODEL_NAME
    if not model_name:
        raise ConfigError(
            "Missing model_name: set model.model_name/name or DEFAULT_MODEL_NAME"
        )

    body = {
        "model": model_name,
        "messages": [{"role": "user", "content": prompt}],
        **{
            k: v
            for k, v in params.items()
            if k in ("temperature", "max_tokens", "top_p", "seed")
        },
    }

    t0 = time.perf_counter()
    first_token_ms = 0.0
    try:
        resp = await client.post(
            endpoint_url, json=body, headers=headers, timeout=120.0
        )
        latency_ms = (time.perf_counter() - t0) * 1000
        resp.raise_for_status()
        data = resp.json()

        content, tokens = _extract_model_text(data, anthropic_mode)
        first_token_ms = latency_ms
        model_calls_total.labels(model_name=model_name, status="success").inc()
        model_call_duration_seconds.labels(model_name=model_name).observe(latency_ms / 1000)
        model_tokens_generated.labels(model_name=model_name).inc(tokens)
        task_prompts_processed.inc()
        return ModelCallResult(content, latency_ms, first_token_ms, tokens)

    except Exception as e:
        latency_ms = (time.perf_counter() - t0) * 1000
        model_calls_total.labels(model_name=model_name, status="error").inc()
        model_call_duration_seconds.labels(model_name=model_name).observe(latency_ms / 1000)
        logger.error("Model call failed: %s", e)

        # Classify the error
        error: ModelCallError
        if isinstance(e, httpx.TimeoutException):
            error = ModelTimeoutError(f"Model call timed out: {e}")
        elif isinstance(e, httpx.HTTPStatusError):
            status = e.response.status_code
            if status in (401, 403):
                error = ModelAuthError(f"Model auth failed (HTTP {status}): {e}")
            elif status == 429:
                error = ModelRateLimitError(f"Model rate limited: {e}")
            else:
                error = ModelCallError(f"Model HTTP error {status}: {e}")
        else:
            error = ModelCallError(f"Model call failed: {e}")

        return ModelCallResult(
            output="", latency_ms=latency_ms,
            first_token_ms=0.0, tokens_generated=0, error=error,
        )


def _extract_field(row: dict, keys: list[str]) -> str:
    """Extract the first non-empty value matching any of the candidate keys."""
    for key in keys:
        val = row.get(key)
        if val is not None and str(val).strip():
            return str(val)
    # Fallback: return the first string value in the row
    for val in row.values():
        if isinstance(val, str) and val.strip():
            return val
    return ""


def _validate_result(result: EvalResult) -> None:
    """Guard: refuse to persist dirty results.

    Raises ResultIngestionError if the result is in an invalid state.
    """
    from app.errors import ResultIngestionError

    if result.model_output.startswith("[ERROR]"):
        raise ResultIngestionError(
            f"Refusing dirty result: model_output contains error string: "
            f"{result.model_output[:80]}"
        )
    if not (0.0 <= result.score <= 1.0):
        raise ResultIngestionError(
            f"Score out of range [0, 1]: {result.score}"
        )
    if not result.is_valid and result.error_category is None:
        raise ResultIngestionError(
            "Invalid result must have an error_category"
        )


async def run_task(task_id: uuid.UUID):
    """Execute an evaluation task end-to-end."""
    storage = get_storage()

    async with AsyncSession(engine, expire_on_commit=False) as session:
        task = await session.get(EvalTask, task_id)
        if not task:
            logger.error("Task %s not found", task_id)
            return

        snapshot_model_id = task.model_id
        snapshot_dataset_ids = [
            uuid.UUID(d) for d in task.dataset_ids.split(",") if d
        ]
        snapshot_criteria_ids = [
            uuid.UUID(c) for c in task.criteria_ids.split(",") if c
        ]
        snapshot_params = json.loads(task.params_json or "{}")
        snapshot_repeat_count = task.repeat_count

        # Apply GPU and environment variable settings (scoped)
        _ENV_ALLOWLIST = {
            "CUDA_VISIBLE_DEVICES", "OMP_NUM_THREADS",
            "TOKENIZERS_PARALLELISM", "CUDA_LAUNCH_BLOCKING",
        }
        saved_env: dict[str, str | None] = {}
        if task.gpu_ids:
            saved_env["CUDA_VISIBLE_DEVICES"] = os.environ.get(
                "CUDA_VISIBLE_DEVICES"
            )
            os.environ["CUDA_VISIBLE_DEVICES"] = task.gpu_ids
        if task.env_vars:
            try:
                env_dict = json.loads(task.env_vars)
                if not isinstance(env_dict, dict):
                    raise InvalidEnvVarsError(
                        f"env_vars must be a JSON object, got {type(env_dict).__name__}"
                    )
                for k, v in env_dict.items():
                    if str(k) in _ENV_ALLOWLIST:
                        saved_env[str(k)] = os.environ.get(str(k))
                        os.environ[str(k)] = str(v)
            except (json.JSONDecodeError, TypeError) as e:
                raise InvalidEnvVarsError(
                    f"Invalid env_vars JSON: {e}"
                ) from e

        task.status = TaskStatus.running
        task.started_at = datetime.now(timezone.utc)
        tasks_running.inc()
        session.add(task)
        await session.commit()

        # vLLM deployment tracking — initialized here so the except block can see them
        _vllm_deployment: str | None = None
        _vllm_kubeconfig: str | None = None
        _vllm_namespace: str | None = None

        logger.info(
            "Task %s STARTED — model=%s, datasets=%d, criteria=%d, repeat=%d",
            task_id, snapshot_model_id, len(snapshot_dataset_ids),
            len(snapshot_criteria_ids), snapshot_repeat_count,
        )

        try:
            model = await session.get(LLMModel, snapshot_model_id)
            if not model:
                raise ValueError(f"Model {snapshot_model_id} not found")

            # ── K8s/vLLM deployment if needed ──
            execution_backend = getattr(task, "execution_backend", "external_api") or "external_api"
            if execution_backend == "k8s_vllm":
                from app.models.compute_cluster import ComputeCluster

                cluster_id = task.cluster_id or model.cluster_id
                if not cluster_id:
                    raise ConfigError(
                        "k8s_vllm backend requires cluster_id on task or model"
                    )
                cluster = await session.get(ComputeCluster, cluster_id)
                if not cluster or not cluster.kubeconfig_encrypted:
                    raise ConfigError(
                        f"Cluster {cluster_id} not found or has no kubeconfig"
                    )

                # Skip deployment if model is already running on a cluster
                if model.deploy_status == "running" and model.endpoint_url:
                    logger.info(
                        "Task %s: model '%s' already deployed at %s, reusing",
                        task_id, model.name, model.endpoint_url,
                    )
                    # Don't cleanup pre-existing deployment
                    _vllm_deployment = None
                else:
                    # Deploy vLLM from scratch
                    from app.services.k8s_vllm import full_vllm_lifecycle

                    # Determine HF model ID to deploy
                    hf_model_id = (
                        model.source_model_id
                        or model.model_name
                        or model.name
                    )
                    if not hf_model_id:
                        raise ConfigError(
                            "Model must have source_model_id or model_name for vLLM deployment"
                        )

                    # Parse resource config
                    res_cfg = {}
                    if hasattr(task, "resource_config") and task.resource_config:
                        try:
                            res_cfg = json.loads(task.resource_config)
                        except (json.JSONDecodeError, TypeError):
                            pass

                    gpu_count = res_cfg.get("gpu_count", 1)
                    gpu_type = res_cfg.get("gpu_type", cluster.gpu_type or "")
                    memory_gb = res_cfg.get("memory_gb", 40)

                    logger.info(
                        "Task %s: deploying vLLM for '%s' on cluster '%s' "
                        "(%d GPU, %s, %dGB)",
                        task_id, hf_model_id, cluster.name,
                        gpu_count, gpu_type, memory_gb,
                    )

                    # Update model deploy status
                    model.deploy_status = "deploying"
                    model.cluster_id = cluster.id
                    session.add(model)
                    await session.commit()

                    hf_token = (
                        model.api_key
                        if model.model_type in ("huggingface", "modelscope")
                        else ""
                    )

                    try:
                        vllm_image = getattr(cluster, "vllm_image", "") or ""
                        vllm_endpoint, _vllm_deployment = await full_vllm_lifecycle(
                            kubeconfig_encrypted=cluster.kubeconfig_encrypted,
                            namespace=cluster.namespace,
                            model_name=model.name,
                            hf_model_id=hf_model_id,
                            gpu_count=gpu_count,
                            gpu_type=gpu_type,
                            memory_gb=memory_gb,
                            hf_token=hf_token,
                            image=vllm_image,
                        )
                        _vllm_kubeconfig = cluster.kubeconfig_encrypted
                        _vllm_namespace = cluster.namespace
                    except Exception as e:
                        model.deploy_status = "failed"
                        session.add(model)
                        await session.commit()
                        raise ConfigError(
                            f"vLLM deployment failed: {e}"
                        ) from e

                    # Override model endpoint with the deployed vLLM endpoint
                    model.endpoint_url = vllm_endpoint
                    model.deploy_status = "running"
                    model.vllm_deployment_name = _vllm_deployment
                    session.add(model)
                    await session.commit()

                    logger.info(
                        "Task %s: vLLM deployed at %s (deployment=%s)",
                        task_id, vllm_endpoint, _vllm_deployment,
                    )

            logger.info(
                "Task %s using model '%s' (%s @ %s) [backend=%s]",
                task_id, model.name, model.model_name,
                model.endpoint_url, execution_backend,
            )

            dataset_ids = snapshot_dataset_ids
            criteria_ids = snapshot_criteria_ids
            params = snapshot_params

            if _should_use_evalscope(params):
                await _run_task_with_evalscope(
                    session=session,
                    storage=storage,
                    task_id=task_id,
                    repeat_count=snapshot_repeat_count,
                    model=model,
                    dataset_ids=dataset_ids,
                    criteria_ids=criteria_ids,
                    params=params,
                )
                task.status = TaskStatus.completed
                task.finished_at = datetime.now(timezone.utc)
                session.add(task)
                await session.commit()
                return

            # Load datasets — fail explicitly on missing/broken datasets
            all_rows: list[tuple[uuid.UUID, dict]] = []
            dataset_errors: list[str] = []
            for ds_id in dataset_ids:
                ds = await session.get(Dataset, ds_id)
                if not ds:
                    dataset_errors.append(f"Dataset {ds_id} not found in database")
                    logger.error("Task %s: dataset %s not found", task_id, ds_id)
                    continue
                try:
                    rows = await _load_dataset_rows(storage, ds.source_uri)
                except (DatasetNotFoundError, DatasetParseError) as e:
                    dataset_errors.append(f"Dataset '{ds.name}': {e.detail}")
                    logger.error("Task %s: %s", task_id, e.detail)
                    continue
                if not rows:
                    dataset_errors.append(f"Dataset '{ds.name}' loaded 0 rows")
                    logger.warning("Task %s: dataset '%s' has 0 rows", task_id, ds.name)
                    continue
                logger.info("Task %s: loaded %d rows from '%s'", task_id, len(rows), ds.name)
                for row in rows:
                    all_rows.append((ds_id, row))

            if not all_rows:
                error_summary = (
                    "; ".join(dataset_errors) if dataset_errors else "all datasets empty"
                )
                raise DatasetEmptyError(
                    f"No rows loaded from any dataset — cannot proceed: {error_summary}"
                )
            if dataset_errors:
                logger.warning(
                    "Task %s: %d dataset(s) failed but continuing with %d rows: %s",
                    task_id, len(dataset_errors), len(all_rows),
                    "; ".join(dataset_errors),
                )
            logger.info("Task %s: total %d prompt rows to evaluate", task_id, len(all_rows))

            # Load criteria
            criteria: list[Criterion] = []
            enriched_configs: dict[str, str] = {}  # criterion_id -> enriched config_json
            for c_id in criteria_ids:
                c = await session.get(Criterion, c_id)
                if c:
                    criteria.append(c)
                    # For llm_judge, resolve judge_model_id to actual credentials
                    if c.type == "llm_judge":
                        cfg = json.loads(c.config_json) if c.config_json else {}
                        judge_model_id = cfg.get("judge_model_id")
                        if judge_model_id:
                            judge_model = await session.get(
                                LLMModel, uuid.UUID(judge_model_id)
                            )
                            if not judge_model:
                                raise EvaluatorConfigError(
                                    f"Judge model {judge_model_id} for "
                                    f"criterion '{c.name}' not found"
                                )
                            cfg["endpoint_url"] = judge_model.endpoint_url
                            cfg["api_key"] = judge_model.api_key
                            cfg["model_name"] = (
                                judge_model.model_name or judge_model.name
                            )
                            if getattr(judge_model, "api_format", "openai") == "anthropic":
                                cfg["api_format"] = "anthropic"
                        enriched_configs[str(c.id)] = json.dumps(cfg)

            if not criteria:
                raise ValueError("No valid criteria found")
            logger.info(
                "Task %s: %d criteria loaded — %s",
                task_id, len(criteria),
                ", ".join(c.name for c in criteria),
            )

            # Create or reuse subtasks (for checkpoint resume)
            existing_stmt = (
                select(EvalSubtask)
                .where(EvalSubtask.task_id == task.id)
                .order_by(EvalSubtask.run_index)
            )
            existing_subtasks = (await session.exec(existing_stmt)).all()

            if existing_subtasks:
                # Resume: reuse existing subtasks
                subtasks = list(existing_subtasks)
                for st in subtasks:
                    if st.status != TaskStatus.completed:
                        st.status = TaskStatus.running
                        session.add(st)
                await session.commit()
                logger.info(
                    "Task %s: resuming with %d existing subtask(s), "
                    "%d already completed",
                    task_id, len(subtasks),
                    sum(1 for s in subtasks if s.status == TaskStatus.completed),
                )
            else:
                # Fresh start: create new subtasks
                subtasks = []
                for run_idx in range(task.repeat_count):
                    st = EvalSubtask(
                        task_id=task.id,
                        run_index=run_idx,
                        status=TaskStatus.running,
                    )
                    session.add(st)
                    subtasks.append(st)
                await session.commit()
                for st in subtasks:
                    await session.refresh(st)
                logger.info(
                    "Task %s: created %d subtask(s), starting evaluation",
                    task_id, len(subtasks),
                )

            # ── Run evaluation — all subtasks in parallel ──
            # Global semaphore limits total concurrent model calls
            MAX_MODEL_PARALLEL = 4
            MAX_CRITERION_PARALLEL = 8

            field_mappings: dict = params.get("field_mappings", {})
            global_pk = params.get("prompt_field", "")
            global_ek = params.get("expected_field", "")
            model_sem = asyncio.Semaphore(MAX_MODEL_PARALLEL)
            crit_sem = asyncio.Semaphore(MAX_CRITERION_PARALLEL)

            # Snapshot immutable data for subtask coroutines
            _task_id = task.id
            _model_snapshot = model
            _criteria_snapshot = list(criteria)
            _enriched_snapshot = dict(enriched_configs)

            async def _eval_crit_retry(
                crit_type: str, cfg: str, exp: str, out: str,
                crit_name: str,
            ) -> float:
                """Retry criterion evaluation up to 3 times.

                Raises EvaluationError if all attempts fail — never returns
                a fabricated 0.0 score.
                """
                last_err: Exception | None = None
                for attempt in range(3):
                    try:
                        score = await asyncio.to_thread(
                            run_criterion, crit_type, cfg, exp, out,
                        )
                        evaluations_total.labels(
                            criterion_type=crit_type, status="success",
                        ).inc()
                        evaluation_score.labels(
                            criterion_type=crit_type,
                        ).observe(score)
                        return score
                    except Exception as e:
                        last_err = e
                        if attempt < 2:
                            logger.warning(
                                "Task %s: '%s' attempt %d/3: %s",
                                task_id, crit_name, attempt + 1, e,
                            )
                            await asyncio.sleep(2 ** attempt)
                        else:
                            evaluations_total.labels(
                                criterion_type=crit_type, status="error",
                            ).inc()
                            logger.error(
                                "Task %s: '%s' failed x3: %s",
                                task_id, crit_name, e,
                            )
                raise EvaluationError(
                    f"Criterion '{crit_name}' failed after 3 attempts: {last_err}"
                )

            async def _run_subtask(
                run_idx: int,
                subtask_id: uuid.UUID,
                seed_params: dict,
                client: httpx.AsyncClient,
            ) -> None:
                """Run one subtask with its own DB session."""
                async with AsyncSession(engine) as sub_session:
                    st = await sub_session.get(EvalSubtask, subtask_id)
                    if not st:
                        return
                    total = len(all_rows)
                    batch_size = MAX_MODEL_PARALLEL * 2

                    # Resume from checkpoint: skip already-completed prompts
                    start_idx = st.last_completed_index if st.last_completed_index > 0 else 0
                    if start_idx > 0:
                        logger.info(
                            "Task %s run %d: resuming from prompt %d/%d",
                            task_id, run_idx + 1, start_idx, total,
                        )
                    completed = start_idx

                    for batch_start in range(start_idx, total, batch_size):
                        # Check for pause/cancel
                        t = await sub_session.get(EvalTask, _task_id)
                        if t and t.status in (
                            TaskStatus.paused,
                            TaskStatus.failed,
                            TaskStatus.cancelled,
                        ):
                            st.status = t.status
                            sub_session.add(st)
                            await sub_session.commit()
                            logger.info(
                                "Task %s run %d stopped (%s) at %d/%d",
                                task_id, run_idx + 1, t.status,
                                completed, total,
                            )
                            return

                        batch = all_rows[batch_start:batch_start + batch_size]

                        async def _do_prompt(
                            idx: int,
                            ds_id: uuid.UUID,
                            row: dict,
                        ) -> list[EvalResult]:
                            async with model_sem:
                                ds_map = field_mappings.get(str(ds_id), {})
                                pk = ds_map.get("prompt_field") or global_pk
                                ek = ds_map.get("expected_field") or global_ek
                                prompt = (
                                    str(row.get(pk, ""))
                                    if pk and pk in row
                                    else _extract_field(row, [
                                        "prompt", "instruction", "query",
                                        "input", "question", "text",
                                        "content",
                                    ])
                                )
                                expected = (
                                    str(row.get(ek, ""))
                                    if ek and ek in row
                                    else _extract_field(row, [
                                        "expected", "response", "output",
                                        "answer", "target", "label",
                                    ])
                                )
                                mcr = await _call_model(
                                    client, _model_snapshot,
                                    prompt, seed_params,
                                )
                                if idx % 20 == 0 or idx == 0:
                                    logger.info(
                                        "Task %s run %d: %d/%d — %.0fms",
                                        task_id, run_idx + 1,
                                        idx + 1, total, mcr.latency_ms,
                                    )

                                # If model call failed, write invalid results
                                # for all criteria — do NOT score error output
                                if mcr.error is not None:
                                    return [
                                        EvalResult(
                                            task_id=_task_id,
                                            subtask_id=subtask_id,
                                            dataset_id=ds_id,
                                            criterion_id=c.id,
                                            prompt_text=prompt,
                                            expected_output=expected,
                                            model_output="",
                                            score=0.0,
                                            latency_ms=mcr.latency_ms,
                                            tokens_generated=0,
                                            first_token_ms=0.0,
                                            is_valid=False,
                                            error_category=mcr.error.error_code,
                                        )
                                        for c in _criteria_snapshot
                                    ]

                                async def _score(c):
                                    async with crit_sem:
                                        cid = str(c.id)
                                        cfg = _enriched_snapshot.get(
                                            cid, c.config_json,
                                        )
                                        try:
                                            sc = await _eval_crit_retry(
                                                c.type, cfg, expected,
                                                mcr.output, c.name,
                                            )
                                            return EvalResult(
                                                task_id=_task_id,
                                                subtask_id=subtask_id,
                                                dataset_id=ds_id,
                                                criterion_id=c.id,
                                                prompt_text=prompt,
                                                expected_output=expected,
                                                model_output=mcr.output,
                                                score=sc,
                                                latency_ms=mcr.latency_ms,
                                                tokens_generated=mcr.tokens_generated,
                                                first_token_ms=mcr.first_token_ms,
                                            )
                                        except EvaluationError as e:
                                            return EvalResult(
                                                task_id=_task_id,
                                                subtask_id=subtask_id,
                                                dataset_id=ds_id,
                                                criterion_id=c.id,
                                                prompt_text=prompt,
                                                expected_output=expected,
                                                model_output=mcr.output,
                                                score=0.0,
                                                latency_ms=mcr.latency_ms,
                                                tokens_generated=mcr.tokens_generated,
                                                first_token_ms=mcr.first_token_ms,
                                                is_valid=False,
                                                error_category=e.error_code,
                                            )

                                return list(await asyncio.gather(
                                    *[_score(c) for c in _criteria_snapshot]
                                ))

                        batch_results = await asyncio.gather(
                            *[
                                _do_prompt(batch_start + i, ds_id, row)
                                for i, (ds_id, row) in enumerate(batch)
                            ]
                        )

                        for prompt_results in batch_results:
                            for r in prompt_results:
                                _validate_result(r)
                                sub_session.add(r)
                            completed += 1

                        st.last_completed_index = completed
                        st.progress_pct = completed / total * 100
                        sub_session.add(st)
                        await sub_session.commit()

                    st.status = TaskStatus.completed
                    st.progress_pct = 100.0
                    sub_session.add(st)
                    await sub_session.commit()
                    logger.info(
                        "Task %s run %d: COMPLETED (%d prompts)",
                        task_id, run_idx + 1, total,
                    )

            # Launch non-completed subtasks concurrently
            async with httpx.AsyncClient(timeout=180.0) as client:
                subtask_coros = []
                for run_idx, subtask in enumerate(subtasks):
                    if subtask.status == TaskStatus.completed:
                        continue  # Already done, skip
                    sp = dict(params)
                    if task.seed_strategy == "random":
                        sp["seed"] = random.randint(0, 2**31)
                    elif task.seed_strategy == "fixed":
                        sp["seed"] = 42 + run_idx
                    subtask_coros.append(
                        _run_subtask(run_idx, subtask.id, sp, client)
                    )
                await asyncio.gather(*subtask_coros)

            task.status = TaskStatus.completed
            task.finished_at = datetime.now(timezone.utc)
            elapsed = (task.finished_at - task.started_at).total_seconds()
            tasks_total.labels(status="completed").inc()
            tasks_running.dec()
            task_duration_seconds.observe(elapsed)
            logger.info(
                "Task %s COMPLETED in %.1fs — %d runs × %d prompts × %d criteria",
                task_id, elapsed, len(subtasks), len(all_rows), len(criteria),
            )

            # Cleanup vLLM deployment if we created one
            if _vllm_deployment and _vllm_kubeconfig and _vllm_namespace:
                try:
                    from app.services.k8s_vllm import cleanup_vllm
                    await cleanup_vllm(
                        _vllm_kubeconfig, _vllm_namespace, _vllm_deployment,
                    )
                    # Reset model deploy status
                    model.deploy_status = "stopped"
                    model.endpoint_url = ""
                    session.add(model)
                    logger.info(
                        "Task %s: vLLM deployment %s cleaned up",
                        task_id, _vllm_deployment,
                    )
                except Exception as ce:
                    logger.error(
                        "Task %s: vLLM cleanup failed: %s",
                        task_id, ce,
                    )

        except Exception as e:
            tasks_total.labels(status="failed").inc()
            tasks_running.dec()
            logger.exception("Task %s FAILED: %s", task_id, e)

            # Cleanup vLLM on failure too (K8s call — no DB session needed)
            if _vllm_deployment and _vllm_kubeconfig and _vllm_namespace:
                try:
                    from app.services.k8s_vllm import cleanup_vllm
                    await cleanup_vllm(
                        _vllm_kubeconfig, _vllm_namespace, _vllm_deployment,
                    )
                except Exception:
                    logger.warning("vLLM cleanup failed during error handling", exc_info=True)

            # Rollback the failed transaction before updating status
            await session.rollback()
            try:
                # Re-fetch task in clean session state
                task = await session.get(EvalTask, task_id)
                if task:
                    task.status = TaskStatus.failed
                    task.finished_at = datetime.now(timezone.utc)
                    session.add(task)
                    # Mark incomplete subtasks as failed
                    stmt = select(EvalSubtask).where(
                        EvalSubtask.task_id == task_id,
                        EvalSubtask.status != TaskStatus.completed,
                    )
                    result = await session.exec(stmt)
                    for st in result.all():
                        st.status = TaskStatus.failed
                        st.error_log = str(e)[:500]
                        session.add(st)
                    # Reset model deploy status if we had a vLLM deployment
                    if _vllm_deployment:
                        model_for_cleanup = await session.get(
                            LLMModel, snapshot_model_id,
                        )
                        if model_for_cleanup:
                            model_for_cleanup.deploy_status = "failed"
                            model_for_cleanup.endpoint_url = ""
                            session.add(model_for_cleanup)
                    await session.commit()
                    logger.info("Task %s marked as FAILED in database", task_id)
            except Exception as cleanup_err:
                logger.error(
                    "Task %s: failed to update status after error: %s",
                    task_id, cleanup_err,
                )
            return

        # Restore environment variables
        for k, orig in saved_env.items():
            if orig is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = orig

        session.add(task)
        await session.commit()
