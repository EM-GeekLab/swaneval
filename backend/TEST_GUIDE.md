# EvalScope GUI 后端单元测试文档

## 1. 项目概述

### 1.1 项目架构

EvalScope GUI 是一个企业级 LLM 评估平台，采用前后端分离架构：

| 层级     | 技术                              |
| -------- | --------------------------------- |
| 后端框架 | FastAPI + SQLModel                |
| 数据库   | PostgreSQL 14 (异步) + SQLAlchemy |
| 任务队列 | 异步任务 (asyncio)                |
| 前端     | Next.js 14 + shadcn/ui            |
| 认证     | JWT (python-jose)                 |

### 1.2 核心功能模块

```text
backend/app/
├── main.py              # FastAPI 应用入口
├── config.py            # 配置管理 (pydantic-settings)
├── database.py          # 异步数据库连接
├── models/              # SQLModel 数据模型
│   ├── user.py         # 用户模型
│   ├── llm_model.py    # LLM 模型注册
│   ├── dataset.py      # 数据集管理
│   ├── criterion.py    # 评估标准
│   ├── eval_task.py    # 评估任务
│   └── eval_result.py  # 评估结果
├── schemas/             # Pydantic 请求/响应模型
├── api/
│   └── v1/
│       ├── auth.py     # 认证接口
│       ├── models.py   # 模型管理接口
│       ├── datasets.py # 数据集接口
│       ├── criteria.py# 评估标准接口
│       ├── tasks.py    # 任务管理接口
│       └── results.py  # 结果查询接口
└── services/
    ├── auth.py         # JWT 认证服务
    ├── evaluators.py   # 评估器实现
    └── task_runner.py # 任务运行器
```

---

## 2. 当前实现说明

**重要提示**：当前项目是一个**独立的评估框架**，并未集成 `evalscope` Python SDK。项目包含：

### 2.1 自定义模型调用 (`app/services/task_runner.py`)

- 直接调用 OpenAI 兼容的 API 端点
- 支持 temperature、max_tokens、seed 等参数
- 返回延迟、token 数量、首个 token 延迟等指标

### 2.2 内置评估器 (`app/services/evaluators.py`)

| 评估器      | 说明                             |
| ----------- | -------------------------------- |
| exact_match | 精确匹配，忽略首尾空白           |
| contains    | 判断期望输出是否包含在模型输出中 |
| regex       | 正则表达式匹配                   |
| numeric     | 数值接近度判断（可配置容差）     |

### 2.3 异步任务执行

- 使用 `asyncio.create_task()` 后台执行
- 支持暂停/恢复/取消
- 支持多次运行 (repeat_count) 用于稳定性测试

---

## 3. 测试环境配置

### 3.1 安装测试依赖

在 `pyproject.toml` 的 `dev` dependency group 中添加：

```toml
[dependency-groups]
dev = [
    "ruff>=0.15.6",
    "pytest>=8.0.0",
    "pytest-asyncio>=0.23.0",
    "pytest-cov>=4.1.0",
    "httpx>=0.27.0",
    "fakeredis>=2.20.0",
]
```

然后运行：

```bash
cd backend
uv sync --group dev
```

### 3.2 创建测试夹具

创建 `backend/tests/conftest.py`：

```python
"""
测试配置文件 / Test configuration

提供测试夹具 (fixtures) 和测试环境设置。
"""
import asyncio
import os
from collections.abc import AsyncGenerator

import pytest
from fastapi.testclient import TestClient
from httpx import AsyncClient, ASGITransport
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

# 设置测试环境变量 / Set test environment variables
os.environ["DATABASE_URL"] = "postgresql+asyncpg://evalscope:evalscope@localhost:5432/evalscope_test"
os.environ["DATABASE_URL_SYNC"] = "postgresql://evalscope:evalscope@localhost:5432/evalscope_test"
os.environ["SECRET_KEY"] = "test-secret-key-for-testing"
os.environ["REDIS_URL"] = "redis://localhost:6379/1"

from app.main import app
from app.database import engine


@pytest.fixture(scope="session")
def event_loop():
    """创建事件循环 / Create event loop for async tests"""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="function")
async def db_session():
    """数据库会话 fixture / Database session fixture

    为每个测试函数创建独立的数据库会话。
    Creates an independent database session for each test function.
    """
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)

    async with AsyncSession(engine) as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)


@pytest.fixture
def client():
    """同步测试客户端 / Synchronous test client"""
    return TestClient(app)


@pytest.fixture
async def async_client():
    """异步测试客户端 / Asynchronous test client"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
```

