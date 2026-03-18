"""Parse EvalScope artifacts into backend result rows.

This ingestor is intentionally schema-tolerant because EvalScope output files
may vary by version/benchmark. It prefers parsed evaluation artifacts and falls
back to the converted input JSONL when no per-sample output file is found.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

PROMPT_KEYS = ("prompt", "query", "input", "question")
EXPECTED_KEYS = ("expected", "response", "answer", "target", "ground_truth", "reference")
MODEL_OUTPUT_KEYS = ("model_output", "prediction", "pred", "generated_text", "completion")
SCORE_KEYS = ("score", "Score", "avg_score", "AverageAccuracy", "accuracy", "acc")
LATENCY_KEYS = ("latency_ms", "latency", "elapsed_ms")
FIRST_TOKEN_KEYS = ("first_token_ms", "ttft_ms")
TOKEN_KEYS = ("tokens_generated", "completion_tokens", "output_tokens")


def ingest_evalscope_results(
    work_dir: str,
    input_jsonl_path: str | None,
    default_score: float = 0.0,
) -> list[dict[str, Any]]:
    """Return per-sample records ready for EvalResult inserts.

    Each returned dict contains keys:
    prompt_text, expected_output, model_output, score,
    latency_ms, first_token_ms, tokens_generated.
    """
    artifact_rows: list[dict[str, Any]] = []
    fallback_path = Path(input_jsonl_path).resolve() if input_jsonl_path else None
    for file_path in _candidate_artifact_files(work_dir):
        if fallback_path is not None and file_path.resolve() == fallback_path:
            continue
        for row in _iter_json_rows(file_path):
            parsed = _extract_sample_from_row(row)
            if parsed is not None:
                artifact_rows.append(parsed)

    deduped = _dedupe_rows(artifact_rows)
    if deduped:
        return deduped

    if input_jsonl_path:
        return _fallback_from_input(input_jsonl_path, default_score)
    return []


def _candidate_artifact_files(work_dir: str) -> list[Path]:
    root = Path(work_dir)
    if not root.exists():
        return []

    candidates: list[Path] = []
    for pattern in ("*.jsonl", "*.json"):
        for file_path in root.rglob(pattern):
            # input/config files are source/config, not model prediction output
            if "input" in file_path.parts or "configs" in file_path.parts:
                continue
            if file_path.name == "progress.json":
                continue
            candidates.append(file_path)
    return sorted(candidates)


def _iter_json_rows(file_path: Path):
    try:
        text = file_path.read_text(encoding="utf-8")
    except Exception:
        return

    if file_path.suffix == ".jsonl":
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                node = json.loads(line)
            except Exception:
                continue
            yield from _walk_dict_nodes(node)
        return

    try:
        node = json.loads(text)
    except Exception:
        return
    yield from _walk_dict_nodes(node)


def _walk_dict_nodes(node: Any):
    if isinstance(node, dict):
        yield node
        for value in node.values():
            yield from _walk_dict_nodes(value)
    elif isinstance(node, list):
        for item in node:
            yield from _walk_dict_nodes(item)


def _extract_sample_from_row(row: dict[str, Any]) -> dict[str, Any] | None:
    prompt = _extract_text(row, PROMPT_KEYS)
    expected = _extract_text(row, EXPECTED_KEYS)
    model_output = _extract_text(row, MODEL_OUTPUT_KEYS)

    # Some schemas may only expose "output" for model text.
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
        "score": score if score is not None else 0.0,
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
    return int(bool(row.get("score"))) + int(bool(row.get("latency_ms"))) + int(
        bool(row.get("first_token_ms"))
    ) + int(bool(row.get("tokens_generated")))


def _fallback_from_input(input_jsonl_path: str, default_score: float) -> list[dict[str, Any]]:
    path = Path(input_jsonl_path)
    if not path.exists():
        return []

    rows: list[dict[str, Any]] = []
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                node = json.loads(line)
            except Exception:
                continue
            if not isinstance(node, dict):
                continue
            prompt = _extract_text(node, ("query", "prompt", "question", "input"))
            expected = _extract_text(node, ("response", "expected", "answer", "output"))
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
                }
            )
    except Exception:
        return []

    return rows