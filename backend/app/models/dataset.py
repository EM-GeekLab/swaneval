import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime
from sqlalchemy import Enum as SAEnum
from sqlmodel import Field, SQLModel


# 数据集来源类型枚举 / Dataset source type enumeration
class SourceType(str, enum.Enum):
    """数据集来源类型枚举 / Dataset source type enumeration"""
    upload = "upload"           # 本地上传 / Uploaded from local file
    huggingface = "huggingface" # HuggingFace数据集 / HuggingFace dataset
    modelscope = "modelscope"   # ModelScope数据集 / ModelScope dataset
    server_path = "server_path" # 服务器路径 / Server file path
    preset = "preset"           # 预设数据集 / Preset built-in dataset


class Dataset(SQLModel, table=True):
    """
    数据集模型 / Dataset model

    存储评估数据集的元数据信息。
    Stores metadata for evaluation datasets.
    """
    __tablename__ = "datasets"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    # 数据集ID / Dataset unique identifier

    name: str = Field(index=True, max_length=256)
    # 数据集名称 / Dataset name (indexed)

    description: str = Field(default="")
    # 数据集描述 / Dataset description

    source_type: SourceType = Field(sa_column=Column(SAEnum(SourceType), nullable=False))
    # 数据来源类型 / Source type (upload/huggingface/modelscope/etc)

    source_uri: str = Field(default="")
    # 数据源URI / Source URI (file path or HF/MS dataset ID)

    format: str = Field(default="jsonl", max_length=32)
    # 数据格式 / Data format (jsonl, csv, parquet, etc)

    tags: str = Field(default="")  # comma-separated
    # 标签 / Tags (comma-separated, e.g., "math,reasoning")

    version: int = Field(default=1)
    # 数据集版本 / Dataset version number

    size_bytes: int = Field(default=0)
    # 文件大小(字节) / File size in bytes

    row_count: int = Field(default=0)
    # 数据行数 / Number of data rows

    created_by: uuid.UUID | None = Field(default=None, foreign_key="users.id")
    # 创建者ID / Creator user ID (foreign key to users)

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=DateTime(timezone=True),
    )
    # 创建时间 / Creation timestamp

    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=DateTime(timezone=True),
    )
    # 更新时间 / Last update timestamp

    # ── 订阅自动更新 / Subscription auto-update fields ──

    auto_update: bool = Field(default=False)
    # 是否启用自动更新 / Whether auto-update is enabled

    update_interval_hours: int = Field(default=24)
    # 更新检查间隔（小时）/ Update check interval in hours

    last_synced_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    # 上次同步时间 / Last sync timestamp

    sync_status: str = Field(default="")
    # 同步状态: syncing, synced, failed, "" / Sync status

    hf_dataset_id: str = Field(default="")
    # HuggingFace Dataset ID（用于订阅更新）/ HF dataset ID for subscription

    hf_subset: str = Field(default="")
    # HuggingFace 子集 / HF dataset subset/config

    hf_split: str = Field(default="test")
    # HuggingFace 拆分 / HF dataset split

    hf_last_sha: str = Field(default="")
    # 上次同步时的 commit SHA / Last known repo commit SHA


class DatasetVersion(SQLModel, table=True):
    """
    数据集版本模型 / Dataset version model

    存储数据集的版本历史记录。
    Stores version history for datasets.
    """
    __tablename__ = "dataset_versions"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    # 版本ID / Version unique identifier

    dataset_id: uuid.UUID = Field(foreign_key="datasets.id")
    # 所属数据集ID / Parent dataset ID (foreign key to datasets)

    version: int
    # 版本号 / Version number

    file_path: str
    # 文件路径 / File path for this version

    changelog: str = Field(default="")
    # 变更日志 / Change log for this version

    row_count: int = Field(default=0)
    # 该版本的行数 / Row count for this version

    size_bytes: int = Field(default=0)
    # 该版本文件大小(字节) / File size in bytes for this version

    format: str = Field(default="")
    # 该版本的数据格式 / Data format for this version

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=DateTime(timezone=True),
    )
    # 创建时间 / Creation timestamp


class SyncLog(SQLModel, table=True):
    """Sync history record for auto-update subscriptions."""
    __tablename__ = "sync_logs"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    dataset_id: uuid.UUID = Field(foreign_key="datasets.id", index=True)
    triggered_by: str = Field(default="auto")  # "auto" or "manual"
    status: str = Field(default="")  # syncing, synced, failed, up_to_date
    old_version: int = Field(default=0)
    new_version: int | None = Field(default=None)
    old_row_count: int = Field(default=0)
    new_row_count: int | None = Field(default=None)
    error_message: str = Field(default="")
    duration_ms: int = Field(default=0)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=DateTime(timezone=True),
    )