"""model and criteria phase2: modelscope enum, deploy fields, judge_templates

Revision ID: 0009
Revises: 0008
Create Date: 2026-03-21
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # -- Add 'modelscope' value to the modeltype enum --
    op.execute("ALTER TYPE modeltype ADD VALUE IF NOT EXISTS 'modelscope'")

    # -- Add deployment & status fields to llm_models --
    op.add_column(
        "llm_models",
        sa.Column("deploy_status", sa.String(), nullable=False, server_default=sa.text("''")),
    )
    op.add_column(
        "llm_models",
        sa.Column("cluster_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_llm_models_cluster_id",
        "llm_models",
        "compute_clusters",
        ["cluster_id"],
        ["id"],
    )
    op.add_column(
        "llm_models",
        sa.Column("source_model_id", sa.String(), nullable=False, server_default=sa.text("''")),
    )
    op.add_column(
        "llm_models",
        sa.Column("last_test_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "llm_models",
        sa.Column("last_test_ok", sa.Boolean(), nullable=True),
    )

    # -- Create judge_templates table --
    op.create_table(
        "judge_templates",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=256), nullable=False),
        sa.Column("description", sa.String(), nullable=False, server_default=sa.text("''")),
        sa.Column("system_prompt", sa.String(), nullable=False, server_default=sa.text("''")),
        sa.Column("dimensions", sa.String(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("scale", sa.Integer(), nullable=False, server_default=sa.text("10")),
        sa.Column("is_builtin", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
    )
    op.create_index("ix_judge_templates_name", "judge_templates", ["name"])


def downgrade() -> None:
    op.drop_index("ix_judge_templates_name", table_name="judge_templates")
    op.drop_table("judge_templates")
    op.drop_column("llm_models", "last_test_ok")
    op.drop_column("llm_models", "last_test_at")
    op.drop_column("llm_models", "source_model_id")
    op.drop_constraint("fk_llm_models_cluster_id", "llm_models", type_="foreignkey")
    op.drop_column("llm_models", "cluster_id")
    op.drop_column("llm_models", "deploy_status")
    # Note: PostgreSQL does not support removing values from enums.
    # The 'modelscope' value will remain in the modeltype enum on downgrade.
