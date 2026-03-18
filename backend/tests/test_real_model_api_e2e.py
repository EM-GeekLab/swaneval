import json
import os
import socket
import subprocess
import tempfile
import time
import unittest
import uuid
from pathlib import Path

import httpx


class TestRealModelApiE2E(unittest.TestCase):
    def _require_real_e2e_enabled(self):
        run_real_e2e = os.getenv("RUN_REAL_E2E", "0").strip() == "1"
        if not run_real_e2e:
            self.skipTest("Set RUN_REAL_E2E=1 to enable real-model end-to-end test")

    def _require_model_env(self) -> tuple[str, str]:
        model_endpoint = os.getenv("E2E_MODEL_ENDPOINT", "").strip()
        model_name = os.getenv("E2E_MODEL_NAME", "").strip()
        model_api_key = os.getenv("E2E_MODEL_API_KEY", "").strip()

        missing = [
            name
            for name, val in (
                ("E2E_MODEL_ENDPOINT", model_endpoint),
                ("E2E_MODEL_NAME", model_name),
                ("E2E_MODEL_API_KEY", model_api_key),
            )
            if not val
        ]
        if missing:
            self.fail(f"Missing required env vars: {', '.join(missing)}")
        return model_endpoint, model_name

    def _run_e2e_flow(self, base_url: str):
        model_endpoint, model_name = self._require_model_env()
        model_api_key = os.getenv("E2E_MODEL_API_KEY", "").strip()

        username = f"e2e_user_{uuid.uuid4().hex[:8]}"
        email = f"{username}@example.com"
        password = "pass123456"

        with httpx.Client(timeout=30.0) as client:
            register = client.post(
                f"{base_url}/auth/register",
                json={
                    "username": username,
                    "email": email,
                    "password": password,
                    "role": "admin",
                },
            )
            self.assertIn(register.status_code, (200, 201, 409), register.text)

            login = client.post(
                f"{base_url}/auth/login", json={"username": username, "password": password}
            )
            self.assertEqual(login.status_code, 200, login.text)
            token = login.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            model = client.post(
                f"{base_url}/models",
                headers=headers,
                json={
                    "name": f"real-model-{uuid.uuid4().hex[:6]}",
                    "provider": "real-api",
                    "endpoint_url": model_endpoint,
                    "api_key": model_api_key,
                    "model_type": "api",
                    "model_name": model_name,
                },
            )
            self.assertEqual(model.status_code, 201, model.text)
            model_id = model.json()["id"]

            model_test = client.post(f"{base_url}/models/{model_id}/test", headers=headers)
            self.assertEqual(model_test.status_code, 200, model_test.text)
            model_test_body = model_test.json()
            self.assertIn("ok", model_test_body)
            self.assertIn("message", model_test_body)
            self.assertTrue(model_test_body["ok"], model_test_body["message"])

            jsonl_payload = '{"query":"What is the capital of China?","response":"Beijing"}\n'
            files = {"file": ("general_qa_sample.jsonl", jsonl_payload, "application/json")}
            dataset = client.post(
                f"{base_url}/datasets/upload",
                headers=headers,
                data={
                    "name": f"e2e-ds-{uuid.uuid4().hex[:6]}",
                    "description": "e2e dataset",
                    "tags": "e2e,real-api",
                },
                files=files,
            )
            self.assertEqual(dataset.status_code, 201, dataset.text)
            dataset_id = dataset.json()["id"]

            criterion = client.post(
                f"{base_url}/criteria",
                headers=headers,
                json={
                    "name": f"e2e-criterion-{uuid.uuid4().hex[:6]}",
                    "type": "preset",
                    "config_json": '{"metric":"exact_match"}',
                },
            )
            self.assertEqual(criterion.status_code, 201, criterion.text)
            criterion_id = criterion.json()["id"]

            task = client.post(
                f"{base_url}/tasks",
                headers=headers,
                json={
                    "name": f"e2e-task-{uuid.uuid4().hex[:6]}",
                    "model_id": model_id,
                    "dataset_ids": [dataset_id],
                    "criteria_ids": [criterion_id],
                    "params_json": json.dumps(
                        {"temperature": 0.0, "max_tokens": 32, "use_evalscope": True}
                    ),
                    "repeat_count": 1,
                    "seed_strategy": "fixed",
                },
            )
            self.assertEqual(task.status_code, 201, task.text)
            task_id = task.json()["id"]

            status = "pending"
            for _ in range(120):
                time.sleep(1)
                task_status = client.get(f"{base_url}/tasks/{task_id}", headers=headers)
                self.assertEqual(task_status.status_code, 200, task_status.text)
                status = task_status.json()["status"]
                if status in ("completed", "failed"):
                    break

            results_resp = client.get(
                f"{base_url}/results",
                headers=headers,
                params={"task_id": task_id, "page_size": 20},
            )
            self.assertEqual(results_resp.status_code, 200, results_resp.text)
            results = results_resp.json()

        self.assertEqual(status, "completed", f"task status is {status}")
        self.assertGreaterEqual(len(results), 1, "result rows should be >= 1")

        first_prompt = str(results[0].get("prompt_text") or "")
        self.assertTrue(first_prompt, "unexpected result format; prompt_text is empty")

    def test_real_model_api_end_to_end(self):
        """E2E mode: run against an already-running backend service."""
        self._require_real_e2e_enabled()
        base_url = os.getenv("E2E_BASE_URL", "http://127.0.0.1:8000/api/v1").strip()
        self._run_e2e_flow(base_url)

    def test_real_model_api_integration_with_local_backend(self):
        """Integration mode: spin up backend process inside test, then run real-model E2E flow."""
        self._require_real_e2e_enabled()
        run_integration = os.getenv("RUN_REAL_E2E_INTEGRATION", "0").strip() == "1"
        if not run_integration:
            self.skipTest("Set RUN_REAL_E2E_INTEGRATION=1 to auto-start backend in test")

        repo_root = Path(__file__).resolve().parents[2]
        python_bin = str(repo_root / ".venv" / "bin" / "python")
        if not Path(python_bin).exists():
            self.fail(f"Python executable not found: {python_bin}")

        with tempfile.TemporaryDirectory(prefix="real-e2e-") as tmpdir:
            db_file = Path(tmpdir) / "e2e_real_integration.db"
            upload_dir = Path(tmpdir) / "uploads"
            upload_dir.mkdir(parents=True, exist_ok=True)

            port = int(os.getenv("E2E_LOCAL_SERVER_PORT", "18000"))
            host = "127.0.0.1"
            base_url = f"http://{host}:{port}/api/v1"

            env = os.environ.copy()
            env.update(
                {
                    "DATABASE_URL": f"sqlite+aiosqlite:///{db_file}",
                    "DATABASE_URL_SYNC": f"sqlite:///{db_file}",
                    "REDIS_URL": "redis://localhost:6379/9",
                    "UPLOAD_DIR": str(upload_dir),
                    "CORS_ORIGINS": '["http://localhost:3000"]',
                }
            )

            cmd = [
                python_bin,
                "-m",
                "uvicorn",
                "app.main:app",
                "--app-dir",
                "backend",
                "--host",
                host,
                "--port",
                str(port),
            ]

            process = subprocess.Popen(
                cmd,
                cwd=str(repo_root),
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
            )
            try:
                self._wait_server_ready(host=host, port=port, process=process)
                self._run_e2e_flow(base_url)
            finally:
                self._stop_process(process)

    def _wait_server_ready(self, host: str, port: int, process: subprocess.Popen, timeout: int = 40):
        start = time.time()
        last_err = ""
        while time.time() - start < timeout:
            if process.poll() is not None:
                output = ""
                if process.stdout:
                    output = process.stdout.read()
                self.fail(f"Backend process exited early with code {process.returncode}:\n{output}")

            try:
                with socket.create_connection((host, port), timeout=1.0):
                    with httpx.Client(timeout=2.0) as client:
                        health = client.get(f"http://{host}:{port}/health")
                        if health.status_code == 200:
                            return
            except Exception as exc:  # pragma: no cover - retry path
                last_err = str(exc)

            time.sleep(1)

        logs = ""
        if process.stdout:
            logs = process.stdout.read()
        self.fail(f"Backend not ready in {timeout}s. last_err={last_err}\n{logs}")

    def _stop_process(self, process: subprocess.Popen):
        if process.poll() is not None:
            return
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)


if __name__ == "__main__":
    unittest.main()