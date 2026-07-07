# Release Notes

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
