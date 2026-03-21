"""add dataset version management fields

Revision ID: 0008
Revises: 0007
Create Date: 2026-03-21
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # -- dataset_versions: add size_bytes and format columns --
    op.add_column(
        "dataset_versions",
        sa.Column("size_bytes", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.add_column(
        "dataset_versions",
        sa.Column("format", sa.String(), nullable=False, server_default=sa.text("''")),
    )

    # -- eval_tasks: add dataset_version_id column --
    op.add_column(
        "eval_tasks",
        sa.Column("dataset_version_id", sa.String(), nullable=False, server_default=sa.text("''")),
    )

    # -- sync_logs table --
    op.create_table(
        "sync_logs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("dataset_id", sa.Uuid(), nullable=False),
        sa.Column("triggered_by", sa.String(), nullable=False, server_default=sa.text("'auto'")),
        sa.Column("status", sa.String(), nullable=False, server_default=sa.text("''")),
        sa.Column("old_version", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("new_version", sa.Integer(), nullable=True),
        sa.Column("old_row_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("new_row_count", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.String(), nullable=False, server_default=sa.text("''")),
        sa.Column("duration_ms", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["dataset_id"], ["datasets.id"]),
    )
    op.create_index("ix_sync_logs_dataset_id", "sync_logs", ["dataset_id"])


def downgrade() -> None:
    op.drop_index("ix_sync_logs_dataset_id", table_name="sync_logs")
    op.drop_table("sync_logs")
    op.drop_column("eval_tasks", "dataset_version_id")
    op.drop_column("dataset_versions", "format")
    op.drop_column("dataset_versions", "size_bytes")
