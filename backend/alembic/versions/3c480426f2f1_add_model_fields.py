"""add description model_name max_tokens to llm_models

Revision ID: 3c480426f2f1
Revises:
Create Date: 2026-03-19
"""
from alembic import op
import sqlalchemy as sa

revision = "3c480426f2f1"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("llm_models", sa.Column("description", sa.String(), server_default="", nullable=False))
    op.add_column("llm_models", sa.Column("model_name", sa.String(), server_default="", nullable=False))
    op.add_column("llm_models", sa.Column("max_tokens", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("llm_models", "max_tokens")
    op.drop_column("llm_models", "model_name")
    op.drop_column("llm_models", "description")
