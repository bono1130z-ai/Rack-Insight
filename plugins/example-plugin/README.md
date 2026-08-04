# Rack Insight — Example Plugin

A minimal, standalone reference plugin. It shares no code with the Core and runs
in its own container. Use it as the starting point for a new plugin — see
[`docs/plugin-development.md`](../../docs/plugin-development.md) for the full
contract.

## Endpoints (the Plugin Contract)

| Endpoint            | Purpose                                  |
| ------------------- | ---------------------------------------- |
| `GET /plugin/manifest` | Plugin metadata (name, version, api version, health/ready paths) |
| `GET /healthz`      | Liveness (200 = alive)                   |
| `GET /readyz`       | Readiness (200 = ready)                  |
| `GET /api/status`   | Example plugin-specific API              |
| `POST /api/echo`    | Example POST endpoint (echoes its body)  |

## Local development

```bash
cd plugins/example-plugin
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8080
curl localhost:8080/plugin/manifest
```

## Build (internet-connected machine)

```bash
docker build -t rack-insight-plugin-example:1.4.0 plugins/example-plugin
```

## Run with the Core (docker compose)

The Core registers this plugin via `PLUGINS_CONFIG` and reaches it at the
Docker/Kubernetes service DNS name `http://example-plugin:8080` — never
`localhost`. Bring the whole stack up with:

```bash
docker compose up -d
```

Then, in the Rack Insight UI, open **Administration → Plugins**.

## Call it through the Core proxy

The browser never talks to the plugin directly. The Core authenticates the user
and forwards the request:

```
GET /api/plugins/example-plugin/proxy/api/status
        ↓  (Core auth + plugin.proxy permission)
GET http://example-plugin:8080/api/status
```
