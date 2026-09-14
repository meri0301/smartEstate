"""
Categorical vocabularies, mirrored from `packages/contracts/src/common/enums.ts`.

LightGBM encodes a categorical feature as an integer code, so training and
inference must agree on the order of the categories, not only on the set. That
makes these lists part of the model contract: appending a value is safe,
reordering one silently changes what every stored model means. A test compares
them against the TypeScript source, so the two cannot drift unnoticed.
"""

from typing import Final

BUILDING_TYPES: Final[tuple[str, ...]] = (
    "STONE",
    "PANEL",
    "MONOLITH",
    "KHRUSHCHYOVKA",
    "STALINKA",
    "NEW_BUILD",
)

CONDITIONS: Final[tuple[str, ...]] = (
    "NEEDS_REPAIR",
    "OLD_RENOVATION",
    "GOOD",
    "EURO_RENOVATION",
    "DESIGNER",
)

HEATING_TYPES: Final[tuple[str, ...]] = (
    "CENTRAL_GAS",
    "INDIVIDUAL_GAS_BOILER",
    "ELECTRIC",
    "NONE",
)

OWNERSHIP_DOCS_STATUSES: Final[tuple[str, ...]] = ("VERIFIED", "UNVERIFIED")

# The enum lists this module claims to mirror, keyed by their TypeScript name.
MIRRORED_TS_ENUMS: Final[dict[str, tuple[str, ...]]] = {
    "BUILDING_TYPES": BUILDING_TYPES,
    "CONDITIONS": CONDITIONS,
    "HEATING_TYPES": HEATING_TYPES,
    "OWNERSHIP_DOCS_STATUSES": OWNERSHIP_DOCS_STATUSES,
}

#: Condition is the one enum with a natural order, from unrenovated to designer
#: finish. Supplying it as a number as well as a category gives the trees a
#: monotone signal they would otherwise have to rediscover from splits.
CONDITION_RANK: Final[dict[str, int]] = {value: rank for rank, value in enumerate(CONDITIONS)}
