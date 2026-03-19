# SwanEVAL

企业级大模型评测平台。管理数据集、定义评测标准、跨模型执行评测任务，并通过图表与报告深入分析结果。

## 功能特性

- **数据集管理** — 上传（JSONL/CSV/JSON）、挂载服务器路径、数据预览与统计
- **评测标准** — 预置标准（精确匹配、包含匹配、数值匹配）、正则表达式、自定义脚本、LLM-as-a-Judge
- **模型注册** — 注册任何 OpenAI / Anthropic 兼容 API 端点或本地推理服务
- **任务执行** — 4 步配置向导、异步后台执行、稳定性测试（多随机种子）、断点续测
- **结果与可视化** — 排行榜、柱状图/雷达图/折线图、错误下钻分析、汇总统计

## 技术栈

| 层级     | 技术                                                                                       |
| -------- | ------------------------------------------------------------------------------------------ |
| 后端     | FastAPI, SQLModel, Alembic, Pydantic Settings, HTTPX                                       |
| 前端     | Next.js 14 (App Router), React 18, Tailwind CSS, shadcn/ui, React Query, Zustand, Recharts |
| 数据     | PostgreSQL 14, Redis 7                                                                     |
| 基础设施 | Docker Compose, uv                                                                         |

---

## 部署与开发

### 生产部署（全容器化）

项目已完全容器化，一条命令即可启动所有服务：

```bash
docker compose up --build -d
```

所有服务（PostgreSQL、Redis、后端、前端）将自动构建并启动。数据库迁移在后端容器启动时自动执行。

服务就绪后访问：

| 服务                | 地址                        |
| ------------------- | --------------------------- |
| 前端界面            | http://localhost:3000       |
| 后端 API            | http://localhost:8000       |
| API 文档（Swagger） | http://localhost:8000/docs  |
| API 文档（ReDoc）   | http://localhost:8000/redoc |

**自定义端口**（避免冲突）：

```bash
BACKEND_PORT=18000 FRONTEND_PORT=13000 PG_PORT=15432 docker compose up --build -d
```

或在项目根目录 `.env` 中配置。

### 本地开发（支持热重载）

本地开发模式下，仅容器化数据库和缓存，前后端在宿主机运行以获得热重载体验。

**前置要求：** Python 3.10+、Node.js 18+、Docker

#### 1. 启动基础设施

```bash
docker compose up -d postgres redis
```

#### 2. 启动后端（热重载）

```bash
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000
```

修改后端代码后服务会自动重启。

#### 3. 启动前端（热重载）

```bash
cd frontend
npm install
npm run dev
```

修改前端代码后页面会自动刷新。

#### 环境变量

后端从 `backend/.env` 读取配置：

```env
DATABASE_URL=postgresql+asyncpg://evalscope:evalscope@localhost:6001/evalscope
DATABASE_URL_SYNC=postgresql://evalscope:evalscope@localhost:6001/evalscope
REDIS_URL=redis://localhost:6379/0
CORS_ORIGINS=["http://localhost:3000"]
SECRET_KEY=dev-secret-change-in-production
UPLOAD_DIR=data/uploads
```

### 可选服务

```bash
# 本地模型推理（Ollama）
docker compose --profile ollama up -d

# S3 对象存储（MinIO）
docker compose --profile s3 up -d
```

---

## 使用指南

SwanEVAL 的核心工作流为：**注册账号 → 注册模型 → 准备数据集 → 定义评测标准 → 创建评测任务 → 查看结果**。

### 第 1 步：注册与登录

访问前端界面，注册管理员账号并登录。首次部署建议使用 `admin` 角色。

### 第 2 步：注册模型

进入 **模型管理** 页面，添加待评测的模型：

- 填写模型名称与服务商信息
- 配置 API 端点地址和密钥
- 支持 OpenAI 兼容 API、本地推理服务（如 Ollama）及 HuggingFace 模型

### 第 3 步：准备数据集

进入 **数据集** 页面，通过以下方式之一导入评测数据：

- **文件上传**：支持 JSONL、CSV、JSON 格式，每条数据包含 `prompt` 和 `expected` 字段
- **服务器挂载**：注册服务器上已有的数据文件路径（零拷贝）

上传后可在详情页预览数据和查看统计信息。平台支持自动版本管理，重复上传同名数据集将自动创建新版本。

### 第 4 步：定义评测标准

进入 **评测标准** 页面，选择或创建评测方式：

| 类型       | 说明                                               |
| ---------- | -------------------------------------------------- |
| 预置标准   | 精确匹配、包含匹配、BLEU、ROUGE、Pass@k 等         |
| 正则表达式 | 自定义匹配模式提取和评分                           |
| 自定义脚本 | 编写 Python 脚本实现自定义评测逻辑                 |
| LLM 裁判   | 配置裁判模型、评分维度和评分标准，由大模型担任裁判 |

可通过 **测试** 功能对样本数据进行试评，验证标准配置是否正确。

### 第 5 步：创建评测任务

进入 **评测任务** 页面，通过 4 步向导创建任务：

1. **选择模型** — 选择一个或多个待评测模型
2. **选择数据集** — 多选数据集，支持标签筛选
3. **设置参数** — 配置 temperature、top_p、max_tokens、重复次数、随机种子策略等
4. **确认提交** — 预览配置并启动任务

任务提交后进入异步执行队列。可在任务详情页实时查看进度，支持暂停、恢复和取消操作。若任务失败，支持从断点处续测。

### 第 6 步：查看结果

进入 **结果分析** 页面，多维度分析评测结果：

- **排行榜**：按评测标准对模型进行排名
- **图表分析**：柱状图、雷达图、折线图，支持多模型、多标准交叉对比
- **错误分析**：下钻到单条 prompt 级别，查看模型输出与期望输出的差异
- **报告导出**：生成评测报告，支持 DOCX、HTML、CSV 格式导出

---

## API 端点

| 模块     | 端点                                                                                     |
| -------- | ---------------------------------------------------------------------------------------- |
| 认证     | `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `GET /api/v1/auth/me`           |
| 数据集   | `POST /upload`, `POST /mount`, `GET /`, `GET /{id}`, `GET /{id}/preview`, `DELETE /{id}` |
| 评测标准 | `POST /`, `GET /`, `GET /{id}`, `PUT /{id}`, `DELETE /{id}`, `POST /test`                |
| 模型     | `POST /`, `GET /`, `GET /{id}`, `PUT /{id}`, `DELETE /{id}`                              |
| 任务     | `POST /`, `GET /`, `GET /{id}`, `GET /{id}/subtasks`, `POST /{id}/pause\|resume\|cancel` |
| 结果     | `GET /`, `GET /leaderboard`, `GET /errors`, `GET /summary`                               |

完整交互式文档：http://localhost:8000/docs（Swagger）或 http://localhost:8000/redoc

## 项目结构

```
backend/
  app/
    main.py              # FastAPI 应用入口
    config.py            # pydantic-settings 配置
    database.py          # 异步 SQLAlchemy 引擎
    models/              # SQLModel 数据表模型
    schemas/             # Pydantic 请求/响应模式
    api/
      deps.py            # 认证与数据库依赖
      v1/                # 路由模块
    services/            # 业务逻辑（认证、评测器、任务执行器）
  alembic/               # 数据库迁移
frontend/
  app/                   # Next.js App Router 页面
  components/            # React 组件
  lib/                   # API 客户端、Hooks、状态管理
docker-compose.yml       # 全容器化编排
```

## 许可证

Apache-2.0
