"""shot records for video analysis

Revision ID: 0003
Revises: 0002
Create Date: 2026-08-31
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "shots",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("source_asset_id", sa.String(length=36), nullable=False),
        sa.Column("analysis_job_id", sa.String(length=36), nullable=False),
        sa.Column("index", sa.Integer(), nullable=False),
        sa.Column("start_time", sa.Float(), nullable=False),
        sa.Column("end_time", sa.Float(), nullable=False),
        sa.Column("duration", sa.Float(), nullable=False),
        sa.Column("representative_asset_id", sa.String(length=36), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_asset_id"], ["assets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["analysis_job_id"], ["jobs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["representative_asset_id"], ["assets.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_shots_project_id", "shots", ["project_id"], unique=False)
    op.create_index("ix_shots_source_asset_id", "shots", ["source_asset_id"], unique=False)
    op.create_index("ix_shots_analysis_job_id", "shots", ["analysis_job_id"], unique=False)
    op.create_index(
        "ix_shots_representative_asset_id",
        "shots",
        ["representative_asset_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_shots_representative_asset_id", table_name="shots")
    op.drop_index("ix_shots_analysis_job_id", table_name="shots")
    op.drop_index("ix_shots_source_asset_id", table_name="shots")
    op.drop_index("ix_shots_project_id", table_name="shots")
    op.drop_table("shots")
