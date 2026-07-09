# Release Notes

## 1.2.0 (2026-07-08) — Operational Automation & Discovery

The first operational-automation milestone. Six additive features turn the
inventory tool into a datacenter management platform. Fully backward
compatible: no breaking API changes, the Device Template / Installed Device
model and the Rack Editor are unchanged, and all 1.1.x features keep working.
One additive migration (0008) adds two new tables.

### F1 — SNMP Discovery

- `POST /api/discovery/scan` walks standard SNMP system OIDs (sysDescr,
  sysObjectID, sysName) across a set of targets (single IPs and/or CIDR blocks,
  up to 1024 hosts) and stores each reachable host as a **PENDING**
  `DiscoveredDevice`. Vendor and device type are inferred from sysDescr.
- Discovery collects identification data only and **never creates Installed
  Devices automatically**. `GET /api/discovery` lists pending discoveries;
  `DELETE /api/discovery/{id}` ignores one.
- SNMP support (pysnmp) is an optional dependency imported lazily: the platform
  runs without it and the scan endpoint returns a clear 503 until it is
  installed (it ships in the backend image).
- New **SNMP Discovery** admin page: scan form, results table, ignore.

### F2 — Discovery Import Wizard

- `POST /api/discovery/import` creates Installed Devices from selected
  discoveries, **reusing the existing bulk device-creation logic** (no
  duplicated hardware or provisioning code). Hostname and management IP are
  pre-filled (IP defaults to the discovered address) and editable before
  confirming; imported discoveries are marked IMPORTED and linked to the new
  device.

### F3 — Initial Collection Workflow

- After onboarding (Discovery import and the Provisioning wizard), an obvious
  **Finish & Collect / Install & Collect** action runs the first inventory
  collection immediately, reusing the existing per-device refresh. Collection
  stays manual — no scheduled collection was added.

### F4 — Inventory Drift Detection

- `GET /api/devices/{id}/drift` compares a device's two most recent
  **successful** snapshots and reports added / removed / changed hardware per
  section — Firmware/BIOS, CPU, Memory, Storage, NIC, Network, and serial
  numbers. A new **Drift** tab on Device Detail shows the differences.

### F5 — Lifecycle Management

- Admin-configurable retention per category (`collector_runs`, `snapshots`,
  `discovery`) via `GET/PATCH /api/lifecycle/policies`, disabled by default.
- `POST /api/lifecycle/cleanup` runs cleanup on demand; enabled policies are
  also applied automatically by the existing background scheduler (no new
  scheduler introduced). **Current inventory is always preserved** — the latest
  snapshot per device is never deleted regardless of age.
- New **Lifecycle & Retention** admin page.

### F6 — Firmware Compliance

- `GET /api/device-templates/{id}/compliance` compares firmware across every
  device using a template, treats the most common version per component as the
  baseline, and flags mismatches. A **Firmware Compliance** dialog on the
  Device Templates page shows per-component, per-device status.

### Schema

- Migration 0008 (additive): `discovered_devices` and `retention_policies`
  tables. No existing table changed. Retention rows are seeded (disabled) on
  startup.

### Upgrade notes

- `docker compose` up/pull the 1.2.0 images. Migration 0008 runs automatically.
- New optional Python dependency `pysnmp` (bundled in the backend image) enables
  SNMP Discovery.
- Default image tag is now `1.2.0`.

## 1.1.3 (2026-07-08)

Final stabilization patch before 1.2.0. Correctness, consistency and
integrity fixes across the rack-placement and provisioning workflows. No
breaking API changes, no model redesign; all existing data remains valid. One
data-safe migration (0007) cleans up records stranded by an older bug.

### Rack placement (Required Fix 1) — bugs fixed

- **Orphan rack placements corrupted the layout.** `rack_units.device_id` is
  `ON DELETE SET NULL`, so deleting an Installed Device left its rack_unit
  behind with a NULL device — permanently occupying its U slot and rendering a
  dead cell that no device could be placed into. `delete_device` now removes
  the placement, and **migration 0007** purges any orphans left by older
  versions. Result: deleting a device frees its U immediately.
