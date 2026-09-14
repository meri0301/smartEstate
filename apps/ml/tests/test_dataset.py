import pytest

from app.pipelines.dataset import (
    DatasetError,
    districts_of,
    fingerprint,
    load_from_csv,
    validate,
    write_csv,
)


def test_a_dataset_smaller_than_the_floor_is_refused(synthetic_rows):
    with pytest.raises(DatasetError, match="at least 50"):
        validate(synthetic_rows[:10])


def test_a_dataset_missing_a_required_column_is_refused(synthetic_rows):
    rows = [
        {key: value for key, value in row.items() if key != "district_slug"}
        for row in synthetic_rows
    ]

    with pytest.raises(DatasetError, match="district_slug"):
        validate(rows)


def test_a_listing_without_a_price_is_refused(synthetic_rows):
    rows = [dict(row) for row in synthetic_rows]
    rows[3]["price_amd"] = 0

    with pytest.raises(DatasetError, match="no price"):
        validate(rows)


def test_a_single_district_is_refused_because_grouped_validation_needs_groups(synthetic_rows):
    rows = [dict(row, district_slug="kentron") for row in synthetic_rows]

    with pytest.raises(DatasetError, match="two districts"):
        validate(rows)


def test_a_usable_dataset_passes(synthetic_rows):
    validate(synthetic_rows)


def test_the_fingerprint_depends_on_the_data_and_not_on_its_order(synthetic_rows):
    forwards = fingerprint(synthetic_rows)
    backwards = fingerprint(list(reversed(synthetic_rows)))

    assert forwards == backwards
    assert len(forwards) == 64


def test_changing_one_price_changes_the_fingerprint(synthetic_rows):
    changed = [dict(row) for row in synthetic_rows]
    changed[0]["price_amd"] += 100_000

    assert fingerprint(changed) != fingerprint(synthetic_rows)


def test_districts_come_back_sorted_and_deduplicated(synthetic_rows):
    result = districts_of(synthetic_rows)

    assert result == tuple(sorted(set(result)))


def test_a_dataset_survives_a_round_trip_through_csv(tmp_path, synthetic_rows):
    path = tmp_path / "dataset.csv"

    write_csv(synthetic_rows, path)
    restored = load_from_csv(path)

    assert len(restored) == len(synthetic_rows)
    assert restored[0]["price_amd"] == pytest.approx(synthetic_rows[0]["price_amd"])
    assert restored[0]["district_slug"] == synthetic_rows[0]["district_slug"]
    # The types matter: a float read back as a string would break the pipeline.
    assert isinstance(restored[0]["total_area"], float)
    assert isinstance(restored[0]["has_elevator"], bool)
    assert fingerprint(restored) == fingerprint(synthetic_rows)


def test_an_empty_export_is_refused_rather_than_written(tmp_path):
    with pytest.raises(DatasetError, match="empty dataset"):
        write_csv([], tmp_path / "empty.csv")


def test_a_missing_optional_value_survives_the_round_trip_as_none(tmp_path, synthetic_rows):
    rows = [dict(row) for row in synthetic_rows[:60]]
    rows[0]["kitchen_area"] = None
    path = tmp_path / "dataset.csv"

    write_csv(rows, path)
    restored = load_from_csv(path)

    assert restored[0]["kitchen_area"] is None
