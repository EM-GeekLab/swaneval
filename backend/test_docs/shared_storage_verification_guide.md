# 共享存储抽象层 — 验证指南

> 分支：`feature/shared-storage`
> 日期：2026-03-19

本文档帮助审查者在另一台机器上从零开始拉取代码、运行测试、验证功能。
所有命令均已实测可执行。

---

## 1. 改动概览

引入 `StorageBackend` 抽象层，替换所有硬编码的本地文件操作，支持 **Local 文件系统** 和 **原生 S3** 双后端。

### 新增文件（6个）

| 文件 | 作用 |
|------|------|
| `app/services/storage/__init__.py` | 工厂 `get_storage()`，按配置创建单例 |
| `app/services/storage/base.py` | `StorageBackend` 抽象基类（11个方法） |
| `app/services/storage/local.py` | `LocalFileStorage` — 本地文件系统实现 |
| `app/services/storage/s3.py` | `S3Storage` — 原生 boto3 实现（MinIO/AWS/OSS） |
| `app/services/storage/utils.py` | `uri_to_key()` — DB source_uri 与存储 key 互转 |
| `tests/test_storage.py` | LocalFileStorage 单元测试（15个用例） |

### 修改文件（14个）

| 文件 | 改动摘要 |
|------|---------|
| `app/config.py` | +8 配置项：`STORAGE_BACKEND`, `STORAGE_ROOT`, `S3_*` |
| `app/main.py` | lifespan 中初始化存储、校验连通性、设置 AWS 环境变量 |
| `app/api/v1/datasets.py` | upload/preview/delete 走 StorageBackend，通过 Depends 注入 |
| `app/services/dataset_deletion.py` | `cleanup_uploaded_file` 改为 async + storage |
| `app/services/task_runner.py` | 数据集加载走 storage，evalscope work_dir 用 `resolve_uri()` |
| `app/services/evalscope_adapter.py` | 格式转换和 score 提取改为 async + storage |
| `app/services/evalscope_result_ingestor.py` | 全部改为 async，递归扫描和读取走 storage |
| `pyproject.toml` | 新增 boto3, aiosqlite, pytest 依赖 |
| `docker-compose.yml` | +MinIO 服务（`--profile s3`）、backend 卷挂载 |
| `tests/test_dataset_deletion.py` | 适配 async + storage 新接口 |
| `tests/test_evalscope_adapter.py` | 适配 async + storage 新接口 |
| `tests/test_evalscope_result_ingestor.py` | 适配 async + storage 新接口 |
| `tests/test_real_model_api_e2e.py` | `/results` 分页响应解包 + STORAGE_ROOT 环境变量 |
| `test_docs/run_e2e_evalscope_api_test.py` | `/results` 分页响应解包 |

### 未修改（及原因）

| 文件 | 原因 |
|------|------|
| `app/services/evaluators.py` | 脚本评估器保持本地文件系统（安全边界） |
| `datasets.py:mount_dataset()` | mount 始终操作本地路径 |
| 前端所有文件 | 本次改动仅在后端存储层 |

---

## 2. 环境准备

### 2.1 前置条件

- Python >= 3.10
- [uv](https://docs.astral.sh/uv/getting-started/installation/) 包管理器
- Node.js >= 18（可选，仅验证前端 build）
- Docker（可选，仅验证 S3 模式）

### 2.2 拉取代码

```bash
git clone git@github.com:KrLite/evalscope-gui.git
cd evalscope-gui
git checkout feature/shared-storage
```

### 2.3 安装后端依赖

```bash
cd backend
uv sync
```

### 2.4 安装前端依赖（可选）

```bash
cd frontend
npm install
```

---

## 3. 运行单元测试

```bash
cd backend
uv run python -m pytest tests/test_storage.py \
  tests/test_dataset_deletion.py \
  tests/test_evalscope_adapter.py \
  tests/test_evalscope_result_ingestor.py \
  -v
```

**预期输出：39 passed**

不需要数据库、不需要 Docker、不需要任何外部服务。全部在内存/临时目录中完成。

| 测试文件 | 用例数 | 覆盖 |
|---------|--------|------|
| `test_storage.py` | 15 | LocalFileStorage 全部方法 |
| `test_dataset_deletion.py` | 4 | cleanup_uploaded_file (async) + delete_versions |
| `test_evalscope_adapter.py` | 12 | 格式转换、config 构建、score 提取 |
| `test_evalscope_result_ingestor.py` | 8 | 结果解析、artifact 优先、fallback、过滤 |

---

## 4. 代码 Lint 检查

```bash
cd backend
uv run ruff check \
  app/services/storage/ \
  app/api/v1/datasets.py \
  app/services/task_runner.py \
  app/services/evalscope_adapter.py \
  app/services/evalscope_result_ingestor.py \
  app/services/dataset_deletion.py \
  app/main.py \
  app/config.py \
  tests/test_storage.py \
  tests/test_dataset_deletion.py \
  tests/test_evalscope_adapter.py \
  tests/test_evalscope_result_ingestor.py
```

**预期输出：All checks passed!**

---

## 5. 前端 Build 检查（可选）

```bash
cd frontend
npm run build
```

预期：build 成功，无 TypeScript 错误。前端代码本次无改动，此步骤仅确认未引入破坏。

---

## 6. Local 模式功能验证

本节使用 SQLite（无需 PostgreSQL），可在任何机器上独立运行。

### 6.1 启动后端

```bash
cd backend
DATABASE_URL='sqlite+aiosqlite:///./test_verify.db' \
DATABASE_URL_SYNC='sqlite:///./test_verify.db' \
STORAGE_BACKEND=local \
STORAGE_ROOT=data \
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

**检查点 — 日志中应出现以下两行：**

```
INFO:app.services.storage:Storage backend: local (data)
INFO:app.main:Storage backend validated and ready
```

### 6.2 基础 API 验证

打开新终端，进入项目的 `backend/` 目录，执行：

**步骤 1：注册用户**

```bash
curl -s -X POST http://localhost:8000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"tester","email":"t@t.com","password":"pass123456","role":"admin"}'
```

预期：返回用户 JSON（或 409 表示已存在，均可）。

**步骤 2：登录获取 Token**

```bash
curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"tester","password":"pass123456"}'
```

预期：返回 `{"access_token":"...","token_type":"bearer"}`。

复制 `access_token` 的值，后续命令中替换 `<TOKEN>`。

**步骤 3：上传数据集**

```bash
echo '{"query":"2+2=?","response":"4"}' > /tmp/test.jsonl

