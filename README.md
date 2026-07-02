# Rack Insight

**Hardware & Firmware Inventory Management System (DCIM Lite)**

A web-based management system for browsing the hardware of HPE servers and
Cisco switches in a datacenter / core-network server room — Rack, Cluster,
Server, Switch, Hardware, Firmware, Network and VM information in one GUI,
without touching iLO or SSH by hand.

## Quick Start

```bash
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
- **Roles** — `ADMIN` manages clusters/racks/devices/users and can refresh;
  `USER` has read-only access to all inventory views.

## Repository layout

```
backend/    FastAPI app: api/ auth/ cache/ collectors/ config/ database/
            models/ repositories/ schemas/ scheduler/ services/ tests/ utils/
frontend/   React app: pages/ layouts/ components/ features/ hooks/
            services/ stores/ types/ utils/
docker/     nginx reverse-proxy config
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

## Configuration

All configuration is environment-driven — see `backend/.env.example`.
Generate a production Fernet key with:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Set `JWT_SECRET_KEY`, `ENCRYPTION_KEY` and `DEFAULT_ADMIN_PASSWORD` before
deploying to a real environment.
