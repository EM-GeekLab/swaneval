"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-03-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Create enum types (idempotent) ────────────────────────────────
    userrole = postgresql.ENUM("admin", "data_admin", "engineer", "viewer", name="userrole", create_type=False)
    sourcetype = postgresql.ENUM("upload", "huggingface", "modelscope", "server_path", "preset", name="sourcetype", create_type=False)
    criteriontype = postgresql.ENUM("preset", "regex", "script", "llm_judge", name="criteriontype", create_type=False)
    modeltype = postgresql.ENUM("api", "local", "huggingface", name="modeltype", create_type=False)
    apiformat = postgresql.ENUM("openai", "anthropic", name="apiformat", create_type=False)
    taskstatus = postgresql.ENUM("pending", "running", "paused", "completed", "failed", name="taskstatus", create_type=False)
    seedstrategy = postgresql.ENUM("fixed", "random", name="seedstrategy", create_type=False)

    userrole.create(op.get_bind(), checkfirst=True)
    sourcetype.create(op.get_bind(), checkfirst=True)
    criteriontype.create(op.get_bind(), checkfirst=True)
    modeltype.create(op.get_bind(), checkfirst=True)
    apiformat.create(op.get_bind(), checkfirst=True)
    taskstatus.create(op.get_bind(), checkfirst=True)
    seedstrategy.create(op.get_bind(), checkfirst=True)

    # ── users ─────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("username", sa.String(64), nullable=False),
        sa.Column("email", sa.String(256), nullable=False),
        sa.Column("nickname", sa.String(64), nullable=False, server_default=""),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column("role", userrole, nullable=False, server_default="viewer"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # ── datasets ──────────────────────────────────────────────────────
    op.create_table(
        "datasets",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("description", sa.String(), nullable=False, server_default=""),
        sa.Column("source_type", sourcetype, nullable=False),
        sa.Column("source_uri", sa.String(), nullable=False, server_default=""),
        sa.Column("format", sa.String(32), nullable=False, server_default="jsonl"),
        sa.Column("tags", sa.String(), nullable=False, server_default=""),
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("size_bytes", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("row_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("auto_update", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("update_interval_hours", sa.Integer(), nullable=False, server_default=sa.text("24")),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sync_status", sa.String(), nullable=False, server_default=""),
        sa.Column("hf_dataset_id", sa.String(), nullable=False, server_default=""),
        sa.Column("hf_subset", sa.String(), nullable=False, server_default=""),
        sa.Column("hf_split", sa.String(), nullable=False, server_default="test"),
        sa.Column("hf_last_sha", sa.String(), nullable=False, server_default=""),
    )
    op.create_index("ix_datasets_name", "datasets", ["name"])

    # ── dataset_versions ──────────────────────────────────────────────
    op.create_table(
        "dataset_versions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("dataset_id", sa.Uuid(), sa.ForeignKey("datasets.id"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("file_path", sa.String(), nullable=False),
        sa.Column("changelog", sa.String(), nullable=False, server_default=""),
        sa.Column("row_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    # ── criteria ──────────────────────────────────────────────────────
    op.create_table(
        "criteria",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("type", criteriontype, nullable=False),
        sa.Column("config_json", sa.String(), nullable=False, server_default="{}"),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_criteria_name", "criteria", ["name"])

    # ── llm_models ────────────────────────────────────────────────────
    op.create_table(
        "llm_models",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("provider", sa.String(64), nullable=False),
        sa.Column("endpoint_url", sa.String(), nullable=False),
        sa.Column("api_key", sa.String(), nullable=False, server_default=""),
        sa.Column("model_type", modeltype, nullable=False),
        sa.Column("api_format", apiformat, nullable=False, server_default="openai"),
        sa.Column("description", sa.String(), nullable=False, server_default=""),
        sa.Column("model_name", sa.String(), nullable=False, server_default=""),
        sa.Column("max_tokens", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_llm_models_name", "llm_models", ["name"])

    # ── eval_tasks ────────────────────────────────────────────────────
    op.create_table(
        "eval_tasks",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("status", taskstatus, nullable=False, server_default="pending"),
        sa.Column("model_id", sa.Uuid(), sa.ForeignKey("llm_models.id"), nullable=False),
        sa.Column("dataset_ids", sa.String(), nullable=False, server_default=""),
        sa.Column("criteria_ids", sa.String(), nullable=False, server_default=""),
        sa.Column("params_json", sa.String(), nullable=False, server_default='{"temperature": 0.7, "max_tokens": 1024}'),
        sa.Column("repeat_count", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("seed_strategy", seedstrategy, nullable=False, server_default="fixed"),
        sa.Column("gpu_ids", sa.String(), nullable=False, server_default=""),
        sa.Column("env_vars", sa.String(), nullable=False, server_default=""),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    # ── eval_subtasks ─────────────────────────────────────────────────
    op.create_table(
        "eval_subtasks",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("task_id", sa.Uuid(), sa.ForeignKey("eval_tasks.id"), nullable=False),
        sa.Column("run_index", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("status", taskstatus, nullable=False, server_default="pending"),
        sa.Column("progress_pct", sa.Float(), nullable=False, server_default=sa.text("0.0")),
        sa.Column("last_completed_index", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("error_log", sa.String(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    # ── eval_results ──────────────────────────────────────────────────
    op.create_table(
        "eval_results",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("task_id", sa.Uuid(), sa.ForeignKey("eval_tasks.id"), nullable=False),
        sa.Column("subtask_id", sa.Uuid(), sa.ForeignKey("eval_subtasks.id"), nullable=False),
        sa.Column("dataset_id", sa.Uuid(), sa.ForeignKey("datasets.id"), nullable=False),
        sa.Column("criterion_id", sa.Uuid(), sa.ForeignKey("criteria.id"), nullable=False),
        sa.Column("prompt_text", sa.String(), nullable=False, server_default=""),
        sa.Column("expected_output", sa.String(), nullable=False, server_default=""),
        sa.Column("model_output", sa.String(), nullable=False, server_default=""),
        sa.Column("score", sa.Float(), nullable=False, server_default=sa.text("0.0")),
        sa.Column("latency_ms", sa.Float(), nullable=False, server_default=sa.text("0.0")),
        sa.Column("tokens_generated", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("first_token_ms", sa.Float(), nullable=False, server_default=sa.text("0.0")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_eval_results_task_id", "eval_results", ["task_id"])

    # ── external_benchmarks ───────────────────────────────────────────
    op.create_table(
        "external_benchmarks",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("model_name", sa.String(256), nullable=False),
        sa.Column("provider", sa.String(), nullable=False, server_default=""),
        sa.Column("benchmark_name", sa.String(256), nullable=False),
        sa.Column("score", sa.Float(), nullable=False, server_default=sa.text("0.0")),
        sa.Column("score_display", sa.String(), nullable=False, server_default=""),
        sa.Column("source_url", sa.String(), nullable=False, server_default=""),
        sa.Column("source_platform", sa.String(), nullable=False, server_default=""),
        sa.Column("notes", sa.String(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_external_benchmarks_model_name", "external_benchmarks", ["model_name"])


def downgrade() -> None:
    op.drop_table("external_benchmarks")
    op.drop_table("eval_results")
    op.drop_table("eval_subtasks")
    op.drop_table("eval_tasks")
    op.drop_table("llm_models")
    op.drop_table("criteria")
    op.drop_table("dataset_versions")
    op.drop_table("datasets")
    op.drop_table("users")

    for name in ("seedstrategy", "taskstatus", "apiformat", "modeltype", "criteriontype", "sourcetype", "userrole"):
        postgresql.ENUM(name=name).drop(op.get_bind(), checkfirst=True)