curl -s -X POST http://localhost:8000/api/v1/datasets/upload \
  -H "Authorization: Bearer <TOKEN>" \
  -F "file=@/tmp/test.jsonl" \
  -F "name=verify-ds"
```

预期：返回 Dataset JSON，其中 `source_uri` 包含 `data/uploads/` 路径。

**步骤 4：验证文件已写入存储目录**

```bash
ls data/uploads/
```

预期：看到一个 UUID 命名的 `.jsonl` 文件。

**步骤 5：获取数据集列表（验证分页响应格式）**

```bash
curl -s http://localhost:8000/api/v1/datasets \
  -H "Authorization: Bearer <TOKEN>"
```

预期：返回分页格式 JSON：

```json
{
  "items": [{"id": "...", "name": "verify-ds", ...}],
  "total": 1,
  "page": 1,
  "page_size": 20
}
```

**关键验证点**：响应是 `{items, total, page, page_size}` 格式，不是裸列表。

### 6.3 清理

```bash
# 停止后端 (Ctrl+C)
rm -f test_verify.db
```

---

## 7. S3 模式功能验证（需要 Docker）

### 7.1 启动 MinIO

```bash
# 在项目根目录
docker compose --profile s3 up -d minio
# 如果用旧版 Docker，改用: docker-compose --profile s3 up -d minio

# 等待就绪
curl -sf http://localhost:9000/minio/health/live && echo "MinIO ready"
```

MinIO 控制台：http://localhost:9001（用户名 `minioadmin`，密码 `minioadmin`）

### 7.2 启动后端（S3 模式）

```bash
cd backend
DATABASE_URL='sqlite+aiosqlite:///./test_s3.db' \
DATABASE_URL_SYNC='sqlite:///./test_s3.db' \
STORAGE_BACKEND=s3 \
S3_BUCKET=evalscope \
S3_ENDPOINT_URL=http://localhost:9000 \
S3_ACCESS_KEY=minioadmin \
S3_SECRET_KEY=minioadmin \
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

**检查点 — 日志中应出现：**

```
INFO:app.services.storage:Storage backend: S3 (bucket=evalscope)
INFO:app.main:Storage backend validated and ready
```

### 7.3 验证 S3 写入

重复 6.2 的步骤 1-5（注册、登录、上传、查列表）。

然后打开 MinIO 控制台 http://localhost:9001 检查：
- Bucket `evalscope` 已自动创建
- `uploads/` 前缀下有上传的文件
- 数据集列表 API 返回的 `source_uri` 以 `s3://evalscope/uploads/` 开头

### 7.4 清理

```bash
# 停止后端 (Ctrl+C)
rm -f test_s3.db
docker compose --profile s3 down
```

---

## 8. 设计审查清单

审查者可逐项检查：

- [ ] **StorageBackend 接口** (`base.py`)：11 个方法覆盖所有文件操作场景
- [ ] **LocalFileStorage** (`local.py`)：用 `asyncio.to_thread` 包装阻塞 I/O
- [ ] **S3Storage** (`s3.py`)：`resolve_uri()` 返回 `s3://` URI，EvalScope 可直接消费
- [ ] **uri_to_key** (`utils.py`)：正确处理 S3 URI / 绝对路径 / 相对路径 / mount 路径
- [ ] **mount 模式** (`datasets.py`)：不走 storage，直接本地操作
- [ ] **evaluators.py**：脚本加载保持本地（安全边界：不从 S3 执行代码）
- [ ] **main.py lifespan**：S3 模式下自动设置 `AWS_*` 环境变量供 EvalScope/fsspec 使用
- [ ] **E2E 测试**：适配分页响应 + STORAGE_ROOT 配置
- [ ] **docker-compose.yml**：MinIO 在 `s3` profile 下，`docker compose up` 默认不启动

---

## 9. 配置参考

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `STORAGE_BACKEND` | `local` | `local` 或 `s3` |
| `STORAGE_ROOT` | `data` | Local 模式根目录 |
| `S3_BUCKET` | _(空)_ | S3 桶名 |
| `S3_ENDPOINT_URL` | _(空)_ | S3 端点（MinIO: `http://minio:9000`） |
| `S3_ACCESS_KEY` | _(空)_ | S3 访问密钥 |
| `S3_SECRET_KEY` | _(空)_ | S3 密钥 |
| `S3_REGION` | `us-east-1` | S3 区域 |
| `S3_PREFIX` | _(空)_ | S3 key 前缀（可选） |

---

## 10. 已知限制

1. **大文件读取**：S3 模式下 `read_file` / `read_text` 将整个文件读入内存。GB 级数据集未来需增加流式读取。
2. **旧数据迁移**：已有数据库中的 `source_uri` 是本地绝对路径。从 local 切换到 S3 需一次性迁移脚本（上传文件 + 更新 DB 记录）。
3. **脚本评估器**：始终要求本地路径，不支持从 S3 加载。这是有意为之的安全设计。
