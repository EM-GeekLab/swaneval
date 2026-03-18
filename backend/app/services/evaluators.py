"""Built-in evaluation functions for criteria types."""

import importlib.util
import inspect
import json
import re
from pathlib import Path
from urllib.parse import urlparse

import httpx

from app.config import settings


def evaluate_exact_match(expected: str, actual: str) -> float:
    return 1.0 if expected.strip() == actual.strip() else 0.0


def evaluate_contains(expected: str, actual: str) -> float:
    return 1.0 if expected.strip() in actual.strip() else 0.0


def evaluate_regex(pattern: str, actual: str, extract_group: int = 0) -> float:
    match = re.search(pattern, actual)
    if not match:
        return 0.0
    return 1.0


def evaluate_numeric_closeness(expected: str, actual: str, tolerance: float = 0.01) -> float:
    try:
        exp_val = float(expected.strip())
        # Try to extract a number from model output
        numbers = re.findall(r"-?\d+\.?\d*", actual)
        if not numbers:
            return 0.0
        act_val = float(numbers[-1])
        return 1.0 if abs(exp_val - act_val) <= tolerance else 0.0
    except (ValueError, IndexError):
        return 0.0


def _is_anthropic_endpoint(endpoint_url: str) -> bool:
    path = (urlparse(endpoint_url).path or "").lower()
    return path.endswith("/v1/messages") or "/apps/anthropic" in path


def _normalize_endpoint_url(endpoint_url: str) -> str:
    if not endpoint_url:
        return endpoint_url
    if _is_anthropic_endpoint(endpoint_url):
        path = (urlparse(endpoint_url).path or "").lower()
        if not path.endswith("/v1/messages"):
            return endpoint_url.rstrip("/") + "/v1/messages"
    return endpoint_url


def _extract_score_from_text(text: str) -> float:
    numbers = re.findall(r"-?\d+(?:\.\d+)?", text)
    if not numbers:
        raise ValueError("No numeric score found in judge output")
    score = float(numbers[0])
    return max(0.0, min(1.0, score))


def evaluate_script(config: dict, expected: str, actual: str) -> float:
    script_path = (config.get("script_path") or "").strip()
    entrypoint = (config.get("entrypoint") or "evaluate").strip()
    if not script_path:
        raise ValueError("script evaluator requires config.script_path")

    path = Path(script_path)
    if not path.exists():
        raise FileNotFoundError(f"script evaluator path not found: {script_path}")

    module_name = f"criterion_script_{path.stem}_{abs(hash(str(path)))}"
    spec = importlib.util.spec_from_file_location(module_name, str(path))
    if spec is None or spec.loader is None:
        raise ValueError(f"failed to load script module: {script_path}")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    if not hasattr(module, entrypoint):
        raise AttributeError(f"entrypoint '{entrypoint}' not found in {script_path}")

    func = getattr(module, entrypoint)
    if not callable(func):
        raise TypeError(f"entrypoint '{entrypoint}' is not callable")

    sig = inspect.signature(func)
    kwargs = {}
    if "expected" in sig.parameters:
        kwargs["expected"] = expected
    if "actual" in sig.parameters:
        kwargs["actual"] = actual
    if "config" in sig.parameters:
        kwargs["config"] = config

    if kwargs:
        result = func(**kwargs)
    else:
        result = func(expected, actual)
    return max(0.0, min(1.0, float(result)))


def evaluate_llm_judge(config: dict, expected: str, actual: str) -> float:
    endpoint_url = _normalize_endpoint_url(
        (config.get("endpoint_url") or settings.DEFAULT_MODEL_ENDPOINT_URL).strip()
    )
    model_name = (config.get("model_name") or settings.DEFAULT_MODEL_NAME).strip()
    api_key = (config.get("api_key") or settings.DEFAULT_MODEL_API_KEY).strip()
    system_prompt = (
        config.get("system_prompt")
        or "You are a strict evaluator. Return only a float score in [0,1]."
    )

    if not endpoint_url:
        raise ValueError("llm_judge requires endpoint_url")
    if not model_name:
        raise ValueError("llm_judge requires model_name")
    if not api_key:
        raise ValueError("llm_judge requires api_key")

    prompt = (
        f"{system_prompt}\n\n"
        "Task: score model output by comparing expected and actual.\n"
        "Return only one number between 0 and 1.\n"
        f"Expected: {expected}\n"
        f"Actual: {actual}"
    )

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    anthropic_mode = _is_anthropic_endpoint(endpoint_url)
    if anthropic_mode:
        headers["anthropic-version"] = "2023-06-01"

    payload = {
        "model": model_name,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 16,
        "temperature": 0.0,
    }

    with httpx.Client(timeout=30.0) as client:
        resp = client.post(endpoint_url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()

    if anthropic_mode:
        text_parts = []
        for block in data.get("content", []):
            if isinstance(block, dict) and block.get("type") == "text":
                text_parts.append(str(block.get("text", "")))
        judge_text = "\n".join([x for x in text_parts if x])
    else:
        judge_text = str(data.get("choices", [{}])[0].get("message", {}).get("content", ""))

    return _extract_score_from_text(judge_text)


def run_criterion(criterion_type: str, config_json: str, expected: str, actual: str) -> float:
    """Dispatch to the right evaluator based on criterion type and config."""
    config = json.loads(config_json) if config_json else {}

    if criterion_type == "preset":
        metric = config.get("metric", "exact_match")
        if metric == "exact_match":
            return evaluate_exact_match(expected, actual)
        elif metric == "contains":
            return evaluate_contains(expected, actual)
        elif metric == "numeric":
            return evaluate_numeric_closeness(expected, actual, config.get("tolerance", 0.01))
        else:
            return evaluate_exact_match(expected, actual)

    elif criterion_type == "regex":
        pattern = config.get("pattern", "")
        if not pattern:
            return 0.0
        return evaluate_regex(pattern, actual, config.get("extract_group", 0))

    elif criterion_type == "script":
        return evaluate_script(config, expected, actual)

    elif criterion_type == "llm_judge":
        return evaluate_llm_judge(config, expected, actual)

    raise ValueError(f"Unsupported criterion_type: {criterion_type}")