### 3.3 pytest 配置

创建 `backend/pytest.ini`：

```ini
[pytest]
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
asyncio_mode = auto
addopts = -v --tb=short
```

---

## 4. 各模块测试用例

### 4.1 认证模块测试

文件：`backend/tests/test_auth.py`

```python
"""
认证模块测试 / Authentication module tests

测试用户注册、登录、JWT令牌等功能。
"""
import pytest
from fastapi import status


class TestAuth:
    """认证测试类 / Authentication test class"""

    def test_register_success(self, client: TestClient):
        """测试用户注册成功 / Test successful user registration"""
        response = client.post(
            "/api/v1/auth/register",
            json={
                "username": "testuser",
                "email": "test@example.com",
                "password": "testpass123",
                "role": "viewer"
            }
        )
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["username"] == "testuser"
        assert data["email"] == "test@example.com"
        assert "id" in data
        assert "hashed_password" not in data  # 密码不应返回

    def test_register_duplicate_username(self, client: TestClient):
        """测试重复用户名 / Test duplicate username"""
        # 先注册一个用户
        client.post(
            "/api/v1/auth/register",
            json={
                "username": "duplicate",
                "email": "first@example.com",
                "password": "pass123"
            }
        )
        # 尝试重复注册
        response = client.post(
            "/api/v1/auth/register",
            json={
                "username": "duplicate",
                "email": "second@example.com",
                "password": "pass123"
            }
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_login_success(self, client: TestClient):
        """测试登录成功 / Test successful login"""
        # 先注册用户
        client.post(
            "/api/v1/auth/register",
            json={
                "username": "loginuser",
                "email": "login@example.com",
                "password": "correctpassword"
            }
        )

        # 尝试登录
        response = client.post(
            "/api/v1/auth/login",
            json={
                "username": "loginuser",
                "password": "correctpassword"
            }
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_login_wrong_password(self, client: TestClient):
        """测试错误密码 / Test wrong password"""
        # 注册用户
        client.post(
            "/api/v1/auth/register",
            json={
                "username": "passuser",
                "email": "pass@example.com",
                "password": "correctpassword"
            }
        )

        # 错误密码登录
        response = client.post(
            "/api/v1/auth/login",
            json={
                "username": "passuser",
                "password": "wrongpassword"
            }
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_get_current_user(self, client: TestClient):
        """测试获取当前用户信息 / Test get current user info"""
        # 注册并登录
        client.post(
            "/api/v1/auth/register",
            json={
                "username": "currentuser",
                "email": "current@example.com",
                "password": "pass123"
            }
        )
        login_resp = client.post(
            "/api/v1/auth/login",
            json={
                "username": "currentuser",
                "password": "pass123"
            }
        )
        token = login_resp.json()["access_token"]

        # 获取当前用户
        response = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["username"] == "currentuser"
```

### 4.2 模型管理模块测试

文件：`backend/tests/test_models.py`

