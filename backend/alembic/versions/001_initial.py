"""initial schema

Revision ID: 001
Revises:
Create Date: 2025-01-01 00:00:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "users",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("bio", sa.String, default=""),
        sa.Column("recording_link", sa.String, default=""),
        sa.Column("avatar_url", sa.String, default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "user_instruments",
        sa.Column("user_id", sa.String, sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("instrument", sa.String, primary_key=True),
        sa.Column("skill_level", sa.String, nullable=False),
    )

    op.create_table(
        "jams",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("state", sa.String, default="initial"),
        sa.Column("visibility", sa.String, default="public"),
        sa.Column("invite_code", sa.String, unique=True, nullable=True),
        sa.Column("address", sa.String, default=""),
        sa.Column("lat", sa.Float, nullable=True),
        sa.Column("lng", sa.Float, nullable=True),
        sa.Column("require_role_approval", sa.Boolean, default=False),
        sa.Column("require_song_approval", sa.Boolean, default=False),
        sa.Column("current_song_id", UUID(as_uuid=True), nullable=True),
        sa.Column("created_by", sa.String, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "jam_admins",
        sa.Column("jam_id", UUID(as_uuid=True), sa.ForeignKey("jams.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", sa.String, sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    )

    op.create_table(
        "jam_participants",
        sa.Column("jam_id", UUID(as_uuid=True), sa.ForeignKey("jams.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", sa.String, sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "songs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("jam_id", UUID(as_uuid=True), sa.ForeignKey("jams.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String, nullable=False),
        sa.Column("artist", sa.String, default=""),
        sa.Column("status", sa.String, default="approved"),
        sa.Column("submitted_by", sa.String, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "roles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("song_id", UUID(as_uuid=True), sa.ForeignKey("songs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("instrument", sa.String, nullable=False),
        sa.Column("owner_id", sa.String, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("joined_by", sa.String, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("pending_user", sa.String, sa.ForeignKey("users.id"), nullable=True),
    )

    # Add FK from jams.current_song_id → songs.id after songs table exists
    op.create_foreign_key("fk_jams_current_song", "jams", "songs", ["current_song_id"], ["id"])


def downgrade():
    op.drop_constraint("fk_jams_current_song", "jams", type_="foreignkey")
    op.drop_table("roles")
    op.drop_table("songs")
    op.drop_table("jam_participants")
    op.drop_table("jam_admins")
    op.drop_table("jams")
    op.drop_table("user_instruments")
    op.drop_table("users")
