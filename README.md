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
- **Roles** — `ADMIN` manages clusters/racks/devices/users and can refresh;
  `USER` has read-only access to all inventory views.

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

## Configuration

All configuration is environment-driven — see `backend/.env.example`.
Generate a production Fernet key with:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Set `JWT_SECRET_KEY`, `ENCRYPTION_KEY` and `DEFAULT_ADMIN_PASSWORD` before
deploying to a real environment.
