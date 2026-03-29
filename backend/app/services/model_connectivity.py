"""Model endpoint connectivity checks used by models API."""

from __future__ import annotations

from typing import Any, cast
from urllib.parse import urlparse

import httpx


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


def _build_headers(api_key: str, endpoint_url: str) -> dict[str, str]:
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    if _is_anthropic_endpoint(endpoint_url):
        headers["anthropic-version"] = "2023-06-01"
    return headers


def _build_payload(model_name: str, endpoint_url: str) -> dict:
    # Anthropic endpoints accept `messages` but don't use OpenAI `choices` schema.
    _ = endpoint_url
    return {
        "model": model_name,
        "messages": [{"role": "user", "content": "ping"}],
        "max_tokens": 1,
    }


async def test_model_connectivity(
    endpoint_url: str,
    api_key: str,
    model_name: str,
    api_format: str = "openai",
    timeout_seconds: float = 15.0,
    client: httpx.AsyncClient | None = None,
) -> tuple[bool, str]:
    """Send a minimal request in the specified format and return a readable result."""
    if not endpoint_url:
        return False, "Missing endpoint_url"
    if not model_name:
        return False, "Missing model_name"
    if not api_key:
        return False, "Missing api_key"

    anthropic_mode = api_format == "anthropic" or _is_anthropic_endpoint(endpoint_url)
    resolved_endpoint = _normalize_endpoint_url(endpoint_url) if anthropic_mode else endpoint_url
    payload = _build_payload(model_name=model_name, endpoint_url=resolved_endpoint)
    headers = _build_headers(api_key=api_key, endpoint_url=resolved_endpoint)
    if anthropic_mode and "anthropic-version" not in headers:
        headers["anthropic-version"] = "2023-06-01"

    async def _do_request(http_client: httpx.AsyncClient) -> tuple[bool, str]:
        response = await http_client.post(
            resolved_endpoint,
            json=payload,
            headers=headers,
            timeout=timeout_seconds,
        )
        if response.status_code < 400:
            return True, f"Connected ({response.status_code})"

        text = (response.text or "").strip()
        short_text = text[:200]
        if short_text:
            return False, f"HTTP {response.status_code}: {short_text}"
        return False, f"HTTP {response.status_code}"

    try:
        if client is not None:
            return await _do_request(client)

        async with httpx.AsyncClient() as internal_client:
            return await _do_request(internal_client)
    except httpx.TimeoutException:
        return False, "Connection timed out"
    except Exception as exc:
        return False, f"Connection failed: {exc}"


# Prevent pytest from collecting this helper as a test function.
cast(Any, test_model_connectivity).__test__ = False
