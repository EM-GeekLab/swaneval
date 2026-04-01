"""Tests for Redis queue worker resilience."""

import asyncio
import sys
import types
import unittest
import uuid
from unittest.mock import patch

from app.services import task_queue


class TestEmbeddedWorkerLoop(unittest.IsolatedAsyncioTestCase):
    async def test_embedded_worker_loop_survives_redis_bookkeeping_failures(self):
        task_id = str(uuid.uuid4())
        register_calls = 0
        dequeue_calls = 0
        statuses: list[str] = []
        backoff_delays: list[int] = []
        run_task_calls: list[uuid.UUID] = []
        mark_running_calls: list[tuple[str, str]] = []
        mark_done_calls: list[str] = []
        done_event = asyncio.Event()

        async def fake_register_worker(worker_id: str) -> None:
            nonlocal register_calls
            register_calls += 1
            if register_calls == 1:
                raise RuntimeError("register down")

        async def fake_update_worker_status(worker_id: str, status: str) -> None:
            statuses.append(status)
            raise RuntimeError(f"status {status} down")

        async def fake_dequeue_task(timeout: int = 3) -> dict | None:
            nonlocal dequeue_calls
            dequeue_calls += 1
            if dequeue_calls <= 10:
                raise RuntimeError(f"redis down #{dequeue_calls}")
            if dequeue_calls == 11:
                return {"task_id": task_id}
            await asyncio.Future()
            return None

        async def fake_mark_running(task_id: str, worker_id: str) -> None:
            mark_running_calls.append((task_id, worker_id))
            raise RuntimeError("mark_running down")

        async def fake_mark_done(task_id: str) -> None:
            mark_done_calls.append(task_id)
            done_event.set()
            raise RuntimeError("mark_done down")

        async def fake_sleep(delay: int) -> None:
            backoff_delays.append(delay)

        async def fake_run_task(task_uuid: uuid.UUID) -> None:
            run_task_calls.append(task_uuid)

        fake_task_runner = types.SimpleNamespace(run_task=fake_run_task)

        with (
            patch.object(task_queue, "register_worker", side_effect=fake_register_worker),
            patch.object(task_queue, "update_worker_status", side_effect=fake_update_worker_status),
            patch.object(task_queue, "dequeue_task", side_effect=fake_dequeue_task),
            patch.object(task_queue, "mark_running", side_effect=fake_mark_running),
            patch.object(task_queue, "mark_done", side_effect=fake_mark_done),
            patch.object(
                task_queue,
                "unregister_worker",
                side_effect=RuntimeError("unregister down"),
            ),
            patch("asyncio.sleep", side_effect=fake_sleep),
            patch.dict(sys.modules, {"app.services.task_runner": fake_task_runner}),
        ):
            worker = asyncio.create_task(task_queue.embedded_worker_loop())
            await asyncio.wait_for(done_event.wait(), timeout=1)
            worker.cancel()
            await worker

        self.assertEqual([str(task_uuid) for task_uuid in run_task_calls], [task_id])
        self.assertEqual(len(mark_running_calls), 1)
        self.assertEqual(mark_running_calls[0][0], task_id)
        self.assertTrue(mark_running_calls[0][1].startswith("embedded-"))
        self.assertEqual(mark_done_calls, [task_id])
        self.assertIn("redis_unhealthy", statuses)
        self.assertEqual(backoff_delays, [5, 10, 15, 20, 25, 30, 30, 30, 30, 30])
        self.assertGreaterEqual(register_calls, 2)


if __name__ == "__main__":
    unittest.main()
