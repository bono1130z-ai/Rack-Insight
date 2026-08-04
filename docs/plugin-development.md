# Rack Insight — Plugin Developer Guide

This is the official guide for building a Rack Insight **Plugin**. The goal of
the Plugin Architecture is that you can add a new feature as an **independent
backend service** — a separate container — **without modifying Rack Insight
Core**. You implement a small HTTP contract, register your service, and the Core
discovers, health-checks, and proxies to it.

> Status: **Foundation** (v1). This release delivers the backend Plugin
> Registry, Contract, health monitoring, a REST proxy foundation, an Example
> Plugin, and frontend discovery. Dynamic UI injection (Module Federation,
> runtime bundles, iframes) is explicitly **out of scope** and reserved for a
> later release.

---

## 1. What is a Plugin?

A Plugin is a standalone backend service (its own image/container) that:

- implements the **Plugin Contract** (a few HTTP endpoints), and
- is reachable from the Core by a stable URL (a Docker/Kubernetes **Service DNS
  name**, e.g. `http://example-plugin:8080` — never `localhost`).

The Core never runs plugin code in-process. It only talks HTTP to your plugin.

```
                Rack Insight Core
        Auth / RBAC / Inventory / Alerts / Audit
                 Plugin Registry + Proxy
                          │
                   Plugin Contract
        ┌─────────────────┼─────────────────┐
   Example Plugin      Plugin B           Plugin C
     (container)      (container)        (container)
```

## 2. Architecture & responsibilities

| Layer     | Responsibility |
| --------- | -------------- |
| **Core**  | Registry, configuration, health checks, metadata, status, permission checks, proxy, audit, DB persistence |
| **Plugin**| Manifest, health/ready, plugin-specific API |
| **Frontend** | Plugin list, status, detail, enable/disable, health-check action, error display |

## 3. Manifest specification

Your plugin MUST serve `GET /plugin/manifest` returning JSON. camelCase is the
wire convention (snake_case is also accepted). Unknown fields are ignored, so
newer plugins never break an older Core.

```json
{
  "name": "example-plugin",
  "displayName": "Example Plugin",
  "version": "1.0.0",
  "apiVersion": "v1",
  "description": "Example plugin",
  "healthEndpoint": "/healthz",
  "readyEndpoint": "/readyz",
  "manifestEndpoint": "/plugin/manifest",

  "routes": [],
  "permissions": [],
  "menus": []
}
```

- `name` — technical id, unique across plugins.
- `version` — **your plugin's** version (e.g. `1.4.2`).
- `apiVersion` — the **contract** version (`v1`). See §15.
- `routes` / `permissions` / `menus` — reserved for future dynamic extension;
  declare them now if you like, but the Core does not consume them yet.

## 4. Required endpoints

| Endpoint               | Purpose                                        |
| ---------------------- | ---------------------------------------------- |
| `GET /plugin/manifest` | The contract (above).                          |
| `GET /healthz`         | Liveness. `200` = alive.                       |
| `GET /readyz`          | Readiness. `200` = ready to serve.             |
| `GET /api/...`         | Your plugin-specific API.                      |

See `plugins/example-plugin/app.py` for a complete, minimal implementation.

## 5. Health check

The Core health-monitors every registered plugin on a short interval
(`PLUGIN_HEALTH_INTERVAL_SECONDS`, default 60s) and on demand. Status values:

```
HEALTHY     health endpoint returned 2xx
UNHEALTHY   unreachable / timeout / non-2xx
UNKNOWN     not yet checked
DISABLED    administratively disabled
```

**A plugin being UNHEALTHY never affects the Core.** All plugin calls are
timeout-bounded (`PLUGIN_REQUEST_TIMEOUT_SECONDS`, default 5s) and failures are
isolated.

## 6. API version

`apiVersion` describes the **contract**, not your build. The current contract is
`v1`. When the Core introduces a breaking contract change it will support `v1`
and `v2` side by side; you migrate when ready.

Keep these distinct:

```
Plugin Version : 1.4.2     (your service)
API Version    : v1        (the Core contract you implement)
```

## 7. Permission naming

Plugins live behind the Core's authentication and RBAC. The Core exposes three
core permissions:

- `plugin.view` — see the registry/status
- `plugin.manage` — register / enable / disable / remove
- `plugin.proxy` — call plugin APIs through the Core proxy

For plugin-specific permissions, use the reserved namespace
`plugin.<name>.<action>`, e.g. `plugin.example.view`, `plugin.example.manage`.
Declare them in your manifest's `permissions` list. (Automatic seeding of
plugin-declared permissions is a future enhancement; today the proxy is gated by
the core `plugin.proxy` permission.)

## 8. Dockerfile

Build a self-contained image (no runtime internet access), mirroring the Core:

```dockerfile
FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8080
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
```

## 9. Local development

```bash
cd plugins/example-plugin
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8080
curl localhost:8080/plugin/manifest
```

## 10. Docker Compose integration

Add your plugin as a service and register it with the Core via config.

