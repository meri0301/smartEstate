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


def test_start_up_survives_a_model_directory_that_does_not_exist(tmp_path, monkeypatch):
    """
    The service must come up without an artefact.

    Refusing to start would take the whole compose stack down whenever a model
    had not been trained yet, which is the normal state of a fresh checkout.
    """
    from app.config import get_settings
    from app.main import load_valuation_model

    monkeypatch.setattr(get_settings(), "model_dir", tmp_path / "missing", raising=False)
    app = create_app()
    load_valuation_model(app, tmp_path / "missing")

    assert app.state.valuation_model is None
    assert app.state.valuation_model_error is not None
