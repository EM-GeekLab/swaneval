import uuid
from datetime import datetime

from pydantic import BaseModel


class ClusterCreate(BaseModel):
    name: str
    kubeconfig: str  # raw YAML
    namespace: str = "default"
    description: str = ""
    vllm_image: str = ""  # 留空使用默认镜像


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
    vllm_cache_ready: bool
    last_probed_at: datetime | None
    created_at: datetime


class ClusterNodeResponse(BaseModel):
    name: str
    gpu_count: int
    gpu_type: str
    cpu_millicores: int
    memory_bytes: int
    status: str
