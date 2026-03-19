"""add api_format to llm_models

Revision ID: a1b2c3d4e5f6
Revises: 3c480426f2f1
Create Date: 2026-03-19
"""
from alembic import op
import sqlalchemy as sa

revision = "a1b2c3d4e5f6"
down_revision = "3c480426f2f1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create the enum type first
    api_format_enum = sa.Enum("openai", "anthropic", name="apiformat")
    api_format_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "llm_models",
        sa.Column("api_format", api_format_enum, server_default="openai", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("llm_models", "api_format")
    sa.Enum(name="apiformat").drop(op.get_bind(), checkfirst=True)
