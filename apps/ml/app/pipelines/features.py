"""
Feature engineering, shared by training and inference.

One function builds the model matrix, and both the training CLI and the HTTP
service call it. That is the whole point of putting it here: a feature computed
one way at training time and another way at request time is the classic silent
failure of a deployed model, and the only reliable defence is to have a single
implementation.

Every derived column is a plain arithmetic transform of the raw listing, so the
function is pure, order-preserving and testable without a model.
"""

from collections.abc import Iterable, Mapping, Sequence
from typing import Any, Final

import numpy as np
import pandas as pd

from app.pipelines.enums import (
    BUILDING_TYPES,
    CONDITION_RANK,
    CONDITIONS,
    HEATING_TYPES,
    OWNERSHIP_DOCS_STATUSES,
)

# Republic Square. Distance to it is the one geographic feature that transfers to
# a district the model has never seen, which is what spatial validation tests.
CITY_CENTRE_LAT: Final[float] = 40.1776
CITY_CENTRE_LON: Final[float] = 44.5126

EARTH_RADIUS_M: Final[float] = 6_371_000.0

# Building age is measured against this year rather than "now", so a model gives
# the same answer tomorrow as it did today. It is recorded in the artefact.
MARKET_REFERENCE_YEAR: Final[int] = 2026

NUMERIC_FEATURES: Final[tuple[str, ...]] = (
    "total_area",
    "rooms",
    "bathrooms",
    "ceiling_height",
    "floor",
    "total_floors",
    "floor_ratio",
    "balcony_count",
    "building_age",
    "area_per_room",
    "living_ratio",
    "kitchen_ratio",
    "distance_to_centre_m",
    "condition_rank",
)

BOOLEAN_FEATURES: Final[tuple[str, ...]] = (
    "has_loggia",
    "has_parking",
    "has_storage",
    "has_elevator",
    "seismic_retrofit",
    "is_ground_floor",
    "is_top_floor",
)

CATEGORICAL_FEATURES: Final[tuple[str, ...]] = (
    "district_slug",
    "building_type",
    "condition",
    "heating",
    "ownership_docs",
)

FEATURE_COLUMNS: Final[tuple[str, ...]] = (
    *NUMERIC_FEATURES,
    *BOOLEAN_FEATURES,
    *CATEGORICAL_FEATURES,
)

# Fixed vocabularies; districts are data-driven and supplied by the caller.
_FIXED_CATEGORIES: Final[dict[str, tuple[str, ...]]] = {
    "building_type": BUILDING_TYPES,
    "condition": CONDITIONS,
    "heating": HEATING_TYPES,
    "ownership_docs": OWNERSHIP_DOCS_STATUSES,
}