```python
"""
模型管理模块测试 / Model management module tests

测试 LLM 模型的增删改查功能。
"""
import pytest
from fastapi import status


class TestModels:
    """模型管理测试类 / Model management test class"""

    @pytest.fixture
    def auth_headers(self, client: TestClient) -> dict:
        """获取认证头 / Get auth headers"""
        client.post("/api/v1/auth/register", json={
            "username": "modeltester",
            "email": "modeltester@example.com",
            "password": "pass123",
            "role": "admin"
        })
        resp = client.post("/api/v1/auth/login", json={
            "username": "modeltester",
            "password": "pass123"
        })
        token = resp.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    def test_create_model(self, client: TestClient, auth_headers: dict):
        """测试创建模型 / Test create model"""
        response = client.post(
            "/api/v1/models",
            json={
                "name": "gpt-4",
                "provider": "openai",
                "endpoint_url": "https://api.openai.com/v1/chat/completions",
                "api_key": "sk-test123",
                "model_type": "api"
            },
            headers=auth_headers
        )
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["name"] == "gpt-4"
        assert data["model_type"] == "api"

    def test_list_models(self, client: TestClient, auth_headers: dict):
        """测试列出模型 / Test list models"""
        # 先创建模型
        client.post("/api/v1/models", json={
            "name": "model1",
            "provider": "openai",
            "endpoint_url": "https://api.openai.com/v1/chat/completions",
            "model_type": "api"
        }, headers=auth_headers)

        # 列出模型
        response = client.get("/api/v1/models", headers=auth_headers)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.json()) >= 1

    def test_get_model(self, client: TestClient, auth_headers: dict):
        """测试获取单个模型 / Test get single model"""
        # 创建模型
        create_resp = client.post("/api/v1/models", json={
            "name": "specificmodel",
            "provider": "anthropic",
            "endpoint_url": "https://api.anthropic.com/v1/messages",
            "model_type": "api"
        }, headers=auth_headers)
        model_id = create_resp.json()["id"]

        # 获取模型
        response = client.get(f"/api/v1/models/{model_id}", headers=auth_headers)
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["name"] == "specificmodel"

    def test_update_model(self, client: TestClient, auth_headers: dict):
        """测试更新模型 / Test update model"""
        # 创建模型
        create_resp = client.post("/api/v1/models", json={
            "name": "oldname",
            "provider": "openai",
            "endpoint_url": "https://api.openai.com/v1/chat/completions",
            "model_type": "api"
        }, headers=auth_headers)
        model_id = create_resp.json()["id"]

        # 更新模型
        response = client.patch(f"/api/v1/models/{model_id}", json={
            "name": "newname"
        }, headers=auth_headers)
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["name"] == "newname"

    def test_delete_model(self, client: TestClient, auth_headers: dict):
        """测试删除模型 / Test delete model"""
        # 创建模型
        create_resp = client.post("/api/v1/models", json={
            "name": "todelete",
            "provider": "openai",
            "endpoint_url": "https://api.openai.com/v1/chat/completions",
            "model_type": "api"
        }, headers=auth_headers)
        model_id = create_resp.json()["id"]

        # 删除模型
        response = client.delete(f"/api/v1/models/{model_id}", headers=auth_headers)
        assert response.status_code == status.HTTP_204_NO_CONTENT

        # 确认删除
        get_resp = client.get(f"/api/v1/models/{model_id}", headers=auth_headers)
        assert get_resp.status_code == status.HTTP_404_NOT_FOUND
```

### 4.3 评估器测试

文件：`backend/tests/test_evaluators.py`

