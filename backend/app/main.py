import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import router as v1_router
from app.config import settings
from app.database import init_db

# 配置日志 / Configure logging
logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    应用生命周期管理 / Application lifespan management

    启动时初始化数据库，关闭时清理资源。
    Initialize database on startup, cleanup on shutdown.
    """
    await init_db()  # 启动时初始化数据库表 / Initialize database tables on startup
    yield
    # 关闭时可以添加清理逻辑 / Cleanup logic can be added here on shutdown


# 创建FastAPI应用 / Create FastAPI application
app = FastAPI(
    title="EvalScope GUI API",
    version="0.1.0",
    lifespan=lifespan,
)

# 添加CORS中间件 / Add CORS middleware
# 允许前端跨域访问 / Allow frontend cross-origin access
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 包含API路由 / Include API routes
app.include_router(v1_router)


@app.get("/health")
async def health():
    """
    健康检查端点 / Health check endpoint

    用于检查服务是否正常运行。
    Used to check if the service is running normally.
    """
    return {"status": "ok"}