import unittest
from typing import Any, cast
from unittest.mock import patch

import httpx

from app.services.model_connectivity import (
    _build_headers,
    _normalize_endpoint_url,
    test_model_connectivity,
)


class _FakeResponse:
    def __init__(self, status_code: int, text: str = ""):
        self.status_code = status_code
        self.text = text


class _FakeClient:
    def __init__(self, response=None, exc=None):
        self._response = response
        self._exc = exc
        self.calls = []

    async def post(self, endpoint_url, json, headers, timeout):
        self.calls.append(
            {
                "endpoint_url": endpoint_url,
                "json": json,
                "headers": headers,
                "timeout": timeout,
            }
        )
        if self._exc:
            raise self._exc
        return self._response


class _FakeAsyncClientContext:
    def __init__(self, inner_client):
        self.inner_client = inner_client

    async def __aenter__(self):
        return self.inner_client

    async def __aexit__(self, exc_type, exc, tb):
        return False


class TestModelConnectivity(unittest.IsolatedAsyncioTestCase):
    def test_build_headers(self):
        self.assertEqual(
            _build_headers("", "http://127.0.0.1:8801/v1/chat/completions"),
            {"Content-Type": "application/json"},
        )
        self.assertEqual(
            _build_headers("token", "http://127.0.0.1:8801/v1/chat/completions"),
            {
                "Content-Type": "application/json",
                "Authorization": "Bearer token",
            },
        )
        self.assertEqual(
            _build_headers("token", "https://coding.dashscope.aliyuncs.com/apps/anthropic"),
            {
                "Content-Type": "application/json",
                "Authorization": "Bearer token",
                "anthropic-version": "2023-06-01",
            },
        )

    def test_normalize_endpoint_url(self):
        self.assertEqual(_normalize_endpoint_url(""), "")
        self.assertEqual(
            _normalize_endpoint_url("https://coding.dashscope.aliyuncs.com/apps/anthropic"),
            "https://coding.dashscope.aliyuncs.com/apps/anthropic/v1/messages",
        )
        self.assertEqual(
            _normalize_endpoint_url("https://coding.dashscope.aliyuncs.com/apps/anthropic/v1/messages"),
            "https://coding.dashscope.aliyuncs.com/apps/anthropic/v1/messages",
        )
        self.assertEqual(
            _normalize_endpoint_url("http://127.0.0.1:8801/v1/chat/completions"),
            "http://127.0.0.1:8801/v1/chat/completions",
        )

    async def test_connectivity_success_with_provided_client(self):
        client = _FakeClient(response=_FakeResponse(200, "ok"))

        ok, message = await test_model_connectivity(
            endpoint_url="http://127.0.0.1:8801/v1/chat/completions",
            api_key="abc",
            model_name="mock-model",
            client=cast(Any, client),
        )

        self.assertTrue(ok)
        self.assertEqual(message, "Connected (200)")
        self.assertEqual(client.calls[0]["headers"]["Authorization"], "Bearer abc")

    async def test_connectivity_http_error_with_text(self):
        client = _FakeClient(response=_FakeResponse(500, "server exploded"))

        ok, message = await test_model_connectivity(
            endpoint_url="http://127.0.0.1:8801/v1/chat/completions",
            api_key="abc",
            model_name="mock-model",
            client=cast(Any, client),
        )

        self.assertFalse(ok)
        self.assertEqual(message, "HTTP 500: server exploded")

    async def test_connectivity_http_error_without_text(self):
        client = _FakeClient(response=_FakeResponse(400, "   "))

        ok, message = await test_model_connectivity(
            endpoint_url="http://127.0.0.1:8801/v1/chat/completions",
            api_key="abc",
            model_name="mock-model",
            client=cast(Any, client),
        )

        self.assertFalse(ok)
        self.assertEqual(message, "HTTP 400")

    async def test_connectivity_timeout(self):
        client = _FakeClient(exc=httpx.TimeoutException("timeout"))

        ok, message = await test_model_connectivity(
            endpoint_url="http://127.0.0.1:8801/v1/chat/completions",
            api_key="abc",
            model_name="mock-model",
            client=cast(Any, client),
        )

        self.assertFalse(ok)
        self.assertEqual(message, "Connection timed out")

    async def test_connectivity_generic_failure(self):
        client = _FakeClient(exc=RuntimeError("boom"))

        ok, message = await test_model_connectivity(
            endpoint_url="http://127.0.0.1:8801/v1/chat/completions",
            api_key="abc",
            model_name="mock-model",
            client=cast(Any, client),
        )

        self.assertFalse(ok)
        self.assertIn("Connection failed: boom", message)

    async def test_connectivity_without_provided_client(self):
        inner_client = _FakeClient(response=_FakeResponse(204, ""))
        ctx = _FakeAsyncClientContext(inner_client)

        with patch("app.services.model_connectivity.httpx.AsyncClient", return_value=ctx):
            ok, message = await test_model_connectivity(
                endpoint_url="http://127.0.0.1:8801/v1/chat/completions",
                api_key="abc",
                model_name="mock-model",
            )

        self.assertTrue(ok)
        self.assertEqual(message, "Connected (204)")

    async def test_connectivity_fails_fast_for_missing_required_fields(self):
        ok, message = await test_model_connectivity(
            endpoint_url="",
            api_key="abc",
            model_name="mock-model",
        )
        self.assertFalse(ok)
        self.assertEqual(message, "Missing endpoint_url")

        ok, message = await test_model_connectivity(
            endpoint_url="http://127.0.0.1:8801/v1/chat/completions",
            api_key="abc",
            model_name="",
        )
        self.assertFalse(ok)
        self.assertEqual(message, "Missing model_name")

        ok, message = await test_model_connectivity(
            endpoint_url="http://127.0.0.1:8801/v1/chat/completions",
            api_key="",
            model_name="mock-model",
        )
        self.assertFalse(ok)
        self.assertEqual(message, "Missing api_key")


if __name__ == "__main__":
    unittest.main()
