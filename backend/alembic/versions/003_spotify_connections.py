"""Add Spotify OAuth connections

Revision ID: 003
Revises: 002
Create Date: 2026-04-14 00:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "spotify_connections",
        sa.Column("user_id", sa.String, sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("access_token", sa.Text, nullable=False),
        sa.Column("refresh_token", sa.Text, nullable=False),
        sa.Column("scope", sa.String, server_default=""),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table("spotify_connections")
