"""In-process task runner for MVP. Runs eval tasks as asyncio background tasks."""

import asyncio
import json
import logging
import os
import random
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import httpx
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.config import settings
from app.database import engine
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
from app.services.storage.utils import uri_to_key

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
    """Load JSONL/JSON dataset rows via storage backend."""
    key = uri_to_key(source_uri)
    if key is not None:
        if not await storage.exists(key):
            logger.error("Dataset file not found in storage: %s", key)
            return []
        text = await storage.read_text(key)
    else:
        # Mounted path — read directly from local filesystem
        path = Path(source_uri)
        if not path.exists():
            logger.error("Dataset file not found: %s", source_uri)
            return []
        text = await asyncio.to_thread(path.read_text, encoding="utf-8")

    is_json = source_uri.endswith(".json") or (key and key.endswith(".json"))
    if is_json:
        data = json.loads(text)
        return data if isinstance(data, list) else [data]

    rows: list[dict] = []
    for line in text.splitlines():
        line = line.strip()
        if line:
            rows.append(json.loads(line))
    return rows


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
) -> tuple[str, float, float, int]:
    """Call an OpenAI-compatible API endpoint."""
    headers = {}
    api_key = model.api_key or settings.DEFAULT_MODEL_API_KEY
    if not api_key:
        raise ValueError(
            "Missing api_key: set model.api_key or DEFAULT_MODEL_API_KEY"
        )
    headers["Authorization"] = f"Bearer {api_key}"

    endpoint_url = _normalize_model_endpoint(
        model.endpoint_url or settings.DEFAULT_MODEL_ENDPOINT_URL
    )
    if not endpoint_url:
        raise ValueError(
            "Missing endpoint_url: set model.endpoint_url or DEFAULT_MODEL_ENDPOINT_URL"
        )
    anthropic_mode = getattr(model, "api_format", "openai") == "anthropic"
    if not anthropic_mode:
        anthropic_mode = _is_anthropic_endpoint(endpoint_url)
    if anthropic_mode:
        headers["anthropic-version"] = "2023-06-01"

    model_name = model.model_name or model.name or settings.DEFAULT_MODEL_NAME
    if not model_name:
        raise ValueError(
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
        return content, latency_ms, first_token_ms, tokens

    except Exception as e:
        latency_ms = (time.perf_counter() - t0) * 1000
        logger.error("Model call failed: %s", e)
        return f"[ERROR] {e}", latency_ms, 0.0, 0


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
                for k, v in env_dict.items():
                    if str(k) in _ENV_ALLOWLIST:
                        saved_env[str(k)] = os.environ.get(str(k))
                        os.environ[str(k)] = str(v)
            except (json.JSONDecodeError, TypeError):
                pass

        task.status = TaskStatus.running
        task.started_at = datetime.now(timezone.utc)
        session.add(task)
        await session.commit()
        logger.info(
            "Task %s STARTED — model=%s, datasets=%d, criteria=%d, repeat=%d",
            task_id, snapshot_model_id, len(snapshot_dataset_ids),
            len(snapshot_criteria_ids), snapshot_repeat_count,
        )

        try:
            model = await session.get(LLMModel, snapshot_model_id)
            if not model:
                raise ValueError(f"Model {snapshot_model_id} not found")
            logger.info(
                "Task %s using model '%s' (%s @ %s)",
                task_id, model.name, model.model_name, model.endpoint_url,
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

            # Load datasets
            all_rows: list[tuple[uuid.UUID, dict]] = []
            for ds_id in dataset_ids:
                ds = await session.get(Dataset, ds_id)
                if not ds:
                    logger.warning("Task %s: dataset %s not found, skipping", task_id, ds_id)
                    continue
                rows = await _load_dataset_rows(storage, ds.source_uri)
                logger.info("Task %s: loaded %d rows from '%s'", task_id, len(rows), ds.name)
                for row in rows:
                    all_rows.append((ds_id, row))
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
                        try:
                            cfg = json.loads(c.config_json) if c.config_json else {}
                            judge_model_id = cfg.get("judge_model_id")
                            if judge_model_id:
                                judge_model = await session.get(LLMModel, uuid.UUID(judge_model_id))
                                if judge_model:
                                    cfg["endpoint_url"] = judge_model.endpoint_url
                                    cfg["api_key"] = judge_model.api_key
                                    cfg["model_name"] = judge_model.model_name or judge_model.name
                                    if getattr(judge_model, "api_format", "openai") == "anthropic":
                                        cfg["api_format"] = "anthropic"
                            enriched_configs[str(c.id)] = json.dumps(cfg)
                        except Exception:
                            enriched_configs[str(c.id)] = c.config_json

            if not criteria:
                raise ValueError("No valid criteria found")
            logger.info(
                "Task %s: %d criteria loaded — %s",
                task_id, len(criteria),
                ", ".join(c.name for c in criteria),
            )

            # Create subtasks
            subtasks: list[EvalSubtask] = []
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

            # Run evaluation
            async with httpx.AsyncClient(timeout=180.0) as client:
                for run_idx, subtask in enumerate(subtasks):
                    run_params = dict(params)
                    if task.seed_strategy == "random":
                        run_params["seed"] = random.randint(0, 2**31)
                    elif task.seed_strategy == "fixed":
                        run_params["seed"] = 42 + run_idx

                    for ds_id, row in all_rows:
                        await session.refresh(task)
                        if task.status in (
                            TaskStatus.paused,
                            TaskStatus.failed,
                            TaskStatus.cancelled,
                        ):
                            subtask.status = task.status
                            session.add(subtask)
                            await session.commit()
                            logger.info(
                                "Task %s stopped (status=%s) at prompt %d/%d",
                                task_id, task.status, subtask.last_completed_index, len(all_rows),
                            )
                            return

                        # Use user-specified field mapping, fallback to auto-detect
                        prompt_key = params.get("prompt_field", "")
                        prompt = (
                            str(row.get(prompt_key, ""))
                            if prompt_key and prompt_key in row
                            else _extract_field(row, [
                                "prompt", "instruction", "query",
                                "input", "question", "text", "content",
                            ])
                        )
                        expected_key = params.get("expected_field", "")
                        expected = (
                            str(row.get(expected_key, ""))
                            if expected_key and expected_key in row
                            else _extract_field(row, [
                                "expected", "response", "output",
                                "answer", "target", "label",
                            ])
                        )

                        output, latency, first_token, tokens = (
                            await _call_model(client, model, prompt, run_params)
                        )
                        idx = subtask.last_completed_index
                        if idx % 10 == 0 or idx == 0:
                            logger.info(
                                "Task %s run %d: prompt %d/%d — %.0fms, %d tokens",
                                task_id, run_idx + 1,
                                subtask.last_completed_index + 1, len(all_rows),
                                latency, tokens,
                            )

                        for criterion in criteria:
                            cid = str(criterion.id)
                            cfg_json = enriched_configs.get(cid, criterion.config_json)
                            # Retry up to 3 times for transient errors (timeouts, etc.)
                            score = 0.0
                            for attempt in range(3):
                                try:
                                    score = await asyncio.to_thread(
                                        run_criterion,
                                        criterion.type,
                                        cfg_json,
                                        expected,
                                        output,
                                    )
                                    break
                                except Exception as eval_err:
                                    if attempt < 2:
                                        logger.warning(
                                            "Task %s: criterion '%s' failed (attempt %d/3): %s",
                                            task_id, criterion.name, attempt + 1, eval_err,
                                        )
                                        await asyncio.sleep(2 ** attempt)
                                    else:
                                        logger.error(
                                            "Task %s: criterion '%s' failed x3, score=0: %s",
                                            task_id, criterion.name, eval_err,
                                        )

                            result = EvalResult(
                                task_id=task.id,
                                subtask_id=subtask.id,
                                dataset_id=ds_id,
                                criterion_id=criterion.id,
                                prompt_text=prompt,
                                expected_output=expected,
                                model_output=output,
                                score=score,
                                latency_ms=latency,
                                tokens_generated=tokens,
                                first_token_ms=first_token,
                            )
                            session.add(result)

                        subtask.last_completed_index += 1
                        subtask.progress_pct = (
                            subtask.last_completed_index / len(all_rows) * 100
                        )
                        session.add(subtask)
                        await session.commit()

                    subtask.status = TaskStatus.completed
                    subtask.progress_pct = 100.0
                    session.add(subtask)
                    await session.commit()
                    logger.info(
                        "Task %s run %d: COMPLETED (%d prompts)",
                        task_id, run_idx + 1, len(all_rows),
                    )

            task.status = TaskStatus.completed
            task.finished_at = datetime.now(timezone.utc)
            elapsed = (task.finished_at - task.started_at).total_seconds()
            logger.info(
                "Task %s COMPLETED in %.1fs — %d runs × %d prompts × %d criteria",
                task_id, elapsed, len(subtasks), len(all_rows), len(criteria),
            )

        except Exception as e:
            logger.exception("Task %s FAILED: %s", task_id, e)
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