```python
"""
评估器测试 / Evaluators tests

测试内置评估函数的正确性。
"""
import pytest
from app.services.evaluators import (
    evaluate_exact_match,
    evaluate_contains,
    evaluate_regex,
    evaluate_numeric_closeness,
    run_criterion,
)


class TestEvaluators:
    """评估器测试类 / Evaluators test class"""

    def test_exact_match_positive(self):
        """测试精确匹配 - 正确 / Test exact match - correct"""
        assert evaluate_exact_match("hello", "hello") == 1.0
        assert evaluate_exact_match("  hello  ", "hello") == 1.0  # 忽略空白

    def test_exact_match_negative(self):
        """测试精确匹配 - 错误 / Test exact match - incorrect"""
        assert evaluate_exact_match("hello", "world") == 0.0
        assert evaluate_exact_match("Hello", "hello") == 0.0  # 区分大小写

    def test_contains_positive(self):
        """测试包含 - 正确 / Test contains - correct"""
        assert evaluate_contains("hello world", "world") == 1.0
        assert evaluate_contains("The answer is 42", "answer") == 1.0

    def test_contains_negative(self):
        """测试包含 - 错误 / Test contains - incorrect"""
        assert evaluate_contains("hello", "xyz") == 0.0

    def test_regex_match(self):
        """测试正则匹配 / Test regex match"""
        assert evaluate_regex(r"\d+", "abc123def") == 1.0
        assert evaluate_regex(r"^\d{3}-\d{4}$", "123-4567") == 1.0

    def test_regex_no_match(self):
        """测试正则不匹配 / Test regex no match"""
        assert evaluate_regex(r"^\d+$", "abc") == 0.0

    def test_numeric_closeness_exact(self):
        """测试数值接近 - 精确 / Test numeric closeness - exact"""
        assert evaluate_numeric_closeness("42", "42") == 1.0

    def test_numeric_closeness_within_tolerance(self):
        """测试数值接近 - 范围内 / Test numeric closeness - within tolerance"""
        assert evaluate_numeric_closeness("42", "42.005", tolerance=0.01) == 1.0

    def test_numeric_closeness_outside_tolerance(self):
        """测试数值接近 - 范围外 / Test numeric closeness - outside tolerance"""
        assert evaluate_numeric_closeness("42", "50", tolerance=0.01) == 0.0

    def test_numeric_extract_from_output(self):
        """测试从输出中提取数值 / Test extract number from output"""
        assert evaluate_numeric_closeness("42", "The answer is 42.") == 1.0

    def test_run_criterion_preset_exact_match(self):
        """测试预设标准 - 精确匹配 / Test preset criterion - exact match"""
        config = '{"metric": "exact_match"}'
        assert run_criterion("preset", config, "hello", "hello") == 1.0

    def test_run_criterion_preset_contains(self):
        """测试预设标准 - 包含 / Test preset criterion - contains"""
        config = '{"metric": "contains"}'
        assert run_criterion("preset", config, "hello world", "world") == 1.0

    def test_run_criterion_regex(self):
        """测试正则标准 / Test regex criterion"""
        config = '{"pattern": "\\d+"}'
        assert run_criterion("regex", config, "", "abc123") == 1.0

    def test_run_criterion_invalid(self):
        """测试无效标准类型 / Test invalid criterion type"""
        assert run_criterion("invalid_type", "{}", "a", "a") == 0.0
```

### 4.4 任务模块测试

文件：`backend/tests/test_tasks.py`

