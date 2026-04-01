"""Perplexity computation via vLLM logprobs API.

EvalScope has a ``perplexity()`` math function but cannot obtain logprobs
from API-served models.  This module fills that gap by calling vLLM's
``/v1/completions`` endpoint with ``echo=True`` and ``logprobs=1`` to
retrieve per-token log-probabilities, then computing standard perplexity:

    PPL = exp( -1/N * sum(log P(token_i | context)) )
"""

import asyncio
import logging
import math

import httpx

logger = logging.getLogger(__name__)


async def compute_perplexity_batch(
    endpoint_url: str,
    model_name: str,
    api_key: str,
    texts: list[str],
    *,
    timeout: float = 120.0,
    max_concurrent: int = 4,
) -> list[float]:
    """Compute perplexity for a batch of texts via vLLM completions API.

    Args:
        endpoint_url: vLLM base URL (e.g. ``http://vllm:8000``).
        model_name: Model identifier for the completions request.
        api_key: Bearer token (use ``"EMPTY"`` if auth is disabled).
        texts: List of text strings to evaluate.
        timeout: Per-request timeout in seconds.
        max_concurrent: Max parallel requests to vLLM.

    Returns:
        List of perplexity values (one per input text).
        Returns ``float('inf')`` for texts that fail.
    """
    async def _compute_one(client: httpx.AsyncClient, text: str) -> float:
        try:
            resp = await client.post(
                f"{endpoint_url.rstrip('/')}/v1/completions",
                json={
                    "model": model_name,
                    "prompt": text,
                    "echo": True,
                    "logprobs": 1,
                    "max_tokens": 0,
                },
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=timeout,
            )
            resp.raise_for_status()
            data = resp.json()
            token_logprobs = data["choices"][0]["logprobs"]["token_logprobs"]
            valid = [lp for lp in token_logprobs if lp is not None]
            if not valid:
                return float("inf")
            return math.exp(-sum(valid) / len(valid))
        except Exception as e:
            logger.warning("Perplexity computation failed: %s", e)
            return float("inf")

    semaphore = asyncio.Semaphore(max_concurrent)

    async def _limited(client: httpx.AsyncClient, text: str) -> float:
        async with semaphore:
            return await _compute_one(client, text)

    async with httpx.AsyncClient() as client:
        tasks = [_limited(client, text) for text in texts]
        return list(await asyncio.gather(*tasks))


def ppl_to_score(ppl: float, cap: float = 1000.0) -> float:
    """Normalize a perplexity value to a [0, 1] score.

    Lower perplexity → higher score.  Uses ``1 / (1 + log(ppl))``
    clamped to [0, 1].  A perplexity of 1.0 maps to score 1.0;
    infinite perplexity maps to 0.0.
    """
    if ppl <= 0 or math.isinf(ppl):
        return 0.0
    ppl = min(ppl, cap)
    return max(0.0, min(1.0, 1.0 / (1.0 + math.log(ppl))))
