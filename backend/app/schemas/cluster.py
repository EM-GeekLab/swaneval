import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class ClusterCreate(BaseModel):
    name: str = Field(max_length=128)
    kubeconfig: str  # raw YAML
    namespace: str = "default"
    description: str = ""
    vllm_image: str = ""  # 留空使用默认镜像
    install_gpu_support: str = ""  # "device-plugin", "gpu-operator", or "" (skip)

    @field_validator("kubeconfig")
    @classmethod
    def validate_kubeconfig(cls, v: str) -> str:
        if len(v) > 1_000_000:
            raise ValueError("Kubeconfig too large (max 1MB)")
        import yaml
        try:
            data = yaml.safe_load(v)
        except Exception as exc:
            raise ValueError("Invalid YAML format") from exc
        if not isinstance(data, dict) or "clusters" not in data:
            raise ValueError("Invalid kubeconfig: missing 'clusters' key")
        return v


class ClusterUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    namespace: str | None = None
    vllm_image: str | None = None


class ClusterResponse(BaseModel):
    model_config = {"from_attributes": True}
    id: uuid.UUID
    name: str
    description: str
    api_server_url: str
    namespace: str
    status: str
    status_message: str
    gpu_count: int
    gpu_type: str
    gpu_available: int
    cpu_total_millicores: int
    memory_total_bytes: int
    node_count: int
    vllm_image: str = ""
    gpu_operator_installed: bool = False
    vllm_cache_ready: bool
    last_probed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    created_by: uuid.UUID | None = None


class ClusterNodeResponse(BaseModel):
    name: str
    gpu_count: int
    gpu_type: str
    cpu_millicores: int
    memory_bytes: int
    status: str
