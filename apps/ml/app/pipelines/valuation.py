"""
The valuation model at inference time: an estimate, a range, and why.

Explanations come from LightGBM's own `pred_contrib`, which is the exact TreeSHAP
algorithm of Lundberg et al. rather than an approximation of it. Using it avoids
adding the `shap` package to the runtime image, and gives the same numbers; the
package is still a training dependency, where it draws the global summary plots
for the thesis.

Because the model learns the log of price per m², a SHAP contribution is a log
multiplier. Exponentiating it turns "+0.11 on the log scale" into "+12%", which
is the form the interface shows and the only form a reader can act on.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Final

import numpy as np
import pandas as pd

from app.pipelines.artifact import ValuationArtifact
from app.pipelines.features import build_feature_frame, from_log_target

#: Contributions smaller than this are noise in the reader's eyes, not a reason.
MIN_REPORTABLE_EFFECT: Final[float] = 0.005


@dataclass(frozen=True, slots=True)
class Estimate:
    """One valuation: the point estimate and the range around it, all in dram."""

    price_per_sqm_amd: float
    price_amd: float
    low_price_amd: float
    high_price_amd: float


@dataclass(frozen=True, slots=True)
class Contribution:
    """One feature's share of the difference between this listing and the average one."""

    feature: str
    value: Any
    log_contribution: float
    effect: float


@dataclass(frozen=True, slots=True)
class Explanation:
    """A valuation with its reasons, and how the asking price compares."""

    estimate: Estimate
    baseline_price_per_sqm_amd: float
    contributions: tuple[Contribution, ...]
    deviation: float | None
    verdict: str | None


class ValuationModel:
    """Wraps an artefact. Stateless apart from the boosters it was built with."""

    def __init__(self, artifact: ValuationArtifact) -> None:
        self._artifact = artifact

    @property
    def version(self) -> str:
        return self._artifact.metadata.model_version

    @property
    def metadata(self) -> Any:
        return self._artifact.metadata

    def _frame(self, listings: Sequence[Mapping[str, Any]]) -> pd.DataFrame:
        frame = build_feature_frame(listings, self._artifact.metadata.districts)
        expected = list(self._artifact.metadata.feature_columns)
        missing = [name for name in expected if name not in frame.columns]
        if missing:
            raise ValueError(f"feature pipeline produced no {', '.join(missing)}")
        return frame[expected]

    def predict(self, listings: Sequence[Mapping[str, Any]]) -> list[Estimate]:
        """Point estimate and interval for each listing, in the order given."""
        if not listings:
            return []
        frame = self._frame(listings)
        areas = pd.to_numeric(
            pd.DataFrame(list(listings)).get("total_area"), errors="coerce"
        ).to_numpy(dtype="float64")

        median = from_log_target(np.asarray(self._artifact.median.predict(frame), dtype="float64"))
        low = from_log_target(
            np.asarray(self._artifact.quantile_low.predict(frame), dtype="float64")
        )
        high = from_log_target(
            np.asarray(self._artifact.quantile_high.predict(frame), dtype="float64")
        )
        # Quantile models are fitted independently, so nothing guarantees the
        # low one stays below the high one on every row; sorting the pair is the
        # standard repair and keeps the interval meaningful.
        low, high = np.minimum(low, high), np.maximum(low, high)
        # The raw quantile interval covers less than it claims; the conformal
        # offset measured during training widens it to its promised share.
        factor = float(np.exp(self._artifact.metadata.interval_log_offset))
        low, high = low / factor, high * factor

        return [
            Estimate(
                price_per_sqm_amd=float(median[index]),
                price_amd=float(median[index] * areas[index]),
                low_price_amd=float(low[index] * areas[index]),
                high_price_amd=float(high[index] * areas[index]),
            )
            for index in range(len(listings))
        ]

    def explain(
        self,
        listing: Mapping[str, Any],
        asking_price_amd: float | None = None,
        top_k: int = 3,
    ) -> Explanation:
        """
        Explain one valuation.

        The contributions sum, on the log scale, to the difference between this
        listing's estimate and the average listing the model was trained on, so
        the explanation is complete by construction rather than by assertion.
        """
        estimate = self.predict([listing])[0]
        frame = self._frame([listing])

        contributions = np.asarray(
            self._artifact.median.predict(frame, pred_contrib=True), dtype="float64"
        )[0]
        # LightGBM appends the expected value of the model as a final column.
        *feature_contributions, base_value = contributions.tolist()

        ranked = sorted(
            (
                Contribution(
                    feature=name,
                    value=_plain(frame.iloc[0][name]),
                    log_contribution=float(contribution),
                    effect=float(np.expm1(contribution)),
                )
                for name, contribution in zip(
                    self._artifact.metadata.feature_columns, feature_contributions, strict=True
                )
            ),
            key=lambda item: abs(item.log_contribution),
            reverse=True,
        )
        reportable = tuple(item for item in ranked if abs(item.effect) >= MIN_REPORTABLE_EFFECT)[
            :top_k
        ]

        deviation: float | None = None
        verdict: str | None = None
        if asking_price_amd is not None and estimate.price_amd > 0:
            deviation = float(asking_price_amd / estimate.price_amd - 1)
            verdict = self._verdict(asking_price_amd, estimate)

        return Explanation(
            estimate=estimate,
            baseline_price_per_sqm_amd=float(from_log_target(base_value)),
            contributions=reportable,
            deviation=deviation,
            verdict=verdict,
        )

    @staticmethod
    def _verdict(asking_price_amd: float, estimate: Estimate) -> str:
        """
        Where the asking price falls against the model's own range.

        Deliberately not a fixed percentage band: the interval is wider where the
        model is less certain, so a listing is only called mispriced when it sits
        outside what the model thinks plausible for a property like it.
        """
        if asking_price_amd < estimate.low_price_amd:
            return "UNDERPRICED"
        if asking_price_amd > estimate.high_price_amd:
            return "OVERPRICED"
        return "FAIR"


def _plain(value: Any) -> Any:
    """Numpy and pandas scalars are not JSON; unwrap them, and turn NaN into None."""
    if value is None:
        return None
    if isinstance(value, float | np.floating):
        number = float(value)
        return None if np.isnan(number) else number
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.bool_):
        return bool(value)
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    return str(value)
