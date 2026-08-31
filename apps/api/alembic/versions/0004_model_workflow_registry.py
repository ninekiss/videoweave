"""model and workflow registry

Revision ID: 0004
Revises: 0003
Create Date: 2026-08-31
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "model_definitions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("family", sa.String(length=128), nullable=True),
        sa.Column("version", sa.String(length=128), nullable=True),
        sa.Column("capability", sa.String(length=64), nullable=False),
        sa.Column("engine", sa.String(length=64), nullable=False),
        sa.Column("location", sa.String(length=1024), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("config_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_model_definitions_capability", "model_definitions", ["capability"])
    op.create_index("ix_model_definitions_engine", "model_definitions", ["engine"])
    op.create_index("ix_model_definitions_status", "model_definitions", ["status"])

    op.create_table(
        "workflow_definitions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("version", sa.String(length=128), nullable=False),
        sa.Column("capability", sa.String(length=64), nullable=False),
        sa.Column("engine", sa.String(length=64), nullable=False),
        sa.Column("model_id", sa.String(length=36), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("artifact_ref", sa.String(length=1024), nullable=True),
        sa.Column("config_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["model_id"], ["model_definitions.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_workflow_definitions_capability", "workflow_definitions", ["capability"])
    op.create_index("ix_workflow_definitions_engine", "workflow_definitions", ["engine"])
    op.create_index("ix_workflow_definitions_model_id", "workflow_definitions", ["model_id"])
    op.create_index("ix_workflow_definitions_enabled", "workflow_definitions", ["enabled"])


def downgrade() -> None:
    op.drop_index("ix_workflow_definitions_enabled", table_name="workflow_definitions")
    op.drop_index("ix_workflow_definitions_model_id", table_name="workflow_definitions")
    op.drop_index("ix_workflow_definitions_engine", table_name="workflow_definitions")
    op.drop_index("ix_workflow_definitions_capability", table_name="workflow_definitions")
    op.drop_table("workflow_definitions")

    op.drop_index("ix_model_definitions_status", table_name="model_definitions")
    op.drop_index("ix_model_definitions_engine", table_name="model_definitions")
    op.drop_index("ix_model_definitions_capability", table_name="model_definitions")
    op.drop_table("model_definitions")
