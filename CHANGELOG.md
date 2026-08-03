# Changelog

All notable changes to Rack Insight. See `docs/RELEASE_NOTES.md` for the full
notes of each release.

## [1.3.1] - 2026-07-10 — Alert Engine responsibility split

Maintainability patch. Same architecture and behaviour as 1.3.0; the Alert
Engine is now a thin orchestrator with the business rules extracted into small
pure helpers. Additive migration 0011; backward compatible.

### Added
- **AlertPolicy** (`services/alert_policy.py`) — pure mapping from an Event to
  its alert behaviour (category, severity, auto-resolve). No DB, no side
  effects; future severity rules have a single home.
- **AlertBuilder** (`services/alert_builder.py`) — constructs the Alert model
  only. No resolve/dedupe/history/DB access.
- **Alert category** now distinct from event type: `Alert.event_type` (what
  happened) + `Alert.category` (operational domain: Hardware, Firmware,
  Connectivity, Collector, Credential, Health). The UI filters by category; the
  event type is shown per row. Alerts API gains an `event_type` filter and
  returns both fields.
- **Event.subject** — the Event Engine records what changed (sensor name, DIMM
  slot, firmware component…); the Alert Engine reuses it instead of parsing
  JSON details.

### Changed
- Alert Engine reduced to orchestration: persist events → resolve counterparts
  → dedupe → AlertPolicy → AlertBuilder → persist → record history. Lifecycle
  queries key off `event_type` (was `category`).
- Migration 0011 backfills existing alerts (`event_type = category`, then
  reclassifies `category` to the operational domain).

### Preserved
- One event → one alert; recovery events create already-resolved INFO alerts;
  Hardware/Firmware alerts require manual resolve; state alerts auto-resolve;
  active state alerts deduplicated; history immutable; existing APIs unchanged.

## [1.3.0] - 2026-07-10 — Operations & Alert Center

### Added
- Operations pipeline: Collector → Inventory Snapshot → **Event Engine** →
  **Alert Engine** → Frontend. The collector only stores snapshots; the Event
  Engine compares snapshot N-1 vs N and is the only producer of events; the
  Alert Engine owns the alert lifecycle.
- Event types: HardwareChanged, FirmwareChanged, DeviceOffline,
  DeviceRecovered, SensorThresholdExceeded, SensorRecovered, CollectorFailed,
  CredentialFailed, NetworkReachabilityChanged (extensible).
- Alerts: INFO/WARNING/CRITICAL, ACTIVE/RESOLVED. Hardware/Firmware alerts
  resolve manually; state alerts auto-resolve on recovery. Configurable
  consecutive-failure threshold (default 3).
- Permanent, immutable **Device History** (firmware upgrades, hardware
  replacements, collector failures, manual resolves).
- Health model: `GET /api/devices/{id}/health` (overall health, sensor
  groups, storage/memory/network health, health timeline) + Device Detail
  **Health** tab.
- **Alert Center** UI: top-level Alerts section (Alerts + History pages),
  filterable alert table, header notification bell with unread count
  (UI-only notifications), reusable AlertSeverityBadge / AlertStatusBadge /
  Timeline / **DiffViewer** / HistoryCard / HealthSummaryCard components.
- Operations dashboard: alert cards, latest alerts, critical devices, recent
  hardware/firmware changes (cluster browsing unchanged).
- APIs: /api/alerts, /api/alerts/{id}, /api/alerts/{id}/resolve,
  /api/history, /api/history/device/{id}, /api/dashboard/alerts,
  /api/dashboard/health, /api/lifecycle/alert-settings.
- Retention categories `resolved_alerts` and `history` (history ships
  disabled = permanent). Migration 0010 (additive).
- RBAC permissions `alert.view`, `alert.resolve`, `history.view`.

### Changed
- Dashboard is operations-first; Device Detail tabs are Overview / Health /
  Hardware / Firmware / Network / Storage / VM / History.
- Background scheduler retries all enabled devices (not only ONLINE) and runs
  the full pipeline.

### Removed
- Drift UI (Drift tab). Hardware changes are Alerts; History stores the
  permanent record. The `/api/devices/{id}/drift` endpoint remains for
  backward compatibility.

## [1.2.2] - 2026-07-10 — Administration UX & Navigation

- Grouped, collapsible sidebar (Inventory / Operations / Administration /
  Access Management) with persisted expand state.
- Role assignment moved into the User Group editor; standalone Role Bindings
  page removed (table + APIs preserved).
- Role Details page (permissions, bound groups, effective user count).
- Standalone Permissions page removed (permissions live in the Role editor).

## [1.2.1] - 2026-07-10 — Access Management (RBAC)

- Full RBAC: User → User Group → Role Binding → Role → Permissions.
- System roles Administrator / Operator / Viewer + custom roles; centralized
  `RequirePermission` guard (HTTP 403); permission-driven sidebar and routes.
- Users extended with display name / email / status. Migration 0009.

## [1.2.0] - 2026-07-08 — Operational Automation & Discovery

- SNMP Discovery + Import Wizard, Initial Collection, Inventory Drift
  Detection, Firmware Compliance, Lifecycle & Retention. Migration 0008.

## [1.1.3] - Stabilization patch

- Rack placement integrity fixes (orphan units, overlap validation), bulk
  provisioning validation, hostname/template consistency.

## [1.1.2] - Provisioning wizard

- Bulk provisioning wizard with editable review table, hostname generation,
  sequential IPs, default credentials.

## [1.1.1] - Device Templates

- Device model split into Device Template + Rack Device Instance
  (migration 0006), bulk install, rack drag & drop preserved.

## [1.1.0] - Admin & operations features

- Export (JSON/CSV/XLSX), collector diagnostics, unified status model,
  dashboard, inventory search, sensor thresholds, bulk racks, audit log.

## [1.0.x] - Initial releases

- Inventory MVP: clusters/racks/devices, Redfish/SSH/virsh/Cisco collectors,
  snapshot-based inventory, JWT auth, air-gapped deployment, Admin Console,
  Alembic migration framework.
