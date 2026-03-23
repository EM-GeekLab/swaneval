"""add vllm_image to compute_clusters

Revision ID: 0014
Revises: 0013
Create Date: 2026-03-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "compute_clusters",
        sa.Column("vllm_image", sa.String(), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("compute_clusters", "vllm_image")
