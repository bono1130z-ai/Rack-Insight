# Release Notes

## 1.1.1 (2026-07-08)

Patch release. Fully backward compatible: the 1.0/1.1 `/api/devices` API,
exports, collectors, dashboard, search and audit log all keep working. The one
additive migration (0006) preserves all existing data.

### Data model — Device Template + Rack Device Instance (P5)

The device model is split into two concepts:

- **Device Template** — a reusable hardware model (vendor, model, CPU, memory,
  storage, firmware, NIC). Never holds deployment data.
- **Rack Device Instance** — an installed server: hostname, management IP,
  iLO IP, credentials, rack, U position, status. Many instances may reference
  one template.

Implementation: the existing `devices` table (which holds deployment data) was
renamed to `rack_device_instances`; its foreign keys
(snapshots/rack_units/collector_runs) follow the rename with no value rewrites,
so **existing rack layouts, snapshots and exports stay valid**. A new
`device_templates` table holds hardware models. Migration 0006 backfills one
**deduplicated** template per distinct (vendor, model) and links every existing
instance to it — one template + one instance per original device, no data loss.

- `GET/POST/PATCH/DELETE /api/device-templates` (read: any user; write: admin,
  audited). Deletion is blocked while instances reference the template.
- Creating a device accepts an optional `template_id`; vendor/model are
  inherited from the template when not set explicitly.
- Collectors keep writing **per-instance** snapshots; templates hold declared
  specs and are not overwritten by collection (so shared templates never
  thrash).
- UI: **Device Templates** admin page (hardware models); **Installed Devices**
  page manages instances and lets you pick a template.

### Other improvements

- **P1 — Rename**: "Bulk" rack creation is now **"Create Multiple Racks"**
  (button, dialog, tooltip, docs). API `POST /api/racks/bulk` unchanged.
- **P2 — Rack assignment workflow**: assign/remove devices without opening the
  spreadsheet editor. `PUT /api/devices/{id}/position` can now move a device
  into a different rack; new `DELETE /api/devices/{id}/position` uninstalls a
  device from its slot (keeps the device). Available inline in Installed
  Devices and via drag-and-drop in the rack editor.
- **P3 — Create Multiple Devices**: `POST /api/devices/bulk` installs many
  identical instances in one transaction with sequential hostname generation
  (prefix + zero-padded number) or explicit hostnames; duplicates skipped,
  errors reported. UI dialog in Installed Devices.
- **P4 — Drag-and-drop rack editing**: the rack layout editor is now a 42U
  drag-and-drop surface (same interaction as Rack View) — devices move
  directly with no automatic shifting, and an "Unplaced" palette assigns/removes
  devices. Replaces the number-input reordering.

### Upgrade notes

- `docker compose` up/pull the 1.1.1 images — migration 0006 runs automatically
  at startup and transforms existing devices into templates + instances.
- Default image tag is now `1.1.1`.

## 1.1.0 (2026-07-07)

Fully backward compatible with 1.0.0. All schema changes ship as additive
Alembic migrations (0003–0005) applied automatically on startup. No existing
API contract changed; new endpoints and optional parameters only.

### Core features

- **F1 — Inventory Export**: `GET /api/export?scope=device|rack|cluster|all`
  `&format=json|csv|xlsx`. Excel has one sheet per section (Devices, CPU,
  Memory, NIC, Storage, Firmware, Network, VM, Sensor); CSV is a zip with one
  file per section. Export buttons on Device Detail, Rack Detail and the
  Dashboard.
- **F2 — Collector Failure Diagnosis**: collector failures are categorized
  (`AUTH_FAILED`, `CONNECTION_TIMEOUT`, `HOST_UNREACHABLE`, `SSL_ERROR`,
  `DNS_FAILURE`, `HTTP_ERROR`, `REDFISH_SCHEMA_ERROR`, `SSH_ERROR`,
  `COLLECTOR_EXCEPTION`). CollectorRun stores `error_code` and
  `readable_message`; the Collector Management UI shows the code chip and
  readable text (migration 0003).
- **F3 — Unified Status / Health UI**: one `StatusPill` component defines the
  color/label language everywhere (Healthy/Online green, Warning orange,
  Critical/Offline red, Unknown gray, Refreshing blue; always icon + text).
- **F4 — Dashboard Summary**: `GET /api/dashboard/summary` with Total /
  Online / Warning / Critical / Offline / Unknown counts (Critical = health
  score in the Critical band). Five stat cards on the dashboard, visible to
  both roles.
- **F5 — Inventory Search / Filter**: `GET /api/devices/search` with free
  text (hostname, vendor, model, snapshot serials), dedicated field filters,
  cluster/rack/status filters and server-side pagination. New Inventory
  Search page in the sidebar.
- **F6 — Sensor Thresholds**: Redfish upper/lower thresholds are collected
  and displayed per sensor; "Threshold unavailable" otherwise
  (migration 0004).
- **F7 — Bulk Rack Creation**: `POST /api/racks/bulk` creates
  `PREFIX-1..N`; existing names are skipped and reported. Bulk Create dialog
  in Rack Management.

### Stretch features

- **F9 — Pagination**: optional `page`/`page_size` on `/api/devices`,
  `/api/users` and collector run logs (response shapes unchanged);
  `/api/devices/search` and `/api/audit` return paginated envelopes with
  totals.
- **F10 — Administrative Audit Log**: every admin CREATE/UPDATE/DELETE on
  clusters, racks, devices, credentials and users is recorded with who,
  when, and JSON old/new values (secrets redacted; migration 0005).
  Admin-only `GET /api/audit` and an Audit Log page with filters.

### Deferred to 1.2.0

- **F8 — Hardware Inventory Expansion** (PSU / Fan / GPU / PCI device
  tables): PSUs and fans are already visible as sensors; dedicated
  inventory tables need new collectors sections, schemas and UI tabs and
  were deferred to keep this release reviewable.
- **F11 — CSV Import**: bulk device registration with validation report.

### Upgrade notes

- `docker compose pull`/load new images and `docker compose up -d` —
  migrations 0003–0005 apply automatically at startup.
- New Python dependency: `openpyxl` (bundled in the backend image).
- Default image tag is now `1.1.0` (override with `IMAGE_TAG`).
