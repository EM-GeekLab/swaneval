"""add vllm_deployment_name to llm_models

Revision ID: 0015
Revises: 0014
Create Date: 2026-03-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "llm_models",
        sa.Column("vllm_deployment_name", sa.String(), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("llm_models", "vllm_deployment_name")
