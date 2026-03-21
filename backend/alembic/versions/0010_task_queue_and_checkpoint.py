"""task queue and checkpoint: execution_backend, resource_config, worker_id, error_summary, total/completed prompts

Revision ID: 0010
Revises: 0009
Create Date: 2026-03-21
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "eval_tasks",
        sa.Column("execution_backend", sa.String(), nullable=False, server_default=sa.text("'external_api'")),
    )
    op.add_column(
        "eval_tasks",
        sa.Column("resource_config", sa.String(), nullable=False, server_default=sa.text("''")),
    )
    op.add_column(
        "eval_tasks",
        sa.Column("worker_id", sa.String(), nullable=False, server_default=sa.text("''")),
    )
    op.add_column(
        "eval_tasks",
        sa.Column("error_summary", sa.String(), nullable=False, server_default=sa.text("''")),
    )
    op.add_column(
        "eval_tasks",
        sa.Column("total_prompts", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.add_column(
        "eval_tasks",
        sa.Column("completed_prompts", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )


def downgrade() -> None:
    op.drop_column("eval_tasks", "completed_prompts")
    op.drop_column("eval_tasks", "total_prompts")
    op.drop_column("eval_tasks", "error_summary")
    op.drop_column("eval_tasks", "worker_id")
    op.drop_column("eval_tasks", "resource_config")
    op.drop_column("eval_tasks", "execution_backend")
