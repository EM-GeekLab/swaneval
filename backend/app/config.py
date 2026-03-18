from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """
    应用配置 / Application settings

    使用 pydantic-settings 从环境变量或 .env 文件加载配置。
    Load configuration from environment variables or .env file using pydantic-settings.
    """

    DATABASE_URL: str = "postgresql+asyncpg://evalscope:evalscope@localhost:6001/evalscope"
    # 异步数据库连接URL / Async database connection URL (for SQLAlchemy async)

    DATABASE_URL_SYNC: str = "postgresql://evalscope:evalscope@localhost:6001/evalscope"
    # 同步数据库连接URL / Sync database connection URL (for Alembic migrations)

    REDIS_URL: str = "redis://localhost:6379/0"
    # Redis连接URL / Redis connection URL

    CORS_ORIGINS: list[str] = ["http://localhost:20xx"]
    # CORS允许的来源 / Allowed CORS origins

    SECRET_KEY: str = "dev-secret-change-in-production"
    # JWT密钥 / JWT secret key (change in production)

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    # 访问令牌过期时间(分钟) / Access token expiration time in minutes (default: 24 hours)

    UPLOAD_DIR: str = "data/uploads"
    # 上传文件目录 / Upload directory for dataset files

    model_config = {"env_file": ".env", "extra": "ignore"}


# 全局配置实例 / Global settings instance
settings = Settings()