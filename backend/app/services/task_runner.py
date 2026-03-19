"""In-process task runner for MVP. Runs eval tasks as asyncio background tasks."""

import asyncio
import json
import logging
import random
import time
import uuid
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

import httpx
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.database import engine
from app.config import settings
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
            if block.get("type") == "text" and isinstance(block.get("text"), str):
                text_parts.append(block["text"])
    if text_parts:
        output = "\n".join(part for part in text_parts if part)
    else:
        output = str(data.get("content", ""))
    tokens = data.get("usage", {}).get("output_tokens", 0)
    return output, tokens


def _should_use_evalscope(params: dict) -> bool:
    """Enable EvalScope runner only when explicitly requested in task params."""
    return bool(params.get("use_evalscope") or params.get("runner") == "evalscope")


async def _run_task_with_evalscope(
    session: AsyncSession,
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

    work_dir = Path("data/evalscope_outputs") / str(task_id)
    input_dir = work_dir / "input" / "general_qa"
    input_file = input_dir / f"{Path(dataset.source_uri).stem}.jsonl"

    converted_count = convert_dataset_to_general_qa_jsonl(dataset.source_uri, str(input_file))
    if converted_count == 0:
        raise ValueError("No valid rows after converting dataset to EvalScope general_qa format")

    task_cfg = build_evalscope_task_config(
        model=model,
        dataset=dataset,
        evalscope_input_root=str(input_dir),
        params=params,
        repeat_count=repeat_count,
        work_dir=str(work_dir),
    )

    # run_task is synchronous; execute in thread to avoid blocking the event loop.
    await asyncio.to_thread(run_evalscope_task, task_cfg)

    score = extract_primary_score(str(work_dir))
    ingested_results = ingest_evalscope_results(
        work_dir=str(work_dir),
        input_jsonl_path=str(input_file),
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

    subtask.last_completed_index = len(ingested_results) if ingested_results else converted_count
    subtask.progress_pct = 100.0
    subtask.status = TaskStatus.completed
    session.add(subtask)
    await session.commit()


def _load_dataset_rows(file_path: str) -> list[dict]:
    """Load JSONL/JSON dataset rows. Each row must have 'prompt' and optionally 'expected'."""
    rows = []
    path = Path(file_path)
    if not path.exists():
        logger.error(f"Dataset file not found: {file_path}")
        return rows

    with open(path) as f:
        if file_path.endswith(".json"):
            data = json.load(f)
            rows = data if isinstance(data, list) else [data]
        else:
            for line in f:
                line = line.strip()
                if line:
                    rows.append(json.loads(line))
    return rows


async def _call_model(
    client: httpx.AsyncClient,
    model: LLMModel,
    prompt: str,
    params: dict,
) -> tuple[str, float, float, int]:
    """Call an OpenAI-compatible API endpoint.

    Returns (output, latency_ms, first_token_ms, tokens).
    """
    headers = {}
    api_key = model.api_key or settings.DEFAULT_MODEL_API_KEY
    if not api_key:
        raise ValueError("Missing api_key: set model.api_key or DEFAULT_MODEL_API_KEY")
    headers["Authorization"] = f"Bearer {api_key}"

    endpoint_url = _normalize_model_endpoint(
        model.endpoint_url or settings.DEFAULT_MODEL_ENDPOINT_URL
    )
    if not endpoint_url:
        raise ValueError("Missing endpoint_url: set model.endpoint_url or DEFAULT_MODEL_ENDPOINT_URL")
    anthropic_mode = getattr(model, "api_format", "openai") == "anthropic"
    if not anthropic_mode:
        anthropic_mode = _is_anthropic_endpoint(endpoint_url)
    if anthropic_mode:
        headers["anthropic-version"] = "2023-06-01"

    model_name = model.model_name or model.name or settings.DEFAULT_MODEL_NAME
    if not model_name:
        raise ValueError("Missing model_name: set model.model_name/name or DEFAULT_MODEL_NAME")

    body = {
        "model": model_name,
        "messages": [{"role": "user", "content": prompt}],
        **{k: v for k, v in params.items() if k in ("temperature", "max_tokens", "top_p", "seed")},
    }

    t0 = time.perf_counter()
    first_token_ms = 0.0
    try:
        resp = await client.post(
            endpoint_url,
            json=body,
            headers=headers,
            timeout=120.0,
        )
        latency_ms = (time.perf_counter() - t0) * 1000
        resp.raise_for_status()
        data = resp.json()

        content, tokens = _extract_model_text(data, anthropic_mode)
        first_token_ms = latency_ms  # non-streaming, approximate
        return content, latency_ms, first_token_ms, tokens

    except Exception as e:
        latency_ms = (time.perf_counter() - t0) * 1000
        logger.error(f"Model call failed: {e}")
        return f"[ERROR] {e}", latency_ms, 0.0, 0


async def run_task(task_id: uuid.UUID):
    """Execute an evaluation task end-to-end."""
    async with AsyncSession(engine, expire_on_commit=False) as session:
        task = await session.get(EvalTask, task_id)
        if not task:
            logger.error(f"Task {task_id} not found")
            return

        # Snapshot fields before first commit to avoid expired attribute lazy-load issues.
        snapshot_model_id = task.model_id
        snapshot_dataset_ids = [uuid.UUID(d) for d in task.dataset_ids.split(",") if d]
        snapshot_criteria_ids = [uuid.UUID(c) for c in task.criteria_ids.split(",") if c]
        snapshot_params = json.loads(task.params_json or "{}")
        snapshot_repeat_count = task.repeat_count

        # Mark running
        task.status = TaskStatus.running
        task.started_at = datetime.utcnow()
        session.add(task)
        await session.commit()

        try:
            model = await session.get(LLMModel, snapshot_model_id)
            if not model:
                raise ValueError(f"Model {snapshot_model_id} not found")

            dataset_ids = snapshot_dataset_ids
            criteria_ids = snapshot_criteria_ids
            params = snapshot_params

            if _should_use_evalscope(params):
                await _run_task_with_evalscope(
                    session=session,
                    task_id=task_id,
                    repeat_count=snapshot_repeat_count,
                    model=model,
                    dataset_ids=dataset_ids,
                    criteria_ids=criteria_ids,
                    params=params,
                )
                task.status = TaskStatus.completed
                task.finished_at = datetime.utcnow()
                session.add(task)
                await session.commit()
                return

            # Load datasets
            all_rows: list[tuple[uuid.UUID, dict]] = []
            for ds_id in dataset_ids:
                ds = await session.get(Dataset, ds_id)
                if not ds:
                    continue
                rows = _load_dataset_rows(ds.source_uri)
                for row in rows:
                    all_rows.append((ds_id, row))

            # Load criteria
            criteria: list[Criterion] = []
            for c_id in criteria_ids:
                c = await session.get(Criterion, c_id)
                if c:
                    criteria.append(c)

            if not criteria:
                raise ValueError("No valid criteria found")

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
            # Refresh to get IDs
            for st in subtasks:
                await session.refresh(st)

            # Run evaluation
            completed = 0
            async with httpx.AsyncClient() as client:
                for run_idx, subtask in enumerate(subtasks):
                    run_params = dict(params)
                    if task.seed_strategy == "random":
                        run_params["seed"] = random.randint(0, 2**31)
                    elif task.seed_strategy == "fixed":
                        run_params["seed"] = 42 + run_idx

                    for ds_id, row in all_rows:
                        # Check if task was paused/cancelled
                        await session.refresh(task)
                        if task.status in (TaskStatus.paused, TaskStatus.failed):
                            subtask.status = TaskStatus.paused
                            session.add(subtask)
                            await session.commit()
                            return

                        prompt = row.get(
                            "prompt",
                            row.get("query", row.get("input", row.get("question", ""))),
                        )
                        expected = row.get(
                            "expected",
                            row.get("response", row.get("output", row.get("answer", ""))),
                        )

                        output, latency, first_token, tokens = await _call_model(
                            client, model, prompt, run_params
                        )

                        for criterion in criteria:
                            score = run_criterion(
                                criterion.type, criterion.config_json, expected, output
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
                            completed += 1

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

            task.status = TaskStatus.completed
            task.finished_at = datetime.utcnow()

        except Exception as e:
            logger.exception(f"Task {task_id} failed: {e}")
            task.status = TaskStatus.failed
            # Mark all pending subtasks as failed
            stmt = select(EvalSubtask).where(
                EvalSubtask.task_id == task_id,
                EvalSubtask.status != TaskStatus.completed,
            )
            result = await session.exec(stmt)
            for st in result.all():
                st.status = TaskStatus.failed
                st.error_log = str(e)
                session.add(st)

        session.add(task)
        await session.commit()
