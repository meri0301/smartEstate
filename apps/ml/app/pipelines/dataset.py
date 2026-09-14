"""
Where training data comes from.

The service itself never touches the database: it is handed features over HTTP
and answers. Only the training CLI reads Postgres, which is why the driver is an
optional dependency and this module imports it lazily.

A CSV loader exists beside it so the model can be retrained from an exported
snapshot, for instance on a machine that has no database, and so the training
tests can run without one.
"""

from __future__ import annotations

import csv
import hashlib
from pathlib import Path
from typing import Any, Final

#: Only published listings. Drafts and rejected listings are not market evidence,
#: and archived ones may be years stale.
TRAINING_SQL: Final[str] = """
SELECT
  l.public_id,
  l.price_amd,
  l.price_per_sqm_amd,
  l.total_area,
  l.living_area,
  l.kitchen_area,
  l.rooms,
  l.bathrooms,
  l.ceiling_height,
  l.floor,
  l.balcony_count,
  l.has_loggia,
  l.has_parking,
  l.has_storage,
  l.condition::text   AS condition,
  l.heating::text     AS heating,
  l.ownership_docs::text AS ownership_docs,
  ST_Y(l.location)    AS lat,
  ST_X(l.location)    AS lon,
  b.building_type::text AS building_type,
  b.construction_year,
  b.total_floors,
  b.has_elevator,
  b.seismic_retrofit,
  d.slug              AS district_slug
FROM listings l
JOIN buildings b ON b.id = l.building_id
JOIN districts d ON d.id = l.district_id
WHERE l.status = 'PUBLISHED'
ORDER BY l.public_id
"""

#: Columns a row must carry for the feature pipeline and the target to work.
REQUIRED_COLUMNS: Final[tuple[str, ...]] = (
    "public_id",
    "price_amd",
    "total_area",
    "rooms",
    "floor",
    "total_floors",
    "construction_year",
    "condition",
    "heating",
    "building_type",
    "ownership_docs",
    "district_slug",
    "lat",
    "lon",
)

_NUMERIC_CSV_COLUMNS: Final[frozenset[str]] = frozenset(
    {
        "price_amd",
        "price_per_sqm_amd",
        "total_area",
        "living_area",
        "kitchen_area",
        "rooms",
        "bathrooms",
        "ceiling_height",
        "floor",
        "balcony_count",
        "construction_year",
        "total_floors",
        "lat",
        "lon",
    }
)

_BOOLEAN_CSV_COLUMNS: Final[frozenset[str]] = frozenset(
    {"has_loggia", "has_parking", "has_storage", "has_elevator", "seismic_retrofit"}
)


class DatasetError(RuntimeError):
    """The training set could not be read, or is not usable for training."""


def load_from_postgres(database_url: str) -> list[dict[str, Any]]:
    """Read every published listing, joined to its building and district."""
    try:
        import psycopg
        from psycopg.rows import dict_row
    except ImportError as error:  # pragma: no cover - depends on the install extra
        raise DatasetError(
            "psycopg is not installed; install the service with the 'train' extra"
        ) from error

    with psycopg.connect(database_url, row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(TRAINING_SQL)
            rows = [dict(row) for row in cursor.fetchall()]
    return [_coerce(row) for row in rows]


def load_from_csv(path: Path) -> list[dict[str, Any]]:
    """Read the same shape from a CSV export, for machines without a database."""
    with path.open(encoding="utf-8", newline="") as handle:
        rows = [dict(row) for row in csv.DictReader(handle)]
    return [_coerce(_parse_csv_row(row)) for row in rows]


def write_csv(rows: list[dict[str, Any]], path: Path) -> None:
    """Export a dataset so a training run can be reproduced exactly."""
    if not rows:
        raise DatasetError("refusing to write an empty dataset")
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = list(rows[0].keys())
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def validate(rows: list[dict[str, Any]], minimum_rows: int = 50) -> None:
    """
    Refuse a dataset that cannot produce a defensible model.

    Failing loudly here beats training on twelve rows and shipping a model whose
    metrics look fine because the test fold was empty.
    """
    if len(rows) < minimum_rows:
        raise DatasetError(
            f"only {len(rows)} listings available; at least {minimum_rows} are needed. "
            "Has the database been seeded?"
        )
    missing = [name for name in REQUIRED_COLUMNS if name not in rows[0]]
    if missing:
        raise DatasetError(f"dataset is missing the columns {', '.join(missing)}")
    without_price = sum(1 for row in rows if not row.get("price_amd"))
    if without_price:
        raise DatasetError(f"{without_price} listings have no price and cannot be trained on")
    districts = {row["district_slug"] for row in rows}
    if len(districts) < 2:
        raise DatasetError(
            "at least two districts are needed; holding out whole districts is the "
            "validation this model is judged by"
        )


def fingerprint(rows: list[dict[str, Any]]) -> str:
    """
    A stable digest of the training set.

    Deliberately the same triple the compose job hashes to prove the seed is
    deterministic, so a model's fingerprint can be matched against a database.
    """
    digest = hashlib.sha256()
    for row in sorted(rows, key=lambda item: str(item["public_id"])):
        digest.update(
            f"{row['public_id']}:{int(row['price_amd'])}:{float(row['total_area']):.2f}|".encode()
        )
    return digest.hexdigest()


def districts_of(rows: list[dict[str, Any]]) -> tuple[str, ...]:
    """District vocabulary, in a fixed order, for the categorical encoding."""
    return tuple(sorted({str(row["district_slug"]) for row in rows}))


def _parse_csv_row(row: dict[str, str]) -> dict[str, Any]:
    """CSV has only strings; put the numbers and flags back."""
    parsed: dict[str, Any] = {}
    for key, raw in row.items():
        if raw == "":
            parsed[key] = None
        elif key in _NUMERIC_CSV_COLUMNS:
            parsed[key] = float(raw)
        elif key in _BOOLEAN_CSV_COLUMNS:
            parsed[key] = raw.strip().lower() in {"true", "t", "1", "yes"}
        else:
            parsed[key] = raw
    return parsed


def _coerce(row: dict[str, Any]) -> dict[str, Any]:
    """
    Normalise the database's numeric types.

    Postgres hands back `Decimal` for numeric columns and `int` for bigint;
    pandas would keep the Decimals as objects and silently refuse to do
    arithmetic on them.
    """
    out: dict[str, Any] = {}
    for key, value in row.items():
        if key in _NUMERIC_CSV_COLUMNS and value is not None:
            out[key] = float(value)
        elif key in _BOOLEAN_CSV_COLUMNS and value is not None:
            out[key] = bool(value)
        else:
            out[key] = value
    return out
