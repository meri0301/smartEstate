import numpy as np
import pytest

from app.pipelines.evaluate import (
    TARGET_COVERAGE,
    _baseline_prediction,
    _folds_by_group,
    _folds_random,
    conformal_offset,
    cross_validate,
    feature_importance,
    fit_booster,
    interval_coverage,
    regression_metrics,
    widen,
)
from app.pipelines.features import build_feature_frame, price_per_sqm, to_log_target

# Boosting rounds are cut right down: these tests check the machinery, not how
# good the model gets, and the full run belongs in the training CLI.
FAST_ROUNDS = 40


def test_metrics_are_computed_from_the_residuals():
    y_true = np.array([100.0, 200.0, 300.0])
    y_pred = np.array([110.0, 190.0, 300.0])

    metrics = regression_metrics(y_true, y_pred)

    assert metrics.n == 3
    assert metrics.mae_amd == pytest.approx(20 / 3)
    assert metrics.rmse_amd == pytest.approx(np.sqrt(200 / 3))
    assert metrics.mape == pytest.approx((0.10 + 0.05 + 0.0) / 3)
    assert metrics.r2 == pytest.approx(1 - 200 / 20_000)


def test_a_perfect_prediction_scores_zero_error_and_an_r2_of_one():
    y = np.array([10.0, 20.0, 30.0])

    metrics = regression_metrics(y, y)

    assert metrics.mae_amd == 0
    assert metrics.r2 == pytest.approx(1.0)


def test_scoring_nothing_is_an_error_rather_than_a_silent_nan():
    with pytest.raises(ValueError, match="no observations"):
        regression_metrics(np.array([]), np.array([]))


def test_coverage_counts_the_observations_inside_the_interval():
    y_true = np.array([100.0, 100.0, 100.0, 100.0])
    low = np.array([90.0, 101.0, 0.0, 99.0])
    high = np.array([110.0, 200.0, 50.0, 100.0])

    assert interval_coverage(y_true, low, high) == pytest.approx(0.5)


def test_random_folds_partition_every_row_exactly_once():
    folds = _folds_random(23, 5, seed=1)

    assert len(folds) == 5
    combined = np.sort(np.concatenate(folds))
    assert combined.tolist() == list(range(23))


def test_grouped_folds_are_one_district_each():
    folds = _folds_by_group(["a", "b", "a", "c", "b"])

    assert len(folds) == 3
    assert sorted(index for fold in folds for index in fold) == [0, 1, 2, 3, 4]


def test_the_area_only_baseline_recovers_a_line_it_was_given():
    areas = np.array([50.0, 60.0, 70.0])
    prices = 1_000_000 + 500_000 * areas

    predicted = _baseline_prediction(areas, prices, np.array([65.0]))

    assert predicted[0] == pytest.approx(1_000_000 + 500_000 * 65, rel=1e-6)


def test_cross_validation_beats_the_area_only_baseline(synthetic_rows, districts):
    """
    The substantive check: the model has to earn its place.

    Random folds let it use the district it was trained on, which is where a
    gradient-boosted model should comfortably beat one line through area.
    """
    result = cross_validate(synthetic_rows, districts, "random", k=4, num_boost_round=FAST_ROUNDS)

    assert result.folds == 4
    assert result.model.n == len(synthetic_rows)
    assert result.model.mae_amd < result.baseline.mae_amd
    assert result.model.r2 > result.baseline.r2


def test_holding_out_whole_districts_is_harder_than_holding_out_random_listings(
    synthetic_rows, districts
):
    """
    The finding the thesis rests on.

    District price level is the strongest single driver, so a fold that has never
    seen the district cannot know it. The grouped scheme must therefore score
    worse, and a run where it does not would mean the groups were leaking.
    """
    random_cv = cross_validate(
        synthetic_rows, districts, "random", k=4, num_boost_round=FAST_ROUNDS
    )
    grouped_cv = cross_validate(synthetic_rows, districts, "grouped", num_boost_round=FAST_ROUNDS)

    assert grouped_cv.folds == len(districts)
    assert grouped_cv.model.mape > random_cv.model.mape


def test_an_unknown_validation_scheme_is_refused(synthetic_rows, districts):
    with pytest.raises(ValueError, match="unknown validation scheme"):
        cross_validate(synthetic_rows, districts, "leave-one-out")


def test_importance_is_ranked_and_shares_sum_to_one(synthetic_rows, districts):
    frame = build_feature_frame(synthetic_rows, districts)
    prices = np.array([row["price_amd"] for row in synthetic_rows], dtype="float64")
    areas = np.array([row["total_area"] for row in synthetic_rows], dtype="float64")
    booster = fit_booster(
        frame, np.asarray(to_log_target(price_per_sqm(prices, areas))), num_boost_round=FAST_ROUNDS
    )

    importance = feature_importance(booster, top=5)

    assert len(importance) == 5
    gains = [entry["gain"] for entry in importance]
    assert gains == sorted(gains, reverse=True)
    assert 0 < sum(entry["share"] for entry in importance) <= 1.0


def test_the_model_recovers_the_structure_the_data_was_generated_from(synthetic_rows, districts):
    """
    The synthetic prices are built from district, building type, condition and
    floor. Those are the features the model should lean on; if the top of the
    importance table were, say, the balcony count, the pipeline would be wrong.
    """
    frame = build_feature_frame(synthetic_rows, districts)
    prices = np.array([row["price_amd"] for row in synthetic_rows], dtype="float64")
    areas = np.array([row["total_area"] for row in synthetic_rows], dtype="float64")
    booster = fit_booster(
        frame, np.asarray(to_log_target(price_per_sqm(prices, areas))), num_boost_round=120
    )

    top = {entry["feature"] for entry in feature_importance(booster, top=5)}

    assert "district_slug" in top
    assert top & {"condition", "condition_rank"}
    assert "building_type" in top


def test_the_conformal_offset_is_zero_when_the_interval_already_covers_enough():
    y_true = np.full(100, 100.0)
    low = np.full(100, 50.0)
    high = np.full(100, 200.0)

    assert conformal_offset(y_true, low, high, target_coverage=0.8) == 0.0


def test_the_conformal_offset_widens_an_interval_that_is_too_narrow():
    """Ninety of a hundred observations sit outside, so the range has to grow."""
    y_true = np.concatenate([np.full(90, 200.0), np.full(10, 100.0)])
    low = np.full(100, 90.0)
    high = np.full(100, 110.0)

    offset = conformal_offset(y_true, low, high, target_coverage=0.8)

    assert offset > 0
    wide_low, wide_high = widen(low, high, offset)
    assert interval_coverage(y_true, wide_low, wide_high) >= 0.8


def test_calibration_brings_coverage_up_to_its_promise(synthetic_rows, districts):
    result = cross_validate(synthetic_rows, districts, "random", k=4, num_boost_round=FAST_ROUNDS)

    assert result.coverage_calibrated >= TARGET_COVERAGE
    assert result.coverage_calibrated >= result.coverage
