"""EvalScope integration helpers for MVP migration.

This module provides a minimal bridge from dataset files and task params
into EvalScope TaskConfig + run_task, while keeping the existing backend API.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING, Any

from app.services.storage.base import StorageBackend
from app.services.storage.utils import uri_to_key

if TYPE_CHECKING:
    from app.models.dataset import Dataset
    from app.models.llm_model import LLMModel


def _normalize_qa_row(row: dict[str, Any]) -> dict[str, str] | None:
    """Normalize one row into EvalScope general_qa format."""
    query = (
        row.get("query")
        or row.get("prompt")
        or row.get("input")
        or row.get("question")
    )
    if not query:
        return None

    normalized = {"query": str(query)}
    response = (
        row.get("response")
        or row.get("expected")
        or row.get("output")
        or row.get("answer")
    )
    if response is not None:
        normalized["response"] = str(response)
    return normalized


async def convert_dataset_to_general_qa_jsonl(
    storage: StorageBackend, source_uri: str, output_key: str
) -> int:
    """Convert JSON/JSONL dataset into EvalScope general_qa JSONL via storage.

    Returns converted row count.
    """
    key = uri_to_key(source_uri)
    if key is not None:
        text = await storage.read_text(key)
    else:
        # Mounted path — read from local filesystem
        import asyncio

        text = await asyncio.to_thread(
            Path(source_uri).read_text, encoding="utf-8"
        )

    # Parse rows
    rows: list[dict[str, Any]] = []
    if source_uri.endswith(".json") or (key and key.endswith(".json")):
        data = json.loads(text)
        if isinstance(data, list):
            rows = data
        elif isinstance(data, dict):
            rows = [data]
        else:
            raise ValueError("Unsupported JSON structure for dataset conversion")
    else:
        for line in text.splitlines():
            line = line.strip()
            if line:
                rows.append(json.loads(line))

    # Normalize and write output
    output_lines: list[str] = []
    for row in rows:
        normalized = _normalize_qa_row(row)
        if normalized:
            output_lines.append(json.dumps(normalized, ensure_ascii=False))

    if output_lines:
        output_data = ("\n".join(output_lines) + "\n").encode("utf-8")
        await storage.write_file(output_key, output_data)

    return len(output_lines)


def build_evalscope_task_config(
    model: LLMModel,
    dataset: Dataset,
    evalscope_input_root: str,
    params: dict[str, Any],
    repeat_count: int,
    work_dir: str,
):
    """Build EvalScope TaskConfig for minimal single-dataset integration.

    ``evalscope_input_root`` and ``work_dir`` should be fully resolved URIs
    (local path or s3:// URI) from ``storage.resolve_uri()``.
    """
    from evalscope.config import TaskConfig

    api_key = (model.api_key or "").strip()
    if not api_key:
        raise ValueError("Model API key is required for EvalScope execution")

    subset_name = Path(dataset.source_uri).stem
    dataset_args = {
        "general_qa": {
            "dataset_id": evalscope_input_root,
            "subset_list": [subset_name],
        }
    }

    generation_config = {
        "temperature": params.get("temperature", 0.7),
        "max_tokens": params.get("max_tokens", 1024),
        "top_p": params.get("top_p", 1.0),
    }
    if "seed" in params:
        generation_config["seed"] = params["seed"]

    task_cfg = TaskConfig(
        model=model.name,
        api_url=model.endpoint_url,
        api_key=api_key,
        eval_type="openai_api",
        datasets=["general_qa"],
        dataset_args=dataset_args,
        generation_config=generation_config,
        repeats=max(1, repeat_count),
        work_dir=work_dir,
        no_timestamp=True,
        enable_progress_tracker=True,
        ignore_errors=True,
    )
    return task_cfg


def run_evalscope_task(task_cfg) -> dict:
    """Execute one EvalScope task and return the raw run_task result."""
    from evalscope.run import run_task

    result = run_task(task_cfg=task_cfg)
    if isinstance(result, dict):
        return result
    return {"result": result}


async def extract_primary_score(
    storage: StorageBackend, work_dir_key: str
) -> float:
    """Extract one representative score from EvalScope reports directory."""
    reports_prefix = f"{work_dir_key}/reports"
    files = await storage.list_files(reports_prefix, patterns=["*.json"])
    if not files:
        from app.errors import ResultIngestionError
        raise ResultIngestionError(f"No report files found in {reports_prefix} after task completion")
    read_errors: list[str] = []
    for f in files:
        try:
            text = await storage.read_text(f)
            data = json.loads(text)
        except Exception as e:
            read_errors.append(f"{f}: {e}")
            continue
        score = _find_numeric_score(data)
        if score is not None:
            return float(score)
    if read_errors and len(read_errors) == len(files):
        from app.errors import ResultIngestionError
        raise ResultIngestionError(
            f"All {len(files)} report file(s) failed to read/parse: "
            + "; ".join(read_errors)
        )
    return 0.0  # Files exist but no numeric score found


def _find_numeric_score(node: Any) -> float | None:
    if isinstance(node, dict):
        for key in ("score", "Score", "avg_score", "AverageAccuracy"):
            if key in node and isinstance(node[key], (int, float)):
                return float(node[key])
        for value in node.values():
            found = _find_numeric_score(value)
            if found is not None:
                return found
    elif isinstance(node, list):
        for item in node:
            found = _find_numeric_score(item)
            if found is not None:
                return found
    return None
