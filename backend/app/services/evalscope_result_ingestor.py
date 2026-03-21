"""Parse EvalScope artifacts into backend result rows.

This ingestor is intentionally schema-tolerant because EvalScope output files
may vary by version/benchmark. It prefers parsed evaluation artifacts and falls
back to the converted input JSONL when no per-sample output file is found.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from app.errors import ResultIngestionError
from app.services.storage.base import StorageBackend

logger = logging.getLogger(__name__)

PROMPT_KEYS = ("prompt", "query", "input", "question")
EXPECTED_KEYS = (
    "expected", "response", "answer", "target", "ground_truth", "reference",
)
MODEL_OUTPUT_KEYS = (
    "model_output", "prediction", "pred", "generated_text", "completion",
)
SCORE_KEYS = ("score", "Score", "avg_score", "AverageAccuracy", "accuracy", "acc")
LATENCY_KEYS = ("latency_ms", "latency", "elapsed_ms")
FIRST_TOKEN_KEYS = ("first_token_ms", "ttft_ms")
TOKEN_KEYS = ("tokens_generated", "completion_tokens", "output_tokens")


async def ingest_evalscope_results(
    storage: StorageBackend,
    work_dir_key: str,
    input_jsonl_key: str | None,
    default_score: float = 0.0,
) -> list[dict[str, Any]]:
    """Return per-sample records ready for EvalResult inserts."""
    artifact_rows: list[dict[str, Any]] = []

    for file_key in await _candidate_artifact_files(storage, work_dir_key):
        if input_jsonl_key and file_key == input_jsonl_key:
            continue
        for row in await _iter_json_rows(storage, file_key):
            parsed = _extract_sample_from_row(row)
            if parsed is not None:
                artifact_rows.append(parsed)

    deduped = _dedupe_rows(artifact_rows)
    if deduped:
        return deduped

    if input_jsonl_key:
        return await _fallback_from_input(storage, input_jsonl_key, default_score)
    return []


async def _candidate_artifact_files(
    storage: StorageBackend, work_dir_key: str
) -> list[str]:
    if not await storage.exists(work_dir_key):
        # For S3 "directories" don't really exist — try listing anyway
        pass

    all_files = await storage.list_files(
        work_dir_key, patterns=["*.jsonl", "*.json"]
    )
    candidates: list[str] = []
    for f in all_files:
        parts = f.split("/")
        if "input" in parts or "configs" in parts:
            continue
        name = parts[-1] if parts else f
        if name == "progress.json":
            continue
        candidates.append(f)
    return sorted(candidates)


async def _iter_json_rows(
    storage: StorageBackend, file_key: str
) -> list[dict[str, Any]]:
    try:
        text = await storage.read_text(file_key)
    except Exception as e:
        raise ResultIngestionError(
            f"Failed to read artifact file {file_key}: {e}"
        ) from e

    results: list[dict[str, Any]] = []
    parse_errors = 0
    if file_key.endswith(".jsonl"):
        for i, line in enumerate(text.splitlines()):
            line = line.strip()
            if not line:
                continue
            try:
                node = json.loads(line)
            except Exception:
                parse_errors += 1
                continue
            results.extend(_walk_dict_nodes(node))
        if parse_errors > 0:
            logger.warning(
                "Ingestor: %d/%d lines failed to parse in %s",
                parse_errors, parse_errors + len(results), file_key,
            )
        return results

    try:
        node = json.loads(text)
    except Exception as e:
        raise ResultIngestionError(
            f"Failed to parse JSON artifact {file_key}: {e}"
        ) from e
    results.extend(_walk_dict_nodes(node))
    return results


def _walk_dict_nodes(node: Any) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    if isinstance(node, dict):
        results.append(node)
        for value in node.values():
            results.extend(_walk_dict_nodes(value))
    elif isinstance(node, list):
        for item in node:
            results.extend(_walk_dict_nodes(item))
    return results


def _extract_sample_from_row(row: dict[str, Any]) -> dict[str, Any] | None:
    prompt = _extract_text(row, PROMPT_KEYS)
    expected = _extract_text(row, EXPECTED_KEYS)
    model_output = _extract_text(row, MODEL_OUTPUT_KEYS)

    if not model_output and isinstance(row.get("output"), (str, int, float, bool)):
        model_output = str(row["output"])

    if not any([prompt, expected, model_output]):
        return None

    score = _extract_float(row, SCORE_KEYS)
    latency_ms = _extract_float(row, LATENCY_KEYS) or 0.0
    first_token_ms = _extract_float(row, FIRST_TOKEN_KEYS) or 0.0
    tokens_generated = _extract_int(row, TOKEN_KEYS) or 0

    return {
        "prompt_text": prompt,
        "expected_output": expected,
        "model_output": model_output,
        "score": score,
        "is_valid": score is not None,
        "error_category": None if score is not None else "SCORE_MISSING",
        "latency_ms": latency_ms,
        "first_token_ms": first_token_ms,
        "tokens_generated": tokens_generated,
    }


def _extract_text(row: dict[str, Any], keys: tuple[str, ...]) -> str:
    for key in keys:
        value = row.get(key)
        if isinstance(value, str) and value.strip():
            return value
        if isinstance(value, (int, float, bool)):
            return str(value)
    messages = row.get("messages")
    if isinstance(messages, list) and messages:
        for msg in reversed(messages):
            if isinstance(msg, dict):
                content = msg.get("content")
                if isinstance(content, str) and content.strip():
                    return content
    return ""


def _extract_float(row: dict[str, Any], keys: tuple[str, ...]) -> float | None:
    for key in keys:
        value = row.get(key)
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            try:
                return float(value)
            except ValueError:
                continue
    return None


def _extract_int(row: dict[str, Any], keys: tuple[str, ...]) -> int | None:
    value = _extract_float(row, keys)
    if value is None:
        return None
    return int(value)


def _dedupe_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    best_by_key: dict[tuple[Any, ...], dict[str, Any]] = {}
    for row in rows:
        key = (
            row.get("prompt_text", ""),
            row.get("expected_output", ""),
            row.get("model_output", ""),
        )
        existing = best_by_key.get(key)
        if existing is None or _row_richness(row) > _row_richness(existing):
            best_by_key[key] = row
    return list(best_by_key.values())


def _row_richness(row: dict[str, Any]) -> int:
    return (
        int(bool(row.get("score")))
        + int(bool(row.get("latency_ms")))
        + int(bool(row.get("first_token_ms")))
        + int(bool(row.get("tokens_generated")))
    )


async def _fallback_from_input(
    storage: StorageBackend, input_key: str, default_score: float
) -> list[dict[str, Any]]:
    try:
        text = await storage.read_text(input_key)
    except Exception as e:
        raise ResultIngestionError(
            f"Failed to read fallback input {input_key}: {e}"
        ) from e

    rows: list[dict[str, Any]] = []
    parse_errors = 0
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            node = json.loads(line)
        except Exception:
            parse_errors += 1
            continue
        if not isinstance(node, dict):
            continue
        prompt = _extract_text(node, ("query", "prompt", "question", "input"))
        expected = _extract_text(
            node, ("response", "expected", "answer", "output")
        )
        if not prompt and not expected:
            continue
        rows.append(
            {
                "prompt_text": prompt,
                "expected_output": expected,
                "model_output": "",
                "score": float(default_score),
                "latency_ms": 0.0,
                "first_token_ms": 0.0,
                "tokens_generated": 0,
                "is_valid": True,
                "error_category": None,
            }
        )
    if parse_errors > 0:
        logger.warning(
            "Ingestor fallback: %d lines failed to parse in %s", parse_errors, input_key,
        )
    return rows
