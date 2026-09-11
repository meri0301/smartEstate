from datetime import datetime

from fastapi.testclient import TestClient

from app import SERVICE_VERSION
from app.main import create_app


def test_health_returns_ok_payload():
    client = TestClient(create_app())

    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "ml"
    assert body["version"] == SERVICE_VERSION
    # Must be a parseable ISO-8601 timestamp.
    datetime.fromisoformat(body["timestamp"])


def test_unknown_route_returns_404():
    client = TestClient(create_app())

    response = client.get("/does-not-exist")

    assert response.status_code == 404
