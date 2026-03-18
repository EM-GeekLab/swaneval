import json
import os
import time
import uuid

import httpx

BASE = os.getenv("E2E_BASE_URL", "http://127.0.0.1:8000/api/v1")
MODEL_ENDPOINT = os.getenv("E2E_MODEL_ENDPOINT", "")
MODEL_NAME = os.getenv("E2E_MODEL_NAME", "")
MODEL_API_KEY = os.getenv("E2E_MODEL_API_KEY", "")


def main():
    if not MODEL_ENDPOINT or not MODEL_NAME or not MODEL_API_KEY:
        raise SystemExit(
            "Missing env vars: E2E_MODEL_ENDPOINT, E2E_MODEL_NAME, E2E_MODEL_API_KEY"
        )

    # 这个脚本是“最小端到端冒烟测试”：
    # 1) 通过真实 HTTP API 创建用户/模型/数据集/评测标准/任务
    # 2) 轮询任务直到结束
    # 3) 读取结果列表并校验至少有一条写回数据库
    # 它主要验证“链路打通”和“结果落库”，不验证算法分数本身是否正确。
    username = f"e2e_user_{uuid.uuid4().hex[:8]}"
    email = f"{username}@example.com"
    password = "pass123456"

    with httpx.Client(timeout=20.0) as c:
        register = c.post(
            f"{BASE}/auth/register",
            json={
                "username": username,
                "email": email,
                "password": password,
                "role": "admin",
            },
        )
        if register.status_code not in (200, 201, 409):
            raise RuntimeError(f"register failed: {register.status_code} {register.text}")

        login = c.post(f"{BASE}/auth/login", json={"username": username, "password": password})
        login.raise_for_status()
        token = login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        model = c.post(
            f"{BASE}/models",
            headers=headers,
            json={
                "name": f"real-model-{uuid.uuid4().hex[:6]}",
                "provider": "bailian",
                "endpoint_url": MODEL_ENDPOINT,
                "api_key": MODEL_API_KEY,
                "model_type": "api",
                "model_name": MODEL_NAME,
            },
        )
        model.raise_for_status()
        model_id = model.json()["id"]

        dataset = c.post(
            f"{BASE}/datasets/mount",
            headers=headers,
            json={
                "name": f"e2e-ds-{uuid.uuid4().hex[:6]}",
                "description": "e2e dataset",
                "server_path": "data/e2e_cases/general_qa_sample.jsonl",
                "format": "jsonl",
                "tags": "e2e,evalscope",
            },
        )
        dataset.raise_for_status()
        dataset_id = dataset.json()["id"]

        criterion = c.post(
            f"{BASE}/criteria",
            headers=headers,
            json={
                "name": f"e2e-criterion-{uuid.uuid4().hex[:6]}",
                "type": "preset",
                "config_json": '{"metric":"exact_match"}',
            },
        )
        criterion.raise_for_status()
        criterion_id = criterion.json()["id"]

        task = c.post(
            f"{BASE}/tasks",
            headers=headers,
            json={
                "name": f"e2e-task-{uuid.uuid4().hex[:6]}",
                "model_id": model_id,
                "dataset_ids": [dataset_id],
                "criteria_ids": [criterion_id],
                "params_json": json.dumps({"temperature": 0.0, "max_tokens": 32}),
                "repeat_count": 1,
                "seed_strategy": "fixed",
            },
        )
        task.raise_for_status()
        task_id = task.json()["id"]

        # 轮询任务状态：最多等 60 秒。
        # 如果你的机器较慢或队列较忙，可以把 60 调大。
        status = "pending"
        for _ in range(60):
            time.sleep(1)
            task_status = c.get(f"{BASE}/tasks/{task_id}", headers=headers)
            task_status.raise_for_status()
            status = task_status.json()["status"]
            if status in ("completed", "failed"):
                break

        results_resp = c.get(
            f"{BASE}/results",
            headers=headers,
            params={"task_id": task_id, "page_size": 20},
        )
        results_resp.raise_for_status()
        results = results_resp.json()

    print(f"TASK_ID= {task_id}")
    print(f"TASK_STATUS= {status}")
    print(f"RESULT_COUNT= {len(results)}")
    if results:
        print(f"FIRST_RESULT_SCORE= {results[0].get('score')}")
        print(f"FIRST_RESULT_MODEL_OUTPUT= {results[0].get('model_output')}")

    # 最小通过条件：任务完成 + 至少 1 条结果。
    # 这说明后端调度、EvalScope 执行分支、结果写回都成功了。
    if status != "completed" or len(results) < 1:
        raise SystemExit(2)

    # 额外轻量校验：确认是样本级写回（而非 summary 占位行）。
    first_prompt = str(results[0].get("prompt_text") or "")
    if not first_prompt:
        raise SystemExit("unexpected result format; prompt_text is empty")


if __name__ == "__main__":
    main()
