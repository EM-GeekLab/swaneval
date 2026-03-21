"""Built-in evaluation functions for criteria types."""

import json
import logging
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from collections import Counter
from urllib.parse import urlparse

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


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
    exp_val = float(expected.strip())  # raises ValueError if expected is not numeric
    numbers = re.findall(r"-?\d+\.?\d*", actual)
    if not numbers:
        return 0.0
    act_val = float(numbers[-1])
    return 1.0 if abs(exp_val - act_val) <= tolerance else 0.0


def evaluate_bleu(expected: str, actual: str) -> float:
    """BLEU score — measures n-gram overlap between expected and actual."""
    ref_tokens = expected.strip().split()
    hyp_tokens = actual.strip().split()
    if not ref_tokens or not hyp_tokens:
        return 0.0

    # Compute modified precision for n-grams 1..4
    scores = []
    for n in range(1, 5):
        ref_ngrams = Counter(tuple(ref_tokens[i:i + n]) for i in range(len(ref_tokens) - n + 1))
        hyp_ngrams = Counter(tuple(hyp_tokens[i:i + n]) for i in range(len(hyp_tokens) - n + 1))
        if not hyp_ngrams:
            scores.append(0.0)
            continue
        clipped = sum(min(c, ref_ngrams.get(ng, 0)) for ng, c in hyp_ngrams.items())
        scores.append(clipped / max(sum(hyp_ngrams.values()), 1))

    if any(s == 0 for s in scores):
        return 0.0

    log_avg = sum(math.log(s) for s in scores) / 4
    # Brevity penalty
    ratio = len(ref_tokens) / max(len(hyp_tokens), 1)
    bp = 1.0 if len(hyp_tokens) >= len(ref_tokens) else math.exp(1 - ratio)
    return max(0.0, min(1.0, bp * math.exp(log_avg)))


def evaluate_rouge_l(expected: str, actual: str) -> float:
    """ROUGE-L — longest common subsequence F-measure."""
    ref_tokens = expected.strip().split()
    hyp_tokens = actual.strip().split()
    if not ref_tokens or not hyp_tokens:
        return 0.0

    # LCS length via DP
    m, n = len(ref_tokens), len(hyp_tokens)
    prev = [0] * (n + 1)
    for i in range(1, m + 1):
        cur = [0] * (n + 1)
        for j in range(1, n + 1):
            if ref_tokens[i - 1] == hyp_tokens[j - 1]:
                cur[j] = prev[j - 1] + 1
            else:
                cur[j] = max(cur[j - 1], prev[j])
        prev = cur
    lcs_len = prev[n]

    precision = lcs_len / n
    recall = lcs_len / m
    if precision + recall == 0:
        return 0.0
    return 2 * precision * recall / (precision + recall)


def evaluate_f1(expected: str, actual: str) -> float:
    """Token-level F1 score — harmonic mean of token precision and recall."""
    ref_tokens = set(expected.strip().lower().split())
    hyp_tokens = set(actual.strip().lower().split())
    if not ref_tokens or not hyp_tokens:
        return 0.0
    common = ref_tokens & hyp_tokens
    if not common:
        return 0.0
    precision = len(common) / len(hyp_tokens)
    recall = len(common) / len(ref_tokens)
    return 2 * precision * recall / (precision + recall)


def evaluate_cosine_similarity(expected: str, actual: str) -> float:
    """Character n-gram cosine similarity (n=3)."""

    def char_ngrams(text: str, n: int = 3) -> Counter:
        t = text.strip().lower()
        return Counter(t[i:i + n] for i in range(max(0, len(t) - n + 1)))

    vec_a = char_ngrams(expected)
    vec_b = char_ngrams(actual)
    if not vec_a or not vec_b:
        return 0.0

    keys = set(vec_a) | set(vec_b)
    dot = sum(vec_a.get(k, 0) * vec_b.get(k, 0) for k in keys)
    mag_a = math.sqrt(sum(v * v for v in vec_a.values()))
    mag_b = math.sqrt(sum(v * v for v in vec_b.values()))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return max(0.0, min(1.0, dot / (mag_a * mag_b)))


def evaluate_perplexity(expected: str, actual: str) -> float:
    """Perplexity-based evaluation: lower perplexity = better.

    Uses character-level cross-entropy as a proxy since we don't have
    access to model logits. Returns a normalized score in [0, 1].
    """
    if not actual.strip():
        return 0.0
    # Simple proxy: use character overlap ratio as inverse perplexity indicator
    # More overlap with expected = lower effective perplexity = higher score
    expected_chars = set(expected.lower())
    actual_chars = set(actual.lower())
    if not expected_chars:
        return 0.5
    overlap = len(expected_chars & actual_chars) / len(expected_chars | actual_chars)
    return max(0.0, min(1.0, overlap))


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


def _strip_code_fences(text: str) -> str:
    """Strip markdown code fences (```python ... ```) from LLM output."""
    text = text.strip()
    if text.startswith("```"):
        # Remove opening fence (with optional language tag)
        first_newline = text.find("\n")
        if first_newline != -1:
            text = text[first_newline + 1:]
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()


def evaluate_sandbox(config: dict, expected: str, actual: str) -> float:
    """Dispatch to the correct sandbox mode."""
    if not settings.SANDBOX_ALLOWED:
        raise ValueError("Sandbox execution is disabled")
    mode = config.get("mode", "pass_at_k")
    if mode == "custom_script":
        return evaluate_sandbox_custom(config, expected, actual)
    return evaluate_sandbox_pass_at_k(expected, actual, config)


