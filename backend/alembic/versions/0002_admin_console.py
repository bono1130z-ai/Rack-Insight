"""Admin console: clusters.site, credentials, collector_runs, device fields.

Revision ID: 0002
Revises: 0001

Adds the columns/tables introduced by the Admin Console feature:
- ALTER TABLE clusters ADD COLUMN site VARCHAR(255)
- credentials table (named Redfish/SSH/SNMP credentials)
- collector_runs table (collection audit log)
- devices: orientation, collector_types, credential references
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # -- clusters ------------------------------------------------------------
    # ALTER TABLE clusters ADD COLUMN site VARCHAR(255);
    op.add_column("clusters", sa.Column("site", sa.String(255), nullable=True))

    # -- credentials ----------------------------------------------------------
    op.create_table(
        "credentials",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("name", sa.String(128), nullable=False, unique=True),
        sa.Column(
            "credential_type",
            sa.Enum("REDFISH", "SSH", "SNMP", name="credential_type"),
            nullable=False,
        ),
        sa.Column("username", sa.String(128), nullable=True),
        sa.Column("password_encrypted", sa.String(512), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
    )

    # -- collector_runs -------------------------------------------------------
    op.create_table(
        "collector_runs",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "device_id",
            sa.Uuid(),
            sa.ForeignKey("devices.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("success", sa.Boolean(), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=False),
        sa.Column(
            "snapshot_id",
            sa.Uuid(),
            sa.ForeignKey("snapshots.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("trigger", sa.Text(), nullable=True),
    )
    op.create_index("ix_collector_runs_device_id", "collector_runs", ["device_id"])

    # -- devices --------------------------------------------------------------
    # batch_alter_table executes plain ALTERs on PostgreSQL and falls back to
    # copy-and-move on SQLite (which cannot ALTER-add FK constraints).
    device_orientation = sa.Enum("FRONT", "REAR", name="device_orientation")
    device_orientation.create(op.get_bind(), checkfirst=True)
    with op.batch_alter_table("devices") as batch_op:
        batch_op.add_column(
            sa.Column(
                "orientation",
                device_orientation,
                nullable=False,
                server_default="FRONT",
            )
        )
        batch_op.add_column(sa.Column("collector_types", sa.String(64), nullable=True))
        batch_op.add_column(sa.Column("redfish_credential_id", sa.Uuid(), nullable=True))
        batch_op.add_column(sa.Column("ssh_credential_id", sa.Uuid(), nullable=True))
        batch_op.add_column(sa.Column("snmp_credential_id", sa.Uuid(), nullable=True))
        batch_op.create_foreign_key(
            "fk_devices_redfish_credential",
            "credentials",
            ["redfish_credential_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_foreign_key(
            "fk_devices_ssh_credential",
            "credentials",
            ["ssh_credential_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_foreign_key(
            "fk_devices_snmp_credential",
            "credentials",
            ["snmp_credential_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("devices") as batch_op:
        batch_op.drop_constraint("fk_devices_snmp_credential", type_="foreignkey")
        batch_op.drop_constraint("fk_devices_ssh_credential", type_="foreignkey")
        batch_op.drop_constraint("fk_devices_redfish_credential", type_="foreignkey")
        batch_op.drop_column("snmp_credential_id")
        batch_op.drop_column("ssh_credential_id")
        batch_op.drop_column("redfish_credential_id")
        batch_op.drop_column("collector_types")
        batch_op.drop_column("orientation")
    sa.Enum(name="device_orientation").drop(op.get_bind(), checkfirst=True)
    op.drop_table("collector_runs")
    op.drop_table("credentials")
    sa.Enum(name="credential_type").drop(op.get_bind(), checkfirst=True)
    op.drop_column("clusters", "site")