- **Overlap check skipped orphan/NULL rows.** `move_device` excluded the
  device's own unit with `RackUnit.device_id != device_id`, which in SQL also
  excludes NULL-device rows — so a stranded slot both blocked moves and could
  raise a 500 on the unique `(rack_id, u_position)` constraint. Overlap now
  excludes the device's own unit by its **unit id**.
- **`create_device` performed no placement validation.** Creating a device at
  an occupied U raised an opaque 500 (unique-constraint violation) and rack
  height was never checked. It now returns a meaningful 422, consistent with
  `move_device` and bulk creation.
- All three placement paths (create / move / bulk) now share one
  `placement_service` (rack-height + overlap), removing duplicated,
  divergent logic.

### Bulk provisioning (Required Fix 2)

- Added **duplicate-IP validation** within a batch (Management IP and iLO IP);
  conflicts are reported and the whole batch rolls back, matching the existing
  duplicate-hostname behavior. The provisioning wizard now also flags duplicate
  hostnames/IPs client-side before submission.

### Data & business-logic integrity (Required Fix 4/5)

- **PATCH could strand placements.** Moving a device to another rack via
  `PATCH /api/devices/{id}` left its rack_unit in the old rack. The update now
  clears the stale placement (device becomes unplaced until re-positioned).
- **Hostname uniqueness is now enforced consistently.** Single-device create
  and update reject a duplicate hostname within the same rack (409) — bulk
  already did this.
- **Template references are validated on update.** `PATCH` with a non-existent
  `template_id` now returns 422 instead of failing at the database.
- Deleting a template in use remains blocked; deleting a rack still cascades to
  its devices and placements (no orphans).

### Frontend / backend consistency (Required Fix 3) & UI polish (Required Fix 6)

- Removed duplicated placement logic; validation errors are now meaningful
  (422 with a clear message) instead of generic 500s.
- Provisioning wizard: client-side duplicate hostname/IP guards with inline
  messages and a disabled Install button until resolved.

### Upgrade notes

- `docker compose` up/pull the 1.1.3 images. Migration 0007 runs automatically
  and is data-safe (removes only NULL-device orphan rack_units).
- Default image tag is now `1.1.3`.

## 1.1.2 (2026-07-08)

Patch release focused on administrator provisioning productivity. No database
changes, no model changes, no breaking API changes — the 1.1.1 Device Template
/ Installed Device model and the drag-and-drop rack editor are untouched.

### Provisioning wizard (P1–P5)

A two-step **"Provision Multiple Devices"** wizard replaces the simple bulk
dialog on the Installed Devices page:

1. **Setup** — pick a Device Template, quantity, hostname prefix, an optional
   **Default Credential**, and choose Manual or Generate-Sequential mode for
   Management IP and iLO IP (with a start address each).
2. **Review** — an editable table (Hostname, Management IP, iLO IP, Credential,
   Rack Position U) pre-filled with generated values. **Every cell is
   editable**; rows can be removed. Confirm installs all rows in one request.

- **Automatic hostnames** (P2): prefix + sequential number → `worker-1`,
  `worker-2`, … editable per row.
- **Optional sequential IPs** (P3): Management IP / iLO IP can be generated
  from a start address (`10.10.1.100`, `10.10.1.101`, …) or entered manually;
  generation never forces sequential addressing and every address stays
  editable.
- **Default credential** (P5): applied to every generated row, overridable per
  row.
- **Rack placement** (P4/P6): the U column is optional. Left blank, devices are
  installed unplaced and positioned later with the existing drag-and-drop rack
  editor (unchanged). If a U is provided, placement is validated (rack height +
  overlap) and the whole batch rolls back on conflict so the table can be
  fixed.

### API

- `POST /api/devices/bulk` gains an optional `items` array of per-row specs
  (hostname, management_ip, ilo_ip, credential ids, u_position). Without
  `items`, the 1.1.1 prefix/hostnames behavior is unchanged — fully backward
  compatible. `quantity` is now optional (only required for prefix mode).

### Upgrade notes

- No migration required. `docker compose` up/pull the 1.1.2 images.
- Default image tag is now `1.1.2`.

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