```python
"""
任务模块测试 / Task module tests

测试评估任务的创建、查询、暂停、恢复等功能。
"""
import pytest
from fastapi import status


class TestTasks:
    """任务测试类 / Task test class"""

    @pytest.fixture
    def setup_resources(self, client: TestClient, auth_headers: dict):
        """设置测试资源 / Setup test resources"""
        # 创建模型
        model_resp = client.post("/api/v1/models", json={
            "name": "testmodel",
            "provider": "openai",
            "endpoint_url": "https://api.openai.com/v1/chat/completions",
            "api_key": "sk-test",
            "model_type": "api"
        }, headers=auth_headers)
        model_id = model_resp.json()["id"]

        # 创建数据集
        dataset_resp = client.post("/api/v1/datasets", json={
            "name": "testdataset",
            "source_type": "preset",
            "source_path": "tests/fixtures/sample_data.jsonl",
            "format": "jsonl"
        }, headers=auth_headers)
        dataset_id = dataset_resp.json()["id"]

        # 创建评估标准
        criterion_resp = client.post("/api/v1/criteria", json={
            "name": "testcriterion",
            "type": "preset",
            "config_json": '{"metric": "exact_match"}'
        }, headers=auth_headers)
        criterion_id = criterion_resp.json()["id"]

        return {
            "model_id": model_id,
            "dataset_id": dataset_id,
            "criterion_id": criterion_id
        }

    def test_create_task(self, client: TestClient, auth_headers: dict, setup_resources: dict):
        """测试创建任务 / Test create task"""
        response = client.post(
            "/api/v1/tasks",
            json={
                "name": "Test Evaluation",
                "model_id": setup_resources["model_id"],
                "dataset_ids": [setup_resources["dataset_id"]],
                "criteria_ids": [setup_resources["criterion_id"]],
                "params_json": '{"temperature": 0.7, "max_tokens": 100}',
                "repeat_count": 1,
                "seed_strategy": "fixed"
            },
            headers=auth_headers
        )
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["name"] == "Test Evaluation"
        assert data["status"] == "pending"

    def test_list_tasks(self, client: TestClient, auth_headers: dict):
        """测试列出任务 / Test list tasks"""
        response = client.get("/api/v1/tasks", headers=auth_headers)
        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.json(), list)

    def test_get_task(self, client: TestClient, auth_headers: dict, setup_resources: dict):
        """测试获取单个任务 / Test get single task"""
        # 创建任务
        create_resp = client.post("/api/v1/tasks", json={
            "name": "gettest",
            "model_id": setup_resources["model_id"],
            "dataset_ids": [setup_resources["dataset_id"]],
            "criteria_ids": [setup_resources["criterion_id"]]
        }, headers=auth_headers)
        task_id = create_resp.json()["id"]

        # 获取任务
        response = client.get(f"/api/v1/tasks/{task_id}", headers=auth_headers)
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["name"] == "gettest"
```

### 4.5 数据集模块测试

文件：`backend/tests/test_datasets.py`

```python
"""
数据集模块测试 / Dataset module tests

测试数据集的创建、列表、预览等功能。
"""
import pytest
import io
from fastapi import status


class TestDatasets:
    """数据集测试类 / Dataset test class"""

    @pytest.fixture
    def auth_headers(self, client: TestClient) -> dict:
        """获取认证头 / Get auth headers"""
        client.post("/api/v1/auth/register", json={
            "username": "datasettester",
            "email": "ds@example.com",
            "password": "pass123",
            "role": "data_admin"
        })
        resp = client.post("/api/v1/auth/login", json={
            "username": "datasettester",
            "password": "pass123"
        })
        token = resp.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    def test_create_dataset(self, client: TestClient, auth_headers: dict):
        """测试创建数据集 / Test create dataset"""
        response = client.post(
            "/api/v1/datasets",
            json={
                "name": "test_dataset",
                "description": "A test dataset",
                "source_type": "preset",
                "source_path": "mmlu",
                "format": "jsonl",
                "tags": "math,reasoning"
            },
            headers=auth_headers
        )
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["name"] == "test_dataset"
        assert "math" in data["tags"]

    def test_list_datasets(self, client: TestClient, auth_headers: dict):
        """测试列出数据集 / Test list datasets"""
        # 先创建数据集
        client.post("/api/v1/datasets", json={
            "name": "list_test",
            "source_type": "preset",
            "source_path": "test"
        }, headers=auth_headers)

        # 列出
        response = client.get("/api/v1/datasets", headers=auth_headers)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.json()) >= 1
```

---

## 5. 运行测试

### 5.1 命令行操作

```bash
cd backend

# 运行所有测试
pytest

# 运行并显示详细输出
pytest -v

# 运行特定文件
pytest tests/test_auth.py

# 运行特定测试
pytest tests/test_evaluators.py::TestEvaluators::test_exact_match_positive

# 生成覆盖率报告
pytest --cov=app --cov-report=html
```

### 5.2 集成 CI/CD（可选）

