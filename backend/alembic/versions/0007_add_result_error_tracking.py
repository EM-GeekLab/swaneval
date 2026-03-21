"""add error_category and is_valid to eval_results

Revision ID: 0007
Revises: 0006
Create Date: 2026-03-21
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "eval_results",
        sa.Column("is_valid", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column(
        "eval_results",
        sa.Column("error_category", sa.String(), nullable=True),
    )
    op.create_index("ix_eval_results_is_valid", "eval_results", ["is_valid"])


def downgrade() -> None:
    op.drop_index("ix_eval_results_is_valid", table_name="eval_results")
    op.drop_column("eval_results", "error_category")
    op.drop_column("eval_results", "is_valid")
