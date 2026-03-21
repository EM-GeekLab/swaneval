"""Persistent report entity with generation/export history."""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime
from sqlalchemy import Enum as SAEnum
from sqlmodel import Field, SQLModel


class ReportType(str, enum.Enum):
    performance = "performance"
    safety = "safety"
    cost = "cost"
    value = "value"


class ReportStatus(str, enum.Enum):
    generating = "generating"
    ready = "ready"
    failed = "failed"


class Report(SQLModel, table=True):
    """Persistent report entity."""
    __tablename__ = "reports"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    task_id: uuid.UUID = Field(foreign_key="eval_tasks.id", index=True)
    report_type: ReportType = Field(sa_column=Column(SAEnum(ReportType), nullable=False))
    status: ReportStatus = Field(
        sa_column=Column(SAEnum(ReportStatus), nullable=False, default=ReportStatus.generating)
    )
    title: str = Field(default="")
    content_json: str = Field(default="{}")
    error_message: str = Field(default="")
    visibility: str = Field(default="creator")
    # 可见范围: creator (仅创建者), team (团队), public (所有用户)

    allowed_users: str = Field(default="")
    # 白名单用户ID（逗号分隔）/ Whitelist user IDs (comma-separated)

    created_by: uuid.UUID | None = Field(default=None, foreign_key="users.id")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=DateTime(timezone=True),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=DateTime(timezone=True),
    )


class ReportExportLog(SQLModel, table=True):
    """Tracks report export history."""
    __tablename__ = "report_export_logs"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    report_id: uuid.UUID = Field(foreign_key="reports.id", index=True)
    format: str = Field(default="")  # pdf, html, docx, csv
    exported_by: uuid.UUID | None = Field(default=None, foreign_key="users.id")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=DateTime(timezone=True),
    )
