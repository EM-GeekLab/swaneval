import os
import tempfile
import uuid
import unittest
from types import SimpleNamespace
from typing import Any, cast

from app.models.dataset import SourceType
from app.services.dataset_deletion import cleanup_uploaded_file, delete_dataset_versions


class _FakeExecResult:
    def __init__(self, items):
        self._items = items

    def all(self):
        return list(self._items)


class _FakeSession:
    def __init__(self, versions):
        self.versions = versions
        self.deleted = []

    async def exec(self, stmt):
        _ = stmt
        return _FakeExecResult(self.versions)

    async def delete(self, item):
        self.deleted.append(item)


class TestDatasetDeletion(unittest.IsolatedAsyncioTestCase):
    def test_cleanup_uploaded_file_non_upload_or_missing(self):
        ds_not_upload = cast(Any, SimpleNamespace(source_type=SourceType.server_path, source_uri="/tmp/x"))
        self.assertFalse(cleanup_uploaded_file(ds_not_upload))

        ds_empty_path = cast(Any, SimpleNamespace(source_type=SourceType.upload, source_uri=""))
        self.assertFalse(cleanup_uploaded_file(ds_empty_path))

        ds_missing_file = cast(Any, SimpleNamespace(source_type=SourceType.upload, source_uri="/tmp/not-exists"))
        self.assertFalse(cleanup_uploaded_file(ds_missing_file))

    def test_cleanup_uploaded_file_success_and_oserror(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            fpath = os.path.join(tmpdir, "sample.jsonl")
            with open(fpath, "w", encoding="utf-8") as f:
                f.write("{}\n")

            ds_ok = cast(Any, SimpleNamespace(source_type=SourceType.upload, source_uri=fpath))
            self.assertTrue(cleanup_uploaded_file(ds_ok))
            self.assertFalse(os.path.exists(fpath))

            fpath2 = os.path.join(tmpdir, "sample2.jsonl")
            with open(fpath2, "w", encoding="utf-8") as f:
                f.write("{}\n")

            ds_err = cast(Any, SimpleNamespace(source_type=SourceType.upload, source_uri=fpath2))
            original_remove = os.remove

            def _raise_oserror(path):
                _ = path
                raise OSError("cannot remove")

            try:
                os.remove = _raise_oserror
                self.assertFalse(cleanup_uploaded_file(ds_err))
            finally:
                os.remove = original_remove

    async def test_delete_dataset_versions(self):
        versions = [
            cast(Any, SimpleNamespace(id=uuid.uuid4())),
            cast(Any, SimpleNamespace(id=uuid.uuid4())),
            cast(Any, SimpleNamespace(id=uuid.uuid4())),
        ]
        session = _FakeSession(versions)

        deleted_count = await delete_dataset_versions(cast(Any, session), uuid.uuid4())

        self.assertEqual(deleted_count, 3)
        self.assertEqual(session.deleted, versions)


if __name__ == "__main__":
    unittest.main()
