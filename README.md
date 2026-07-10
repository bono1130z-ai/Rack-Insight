# Rack Insight

**Hardware & Firmware Inventory Management System (DCIM Lite)**

A web-based management system for browsing the hardware of HPE servers and
Cisco switches in a datacenter / core-network server room — Rack, Cluster,
Server, Switch, Hardware, Firmware, Network and VM information in one GUI,
without touching iLO or SSH by hand.

## Quick Start

`docker-compose.yml` references **pre-built images only** (no `build:`), so the
images must exist locally first — either built on this machine (internet
required, one time) or loaded from an offline archive (see
[Offline Deployment](#offline-air-gapped-deployment)):

```bash
# Internet-connected machine: build once, then start
docker compose -f docker-compose.yml -f docker-compose.build.yml build
docker compose up -d
```

Then open **http://\<host-ip\>/** in a browser (1920×1080 minimum).

| Item | Default |
|---|---|
| Web UI | `http://<host>/` |
| API docs (Swagger) | `http://<host>/docs` |
| Admin account | `admin` / `admin123!` (change via `DEFAULT_ADMIN_*` env) |

## Architecture

```
Browser ── React + TypeScript (Vite, TailwindCSS, shadcn-style UI, TanStack Query)
   │
 nginx ──► FastAPI (REST, JWT auth)
              │
        Service Layer ──► Collector Layer (async, parallel, plugin-based)
              │                ├── Redfish  (HPE iLO, standard schema)
              │                ├── SSH      (Rocky Linux OS data)
              │                ├── Virsh    (VM inventory)
              │                └── Cisco    (NX-OS / IOS-XE)
              │
        PostgreSQL (Snapshots — collectors never UPDATE, they append)
              │
            Redis (600s TTL cache)
```

### Key policies

- **Snapshot model** — every collector run creates a new `Snapshot`; the UI
  always reads the latest one. Old data is preserved for future history views.
- **Fail-safe** — if all collectors fail (after 3 retries, 10s timeout each),
  no snapshot is created and the previous inventory stays intact; the UI shows
  a "Collector Failed / Last Success" warning with a Retry button.
- **Cache** — reads go Redis → DB → Redis (TTL 600s). Refresh deletes the key,
  re-collects, stores the snapshot and repopulates the cache.
- **Scheduler** — every 30 minutes all online devices are re-collected.
- **Health Score** — Online(+30), Collector success(+20), Power/Fan/Storage/
  Firmware/Sensor OK (+10 each). 95+ Healthy, 80–94 Warning, below Critical.
- **Security** — JWT access/refresh tokens, bcrypt password hashes, iLO/SSH/
  SNMP credentials encrypted at rest (Fernet), secrets never logged or
  returned by the API.
- **Access control (RBAC, 1.2.1)** — authorization flows
  User → User Group → Role Binding → Role → Permissions. Users inherit
  permissions through group membership; built-in **Administrator / Operator /
  Viewer** roles plus custom roles; the sidebar and every action are
  permission-driven. The legacy `ADMIN` role remains a break-glass superuser.

### What's new in 1.2.1 — Access Management (RBAC)

- **Role-Based Access Control** replaces the standalone User Management page.
  Permissions are business-action codes (`cluster.create`, `device.install`,
  `collector.run`, `role.update`, …) bundled into roles, bound to user groups,
  and inherited by users through membership.
- **Centralized authorization** — a single `RequirePermission(code)` guards
  every endpoint (HTTP 403 on denial); no per-controller role checks.
- **Access Management pages** — Users (with display name / email / status /
  group membership), User Groups, Roles, Role Bindings, and a read-only
  Permissions catalog.
- Additive migration (0009); existing admins are auto-migrated into a built-in
  Administrators group. Password hashes are never exposed.

See `docs/RELEASE_NOTES.md` for the full 1.2.1 notes.

### What's new in 1.2.2 — Administration UX & Navigation

- **Grouped, collapsible sidebar** — Dashboard, Inventory, Operations,
  Administration and Access Management sections; expand/collapse state is
  remembered. Menus stay permission-driven and administration pages open
  directly (no drill-down). The Dashboard's operational
  Cluster → Rack → Device flow is unchanged.
- **User Group editor manages roles** — assign roles, members and group info in
  one dialog; the standalone Role Bindings page is gone (the table and APIs
  remain).
- **Role Details page** — click a role to see its permissions, bound user
  groups and effective user count. System roles stay read-only.
- **Permissions** are surfaced only inside the Role editor / Role Details
  (standalone page removed). No backend/RBAC changes; fully compatible with
  1.2.1.

See `docs/RELEASE_NOTES.md` for the full 1.2.2 notes.

### What's new in 1.2.0 — Operational Automation & Discovery

- **SNMP Discovery** — scan IP ranges/CIDRs for SNMP-capable infrastructure;
  discovered devices await approval and are never auto-installed
  (`/api/discovery`).
- **Discovery Import Wizard** — onboard discovered devices into a rack, reusing
  the existing template + bulk-provisioning architecture, with an
  **Install & Collect** step that runs the first collection immediately.
- **Inventory Drift Detection** — a Drift tab comparing the two latest
  successful collections (firmware/BIOS/CPU/memory/storage/NIC/serial).
- **Firmware Compliance** — compare firmware across all devices sharing a
  template and flag mismatches.
- **Lifecycle & Retention** — admin-configurable retention for collector runs,
  snapshot history and discovery cache, with automatic and on-demand cleanup;
  current inventory is always preserved.

See `docs/RELEASE_NOTES.md` for the full 1.2.0 notes.

### What's new in 1.1.3

Stabilization patch. Highlights: deleting a device no longer strands its rack
slot (orphan placements are prevented and cleaned up); placement validation is
consistent across create/move/bulk (meaningful 422s, shared logic); bulk
provisioning validates duplicate IPs; moving a device between racks no longer
strands its placement; hostname uniqueness and template references are enforced
consistently. See `docs/RELEASE_NOTES.md` for the full list of fixes.

### What's new in 1.1.2

- **Provisioning wizard** — a two-step "Provision Multiple Devices" flow:
  choose template / quantity / hostname prefix / default credential and
  optional sequential Management + iLO IP generation, then review and edit
  every row (Hostname, Management IP, iLO IP, Credential, U) before
  installing. Automation fills sensible defaults; every value stays editable.
- `POST /api/devices/bulk` accepts an optional per-row `items` array
  (backward compatible with the 1.1.1 prefix mode).
- The 1.1.1 drag-and-drop rack editor is unchanged and remains the way to
  place devices into U slots.

See `docs/RELEASE_NOTES.md` for the full 1.1.2 notes.

### What's new in 1.1.1

- **Device Templates + Instances** — hardware models (vendor/model/CPU/…) are
  now separate from installed servers; many servers can share one template
  (`/api/device-templates`). Existing devices are migrated automatically.
- **Create Multiple Devices** — install many identical servers at once
  (`POST /api/devices/bulk`, sequential hostnames).
- **Assign / remove from rack** without the spreadsheet editor, plus a
  drag-and-drop 42U rack editor with an "Unplaced devices" palette.
- **"Create Multiple Racks"** — clearer wording for bulk rack creation.

See `docs/RELEASE_NOTES.md` for the full 1.1.1 notes and migration details.

### What's new in 1.1.0

- **Inventory export** — JSON / CSV (zip) / multi-sheet Excel for a device,
  rack, cluster or the entire inventory (`GET /api/export`).
- **Collector failure diagnosis** — categorized error codes
  (AUTH_FAILED, CONNECTION_TIMEOUT, DNS_FAILURE, SSL_ERROR, …) with
  readable messages in the Collector Management UI.
- **Unified status language** — one StatusPill component for
  Healthy/Warning/Critical/Offline/Unknown across every page.
- **Dashboard summary cards** — Total / Online / Warning / Critical /
  Offline device counts (`GET /api/dashboard/summary`).
- **Inventory search** — `GET /api/devices/search` by hostname, serial,
  vendor, model, cluster, rack and status with server-side pagination,
  plus a dedicated Search page.
- **Sensor thresholds** — Redfish upper/lower thresholds displayed per
  sensor when available.
- **Bulk rack creation** — `POST /api/racks/bulk` (prefix + count,
  duplicates skipped gracefully).
- **Audit log** — all admin create/update/delete actions recorded with
  old/new values (`GET /api/audit`, Audit Log admin page).

See `docs/RELEASE_NOTES.md` for details and upgrade notes.

### Admin Console

Administrators get an **Administration** section in the left sidebar and can
complete the entire initial setup from the web UI (no CLI / Swagger needed):

- **Cluster Management** — CRUD with name / site / description, rack &
  device counts, search.
- **Rack Management** — per-cluster rack CRUD (height defaults to 42U),
  delete confirmation.
- **Device Management** — register servers/switches with vendor, model,
  management IP, start U, height, orientation, collector types
  (Redfish / SSH / Cisco) and stored-credential selection. Devices can be
  repositioned by U selection or by drag & drop on the 42U rack view.
- **Access Management (RBAC)** — Users (display name / email / status / group
  membership), User Groups (members **and** role assignment in one editor),
  and Roles (Administrator / Operator / Viewer + custom) with a Role Details
  page. Permissions are managed inside the Role editor. Menus and actions are
  permission-driven.
- **Credential Management** — named Redfish / SSH / SNMP credentials,
  encrypted at rest and never displayed after saving.
- **Collector Management** — per-device Collect Now, last success/failure,
  health score, last snapshot time and a per-device run log.

> Schema note: all schema changes ship as Alembic migrations and are applied
> automatically at startup — existing databases (including ones created by
> older versions before Alembic was introduced) are upgraded in place with
> data preserved. See "Database migrations" below.

## Offline (Air-gapped) Deployment

### 변경 이유 (Why)

데이터센터 / 통신사 Core Network 서버실은 대부분 인터넷이 차단된
**폐쇄망**입니다. 기존 구성처럼 `docker-compose.yml`에 `build:`가 있으면
`docker compose up -d` 시점에 base image pull, `pip install`, `npm install`이
필요해 폐쇄망에서는 기동이 불가능합니다.

이를 해결하기 위해 다음과 같이 변경했습니다.

1. **`docker-compose.yml`은 `image:`만 사용** — 폐쇄망 호스트에서는 빌드가
   전혀 일어나지 않으며, `docker load`로 적재된 이미지를 그대로 실행합니다.
2. **빌드는 인터넷 환경 전용 override로 분리** — `docker-compose.build.yml`
   (pip/npm 의존성 설치는 모두 이 빌드 시점에 이미지 안에 포함됨).
3. **Backend/Frontend 이미지는 self-contained** — 컨테이너 런타임에 pip,
   npm, 외부 레지스트리 접근이 일절 없습니다. Frontend는 multi-stage 빌드로
   nginx + 정적 파일만 남습니다.
4. **`docker save` / `docker load` 스크립트 제공** — `scripts/offline/`.

### 배포 절차 (Procedure)

**1단계 — 인터넷 환경에서 이미지 빌드 & export:**

```bash
./scripts/offline/build_and_export.sh 0.1.0
```

이 스크립트는 다음을 수행합니다.

- `rack-insight-backend:0.1.0`, `rack-insight-frontend:0.1.0` 빌드
- 인프라 이미지 pull (`postgres:17-alpine`, `redis:7-alpine`, `nginx:1.27-alpine`)
- 5개 이미지 전체를 `dist/rack-insight-images-0.1.0.tar.gz`로 `docker save`
- 실행에 필요한 파일(compose, nginx 설정, env 예시, load 스크립트)을
  `dist/rack-insight-deploy-0.1.0.tar.gz`로 패키징

**2단계 — 두 아카이브를 폐쇄망으로 반입** (USB, 반입 서버 등):

```
rack-insight-images-0.1.0.tar.gz
rack-insight-deploy-0.1.0.tar.gz
```

**3단계 — 폐쇄망(Linux) 호스트에서 load & 기동:**

```bash
tar -xzf rack-insight-deploy-0.1.0.tar.gz
./scripts/offline/load_images.sh rack-insight-images-0.1.0.tar.gz
docker compose up -d          # 인터넷 접속 없이 기동
```

버전 태그를 바꿔 빌드한 경우 `IMAGE_TAG`로 지정합니다
(`IMAGE_TAG=0.2.0 docker compose up -d`). 이미지 이름 prefix는
`IMAGE_PREFIX`(기본 `rack-insight`)로 변경할 수 있습니다.

> 사전 요구사항: 폐쇄망 호스트에 Docker Engine + Docker Compose v2가 설치되어
> 있어야 합니다(이 부분만은 OS 패키지 반입 등으로 별도 준비). 이후의 모든
> 애플리케이션 구동은 인터넷 없이 동작합니다.

## Repository layout

```
backend/    FastAPI app: api/ auth/ cache/ collectors/ config/ database/
            models/ repositories/ schemas/ scheduler/ services/ tests/ utils/
frontend/   React app: pages/ layouts/ components/ features/ hooks/
            services/ stores/ types/ utils/
docker/     nginx reverse-proxy config
scripts/    offline build/export & load scripts (air-gapped deployment)
```

## Development

Backend (Python 3.13):

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env      # adjust DATABASE_URL / REDIS_URL
uvicorn main:app --reload
pytest tests/
```

Frontend (Node 22):

```bash
cd frontend
npm install
npm run dev                # proxies /api to http://localhost:8000
```

### Database migrations (Alembic)

The schema is managed **exclusively by Alembic** — the app never calls
`create_all`. On startup the backend runs `alembic upgrade head`
automatically, so containers always run against a schema matching their code
version. Legacy databases created by pre-Alembic versions are detected and
adopted in place (stamped at the matching revision, then upgraded — e.g.
`ALTER TABLE clusters ADD COLUMN site VARCHAR(255)` is applied without data
loss).

**Whenever you change a model you MUST create a migration:**

```bash
cd backend
alembic revision --autogenerate -m "describe the change"
alembic upgrade head       # apply locally (startup also applies it)
pytest tests/              # test_migrations.py fails if models drift
```

`tests/test_migrations.py` compares the migrated schema against the model
metadata and fails the build when a model change ships without a migration;
it also verifies every migration can downgrade and re-upgrade.

**Running Alembic inside Docker:** use the compose network so the `postgres`
hostname resolves — a standalone `docker run` has no access to it and fails
with `Name or service not known`:

```bash
docker compose exec backend alembic current      # correct
docker run --rm -it rack-insight-backend:0.1.0 \
  alembic current                                # wrong: not on the network
```

To inspect the schema state or logs when the backend restarts on boot:

```bash
docker logs rack-insight-backend-1 --tail 50
docker compose exec postgres psql -U rackinsight -c '\d clusters'
```

## Configuration

All configuration is environment-driven — see `backend/.env.example`.
Generate a production Fernet key with:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Set `JWT_SECRET_KEY`, `ENCRYPTION_KEY` and `DEFAULT_ADMIN_PASSWORD` before
deploying to a real environment.
