from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """
    应用配置 / Application settings

    使用 pydantic-settings 从环境变量或 .env 文件加载配置。
    Load configuration from environment variables or .env file using pydantic-settings.
    """

    DATABASE_URL: str = "postgresql+asyncpg://swaneval:swaneval@localhost:6001/swaneval"
    # 异步数据库连接URL / Async database connection URL (for SQLAlchemy async)

    DATABASE_URL_SYNC: str = "postgresql://swaneval:swaneval@localhost:6001/swaneval"
    # 同步数据库连接URL / Sync database connection URL (for Alembic migrations)

    REDIS_URL: str = "redis://localhost:6379/0"
    # Redis连接URL / Redis connection URL

    CORS_ORIGINS: list[str] = ["http://localhost:3000"]
    # CORS允许的来源 / Allowed CORS origins

    SECRET_KEY: str = "dev-secret-change-in-production"
    # JWT密钥 / JWT secret key (change in production)

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    # 访问令牌过期时间(分钟) / Access token expiration time in minutes (default: 24 hours)

    # ── 存储后端 / Storage backend ──
    STORAGE_BACKEND: str = "local"
    # 存储后端类型 / Storage backend type: "local" (filesystem) or "s3"

    STORAGE_ROOT: str = "data"
    # 共享存储根目录 / Shared storage root directory
    # 本地模式为文件系统路径，所有持久化数据存放于此
    # Local mode: filesystem path; all persistent data lives here

    # ── S3 配置 / S3 configuration ──
    S3_BUCKET: str = ""
    S3_ENDPOINT_URL: str = ""
    # S3 端点 / S3 endpoint URL (e.g. http://minio:9000 for MinIO)
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""
    S3_REGION: str = "us-east-1"
    S3_PREFIX: str = ""
    # S3 key 前缀 / Optional key prefix within the bucket

    UPLOAD_DIR: str = "data/uploads"
    # 上传文件目录（仅 mount 模式回退用） / Upload directory (legacy, for mount fallback)

    DEFAULT_MODEL_PROVIDER: str = ""
    # 默认模型提供商 / Optional default provider injected by environment

    DEFAULT_MODEL_ENDPOINT_URL: str = ""
    # 默认模型地址 / Optional default endpoint URL injected by environment

    DEFAULT_MODEL_NAME: str = ""
    # 默认模型名 / Optional default model name injected by environment

    DEFAULT_MODEL_API_KEY: str = ""
    # 默认 API Key / Optional default API key injected by environment

    HF_TOKEN: str = ""
    # HuggingFace API token for accessing gated/private datasets

    MS_TOKEN: str = ""
    # ModelScope API token for accessing gated/private datasets

    VLLM_READINESS_TIMEOUT: int = 600
    # vLLM 部署就绪超时(秒) / vLLM deployment readiness timeout in seconds

    # ── Worker mode ──
    EMBEDDED_WORKER: bool = True
    # 是否在 API 进程内启动内嵌 worker / Run worker inside API process
    # True = 零配置开发模式，任务在 API 进程内执行（默认）
    # False = 生产模式，需单独运行 `python -m app.worker`

    SANDBOX_TIMEOUT_SECONDS: int = 10
    SANDBOX_MAX_OUTPUT_BYTES: int = 1_048_576
    SANDBOX_ALLOWED: bool = True

    # ── EvalScope 服务 / EvalScope evaluation service ──
    EVALSCOPE_SERVICE_URL: str = "http://localhost:9000"
    # EvalScope HTTP 服务地址 / EvalScope service URL
    EVALSCOPE_ENABLED: bool = True
    # 主开关：False 时回退到 legacy evaluators.py / Master switch
    EVALSCOPE_TIMEOUT_SECONDS: int = 3600
    # 单次评测最大超时(秒) / Max timeout per evaluation invoke
    EVALSCOPE_POLL_INTERVAL: int = 5
    # 进度轮询间隔(秒) / Progress polling interval
    EVALSCOPE_SANDBOX_URL: str = ""
    # 远程沙箱地址 / Remote sandbox URL (ms-enclave or VolcEngine)

    model_config = {"env_file": ".env", "extra": "ignore"}


# 全局配置实例 / Global settings instance
settings = Settings()