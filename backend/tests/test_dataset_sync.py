"""Tests for dataset sync helpers."""

import sys
import types
import unittest
from unittest.mock import patch

from app.services.dataset_sync import _get_hf_latest_sha


class TestGetHfLatestSha(unittest.TestCase):
    def test_returns_sha_when_repo_exists(self):
        fake_hf_module = types.SimpleNamespace(
            repo_info=lambda dataset_id, repo_type: types.SimpleNamespace(sha="abc123")
        )
        fake_utils_module = types.SimpleNamespace(
            RepositoryNotFoundError=type("RepositoryNotFoundError", (Exception,), {})
        )

        with patch.dict(
            sys.modules,
            {
                "huggingface_hub": fake_hf_module,
                "huggingface_hub.utils": fake_utils_module,
            },
        ):
            self.assertEqual(_get_hf_latest_sha("org/dataset"), "abc123")

    def test_returns_none_for_repository_not_found_error(self):
        repo_not_found_error = type("RepositoryNotFoundError", (Exception,), {})

        def fake_repo_info(dataset_id, repo_type):
            raise repo_not_found_error("missing repo")

        fake_hf_module = types.SimpleNamespace(repo_info=fake_repo_info)
        fake_utils_module = types.SimpleNamespace(
            RepositoryNotFoundError=repo_not_found_error
        )

        with patch.dict(
            sys.modules,
            {
                "huggingface_hub": fake_hf_module,
                "huggingface_hub.utils": fake_utils_module,
            },
        ):
            self.assertIsNone(_get_hf_latest_sha("org/missing"))

    def test_reraises_non_repository_errors_even_if_message_mentions_404(self):
        def fake_repo_info(dataset_id, repo_type):
            raise RuntimeError("404 not found but actually a different failure")

        fake_hf_module = types.SimpleNamespace(repo_info=fake_repo_info)
        fake_utils_module = types.SimpleNamespace(
            RepositoryNotFoundError=type("RepositoryNotFoundError", (Exception,), {})
        )

        with patch.dict(
            sys.modules,
            {
                "huggingface_hub": fake_hf_module,
                "huggingface_hub.utils": fake_utils_module,
            },
        ):
            with self.assertRaisesRegex(RuntimeError, "404 not found"):
                _get_hf_latest_sha("org/broken")


if __name__ == "__main__":
    unittest.main()
