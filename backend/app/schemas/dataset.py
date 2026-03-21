import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.models.dataset import SourceType


class DatasetCreate(BaseModel):
    name: str
    description: str = ""
    tags: str = ""


class DatasetMountRequest(BaseModel):
    name: str
    description: str = ""
    server_path: str
    format: str = "jsonl"
    tags: str = ""


class DatasetImportRequest(BaseModel):
    """Import dataset from HuggingFace or ModelScope."""
    source: str  # "huggingface" or "modelscope"
    dataset_id: str  # e.g. "openai/gsm8k" or HF/MS URL
    name: str = ""  # display name, defaults to dataset_id
    subset: str = ""  # dataset config/subset name
    split: str = "test"  # which split to download
    description: str = ""
    tags: str = ""


class DatasetSubscribeRequest(BaseModel):
    """Enable auto-update subscription for a dataset."""
    hf_dataset_id: str  # e.g. "openai/gsm8k"
    hf_subset: str = ""
    hf_split: str = "test"
    update_interval_hours: int = 24


class DatasetResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    description: str
    source_type: SourceType
    source_uri: str
    format: str
    tags: str
    version: int
    size_bytes: int
    row_count: int
    created_at: datetime
    auto_update: bool = False
    update_interval_hours: int = 24
    last_synced_at: datetime | None = None
    sync_status: str = ""
    hf_dataset_id: str = ""


class DatasetVersionResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    dataset_id: uuid.UUID
    version: int
    file_path: str
    changelog: str
    row_count: int
    size_bytes: int = 0
    format: str = ""
    created_at: datetime


class SyncLogResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    dataset_id: uuid.UUID
    triggered_by: str
    status: str
    old_version: int
    new_version: int | None
    old_row_count: int
    new_row_count: int | None
    error_message: str
    duration_ms: int
    created_at: datetime


class PreflightResponse(BaseModel):
    """Result of two-stage import: preflight check."""
    source_type: str
    format: str
    row_count: int
    size_bytes: int
    columns: list[str]
    sample_rows: list[dict[str, Any]]
    field_types: dict[str, str]  # column -> inferred type
    warnings: list[str]
    # Opaque token to pass to confirm endpoint
    preflight_token: str


class PreflightConfirmRequest(BaseModel):
    """Confirm a preflight import."""
    preflight_token: str
    name: str
    description: str = ""
    tags: str = ""


class DatasetStatsResponse(BaseModel):
    """Statistical summary of a dataset."""
    row_count: int
    column_count: int
    size_bytes: int
    # Each entry: name, dtype, null_count, null_pct, sample_values,
    # avg_text_len, unique_count, top_values
    columns: list[dict[str, Any]]


class PaginatedResponse(BaseModel):
    items: list[Any]
    total: int
    page: int
    page_size: int
