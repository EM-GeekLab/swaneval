# EvalScope GUI

企业级 EvalScope 模型评估框架图形界面。

## 功能特性

- **模型管理**：支持 HuggingFace、本地模型和 API 模型
- **数据集管理**：预设数据集、HuggingFace 导入、自定义上传
- **评估任务**：4 步向导、实时进度、任务队列管理
- **结果可视化**：柱状图、雷达图、折线图、排行榜
- **报告生成**：支持导出为 PDF、Word、HTML、CSV

## 快速开始

### 前置要求

- Python 3.10+
- Node.js 18+
- PostgreSQL 14+
- Redis 6+

### 数据库配置

```bash
# 创建数据库用户和数据库
psql -U postgres -c "CREATE USER evalscope WITH PASSWORD 'evalscope';"
psql -U postgres -c "CREATE DATABASE evalscope OWNER evalscope;"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE evalscope TO evalscope;"
```

### 后端配置

```bash
cd backend

# 使用 uv（推荐）
uv venv
source .venv/bin/activate
uv pip install -r requirements.txt

# 或使用 pip
pip install -r requirements.txt

# 设置环境变量
export DATABASE_URL="postgresql://evalscope:evalscope@localhost:6001/evalscope"
export REDIS_URL="redis://localhost:6379/0"

# 如果在 Docker 中运行后端，请使用：
# export DATABASE_URL="postgresql://evalscope:evalscope@postgres:6001/evalscope"
# export REDIS_URL="redis://redis:6379/0"

# 运行数据库迁移
alembic upgrade head

# 启动开发服务器
uvicorn app.main:app --reload --port 8000
```

### 前端配置

```bash
cd frontend

# 安装依赖
npm install

# 设置环境变量
export NEXT_PUBLIC_API_URL="http://localhost:8000/api/v1"

# 启动开发服务器
npm run dev
```

### Docker 配置（仅基础设施）

使用 Docker 运行 PostgreSQL 和 Redis，然后在本地运行后端和前端进行开发。

```bash
# 仅启动基础设施服务
docker-compose up -d

# 验证服务运行状态
docker-compose ps

# 停止服务
docker-compose down
```

**连接字符串（本地开发）：**

- PostgreSQL: `postgresql://evalscope:evalscope@localhost:6001/evalscope`
- Redis: `redis://localhost:6379/0`

**连接字符串（Docker/容器化后端）：**

- PostgreSQL: `postgresql://evalscope:evalscope@postgres:6001/evalscope`
- Redis: `redis://redis:6379/0`

然后在本地运行后端和前端（见上文"后端配置"和"前端配置"部分）。

**已包含 Dockerfiles**：后端和前端目录中包含 `Dockerfile`，供参考或生产部署使用。

## API 文档

后端运行后，可访问：

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Web 界面

- 前端地址：http://localhost:3000

## 演示账号

```
用户名：admin
密码：admin
```

## 技术栈

### 后端

- FastAPI
- SQLAlchemy 2.0
- PostgreSQL
- Celery + Redis

### 前端

- Next.js 14（App Router）
- shadcn/ui + Tailwind CSS
- Recharts
- TanStack Query

## 许可证

Apache-2.0
