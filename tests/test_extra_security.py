import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from services.local_api.main import app


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def test_cors_localhost_allowed(client):
    resp = client.get("/health", headers={"Origin": "http://localhost:1420"})
    value = resp.headers.get("access-control-allow-origin")
    assert value == "http://localhost:1420"


def test_cors_evil_origin_denied(client):
    resp = client.get("/health", headers={"Origin": "https://evil.example"})
    value = resp.headers.get("access-control-allow-origin")
    assert value is None


def test_login_rate_limit(client):
    username = f"ratelimit_{time.time_ns() % 10000000}"
    codes = []
    for _ in range(6):
        resp = client.post(
            "/auth/login",
            json={"username": username, "password": "wrong"},
        )
        codes.append(resp.status_code)
    assert codes[:5] == [401] * 5
    assert codes[5] == 429


def test_no_literal_api_base_fetch_pattern():
    source = Path(__file__).resolve().parents[1] / "apps/desktop/src/App.tsx"
    text = source.read_text(encoding="utf-8")
    assert "fetch(`API_BASE" not in text
    assert "fetch(`WS_BASE" not in text
