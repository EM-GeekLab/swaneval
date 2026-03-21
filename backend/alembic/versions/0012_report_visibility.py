"""add report visibility and allowed_users columns

Revision ID: 0012
Revises: 0011
Create Date: 2026-03-21
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "reports",
        sa.Column(
            "visibility",
            sa.String(),
            nullable=False,
            server_default=sa.text("'creator'"),
        ),
    )
    op.add_column(
        "reports",
        sa.Column(
            "allowed_users",
            sa.String(),
            nullable=False,
            server_default=sa.text("''"),
        ),
    )


def downgrade() -> None:
    op.drop_column("reports", "allowed_users")
    op.drop_column("reports", "visibility")