创建 `.github/workflows/test.yml`：

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: "3.10"
      - name: Install dependencies
        run: |
          pip install uv
          uv sync --group dev
      - name: Run tests
        run: pytest --cov=app
```

---

## 6. 未来：集成 evalscope SDK

当前项目是一个独立的评估框架。如果未来需要集成 `evalscope` Python SDK，可按以下方式实现：

### 6.1 安装 evalscope

```bash
pip install evalscope
```

### 6.2 集成示例

在 `app/services/task_runner.py` 中添加：

```python
# 未来集成 evalscope SDK (v1.x) 的示例代码
import json
from pathlib import Path

from evalscope.config import TaskConfig
from evalscope.run import run_task


def build_task_config(task, model, datasets) -> TaskConfig:
    """将本地任务配置映射为 evalscope TaskConfig。"""
    params = json.loads(task.params_json or "{}")

    # 当前后端以 source_uri 存储数据路径；这里示例使用 general_qa 作为统一入口。
    # 实际项目中建议按数据类型（qa/mcq/fc）动态选择 datasets 与 dataset_args。
    dataset_args = {
        "general_qa": {
            "dataset_id": datasets[0].source_uri,  # 例如 /path/to/example.jsonl
            "subset_list": [Path(datasets[0].source_uri).stem],
        }
    }

    task_cfg = TaskConfig(
        model=model.name,
        api_url=model.endpoint_url,
        api_key=model.api_key,
        eval_type="openai_api",
        datasets=["general_qa"],
        dataset_args=dataset_args,
        generation_config={
            "temperature": params.get("temperature", 0.7),
            "max_tokens": params.get("max_tokens", 1024),
            "top_p": params.get("top_p", 1.0),
            "seed": params.get("seed", 42),
        },
        repeats=task.repeat_count,
        enable_progress_tracker=True,
    )
    return task_cfg


async def run_task_with_evalscope(task_id: uuid.UUID):
    """使用 evalscope SDK 运行评估任务（示例）。"""
    async with AsyncSession(engine) as session:
        task = await session.get(EvalTask, task_id)
        if not task:
            raise ValueError(f"Task {task_id} not found")

        model = await session.get(LLMModel, task.model_id)
        if not model:
            raise ValueError(f"Model {task.model_id} not found")

        dataset_ids = [uuid.UUID(x) for x in task.dataset_ids.split(",") if x]
        datasets = [await session.get(Dataset, ds_id) for ds_id in dataset_ids]
        datasets = [d for d in datasets if d is not None]
        if not datasets:
            raise ValueError("No valid datasets found")

        task_cfg = build_task_config(task, model, datasets)

        # 运行评测：evalscope 会在 work_dir 下输出 reports / reviews / progress.json 等文件。
        # 建议后续实现 result ingestor，将 SDK 输出解析并写回 EvalResult。
        run_task(task_cfg=task_cfg)
```

### 6.3 注意事项（v1.x）

1. `run_eval + ARGS` 为旧版本示例；推荐统一使用 `TaskConfig + run_task`。
2. 当前后端数据库以 `criterion_id` 为核心维度，而 evalscope 输出是 `dataset/subset/metric` 维度，需增加结果映射层。
3. 当前代码通过 `asyncio.create_task()` 在 API 进程内执行任务，接入 SDK 后建议迁移到独立 worker 进程。

---

## 7. 总结

本文档涵盖了：

1. **项目架构**：EvalScope GUI 采用 FastAPI + SQLModel + PostgreSQL 的前后端分离架构
2. **当前实现**：项目使用自定义的任务运行器和评估器，未集成 evalscope SDK
3. **测试环境**：pytest + pytest-asyncio 的完整测试配置
4. **测试用例**：涵盖认证、模型管理、评估器、任务管理、数据集管理等模块
5. **运行方式**：命令行和 CI/CD 集成
6. **未来集成**：evalscope SDK 的集成示例

运行测试：

```bash
cd backend
pytest
```
