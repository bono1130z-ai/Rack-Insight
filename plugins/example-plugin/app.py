"""Rack Insight — Example Plugin.

A minimal, fully independent backend service that implements the Rack Insight
Plugin Contract. It shares NO code with the Core: it is a standalone container
that the Core registers, health-checks, and proxies to.

Contract endpoints:
    GET /plugin/manifest   -> plugin metadata (the contract)
    GET /healthz           -> liveness  (200 = alive)
    GET /readyz            -> readiness (200 = ready to serve)
    GET /api/status        -> a trivial plugin-specific API

Copy this directory as the starting point for a new plugin. See
docs/plugin-development.md.
"""
import os

from fastapi import FastAPI

PLUGIN_NAME = os.environ.get("PLUGIN_NAME", "example-plugin")
PLUGIN_VERSION = os.environ.get("PLUGIN_VERSION", "1.0.0")
API_VERSION = "v1"

app = FastAPI(title="Rack Insight Example Plugin", version=PLUGIN_VERSION)


MANIFEST = {
    "name": PLUGIN_NAME,
    "displayName": "Example Plugin",
    "version": PLUGIN_VERSION,
    "apiVersion": API_VERSION,
    "description": "Reference plugin demonstrating the Rack Insight Plugin Contract.",
    "healthEndpoint": "/healthz",
    "readyEndpoint": "/readyz",
    "manifestEndpoint": "/plugin/manifest",
    # Reserved for future dynamic extension (not consumed by the Core yet).
    "routes": [{"method": "GET", "path": "/api/status"}],
    "permissions": ["plugin.example.view"],
    "menus": [],
}


@app.get("/plugin/manifest")
def manifest() -> dict:
    return MANIFEST


@app.get("/healthz")
def healthz() -> dict:
    return {"status": "healthy"}


@app.get("/readyz")
def readyz() -> dict:
    return {"status": "ready"}


@app.get("/api/status")
def status() -> dict:
    return {"plugin": PLUGIN_NAME, "status": "running", "version": PLUGIN_VERSION}


@app.post("/api/echo")
def echo(payload: dict | None = None) -> dict:
    """Demonstrates POST proxying: returns whatever it is sent."""
    return {"plugin": PLUGIN_NAME, "echo": payload or {}}
