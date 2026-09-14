"""
Shared fixtures.

The synthetic dataset below deliberately imitates the seed generator in
`apps/api/prisma/seed/lib/pricing.ts`: a district price level multiplied by
building-type, condition and floor effects, with log-normal noise. Building it
here rather than loading a fixture file means the tests know the true structure
and can assert that the model recovers it, which is a far stronger statement
than "the numbers did not change".
"""

import math
import random

import pytest

DISTRICTS = {
    "kentron": 1_150_000,
    "arabkir": 900_000,
    "davtashen": 720_000,
    "nor-nork": 560_000,
}

BUILDING_TYPE_MULTIPLIER = {
    "NEW_BUILD": 1.20,
    "MONOLITH": 1.15,
    "STALINKA": 1.05,
    "STONE": 1.00,
    "PANEL": 0.85,
    "KHRUSHCHYOVKA": 0.78,
}

CONDITION_MULTIPLIER = {
    "DESIGNER": 1.25,
    "EURO_RENOVATION": 1.12,
    "GOOD": 1.00,
    "OLD_RENOVATION": 0.88,
    "NEEDS_REPAIR": 0.75,
}

NOISE_SIGMA = 0.12


def floor_multiplier(floor, total_floors, has_elevator):
    if floor <= 1:
        return 0.94
    if floor == total_floors:
        return 0.98 if has_elevator else 0.95
    if 2 <= floor <= 4:
        return 1.03
    return 1.0


def make_row(rng, index):
    """One listing, priced by a known multiplicative model."""
    district = list(DISTRICTS)[index % len(DISTRICTS)]
    building_type = rng.choice(list(BUILDING_TYPE_MULTIPLIER))
    condition = rng.choice(list(CONDITION_MULTIPLIER))
    rooms = rng.choice([1, 2, 3, 4])
    total_area = round(rng.uniform(14, 26) * rooms + rng.uniform(4, 12), 1)
    total_floors = rng.choice([4, 5, 9, 12, 16])
    floor = rng.randint(1, total_floors)
    has_elevator = total_floors >= 9
    ceiling_height = round(rng.uniform(2.5, 3.3), 2)

    per_sqm = (
        DISTRICTS[district]
        * BUILDING_TYPE_MULTIPLIER[building_type]
        * CONDITION_MULTIPLIER[condition]
        * floor_multiplier(floor, total_floors, has_elevator)
        * math.exp(rng.gauss(0, NOISE_SIGMA))
    )
    price = round(per_sqm * total_area / 100_000) * 100_000

    return {
        "public_id": f"L-{index:06d}",
        "price_amd": float(price),
        "total_area": total_area,
        "living_area": round(total_area * rng.uniform(0.55, 0.72), 1),
        "kitchen_area": round(rng.uniform(5, 14), 1),
        "rooms": rooms,
        "bathrooms": 1 if rooms < 3 else 2,
        "ceiling_height": ceiling_height,
        "floor": floor,
        "balcony_count": rng.choice([0, 1, 1, 2]),
        "has_loggia": rng.random() < 0.3,
        "has_parking": rng.random() < 0.25,
        "has_storage": rng.random() < 0.4,
        "condition": condition,
        "heating": rng.choice(["CENTRAL_GAS", "INDIVIDUAL_GAS_BOILER", "ELECTRIC", "NONE"]),
        "ownership_docs": rng.choice(["VERIFIED", "UNVERIFIED"]),
        "lat": 40.17 + rng.uniform(-0.05, 0.08),
        "lon": 44.49 + rng.uniform(-0.06, 0.07),
        "building_type": building_type,
        "construction_year": rng.randint(1955, 2024),
        "total_floors": total_floors,
        "has_elevator": has_elevator,
        "seismic_retrofit": rng.random() < 0.2,
        "district_slug": district,
    }


@pytest.fixture(scope="session")
def synthetic_rows():
    """A deterministic dataset with the same shape the seed produces."""
    rng = random.Random(20_260_914)
    return [make_row(rng, index) for index in range(240)]


@pytest.fixture(scope="session")
def districts(synthetic_rows):
    return tuple(sorted({row["district_slug"] for row in synthetic_rows}))


@pytest.fixture
def one_listing(synthetic_rows):
    """A single listing, without the fields only training needs."""
    row = dict(synthetic_rows[0])
    row.pop("public_id")
    row.pop("price_amd")
    return row
