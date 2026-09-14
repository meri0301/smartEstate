"""
The HTTP surface, including how it behaves with no model.

A service that cannot value anything still has to answer clearly: the brief's
guardrail is that a missing model or a dead dependency must never surface as a
blank page or an unhandled error anywhere in the product, and that starts here.
"""

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.pipelines.artifact import ModelMetadata, load_artifact, save_artifact
from app.pipelines.evaluate import QUANTILE_HIGH, QUANTILE_LOW, fit_booster
from app.pipelines.features import (
    FEATURE_COLUMNS,
    MARKET_REFERENCE_YEAR,
    build_feature_frame,
    price_per_sqm,
    to_log_target,
)
from app.pipelines.valuation import ValuationModel

FAST_ROUNDS = 40


def payload(**overrides):
    body = {
        "totalArea": 72.0,
        "rooms": 3,
        "floor": 4,
        "totalFloors": 9,
        "constructionYear": 1986,
        "districtSlug": "arabkir",
        "buildingType": "STONE",
        "condition": "GOOD",
        "heating": "CENTRAL_GAS",
        "ownershipDocs": "VERIFIED",
        "lat": 40.2,
        "lon": 44.5,
        "hasElevator": True,
    }
    body.update(overrides)
    return body


@pytest.fixture(scope="module")
def model_dir(tmp_path_factory, synthetic_rows, districts):
    rows = synthetic_rows
    frame = build_feature_frame(rows, districts)
    prices = np.array([row["price_amd"] for row in rows], dtype="float64")
    areas = np.array([row["total_area"] for row in rows], dtype="float64")
    target = np.asarray(to_log_target(price_per_sqm(prices, areas)))

    directory = tmp_path_factory.mktemp("api-artifact")
    save_artifact(
        directory,
        fit_booster(frame, target, num_boost_round=FAST_ROUNDS),
        fit_booster(
            frame, target, objective="quantile", alpha=QUANTILE_LOW, num_boost_round=FAST_ROUNDS
        ),
        fit_booster(
            frame, target, objective="quantile", alpha=QUANTILE_HIGH, num_boost_round=FAST_ROUNDS
        ),
        ModelMetadata(
            model_version="valuation-lgbm-api-test",
            trained_at="2026-09-14T00:00:00+00:00",
            feature_columns=FEATURE_COLUMNS,
            districts=districts,
            market_reference_year=MARKET_REFERENCE_YEAR,
            target="log_price_per_sqm_amd",
            quantiles=(QUANTILE_LOW, QUANTILE_HIGH),
            interval_log_offset=0.0,
            target_coverage=0.8,
            training_rows=len(rows),
            dataset_fingerprint="b" * 64,
            lightgbm_version="test",
            metrics={"random": {"model": {"mape": 0.1}}},
        ),
    )
    return directory


@pytest.fixture
def client(model_dir):
    """A client whose application has a model loaded."""
    from app.main import create_app

    app = create_app()
    with TestClient(app) as started:
        started.app.state.valuation_model = ValuationModel(load_artifact(model_dir))
        started.app.state.valuation_model_error = None
        yield started


@pytest.fixture
def client_without_model():
    """A client whose application found no artefact, which is a supported state."""
    from app.main import create_app

    app = create_app()
    with TestClient(app) as started:
        started.app.state.valuation_model = None
        started.app.state.valuation_model_error = RuntimeError("no model directory at /nowhere")
        yield started


def test_liveness_does_not_depend_on_the_model(client_without_model):
    response = client_without_model.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_readiness_reports_the_loaded_model(client):
    response = client.get("/health/ready")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["modelLoaded"] is True
    assert body["modelVersion"] == "valuation-lgbm-api-test"


def test_readiness_is_degraded_and_explains_itself_without_a_model(client_without_model):
    response = client_without_model.get("/health/ready")

    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "degraded"
    assert body["modelLoaded"] is False
    assert "no model directory" in body["detail"]


def test_predicting_without_a_model_is_unavailable_not_a_crash(client_without_model):
    response = client_without_model.post("/predict", json={"listings": [payload()]})

    assert response.status_code == 503
    assert "ml:train" in response.json()["detail"]


def test_predict_returns_one_estimate_per_listing_in_order(client):
    response = client.post(
        "/predict",
        json={"listings": [payload(totalArea=45.0), payload(totalArea=95.0)]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["modelVersion"] == "valuation-lgbm-api-test"
    assert len(body["estimates"]) == 2
    first, second = body["estimates"]
    assert first["priceAmd"] < second["priceAmd"]
    assert first["lowPriceAmd"] <= first["priceAmd"] <= first["highPriceAmd"]


def test_predict_rejects_an_empty_batch(client):
    response = client.post("/predict", json={"listings": []})

    assert response.status_code == 422


def test_predict_rejects_an_impossible_listing(client):
    response = client.post("/predict", json={"listings": [payload(rooms=0)]})

    assert response.status_code == 422


def test_predict_rejects_a_value_outside_the_shared_vocabulary(client):
    response = client.post("/predict", json={"listings": [payload(buildingType="CASTLE")]})

    assert response.status_code == 422


def test_a_misspelled_feature_is_refused_rather_than_ignored(client):
    body = payload()
    body["totalAreaSqm"] = body.pop("totalArea")

    response = client.post("/predict", json={"listings": [body]})

    assert response.status_code == 422


def test_explain_names_the_features_that_moved_the_estimate(client):
    response = client.post("/explain", json={"listing": payload(), "topK": 3})

    assert response.status_code == 200
    body = response.json()
    assert 1 <= len(body["contributions"]) <= 3
    assert body["baselinePricePerSqmAmd"] > 0
    assert body["deviation"] is None
    assert body["verdict"] is None
    for contribution in body["contributions"]:
        assert contribution["feature"] in FEATURE_COLUMNS
        assert isinstance(contribution["effect"], float)


def test_explain_compares_an_asking_price_when_one_is_given(client):
    estimate = client.post("/predict", json={"listings": [payload()]}).json()["estimates"][0]

    response = client.post(
        "/explain",
        json={"listing": payload(), "askingPriceAmd": estimate["highPriceAmd"] * 2},
    )

    body = response.json()
    expected_deviation = estimate["highPriceAmd"] * 2 / estimate["priceAmd"] - 1
    assert body["deviation"] == pytest.approx(expected_deviation, rel=1e-6)
    assert body["verdict"] == "OVERPRICED"


def test_the_model_endpoint_describes_what_is_deployed(client):
    response = client.get("/model")

    assert response.status_code == 200
    body = response.json()
    assert body["modelVersion"] == "valuation-lgbm-api-test"
    assert body["trainingRows"] > 0
    assert body["target"] == "log_price_per_sqm_amd"
    assert "random" in body["metrics"]


def test_the_openapi_document_describes_every_route(client):
    paths = client.get("/openapi.json").json()["paths"]

    assert set(paths) >= {"/health", "/health/ready", "/predict", "/explain", "/model"}
