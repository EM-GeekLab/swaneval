from typing import List, Optional
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings."""

    # App
    app_name: str = "EvalScope GUI"
    debug: bool = True

    # Database
    database_url: str = Field(
        default="postgresql://evalscope:evalscope@localhost:6001/evalscope",
        alias="DATABASE_URL"
    )

    # Redis
    redis_url: str = Field(
        default="redis://localhost:6379/0",
        alias="REDIS_URL"
    )

    # Security
    secret_key: str = Field(
        default="dev-secret-key-change-in-production",
        alias="SECRET_KEY"
    )
    access_token_expire_minutes: int = 60 * 24  # 24 hours

    # CORS
    cors_origins: List[str] = ["http://localhost:3000"]

    # EvalScope
    evalscope_output_dir: str = "./outputs"

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
    )


settings = Settings()