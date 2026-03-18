import uuid
import unittest
from datetime import datetime, timedelta
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from app.api.v1.models import (
    create_model,
    delete_model,
    get_model,
    list_models,
    test_model as api_test_model,
    update_model,
)
from app.models.llm_model import LLMModel, ModelType
from app.schemas.model import LLMModelCreate, LLMModelUpdate


class _FakeExecResult:
    def __init__(self, items):
        self._items = items

    def all(self):
        return list(self._items)


class _FakeSession:
    def __init__(self, items=None):
        self.items = {}
        if items:
            for item in items:
                self.items[item.id] = item

    async def get(self, model_cls, item_id):
        _ = model_cls
        return self.items.get(item_id)

    def add(self, item):
        self.items[item.id] = item

    async def commit(self):
        return None

    async def refresh(self, item):
        _ = item
        return None

    async def delete(self, item):
        self.items.pop(item.id, None)

    async def exec(self, stmt):
        _ = stmt
        items = sorted(self.items.values(), key=lambda it: it.created_at, reverse=True)
        return _FakeExecResult(items)


def _make_model(name: str, created_at: datetime | None = None) -> LLMModel:
    return LLMModel(
        id=uuid.uuid4(),
        name=name,
        provider="openai",
        endpoint_url="http://127.0.0.1:8801/v1/chat/completions",
        api_key="key",
        model_type=ModelType.api,
        description="desc",
        model_name=f"{name}-upstream",
        max_tokens=4096,
        created_at=created_at or datetime.utcnow(),
        updated_at=created_at or datetime.utcnow(),
    )


class TestModelsApi(unittest.IsolatedAsyncioTestCase):
    async def test_create_and_list_models(self):
        user = cast(Any, SimpleNamespace(id=uuid.uuid4()))
        session = _FakeSession()

        body = LLMModelCreate(
            name="gpt-test",
            provider="openai",
            endpoint_url="http://127.0.0.1:8801/v1/chat/completions",
            api_key="sk-test",
            model_type=ModelType.api,
            description="demo",
            model_name="gpt-test-1",
            max_tokens=2048,
        )

        created = await create_model(
            body=body,
            session=cast(Any, session),
            current_user=cast(Any, user),
        )
        self.assertEqual(created.description, "demo")
        self.assertEqual(created.model_name, "gpt-test-1")
        self.assertEqual(created.max_tokens, 2048)

        old = _make_model("old", datetime.utcnow() - timedelta(days=1))
        session.add(old)

        listed = await list_models(session=cast(Any, session), current_user=cast(Any, user))
        self.assertEqual(len(listed), 2)
        self.assertEqual(listed[0].name, "gpt-test")

    async def test_get_model_success_and_not_found(self):
        user = cast(Any, SimpleNamespace(id=uuid.uuid4()))
        model = _make_model("m1")
        session = _FakeSession([model])

        got = await get_model(
            model_id=model.id,
            session=cast(Any, session),
            current_user=cast(Any, user),
        )
        self.assertEqual(got.id, model.id)

        with self.assertRaises(HTTPException) as ctx:
            await get_model(
                model_id=uuid.uuid4(),
                session=cast(Any, session),
                current_user=cast(Any, user),
            )
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_update_model_success_and_not_found(self):
        user = cast(Any, SimpleNamespace(id=uuid.uuid4()))
        model = _make_model("before")
        old_updated_at = model.updated_at
        session = _FakeSession([model])

        updated = await update_model(
            model_id=model.id,
            body=LLMModelUpdate(
                name="after",
                endpoint_url="http://new-endpoint",
                api_key="new-key",
                description="new-desc",
                model_name="new-model",
                max_tokens=8192,
            ),
            session=cast(Any, session),
            current_user=cast(Any, user),
        )

        self.assertEqual(updated.name, "after")
        self.assertEqual(updated.endpoint_url, "http://new-endpoint")
        self.assertEqual(updated.api_key, "new-key")
        self.assertEqual(updated.description, "new-desc")
        self.assertEqual(updated.model_name, "new-model")
        self.assertEqual(updated.max_tokens, 8192)
        self.assertGreaterEqual(updated.updated_at, old_updated_at)

        with self.assertRaises(HTTPException) as ctx:
            await update_model(
                model_id=uuid.uuid4(),
                body=LLMModelUpdate(name="x"),
                session=cast(Any, session),
                current_user=cast(Any, user),
            )
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_delete_model_success_and_not_found(self):
        user = cast(Any, SimpleNamespace(id=uuid.uuid4()))
        model = _make_model("delete-me")
        session = _FakeSession([model])

        await delete_model(
            model_id=model.id,
            session=cast(Any, session),
            current_user=cast(Any, user),
        )
        self.assertNotIn(model.id, session.items)

        with self.assertRaises(HTTPException) as ctx:
            await delete_model(
                model_id=uuid.uuid4(),
                session=cast(Any, session),
                current_user=cast(Any, user),
            )
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_test_model_success_failure_and_not_found(self):
        user = cast(Any, SimpleNamespace(id=uuid.uuid4()))
        model = _make_model("to-test")
        model.model_name = ""
        session = _FakeSession([model])

        with patch("app.api.v1.models.test_model_connectivity", new=AsyncMock(return_value=(True, "Connected (200)"))):
            resp = await api_test_model(
                model_id=model.id,
                session=cast(Any, session),
                current_user=cast(Any, user),
            )
        self.assertTrue(resp.ok)
        self.assertEqual(resp.message, "Connected (200)")

        with patch("app.api.v1.models.test_model_connectivity", new=AsyncMock(return_value=(False, "HTTP 500"))):
            resp = await api_test_model(
                model_id=model.id,
                session=cast(Any, session),
                current_user=cast(Any, user),
            )
        self.assertFalse(resp.ok)
        self.assertEqual(resp.message, "HTTP 500")

        with self.assertRaises(HTTPException) as ctx:
            await api_test_model(
                model_id=uuid.uuid4(),
                session=cast(Any, session),
                current_user=cast(Any, user),
            )
        self.assertEqual(ctx.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
