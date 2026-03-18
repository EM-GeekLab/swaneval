from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app.config import settings

# 异步数据库引擎 / Async database engine
# 使用 asyncpg 驱动连接 PostgreSQL / Connect to PostgreSQL using asyncpg driver
engine = create_async_engine(settings.DATABASE_URL, echo=False)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """
    获取数据库会话 / Get database session

    依赖注入函数，用于在API路由中获取数据库会话。
    Dependency injection function to get database session in API routes.

    Yields:
        AsyncSession: 异步数据库会话 / Async database session
    """
    async with AsyncSession(engine) as session:
        yield session


async def init_db():
    """
    初始化数据库 / Initialize database

    创建所有表结构（如果不存在）。
    Create all table structures if they don't exist.
    """
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)