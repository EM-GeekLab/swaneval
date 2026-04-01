"""HTTP client for the EvalScope evaluation service.

Communicates with the EvalScope Flask service (default :9000) via REST API.
Handles the blocking nature of /api/v1/eval/invoke by running the request
in a thread pool while concurrently polling progress on the async loop.
"""

import asyncio
import logging
from collections.abc import Callable, Coroutine
from typing import Any

import httpx

from app.config import settings
from app.errors import EvalScopeServiceError, EvalScopeTimeoutError

logger = logging.getLogger(__name__)


class EvalScopeClient:
    """Async wrapper around the EvalScope HTTP service."""

    def __init__(
        self,
        base_url: str | None = None,
        timeout: int | None = None,
        poll_interval: int | None = None,
    ):
        self.base_url = (base_url or settings.EVALSCOPE_SERVICE_URL).rstrip("/")
        self.timeout = timeout or settings.EVALSCOPE_TIMEOUT_SECONDS
        self.poll_interval = poll_interval or settings.EVALSCOPE_POLL_INTERVAL
        self._sync_client = httpx.Client(timeout=self.timeout)
        self._async_client = httpx.AsyncClient(timeout=30)

    async def close(self) -> None:
        self._sync_client.close()
        await self._async_client.aclose()

    # ── Health ────────────────────────────────────────────────────

    async def health_check(self, retries: int = 3) -> bool:
        """Return True if the EvalScope service is healthy."""
        for attempt in range(retries):
            try:
                resp = await self._async_client.get(
                    f"{self.base_url}/health", timeout=5,
                )
                if resp.status_code == 200:
                    return True
            except Exception:
                if attempt < retries - 1:
                    await asyncio.sleep(1)
        return False

    # ── Evaluation ────────────────────────────────────────────────

    async def invoke_eval(
        self,
        config: dict[str, Any],
        on_progress: Callable[[dict], Coroutine] | None = None,
    ) -> dict[str, Any]:
        """Run an evaluation via the EvalScope service.

        The ``POST /api/v1/eval/invoke`` endpoint is **synchronous/blocking**
        — it does not return until the evaluation completes.  We run the
        blocking HTTP call in a thread so the async event loop stays free,
        and concurrently poll ``GET /api/v1/eval/progress`` to stream
        progress updates back to the caller via *on_progress*.
        """
        done = asyncio.Event()
        result_holder: dict[str, Any] = {}
        error_holder: list[Exception] = []

        async def _do_invoke():
            try:
                resp = await asyncio.to_thread(
                    self._sync_client.post,
                    f"{self.base_url}/api/v1/eval/invoke",
                    json=config,
                )
                if resp.status_code >= 400:
                    error_holder.append(
                        EvalScopeServiceError(
                            f"EvalScope returned {resp.status_code}: "
                            f"{resp.text[:500]}"
                        )
                    )
                    return
                result_holder["data"] = resp.json()
            except httpx.TimeoutException as e:
                error_holder.append(
                    EvalScopeTimeoutError(
                        f"EvalScope evaluation timed out after "
                        f"{self.timeout}s: {e}"
                    )
                )
            except Exception as e:
                error_holder.append(
                    EvalScopeServiceError(
                        f"EvalScope invocation failed: {e}"
                    )
                )
            finally:
                done.set()

        async def _do_poll():
            while not done.is_set():
                if on_progress:
                    try:
                        resp = await self._async_client.get(
                            f"{self.base_url}/api/v1/eval/progress",
                        )
                        if resp.status_code == 200:
                            await on_progress(resp.json())
                    except Exception:
                        pass  # Progress polling failure is non-fatal
                try:
                    await asyncio.wait_for(
                        done.wait(), timeout=self.poll_interval,
                    )
                except asyncio.TimeoutError:
                    pass  # Expected — poll again

        await asyncio.gather(_do_invoke(), _do_poll())

        if error_holder:
            raise error_holder[0]

        return result_holder.get("data", {})

    # ── Performance Testing ───────────────────────────────────────

    async def invoke_perf(self, config: dict[str, Any]) -> dict[str, Any]:
        """Run a performance/stress test via the EvalScope service."""
        try:
            resp = await asyncio.to_thread(
                self._sync_client.post,
                f"{self.base_url}/api/v1/perf/invoke",
                json=config,
            )
            if resp.status_code >= 400:
                raise EvalScopeServiceError(
                    f"EvalScope perf returned {resp.status_code}: "
                    f"{resp.text[:500]}"
                )
            return resp.json()
        except httpx.TimeoutException as e:
            raise EvalScopeTimeoutError(
                f"EvalScope perf test timed out: {e}"
            ) from e

    # ── Discovery ─────────────────────────────────────────────────

    async def list_benchmarks(self) -> list[str]:
        """List available benchmark datasets from the EvalScope service."""
        try:
            resp = await self._async_client.get(
                f"{self.base_url}/api/v1/eval/benchmarks",
            )
            if resp.status_code == 200:
                data = resp.json()
                return data if isinstance(data, list) else []
        except Exception as e:
            logger.warning("Failed to list EvalScope benchmarks: %s", e)
        return []
