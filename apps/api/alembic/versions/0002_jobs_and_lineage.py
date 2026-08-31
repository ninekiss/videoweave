"""jobs and asset lineage

Revision ID: 0002
Revises: 0001
Create Date: 2026-08-31
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "jobs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("type", sa.String(length=64), nullable=False),
        sa.Column("state", sa.String(length=32), nullable=False),
        sa.Column("progress", sa.Float(), nullable=False),
        sa.Column("stage", sa.String(length=128), nullable=True),
        sa.Column("input_asset_id", sa.String(length=36), nullable=True),
        sa.Column("spec_json", sa.JSON(), nullable=False),
        sa.Column("result_json", sa.JSON(), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("worker_id", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["input_asset_id"], ["assets.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_jobs_input_asset_id", "jobs", ["input_asset_id"], unique=False)
    op.create_index("ix_jobs_project_id", "jobs", ["project_id"], unique=False)
    op.create_index("ix_jobs_state", "jobs", ["state"], unique=False)
    op.create_index("ix_jobs_type", "jobs", ["type"], unique=False)

    op.create_table(
        "asset_lineage",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("source_asset_id", sa.String(length=36), nullable=False),
        sa.Column("derived_asset_id", sa.String(length=36), nullable=False),
        sa.Column("job_id", sa.String(length=36), nullable=True),
        sa.Column("operator", sa.String(length=128), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["derived_asset_id"], ["assets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["job_id"], ["jobs.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["source_asset_id"], ["assets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_asset_lineage_derived_asset_id", "asset_lineage", ["derived_asset_id"], unique=False)
    op.create_index("ix_asset_lineage_job_id", "asset_lineage", ["job_id"], unique=False)
    op.create_index("ix_asset_lineage_source_asset_id", "asset_lineage", ["source_asset_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_asset_lineage_source_asset_id", table_name="asset_lineage")
    op.drop_index("ix_asset_lineage_job_id", table_name="asset_lineage")
    op.drop_index("ix_asset_lineage_derived_asset_id", table_name="asset_lineage")
    op.drop_table("asset_lineage")
    op.drop_index("ix_jobs_type", table_name="jobs")
    op.drop_index("ix_jobs_state", table_name="jobs")
    op.drop_index("ix_jobs_project_id", table_name="jobs")
    op.drop_index("ix_jobs_input_asset_id", table_name="jobs")
    op.drop_table("jobs")
