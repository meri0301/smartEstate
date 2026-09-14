"""
How good the model is, and against what.

Two validation schemes are reported side by side, and the gap between them is
the point. Random k-fold splits listings at random, so the model has usually
seen other flats in the same building, let alone the same district. Grouped
validation holds out whole districts, so a fold is scored on a neighbourhood
whose price level the model has never been told. The second is the honest
measure of whether the model has learned anything transferable, and it is always
the worse number.

Every model is measured against the same baseline the brief asks for: a linear
regression on floor area alone. A gradient-boosted model that cannot beat one
line through one variable is not worth deploying.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import asdict, dataclass
from typing import Any, Final

import lightgbm as lgb
import numpy as np
import pandas as pd

from app.pipelines.features import (
    build_feature_frame,
    from_log_target,
    price_per_sqm,
    to_log_target,
)

#: Hyperparameters for a dataset of a few hundred rows. Deliberately conservative
#: and deliberately not searched: with this much data a search would tune itself
#: to the validation folds and report a score the model cannot repeat. The one
#: value chosen from evidence is the number of boosting rounds, below.
LGBM_PARAMS: Final[dict[str, Any]] = {
    "objective": "regression",
    "metric": "l2",
    "learning_rate": 0.05,
    "num_leaves": 15,
    "min_data_in_leaf": 10,
    "feature_fraction": 0.8,
    "bagging_fraction": 0.8,
    "bagging_freq": 1,
    "lambda_l2": 1.0,
    # LightGBM will not split on a categorical feature unless every group it
    # creates keeps at least min_data_per_group rows, and the default of 100
    # assumes a dataset far larger than a city of a dozen districts. Left alone
    # it silently refuses to split on district or building type at all, and the
    # model compensates by fitting noise in the continuous columns. The
    # smoothing priors are lowered with it, for the same reason: they are sized
    # for categories with hundreds of observations each.
    "min_data_per_group": 5,
    "cat_smooth": 5.0,
    "cat_l2": 5.0,
    "verbosity": -1,
    "seed": 20_260_914,
    "deterministic": True,
    "force_row_wise": True,
}

#: Compared at 100, 200 and 400 on out-of-fold error. Error within a known
#: district was flat across all three, while error on a held-out district grew
#: slightly with more rounds, which is overfitting showing up exactly where it
#: matters. The smallest of the three is therefore also the best one, and it
#: keeps the committed artefact under half a megabyte.
NUM_BOOST_ROUND: Final[int] = 100

QUANTILE_LOW: Final[float] = 0.1
QUANTILE_HIGH: Final[float] = 0.9

#: The share of asking prices the published interval aims to contain.
TARGET_COVERAGE: Final[float] = 0.8


@dataclass(frozen=True, slots=True)
class RegressionMetrics:
    """Error of a price prediction, in dram and as a share of the asking price."""

    n: int
    mae_amd: float
    rmse_amd: float
    mape: float
    r2: float

    def to_json(self) -> dict[str, Any]:
        return {
            "n": self.n,
            "maeAmd": round(self.mae_amd),
            "rmseAmd": round(self.rmse_amd),
            "mape": round(self.mape, 4),
            "r2": round(self.r2, 4),
        }


def regression_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> RegressionMetrics:
    """Mean absolute error, root mean squared error, MAPE and R², in that order of usefulness."""
    y_true = np.asarray(y_true, dtype="float64")
    y_pred = np.asarray(y_pred, dtype="float64")
    if y_true.size == 0:
        raise ValueError("no observations to score")
    residual = y_pred - y_true
    total_variance = float(np.sum((y_true - y_true.mean()) ** 2))
    return RegressionMetrics(
        n=int(y_true.size),
        mae_amd=float(np.mean(np.abs(residual))),
        rmse_amd=float(np.sqrt(np.mean(residual**2))),
        mape=float(np.mean(np.abs(residual) / np.where(y_true == 0, np.nan, y_true))),
        r2=float(1 - np.sum(residual**2) / total_variance) if total_variance > 0 else float("nan"),
    )


def interval_coverage(y_true: np.ndarray, low: np.ndarray, high: np.ndarray) -> float:
    """
    Share of asking prices that fell inside the predicted range.

    An 80% interval should contain about 80% of them. Much more and the range is
    so wide it says nothing; much less and the "fair price" badge will call
    ordinary listings mispriced.
    """
    y_true = np.asarray(y_true, dtype="float64")
    inside = (y_true >= np.asarray(low, dtype="float64")) & (
        y_true <= np.asarray(high, dtype="float64")
    )
    return float(np.mean(inside))


def conformal_offset(
    y_true: np.ndarray,
    low: np.ndarray,
    high: np.ndarray,
    target_coverage: float = TARGET_COVERAGE,
) -> float:
    """
    How far the quantile interval has to be widened to keep its promise.

    Two boosters fitted at the 10th and 90th percentiles do not produce an
    interval that actually contains 80% of unseen listings: quantile regression
    on a few hundred rows is optimistic, and on this data the raw interval covers
    well under its nominal share. Conformalised quantile regression (Romano,
    Patterson and Candès, 2019) repairs that with one number, measured on
    predictions the model did not see in training.

    The score is computed on the log scale, so the correction is a multiplier
    rather than a fixed number of dram: a wider range around an expensive flat
    than around a cheap one, which is what proportional error implies.
    """
    log_true = np.log(np.asarray(y_true, dtype="float64"))
    log_low = np.log(np.asarray(low, dtype="float64"))
    log_high = np.log(np.asarray(high, dtype="float64"))
    # Positive when the observation fell outside, by how much on the log scale.
    scores = np.maximum(log_low - log_true, log_true - log_high)
    count = scores.size
    if count == 0:
        return 0.0
    # The finite-sample conformal quantile, which is slightly above the empirical
    # one and is what gives the coverage guarantee for a future listing.
    rank = min(1.0, np.ceil((count + 1) * target_coverage) / count)
    offset = float(np.quantile(scores, rank, method="higher"))
    if offset <= 0:
        return 0.0
    # A hair of slack, because the widened bound lands exactly on the observation
    # that set the quantile and floating point rounds it the wrong side about
    # half the time. Without it the calibration misses its target by one row.
    return offset + 1e-9


def widen(low: np.ndarray, high: np.ndarray, log_offset: float) -> tuple[np.ndarray, np.ndarray]:
    """Apply a conformal offset to an interval expressed in dram."""
    factor = float(np.exp(log_offset))
    return np.asarray(low, dtype="float64") / factor, np.asarray(high, dtype="float64") * factor


def fit_booster(
    features: pd.DataFrame,
    log_target: np.ndarray,
    *,
    objective: str = "regression",
    alpha: float | None = None,
    num_boost_round: int = NUM_BOOST_ROUND,
) -> lgb.Booster:
    """Train one booster on the log of price per m²."""
    params = dict(LGBM_PARAMS)
    if objective != "regression":
        params["objective"] = objective
        params["metric"] = objective
        params.pop("lambda_l2", None)
    if alpha is not None:
        params["alpha"] = alpha
    dataset = lgb.Dataset(features, label=log_target, free_raw_data=False)
    return lgb.train(params, dataset, num_boost_round=num_boost_round)


def _predict_prices(booster: lgb.Booster, features: pd.DataFrame, areas: np.ndarray) -> np.ndarray:
    """Booster output is log price per m²; the caller wants dram."""
    return from_log_target(np.asarray(booster.predict(features), dtype="float64")) * areas


def _baseline_prediction(
    train_areas: np.ndarray,
    train_prices: np.ndarray,
    test_areas: np.ndarray,
) -> np.ndarray:
    """
    Ordinary least squares of price on area, fitted with numpy.

    The brief asks for a linear regression on area alone as the thing to beat.
    Two coefficients do not need scikit-learn, and not importing it here keeps
    the comparison obviously free of any preprocessing the real model enjoys.
    """
    design = np.column_stack([np.ones_like(train_areas), train_areas])
    coefficients, *_ = np.linalg.lstsq(design, train_prices, rcond=None)
    return coefficients[0] + coefficients[1] * test_areas


def _folds_random(n: int, k: int, seed: int) -> list[np.ndarray]:
    """Indices of each test fold for a shuffled k-fold split."""
    rng = np.random.default_rng(seed)
    order = rng.permutation(n)
    return [fold for fold in np.array_split(order, k) if fold.size > 0]


def _folds_by_group(groups: Sequence[str]) -> list[np.ndarray]:
    """One fold per district: leave-one-group-out."""
    values = np.asarray(groups)
    return [np.flatnonzero(values == name) for name in sorted(set(values))]


@dataclass(frozen=True, slots=True)
class CrossValidationResult:
    """What one validation scheme found."""

    scheme: str
    folds: int
    model: RegressionMetrics
    baseline: RegressionMetrics
    #: Coverage of the raw quantile interval, before any calibration.
    coverage: float
    #: Coverage once the conformal offset measured on these folds is applied.
    coverage_calibrated: float
    #: The offset itself, on the log scale. Stored with the model.
    log_offset: float

    def to_json(self) -> dict[str, Any]:
        return {
            "scheme": self.scheme,
            "folds": self.folds,
            "model": self.model.to_json(),
            "baselineAreaOnly": self.baseline.to_json(),
            "intervalCoverage": round(self.coverage, 4),
            "intervalCoverageCalibrated": round(self.coverage_calibrated, 4),
            "intervalLogOffset": round(self.log_offset, 4),
        }


def cross_validate(
    rows: list[dict[str, Any]],
    districts: Sequence[str],
    scheme: str,
    *,
    k: int = 5,
    seed: int = 20_260_914,
    num_boost_round: int = NUM_BOOST_ROUND,
) -> CrossValidationResult:
    """
    Run one validation scheme end to end.

    Both the model and the baseline are refitted inside every fold, so neither
    ever sees a test listing during training.
    """
    frame = build_feature_frame(rows, districts)
    prices = np.asarray([float(row["price_amd"]) for row in rows], dtype="float64")
    areas = np.asarray([float(row["total_area"]) for row in rows], dtype="float64")
    log_target = np.asarray(to_log_target(price_per_sqm(prices, areas)), dtype="float64")

    if scheme == "grouped":
        folds = _folds_by_group([str(row["district_slug"]) for row in rows])
    elif scheme == "random":
        folds = _folds_random(len(rows), k, seed)
    else:
        raise ValueError(f"unknown validation scheme {scheme!r}")

    predictions = np.empty_like(prices)
    baseline = np.empty_like(prices)
    low = np.empty_like(prices)
    high = np.empty_like(prices)

    for test_index in folds:
        train_index = np.setdiff1d(np.arange(len(rows)), test_index, assume_unique=False)
        if train_index.size == 0 or test_index.size == 0:
            continue
        train_frame = frame.iloc[train_index]
        test_frame = frame.iloc[test_index]

        median = fit_booster(train_frame, log_target[train_index], num_boost_round=num_boost_round)
        q_low = fit_booster(
            train_frame,
            log_target[train_index],
            objective="quantile",
            alpha=QUANTILE_LOW,
            num_boost_round=num_boost_round,
        )
        q_high = fit_booster(
            train_frame,
            log_target[train_index],
            objective="quantile",
            alpha=QUANTILE_HIGH,
            num_boost_round=num_boost_round,
        )

        predictions[test_index] = _predict_prices(median, test_frame, areas[test_index])
        fold_low = _predict_prices(q_low, test_frame, areas[test_index])
        fold_high = _predict_prices(q_high, test_frame, areas[test_index])
        low[test_index] = np.minimum(fold_low, fold_high)
        high[test_index] = np.maximum(fold_low, fold_high)
        baseline[test_index] = _baseline_prediction(
            areas[train_index], prices[train_index], areas[test_index]
        )

    log_offset = conformal_offset(prices, low, high)
    wide_low, wide_high = widen(low, high, log_offset)

    return CrossValidationResult(
        scheme=scheme,
        folds=len(folds),
        model=regression_metrics(prices, predictions),
        baseline=regression_metrics(prices, baseline),
        coverage=interval_coverage(prices, low, high),
        coverage_calibrated=interval_coverage(prices, wide_low, wide_high),
        log_offset=log_offset,
    )


def feature_importance(booster: lgb.Booster, top: int = 15) -> list[dict[str, Any]]:
    """Gain-based importance, for the thesis table. SHAP explains single listings."""
    names = booster.feature_name()
    gains = booster.feature_importance(importance_type="gain")
    ranked = sorted(zip(names, gains, strict=True), key=lambda item: item[1], reverse=True)
    total = float(sum(gains)) or 1.0
    return [
        {"feature": name, "gain": float(gain), "share": round(float(gain) / total, 4)}
        for name, gain in ranked[:top]
    ]


def summarise(results: Sequence[CrossValidationResult]) -> dict[str, Any]:
    """Metrics in the shape stored in the artefact and rendered into the thesis."""
    return {result.scheme: result.to_json() for result in results}


def as_dict(metrics: RegressionMetrics) -> dict[str, Any]:
    """Plain mapping, for callers that would rather not import the dataclass."""
    return asdict(metrics)