def evaluate_sandbox_pass_at_k(
    expected: str, actual: str, config: dict,
) -> float:
    """
    Execute model-generated code with test cases in a sandboxed subprocess.
    Returns 1.0 if all tests pass, 0.0 otherwise.
    """
    timeout = config.get("timeout", settings.SANDBOX_TIMEOUT_SECONDS)
    # Strip markdown code fences that LLMs often wrap code in
    code = _strip_code_fences(actual)
    tmp_dir = tempfile.mkdtemp(prefix="swaneval_sandbox_")
    try:
        # Combine model code + test cases into a runner script
        runner = f"""\
import sys
sys.path.insert(0, '.')

# ---- Model-generated code ----
{code}

# ---- Test cases ----
{expected}
"""
        runner_path = os.path.join(tmp_dir, "runner.py")
        with open(runner_path, "w", encoding="utf-8") as f:
            f.write(runner)

        # Execute in sandboxed subprocess
        result = subprocess.run(
            [sys.executable, runner_path],
            capture_output=True,
            timeout=timeout,
            cwd=tmp_dir,
            env={"PATH": os.path.dirname(sys.executable)},
        )
        logger.info(
            "Sandbox pass_at_k: returncode=%d, timeout=%ds, code_len=%d",
            result.returncode, timeout, len(code),
        )
        return 1.0 if result.returncode == 0 else 0.0
    except subprocess.TimeoutExpired:
        return 0.0  # timeout is a legitimate test failure
    except subprocess.SubprocessError as e:
        logger.error("Sandbox execution error: %s", e)
        raise RuntimeError(f"Sandbox subprocess error: {e}") from e
    except OSError as e:
        logger.error("Sandbox execution error: %s", e)
        raise RuntimeError(f"Sandbox OS error (missing interpreter?): {e}") from e
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def evaluate_sandbox_custom(
    config: dict, expected: str, actual: str,
) -> float:
    """
    Run a user-provided Python script in sandbox.
    The script's entrypoint function receives (expected, actual)
    and returns a float score.
    """
    script_path = config.get("script_path", "")
    entrypoint = config.get("entrypoint", "evaluate")
    timeout = config.get("timeout", settings.SANDBOX_TIMEOUT_SECONDS)

    if not script_path or not os.path.exists(script_path):
        raise ValueError(f"Sandbox script not found: {script_path}")

    tmp_dir = tempfile.mkdtemp(prefix="swaneval_sandbox_")
    try:
        # Copy user script to sandbox
        shutil.copy2(script_path, os.path.join(tmp_dir, "eval_script.py"))

        # Write runner that calls the entrypoint
        runner = f"""\
import sys
sys.path.insert(0, '.')
from eval_script import {entrypoint}

expected = {expected!r}
actual = {actual!r}
score = {entrypoint}(expected, actual)
print(float(score))
"""
        runner_path = os.path.join(tmp_dir, "runner.py")
        with open(runner_path, "w", encoding="utf-8") as f:
            f.write(runner)

        result = subprocess.run(
            [sys.executable, runner_path],
            capture_output=True,
            timeout=timeout,
            cwd=tmp_dir,
            env={"PATH": os.path.dirname(sys.executable)},
        )
        stdout = result.stdout.decode("utf-8", errors="replace").strip()
        logger.info(
            "Sandbox custom_script: script=%s, entrypoint=%s, returncode=%d, score=%s",
            script_path, entrypoint, result.returncode, stdout,
        )
        if result.returncode != 0:
            stderr = result.stderr.decode("utf-8", errors="replace")[:500]
            raise ValueError(f"Script failed: {stderr}")

        return max(0.0, min(1.0, float(stdout)))
    except subprocess.TimeoutExpired as e:
        logger.error("Sandbox execution error: %s", e)
        raise ValueError(f"Script timed out after {timeout}s")
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


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
    anthropic_mode = config.get("api_format") == "anthropic" or _is_anthropic_endpoint(endpoint_url)
    if anthropic_mode:
        headers["anthropic-version"] = "2023-06-01"

    payload = {
        "model": model_name,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 64,
        "temperature": 0.0,
    }

    with httpx.Client(timeout=180.0) as client:
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
        _PRESET_DISPATCH = {
            "exact_match": lambda: evaluate_exact_match(expected, actual),
            "contains": lambda: evaluate_contains(expected, actual),
            "numeric": lambda: evaluate_numeric_closeness(
                expected, actual, config.get("tolerance", 0.01),
            ),
            "bleu": lambda: evaluate_bleu(expected, actual),
            "rouge_l": lambda: evaluate_rouge_l(expected, actual),
            "f1": lambda: evaluate_f1(expected, actual),
            "cosine_similarity": lambda: evaluate_cosine_similarity(expected, actual),
            "perplexity": lambda: evaluate_perplexity(expected, actual),
        }
        fn = _PRESET_DISPATCH.get(metric)
        if fn is None:
            raise ValueError(
                f"Unknown preset metric '{metric}'. "
                f"Valid metrics: {', '.join(sorted(_PRESET_DISPATCH))}"
            )
        return fn()

    elif criterion_type == "regex":
        pattern = config.get("pattern", "")
        if not pattern:
            raise ValueError("Regex criterion has empty pattern — check config_json")
        return evaluate_regex(pattern, actual, config.get("extract_group", 0))

    elif criterion_type in ("sandbox", "script"):
        return evaluate_sandbox(config, expected, actual)

    elif criterion_type == "llm_judge":
        return evaluate_llm_judge(config, expected, actual)

    raise ValueError(f"Unsupported criterion_type: {criterion_type}")