```yaml
# docker-compose.yml
  example-plugin:
    image: rack-insight-plugin-example:1.4.0
    healthcheck:
      test: ["CMD","python","-c","import urllib.request;urllib.request.urlopen('http://127.0.0.1:8080/healthz',timeout=3)"]
    restart: unless-stopped
```

The Core does **not** `depends_on` any plugin (failure isolation). Register the
plugin by editing `deploy/local/plugins.json` (mounted into the backend as
`PLUGINS_CONFIG_FILE=/config/plugins.json`):

```json
[
  { "name": "example-plugin", "endpoint": "http://example-plugin:8080", "enabled": true }
]
```

## 11. Kubernetes deployment (the official path)

The reference plugin ships as `deploy/kubernetes/base/plugins/example-plugin.yaml`
(Deployment + Service); registration is via the shared plugins ConfigMap
`deploy/kubernetes/base/config/plugins-configmap.yaml` (mounted into the backend
as `PLUGINS_CONFIG_FILE`). The Core reaches the plugin at its **Service DNS**
name `http://<plugin>:8080` — identical to compose — so nothing in the Core
changes between environments. Scale replicas freely; the Service load-balances.

For your own plugin, add a Deployment + Service (copy the example) into the
Kustomize base (or its own manifest) and add an entry to the plugins ConfigMap.

### Plugin lifecycle (end to end)

```
1. Copy plugins/example-plugin as a template
2. Write your plugin code (implement the contract §3–4)
3. docker build your image
4. Local test (uvicorn / docker; curl /plugin/manifest, /healthz)
5. Add k8s Deployment+Service manifest + a plugins-ConfigMap entry
6. git push to a feature/* branch
7. Open a Pull Request  → CI builds & tests (no deploy)
8. Merge to main        → CI builds & pushes your image (commit-SHA tag)
9. CI updates the overlay image tags (GitOps commit on main)
10. ArgoCD (tracks main) detects the change
11. ArgoCD syncs the cluster
12. Your plugin is deployed; the Core registers and health-checks it
```

Every plugin container must provide, per the contract: **Health** (`/healthz`,
`/readyz`), an **API**, a **Manifest** (`/plugin/manifest`), and a **Version**
(distinct from `apiVersion`). See §4–6.

## 12. Registering a plugin

Two equivalent ways:

1. **Configuration (recommended, air-gap friendly).** Add an entry to
   `PLUGINS_CONFIG` (inline JSON) or `PLUGINS_CONFIG_FILE` (a JSON file /
   ConfigMap). Config-declared plugins are re-seeded on every Core start.
2. **API / UI.** `POST /api/plugins` (or **Administration → Plugins → Register
   Plugin**) with `{ "name", "endpoint" }`.

The Core fetches your manifest on registration to fill in version / api version
/ display name.

## 13. Core API proxy usage

The browser never calls a plugin directly. The Core authenticates the user,
checks `plugin.proxy`, and forwards a minimal REST request (GET/POST):

```
GET  /api/plugins/{name}/proxy/{path}
POST /api/plugins/{name}/proxy/{path}
```

Example:

```
GET /api/plugins/example-plugin/proxy/api/status
        ↓  (Core auth + plugin.proxy)
GET http://example-plugin:8080/api/status
```

The Core does **not** forward its JWT to the plugin. If the plugin is unknown →
`404`; disabled or unreachable → `503` (never a Core `500` or a hang).

## 14. Error handling

- Return correct HTTP status codes from your endpoints; the proxy relays them.
- Keep endpoints fast; the Core enforces a request timeout.
- Never assume the Core forwards auth — treat the network boundary as the Core's
  responsibility for this contract version.

## 15. Versioning

- Bump your **plugin version** on every release.
- Keep serving `apiVersion: v1` until the Core announces `v2`.
- Manifest is forward-compatible: adding fields never breaks an older Core.

## 16. Logging

Log to stdout (12-factor); the container runtime collects it. Never log secrets.

## 17. Air-gapped deployment

- Build your plugin image on an internet-connected machine; the resulting image
  must run with **no** runtime internet access (pin dependencies, no runtime
  downloads).
- Ship the image inside the Rack Insight offline bundle
  (`deploy/offline/build_and_export.sh` builds and exports plugin images too).
- Registration uses local configuration only — no external service discovery.

```
RackInsight Bundle
├── Core / Frontend images
├── Plugin images
├── deploy/local/plugins.json, deploy/kubernetes/*
├── docker-compose.yml
└── load/install scripts
```

## 18. Future extension points (reserved, not in this release)

- Plugin-declared **permissions** auto-seeded into RBAC.
- Plugin-declared **menus/routes** surfaced dynamically in the frontend.
- **Plugin events → Core Event Contract → Alert Engine** (a plugin emits an
  event; the Core's Event/Alert pipeline turns it into an alert). The event
  model already tolerates unknown/`plugin.*` event types — `AlertPolicy` maps
  unrecognized types to the `Other` category — so the ingestion path can be
  added without a contract change.
