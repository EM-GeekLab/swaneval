"""EvalScope integration helpers for MVP migration.

This module provides a minimal bridge from local dataset files and task params
into EvalScope TaskConfig + run_task, while keeping the existing backend API.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.models.dataset import Dataset
    from app.models.llm_model import LLMModel


def _normalize_qa_row(row: dict[str, Any]) -> dict[str, str] | None:
    """Normalize one row into EvalScope general_qa format.

    Supported input fields are aligned with current backend conventions.
    """
    query = row.get("query") or row.get("prompt") or row.get("input") or row.get("question")
    if not query:
        return None

    normalized = {"query": str(query)}
    response = row.get("response") or row.get("expected") or row.get("output") or row.get("answer")
    if response is not None:
        normalized["response"] = str(response)
    return normalized


def convert_dataset_to_general_qa_jsonl(source_uri: str, output_jsonl: str) -> int:
    """Convert local JSON/JSONL dataset into EvalScope general_qa JSONL.

    Returns converted row count.
    """
    source = Path(source_uri)
    if not source.exists():
        raise FileNotFoundError(f"Dataset file not found: {source_uri}")

    rows: list[dict[str, Any]] = []
    with source.open("r", encoding="utf-8") as f:
        if source.suffix == ".json":
            data = json.load(f)
            if isinstance(data, list):
                rows = data
            elif isinstance(data, dict):
                rows = [data]
            else:
                raise ValueError("Unsupported JSON structure for dataset conversion")
        else:
            for line in f:
                line = line.strip()
                if line:
                    rows.append(json.loads(line))

    out_path = Path(output_jsonl)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    converted = 0
    with out_path.open("w", encoding="utf-8") as out:
        for row in rows:
            normalized = _normalize_qa_row(row)
            if not normalized:
                continue
            out.write(json.dumps(normalized, ensure_ascii=False) + "\n")
            converted += 1

    return converted


def build_evalscope_task_config(
    model: "LLMModel",
    dataset: "Dataset",
    evalscope_input_root: str,
    params: dict[str, Any],
    repeat_count: int,
    work_dir: str,
):
    """Build EvalScope TaskConfig for minimal single-dataset integration."""
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


def extract_primary_score(work_dir: str) -> float:
    """Extract one representative score from EvalScope reports directory.

    This is a best-effort MVP extractor and may evolve with report schema.
    """
    reports_dir = Path(work_dir) / "reports"
    if not reports_dir.exists():
        return 0.0

    for report_file in reports_dir.rglob("*.json"):
        try:
            data = json.loads(report_file.read_text(encoding="utf-8"))
        except Exception:
            continue

        score = _find_numeric_score(data)
        if score is not None:
            return float(score)

    return 0.0


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
