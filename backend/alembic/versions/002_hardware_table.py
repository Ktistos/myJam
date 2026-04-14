"""Add jam_hardware table and require_hardware_approval column

Revision ID: 002
Revises: 001
Create Date: 2026-04-13 00:00:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("jams", sa.Column("require_hardware_approval", sa.Boolean, server_default="false"))

    op.create_table(
        "jam_hardware",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("jam_id", UUID(as_uuid=True), sa.ForeignKey("jams.id", ondelete="CASCADE"), nullable=False),
        sa.Column("instrument", sa.String, nullable=False),
        sa.Column("owner_id", sa.String, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String, server_default="approved"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("jam_id", "instrument", "owner_id", name="uq_jam_hardware_item"),
    )

    # Migrate existing JSON hardware data if the column exists
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c["name"] for c in inspector.get_columns("jams")]
    if "hardware" in columns:
        results = conn.execute(sa.text("SELECT id, hardware FROM jams WHERE hardware IS NOT NULL AND hardware::text != '[]'"))
        for row in results:
            jam_id, hw_list = row
            if not hw_list:
                continue
            for item in hw_list:
                instrument = item.get("instrument")
                owner_id = item.get("owner_id")
                if instrument and owner_id:
                    conn.execute(
                        sa.text(
                            "INSERT INTO jam_hardware (id, jam_id, instrument, owner_id, status) "
                            "VALUES (gen_random_uuid(), :jam_id, :instrument, :owner_id, 'approved') "
                            "ON CONFLICT DO NOTHING"
                        ),
                        {"jam_id": jam_id, "instrument": instrument, "owner_id": owner_id},
                    )
        op.drop_column("jams", "hardware")


def downgrade():
    op.add_column("jams", sa.Column("hardware", sa.JSON, server_default="[]"))
    op.drop_table("jam_hardware")
    op.drop_column("jams", "require_hardware_approval")