def haversine_metres(
    lat: "pd.Series[float] | float",
    lon: "pd.Series[float] | float",
    to_lat: float = CITY_CENTRE_LAT,
    to_lon: float = CITY_CENTRE_LON,
) -> Any:
    """Great-circle distance in metres. Vectorised so it works on a whole column."""
    lat1, lon1, lat2, lon2 = (np.radians(value) for value in (lat, lon, to_lat, to_lon))
    delta_lat = lat2 - lat1
    delta_lon = lon2 - lon1
    a = np.sin(delta_lat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(delta_lon / 2) ** 2
    return 2 * EARTH_RADIUS_M * np.arcsin(np.sqrt(a))


def _safe_ratio(numerator: Any, denominator: Any) -> Any:
    """
    Element-wise division that yields NaN rather than an error or an infinity.

    Accepts a Series or a bare array, because training works in numpy and the
    feature frame works in pandas, and both call this. The result keeps whichever
    index it was given so a caller can still use `.iloc`.
    """
    top = np.asarray(pd.to_numeric(np.asarray(numerator), errors="coerce"), dtype="float64")
    bottom = np.asarray(pd.to_numeric(np.asarray(denominator), errors="coerce"), dtype="float64")
    usable = bottom > 0
    ratio = np.divide(top, bottom, out=np.full(top.shape, np.nan), where=usable)
    index = None
    if isinstance(numerator, pd.Series):
        index = numerator.index
    elif isinstance(denominator, pd.Series):
        index = denominator.index
    return ratio if index is None else pd.Series(ratio, index=index)


def build_feature_frame(
    rows: Iterable[Mapping[str, Any]],
    districts: Sequence[str],
) -> pd.DataFrame:
    """
    Turn raw listing records into the model matrix.

    `districts` fixes the category order for the one vocabulary that comes from
    the data rather than from an enum; it is stored with the model. A district
    the model has never seen becomes a missing category, which LightGBM handles
    as a missing value instead of guessing.
    """
    frame = pd.DataFrame(list(rows))
    if frame.empty:
        return pd.DataFrame(columns=list(FEATURE_COLUMNS)).astype(
            {name: "float64" for name in NUMERIC_FEATURES}
        )

    for column in (
        "total_area",
        "living_area",
        "kitchen_area",
        "rooms",
        "bathrooms",
        "ceiling_height",
        "floor",
        "total_floors",
        "balcony_count",
        "construction_year",
        "lat",
        "lon",
    ):
        frame[column] = pd.to_numeric(frame.get(column), errors="coerce")

    out = pd.DataFrame(index=frame.index)

    out["total_area"] = frame["total_area"]
    out["rooms"] = frame["rooms"]
    out["bathrooms"] = frame["bathrooms"]
    out["ceiling_height"] = frame["ceiling_height"]
    out["floor"] = frame["floor"]
    out["total_floors"] = frame["total_floors"]
    out["balcony_count"] = frame["balcony_count"]

    out["floor_ratio"] = _safe_ratio(frame["floor"], frame["total_floors"])
    out["building_age"] = MARKET_REFERENCE_YEAR - frame["construction_year"]
    out["area_per_room"] = _safe_ratio(frame["total_area"], frame["rooms"])
    out["living_ratio"] = _safe_ratio(frame["living_area"], frame["total_area"])
    out["kitchen_ratio"] = _safe_ratio(frame["kitchen_area"], frame["total_area"])
    out["distance_to_centre_m"] = haversine_metres(frame["lat"], frame["lon"])
    out["condition_rank"] = (
        frame.get("condition", pd.Series(index=frame.index, dtype="object"))
        .map(CONDITION_RANK)
        .astype("float64")
    )

    for name in BOOLEAN_FEATURES:
        if name == "is_ground_floor":
            values = frame["floor"] <= 1
        elif name == "is_top_floor":
            values = frame["floor"] >= frame["total_floors"]
        else:
            values = frame.get(name, pd.Series(index=frame.index, dtype="object")).astype("boolean")
        # Float rather than bool: a missing flag must stay missing, and LightGBM
        # reads NaN as "value absent" rather than as False.
        out[name] = pd.to_numeric(values, errors="coerce").astype("float64")

    categories = {**_FIXED_CATEGORIES, "district_slug": tuple(districts)}
    for name in CATEGORICAL_FEATURES:
        raw = frame.get(name, pd.Series(index=frame.index, dtype="object")).astype("object")
        # A value outside the vocabulary is dropped to missing first: handing it
        # to `Categorical` directly is deprecated and would eventually raise, and
        # the intent is the same either way. An unknown district is unknown, not
        # an error and not silently some other district.
        known = raw.where(raw.isin(categories[name]))
        out[name] = pd.Categorical(known, categories=list(categories[name]))

    for name in NUMERIC_FEATURES:
        out[name] = out[name].astype("float64")

    return out[list(FEATURE_COLUMNS)]


def price_per_sqm(price_amd: Any, total_area: Any) -> Any:
    """The quantity the model actually learns, before the log."""
    return _safe_ratio(price_amd, total_area)


def to_log_target(values: Any) -> Any:
    """
    Natural log of price per m².

    The seed's price model, and the market it imitates, are multiplicative: a
    renovation adds a percentage, not an amount. Learning the log turns those
    effects into additive ones, which is what a squared-error objective and an
    additive SHAP decomposition both assume.
    """
    return np.log(pd.to_numeric(values, errors="coerce"))


def from_log_target(values: Any) -> Any:
    """Back to price per m²."""
    return np.exp(values)
