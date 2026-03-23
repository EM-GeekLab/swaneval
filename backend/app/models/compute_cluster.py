"""Compute cluster models for GPU resource pool management."""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import BigInteger, Column, DateTime
from sqlalchemy import Enum as SAEnum
from sqlmodel import Field, SQLModel


class ClusterStatus(str, enum.Enum):
    connecting = "connecting"
    ready = "ready"
    error = "error"
    provisioning = "provisioning"
    offline = "offline"


class InfraJobType(str, enum.Enum):
    namespace_setup = "namespace_setup"
    vllm_cache = "vllm_cache"
    resource_quota = "resource_quota"
    probe = "probe"


class ComputeCluster(SQLModel, table=True):
    __tablename__ = "compute_clusters"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(max_length=128)
    description: str = Field(default="")
    kubeconfig_encrypted: str = Field(default="")
    api_server_url: str = Field(default="")
    namespace: str = Field(default="default")
    status: ClusterStatus = Field(
        sa_column=Column(
            SAEnum(ClusterStatus, name="clusterstatus", create_constraint=False),
            nullable=False,
            default=ClusterStatus.connecting,
        )
    )
    status_message: str = Field(default="")
    gpu_count: int = Field(default=0)
    gpu_type: str = Field(default="")
    gpu_available: int = Field(default=0)
    cpu_total_millicores: int = Field(default=0)
    memory_total_bytes: int = Field(default=0, sa_type=BigInteger)
    node_count: int = Field(default=0)
    vllm_image: str = Field(default="")
    # vLLM 镜像地址，空则使用默认 vllm/vllm-openai:latest

    vllm_cache_ready: bool = Field(default=False)
    last_probed_at: datetime | None = Field(
        default=None, sa_type=DateTime(timezone=True),
    )
    created_by: uuid.UUID | None = Field(
        default=None, foreign_key="users.id",
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=DateTime(timezone=True),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=DateTime(timezone=True),
    )


class ClusterInfraJob(SQLModel, table=True):
    __tablename__ = "cluster_infra_jobs"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    cluster_id: uuid.UUID = Field(foreign_key="compute_clusters.id")
    job_type: InfraJobType = Field(
        sa_column=Column(
            SAEnum(InfraJobType, name="infrajobtype", create_constraint=False),
            nullable=False,
        )
    )
    status: str = Field(default="pending")
    log: str = Field(default="")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=DateTime(timezone=True),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=DateTime(timezone=True),
    )
