"""EvalScope integration — dataset conversion, criterion mapping, HTTP payload.

Bridges SwanEval's data model to the EvalScope HTTP service API.
The legacy ``build_evalscope_task_config`` (direct Python import) is replaced
by ``build_evalscope_http_payload`` which produces a plain dict suitable for
``POST /api/v1/eval/invoke``.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import TYPE_CHECKING, Any

from app.services.storage.base import StorageBackend
from app.services.storage.utils import uri_to_key

if TYPE_CHECKING:
    from app.models.criterion import Criterion
    from app.models.dataset import Dataset
    from app.models.llm_model import LLMModel

logger = logging.getLogger(__name__)


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


def build_evalscope_http_payload(
    model: LLMModel,
    datasets: list[Dataset],
    criteria: list[Criterion],
    params: dict[str, Any],
    repeat_count: int,
    work_dir: str,
    evalscope_input_root: str,
) -> dict[str, Any]:
    """Build the JSON payload for ``POST /api/v1/eval/invoke``.

    Supports multiple datasets and criteria.  Each dataset is converted
    to a general_qa subset; criteria are mapped to EvalScope metric_list
    and judge config.
    """
    api_key = (model.api_key or "").strip() or "EMPTY"

    # Dataset args — each dataset becomes a subset under general_qa
    subset_list = []
    for ds in datasets:
        subset_name = Path(ds.source_uri).stem
        subset_list.append(subset_name)

    dataset_args: dict[str, Any] = {
        "general_qa": {
            "dataset_id": evalscope_input_root,
            "subset_list": subset_list,
        }
    }

    # Criterion mapping
    mapping = map_criteria_to_evalscope(criteria)
    if mapping.get("metric_list"):
        dataset_args["general_qa"]["metric_list"] = mapping["metric_list"]
    if mapping.get("extra_params"):
        dataset_args["general_qa"]["extra_params"] = mapping["extra_params"]

    # Generation config
    generation_config: dict[str, Any] = {
        "temperature": params.get("temperature", 0.7),
        "max_tokens": params.get("max_tokens", 1024),
        "top_p": params.get("top_p", 1.0),
    }
    if "seed" in params:
        generation_config["seed"] = params["seed"]

    payload: dict[str, Any] = {
        "model": model.model_name or model.name,
        "api_url": model.endpoint_url,
        "api_key": api_key,
        "datasets": ["general_qa"],
        "dataset_args": dataset_args,
        "generation_config": generation_config,
        "eval_batch_size": params.get("eval_batch_size", 4),
        "seed": params.get("seed", 42),
        "work_dir": work_dir,
    }

    if repeat_count > 1:
        payload["repeats"] = repeat_count

    if params.get("limit"):
        payload["limit"] = params["limit"]

    # Judge config
    if mapping.get("judge_model_args"):
        payload["judge_model_args"] = mapping["judge_model_args"]
        payload["judge_strategy"] = mapping.get("judge_strategy", "llm")

    # Sandbox config
    if mapping.get("sandbox_config"):
        dataset_args["general_qa"]["sandbox_config"] = mapping[
            "sandbox_config"
        ]

    return payload


# ── Criterion → EvalScope Mapping ────────────────────────────────

# Maps SwanEval preset metric names to EvalScope metric names
_PRESET_METRIC_MAP: dict[str, str] = {
    "exact_match": "exact_match",
    "contains": "acc",
    "bleu": "bleu",
    "rouge_l": "rouge",
    "f1": "f1",
    "numeric": "math_acc",
    "cosine_similarity": "semscore",
    "pass_at_k": "pass_at_k",
    # perplexity is handled locally, NOT sent to EvalScope
}


def map_criteria_to_evalscope(
    criteria: list[Criterion],
) -> dict[str, Any]:
    """Translate SwanEval criteria into EvalScope config fragments.

    Returns a dict with optional keys:
    - ``metric_list``: list of EvalScope metric names
    - ``extra_params``: dict of extra params for custom metrics
    - ``judge_model_args``: dict for LLM-as-Judge config
    - ``judge_strategy``: str
    - ``sandbox_config``: dict for code sandbox
    """
    metric_list: list[str] = []
    extra_params: dict[str, Any] = {}
    judge_model_args: dict[str, Any] | None = None
    judge_strategy: str = "auto"
    sandbox_config: dict[str, Any] | None = None

    for c in criteria:
        cfg = json.loads(c.config_json) if c.config_json else {}

        if c.type == "preset":
            metric = cfg.get("metric", "exact_match")
            es_metric = _PRESET_METRIC_MAP.get(metric)
            if es_metric:
                metric_list.append(es_metric)
            else:
                logger.warning(
                    "Criterion %s: preset metric '%s' has no EvalScope mapping",
                    c.id, metric,
                )

        elif c.type == "regex":
            if "pattern" in extra_params:
                logger.warning(
                    "Criterion %s: multiple regex criteria not supported "
                    "in a single EvalScope run — only the last pattern "
                    "will be used",
                    c.id,
                )
            metric_list.append("regex_match")
            extra_params["pattern"] = cfg.get("pattern", "")
            if cfg.get("match_mode"):
                extra_params["match_mode"] = cfg["match_mode"]

        elif c.type == "llm_judge":
            if judge_model_args is not None:
                logger.warning(
                    "Criterion %s: multiple llm_judge criteria not "
                    "supported in a single EvalScope run — only the "
                    "last judge config will be used",
                    c.id,
                )
            judge_strategy = "llm"
            judge_model_args = {}
            if cfg.get("endpoint_url"):
                judge_model_args["api_url"] = cfg["endpoint_url"]
            if cfg.get("api_key"):
                judge_model_args["api_key"] = cfg["api_key"]
            if cfg.get("model_name"):
                judge_model_args["model_id"] = cfg["model_name"]
            if cfg.get("system_prompt"):
                judge_model_args["system_prompt"] = cfg["system_prompt"]
            # numeric scoring by default for llm_judge
            judge_model_args["score_type"] = cfg.get(
                "score_type", "numeric"
            )

        elif c.type == "sandbox":
            mode = cfg.get("mode", "pass_at_k")
            if mode == "pass_at_k":
                sandbox_config = {
                    "image": "python:3.11-slim",
                    "network_enabled": False,
                }

    result: dict[str, Any] = {}
    if metric_list:
        result["metric_list"] = metric_list
    if extra_params:
        result["extra_params"] = extra_params
    if judge_model_args:
        result["judge_model_args"] = judge_model_args
        result["judge_strategy"] = judge_strategy
    if sandbox_config:
        result["sandbox_config"] = sandbox_config
    return result


async def extract_primary_score(
    storage: StorageBackend, work_dir_key: str
) -> float:
    """Extract one representative score from EvalScope reports directory."""
    reports_prefix = f"{work_dir_key}/reports"
    files = await storage.list_files(reports_prefix, patterns=["*.json"])
    for f in files:
        try:
            text = await storage.read_text(f)
            data = json.loads(text)
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
