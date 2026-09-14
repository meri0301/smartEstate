import math

import numpy as np
import pandas as pd
import pytest

from app.pipelines.enums import CONDITIONS, MIRRORED_TS_ENUMS
from app.pipelines.features import (
    CATEGORICAL_FEATURES,
    CITY_CENTRE_LAT,
    CITY_CENTRE_LON,
    FEATURE_COLUMNS,
    MARKET_REFERENCE_YEAR,
    build_feature_frame,
    from_log_target,
    haversine_metres,
    price_per_sqm,
    to_log_target,
)

DISTRICTS = ("arabkir", "kentron")


def base_row(**overrides):
    row = {
        "total_area": 72.0,
        "living_area": 48.0,
        "kitchen_area": 9.0,
        "rooms": 3,
        "bathrooms": 1,
        "ceiling_height": 2.8,
        "floor": 4,
        "total_floors": 9,
        "balcony_count": 1,
        "has_loggia": False,
        "has_parking": True,
        "has_storage": False,
        "has_elevator": True,
        "seismic_retrofit": False,
        "condition": "GOOD",
        "heating": "CENTRAL_GAS",
        "ownership_docs": "VERIFIED",
        "building_type": "STONE",
        "construction_year": 1986,
        "district_slug": "arabkir",
        "lat": 40.2,
        "lon": 44.5,
    }
    row.update(overrides)
    return row


def test_frame_has_exactly_the_declared_columns_in_order():
    frame = build_feature_frame([base_row()], DISTRICTS)

    assert list(frame.columns) == list(FEATURE_COLUMNS)
    assert len(frame) == 1


def test_derived_columns_are_arithmetic_on_the_raw_listing():
    frame = build_feature_frame([base_row()], DISTRICTS)
    row = frame.iloc[0]

    assert row["floor_ratio"] == pytest.approx(4 / 9)
    assert row["building_age"] == pytest.approx(MARKET_REFERENCE_YEAR - 1986)
    assert row["area_per_room"] == pytest.approx(24.0)
    assert row["living_ratio"] == pytest.approx(48 / 72)
    assert row["kitchen_ratio"] == pytest.approx(9 / 72)
    assert row["condition_rank"] == pytest.approx(CONDITIONS.index("GOOD"))


def test_ground_and_top_floor_flags():
    frame = build_feature_frame(
        [
            base_row(floor=1, total_floors=9),
            base_row(floor=9, total_floors=9),
            base_row(floor=4, total_floors=9),
        ],
        DISTRICTS,
    )

    assert frame["is_ground_floor"].tolist() == [1.0, 0.0, 0.0]
    assert frame["is_top_floor"].tolist() == [0.0, 1.0, 0.0]


def test_missing_optional_measurements_stay_missing_rather_than_becoming_zero():
    frame = build_feature_frame([base_row(living_area=None, kitchen_area=None)], DISTRICTS)
    row = frame.iloc[0]

    assert math.isnan(row["living_ratio"])
    assert math.isnan(row["kitchen_ratio"])


def test_a_zero_denominator_yields_a_missing_ratio_not_an_infinity():
    frame = build_feature_frame([base_row(total_floors=0, rooms=0)], DISTRICTS)
    row = frame.iloc[0]

    assert math.isnan(row["floor_ratio"])
    assert math.isnan(row["area_per_room"])


def test_categories_are_fixed_so_codes_mean_the_same_thing_every_time():
    frame = build_feature_frame([base_row()], DISTRICTS)

    for name in CATEGORICAL_FEATURES:
        assert isinstance(frame[name].dtype, pd.CategoricalDtype)
    assert list(frame["district_slug"].cat.categories) == list(DISTRICTS)


def test_an_unknown_district_becomes_missing_rather_than_another_district():
    frame = build_feature_frame([base_row(district_slug="gyumri-kentron")], DISTRICTS)

    assert pd.isna(frame.iloc[0]["district_slug"])


def test_an_empty_input_produces_an_empty_frame_with_the_right_columns():
    frame = build_feature_frame([], DISTRICTS)

    assert frame.empty
    assert list(frame.columns) == list(FEATURE_COLUMNS)


def test_distance_to_the_centre_is_zero_at_the_centre_and_grows_outwards():
    at_centre = haversine_metres(CITY_CENTRE_LAT, CITY_CENTRE_LON)
    one_degree_north = haversine_metres(CITY_CENTRE_LAT + 1, CITY_CENTRE_LON)

    assert at_centre == pytest.approx(0.0, abs=1e-6)
    # A degree of latitude is about 111 km anywhere on the globe.
    assert one_degree_north == pytest.approx(111_195, rel=0.01)


def test_distance_is_computed_per_row():
    frame = build_feature_frame(
        [
            base_row(lat=CITY_CENTRE_LAT, lon=CITY_CENTRE_LON),
            base_row(lat=40.25, lon=44.55),
        ],
        DISTRICTS,
    )

    assert frame.iloc[0]["distance_to_centre_m"] == pytest.approx(0.0, abs=1.0)
    assert frame.iloc[1]["distance_to_centre_m"] > 5_000


def test_the_log_target_round_trips():
    values = np.array([500_000.0, 1_250_000.0])

    assert from_log_target(to_log_target(values)) == pytest.approx(values)


def test_price_per_sqm_is_the_quotient_and_tolerates_a_zero_area():
    result = price_per_sqm(pd.Series([45_000_000.0, 1.0]), pd.Series([72.0, 0.0]))

    assert result.iloc[0] == pytest.approx(625_000)
    assert math.isnan(result.iloc[1])


def test_the_python_vocabularies_match_the_typescript_contract():
    """
    The categorical codes a stored model uses come from these lists, so a change
    on the TypeScript side that is not mirrored here silently changes what every
    model means. Skipped when only the service is checked out, as in the image.
    """
    import re
    from pathlib import Path

    here = Path(__file__).resolve()
    candidates = [parent / "packages/contracts/src/common/enums.ts" for parent in here.parents]
    contract = next((path for path in candidates if path.is_file()), None)
    if contract is None:
        pytest.skip("the TypeScript contract is not present in this checkout")

    source = contract.read_text(encoding="utf-8")
    for name, expected in MIRRORED_TS_ENUMS.items():
        match = re.search(rf"export const {name} = \[(.*?)\] as const;", source, re.DOTALL)
        assert match is not None, f"{name} is no longer declared in the contract"
        found = tuple(re.findall(r"'([A-Z_]+)'", match.group(1)))
        assert found == expected, f"{name} differs between TypeScript and Python"
