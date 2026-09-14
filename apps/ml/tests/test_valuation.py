import json

import numpy as np
import pytest

from app.pipelines.artifact import (
    ARTIFACT_SCHEMA_VERSION,
    ArtifactError,
    ModelMetadata,
    artifact_exists,
    build_model_version,
    load_artifact,
    save_artifact,
)
from app.pipelines.evaluate import QUANTILE_HIGH, QUANTILE_LOW, fit_booster
from app.pipelines.features import (
    FEATURE_COLUMNS,
    MARKET_REFERENCE_YEAR,
    build_feature_frame,
    price_per_sqm,
    to_log_target,
)
from app.pipelines.valuation import ValuationModel

FAST_ROUNDS = 60


@pytest.fixture(scope="module")
def trained(tmp_path_factory, synthetic_rows, districts):
    """Train once, save, and hand back the directory it was written to."""
    rows = synthetic_rows
    frame = build_feature_frame(rows, districts)
    prices = np.array([row["price_amd"] for row in rows], dtype="float64")
    areas = np.array([row["total_area"] for row in rows], dtype="float64")
    target = np.asarray(to_log_target(price_per_sqm(prices, areas)))

    directory = tmp_path_factory.mktemp("artifact")
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
            model_version="valuation-lgbm-test",
            trained_at="2026-09-14T00:00:00+00:00",
            feature_columns=FEATURE_COLUMNS,
            districts=districts,
            market_reference_year=MARKET_REFERENCE_YEAR,
            target="log_price_per_sqm_amd",
            quantiles=(QUANTILE_LOW, QUANTILE_HIGH),
            interval_log_offset=0.0,
            target_coverage=0.8,
            training_rows=len(rows),
            dataset_fingerprint="a" * 64,
            lightgbm_version="test",
            metrics={},
        ),
    )
    return directory


@pytest.fixture(scope="module")
def model(trained):
    return ValuationModel(load_artifact(trained))


def test_a_saved_artefact_is_complete_and_reloadable(trained):
    assert artifact_exists(trained)

    artifact = load_artifact(trained)

    assert artifact.metadata.model_version == "valuation-lgbm-test"
    assert artifact.metadata.feature_columns == FEATURE_COLUMNS


def test_loading_from_an_empty_directory_says_what_is_missing(tmp_path):
    with pytest.raises(ArtifactError, match="missing"):
        load_artifact(tmp_path)


def test_loading_from_a_directory_that_does_not_exist_says_so(tmp_path):
    with pytest.raises(ArtifactError, match="no model directory"):
        load_artifact(tmp_path / "nowhere")


def test_an_artefact_from_a_future_schema_is_refused_rather_than_misread(trained, tmp_path):
    payload = json.loads((trained / "metadata.json").read_text(encoding="utf-8"))
    payload["schemaVersion"] = ARTIFACT_SCHEMA_VERSION + 1

    with pytest.raises(ArtifactError, match="schema version"):
        ModelMetadata.from_json(payload)


def test_the_model_version_names_the_dataset_it_was_trained_on():
    from datetime import UTC, datetime

    version = build_model_version("abcdef1234567890", datetime(2026, 9, 14, tzinfo=UTC))

    assert version == "valuation-lgbm-20260914-abcdef12"


def test_predictions_come_back_in_order_and_scale_with_area(model, one_listing):
    small = dict(one_listing, total_area=45.0)
    large = dict(one_listing, total_area=95.0)

    estimates = model.predict([small, large])

    assert len(estimates) == 2
    assert estimates[0].price_amd < estimates[1].price_amd
    assert estimates[0].price_amd == pytest.approx(estimates[0].price_per_sqm_amd * 45.0)


def test_predicting_nothing_returns_nothing(model):
    assert model.predict([]) == []


def test_the_interval_brackets_the_point_estimate(model, one_listing):
    estimate = model.predict([one_listing])[0]

    assert estimate.low_price_amd <= estimate.price_amd <= estimate.high_price_amd


def test_a_better_district_is_valued_above_a_cheaper_one(model, one_listing):
    """The clearest sanity check available: the price level the data was built with."""
    kentron = model.predict([dict(one_listing, district_slug="kentron")])[0]
    nor_nork = model.predict([dict(one_listing, district_slug="nor-nork")])[0]

    assert kentron.price_per_sqm_amd > nor_nork.price_per_sqm_amd


def test_an_explanation_decomposes_the_estimate_exactly(model, one_listing):
    """
    TreeSHAP is additive: the contributions plus the base value reconstruct the
    prediction. Asserting it here means an explanation can never be a plausible
    story detached from the number it claims to explain.
    """
    explanation = model.explain(one_listing, top_k=len(FEATURE_COLUMNS))

    total = sum(item.log_contribution for item in explanation.contributions)
    reconstructed = np.exp(np.log(explanation.baseline_price_per_sqm_amd) + total)

    assert reconstructed == pytest.approx(explanation.estimate.price_per_sqm_amd, rel=0.02)


def test_an_explanation_is_ranked_and_trimmed(model, one_listing):
    explanation = model.explain(one_listing, top_k=3)

    effects = [abs(item.log_contribution) for item in explanation.contributions]
    assert len(explanation.contributions) <= 3
    assert effects == sorted(effects, reverse=True)
    assert all(item.feature in FEATURE_COLUMNS for item in explanation.contributions)


def test_contribution_values_are_json_safe(model, one_listing):
    explanation = model.explain(dict(one_listing, kitchen_area=None), top_k=10)

    json.dumps([item.value for item in explanation.contributions])


def test_no_asking_price_means_no_verdict(model, one_listing):
    explanation = model.explain(one_listing)

    assert explanation.deviation is None
    assert explanation.verdict is None


def test_the_verdict_follows_the_interval_not_a_fixed_band(model, one_listing):
    estimate = model.predict([one_listing])[0]

    below = model.explain(one_listing, asking_price_amd=estimate.low_price_amd * 0.5)
    inside = model.explain(one_listing, asking_price_amd=estimate.price_amd)
    above = model.explain(one_listing, asking_price_amd=estimate.high_price_amd * 1.5)

    assert below.verdict == "UNDERPRICED"
    assert inside.verdict == "FAIR"
    assert above.verdict == "OVERPRICED"


def test_the_deviation_is_the_asking_price_against_the_estimate(model, one_listing):
    estimate = model.predict([one_listing])[0]

    explanation = model.explain(one_listing, asking_price_amd=estimate.price_amd * 1.2)

    assert explanation.deviation == pytest.approx(0.2, rel=1e-6)
