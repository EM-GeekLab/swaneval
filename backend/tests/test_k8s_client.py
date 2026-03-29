"""Tests for K8s client factory."""

import base64
import os
import tempfile
import unittest

from app.services.k8s_client import _inline_cert_data, _inline_file_field


class TestInlineFileField(unittest.TestCase):
    def test_inline_existing_file(self):
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pem") as f:
            f.write(b"cert-data-here")
            f.flush()
            path = f.name
        try:
            obj = {"certificate-authority": path}
            _inline_file_field(obj, "certificate-authority", "certificate-authority-data")
            self.assertNotIn("certificate-authority", obj)
            self.assertEqual(
                obj["certificate-authority-data"],
                base64.b64encode(b"cert-data-here").decode("ascii"),
            )
        finally:
            os.unlink(path)

    def test_skip_when_data_already_present(self):
        obj = {
            "certificate-authority": "/some/path",
            "certificate-authority-data": "existing",
        }
        _inline_file_field(obj, "certificate-authority", "certificate-authority-data")
        self.assertEqual(obj["certificate-authority-data"], "existing")
        self.assertIn("certificate-authority", obj)  # not removed

    def test_skip_when_file_not_found(self):
        obj = {"certificate-authority": "/nonexistent/path.pem"}
        _inline_file_field(obj, "certificate-authority", "certificate-authority-data")
        self.assertNotIn("certificate-authority-data", obj)

    def test_skip_when_no_keys(self):
        obj = {}
        _inline_file_field(obj, "certificate-authority", "certificate-authority-data")
        self.assertEqual(obj, {})


class TestInlineCertData(unittest.TestCase):
    def test_processes_clusters_and_users(self):
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pem") as f:
            f.write(b"ca-cert")
            ca_path = f.name
        try:
            kc = {
                "clusters": [{"cluster": {"certificate-authority": ca_path}}],
                "users": [{"user": {}}],
            }
            _inline_cert_data(kc)
            self.assertIn("certificate-authority-data", kc["clusters"][0]["cluster"])
        finally:
            os.unlink(ca_path)

    def test_processes_user_certs(self):
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pem") as f:
            f.write(b"client-cert")
            cert_path = f.name
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pem") as f:
            f.write(b"client-key")
            key_path = f.name
        try:
            kc = {
                "clusters": [],
                "users": [{"user": {
                    "client-certificate": cert_path,
                    "client-key": key_path,
                }}],
            }
            _inline_cert_data(kc)
            user = kc["users"][0]["user"]
            self.assertIn("client-certificate-data", user)
            self.assertIn("client-key-data", user)
            self.assertEqual(
                user["client-certificate-data"],
                base64.b64encode(b"client-cert").decode("ascii"),
            )
            self.assertEqual(
                user["client-key-data"],
                base64.b64encode(b"client-key").decode("ascii"),
            )
        finally:
            os.unlink(cert_path)
            os.unlink(key_path)

    def test_handles_empty(self):
        kc = {"clusters": [], "users": []}
        _inline_cert_data(kc)  # should not raise

    def test_handles_missing_keys(self):
        kc = {}
        _inline_cert_data(kc)  # should not raise


if __name__ == "__main__":
    unittest.main()
