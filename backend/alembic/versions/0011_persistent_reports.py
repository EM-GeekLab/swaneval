"""persistent reports and export logs

Revision ID: 0011
Revises: 0010
Create Date: 2026-03-21
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _create_enum_safe(name: str, values: list[str]):
    """Create a PostgreSQL enum type if it doesn't exist.

    Returns a postgresql.ENUM with create_type=False so that
    create_table won't try to CREATE TYPE again.
    """
    vals = ", ".join(f"'{v}'" for v in values)
    op.execute(sa.text(
        f"DO $$ BEGIN CREATE TYPE {name} AS ENUM ({vals}); "
        f"EXCEPTION WHEN duplicate_object THEN null; END $$;"
    ))
    return postgresql.ENUM(*values, name=name, create_type=False)


def upgrade() -> None:
    # Create enum types (idempotent)
    reporttype_enum = _create_enum_safe("reporttype", ["performance", "safety", "cost", "value"])
    reportstatus_enum = _create_enum_safe("reportstatus", ["generating", "ready", "failed"])

    # Create reports table
    op.create_table(
        "reports",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("task_id", sa.Uuid(), nullable=False),
        sa.Column("report_type", reporttype_enum, nullable=False),
        sa.Column("status", reportstatus_enum, nullable=False, server_default=sa.text("'generating'")),
        sa.Column("title", sa.String(), nullable=False, server_default=sa.text("''")),
        sa.Column("content_json", sa.String(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("error_message", sa.String(), nullable=False, server_default=sa.text("''")),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["task_id"], ["eval_tasks.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
    )
    op.create_index("ix_reports_task_id", "reports", ["task_id"])

    # Create report_export_logs table
    op.create_table(
        "report_export_logs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("report_id", sa.Uuid(), nullable=False),
        sa.Column("format", sa.String(), nullable=False, server_default=sa.text("''")),
        sa.Column("exported_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["report_id"], ["reports.id"]),
        sa.ForeignKeyConstraint(["exported_by"], ["users.id"]),
    )
    op.create_index("ix_report_export_logs_report_id", "report_export_logs", ["report_id"])


def downgrade() -> None:
    op.drop_index("ix_report_export_logs_report_id", table_name="report_export_logs")
    op.drop_table("report_export_logs")
    op.drop_index("ix_reports_task_id", table_name="reports")
    op.drop_table("reports")

    # Drop enum types
    sa.Enum(name="reportstatus").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="reporttype").drop(op.get_bind(), checkfirst=True)
