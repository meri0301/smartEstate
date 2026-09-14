"""
The wire contract for valuation.

Field names are camelCase on the wire because every other service in the system
speaks camelCase, and snake_case in Python because that is what Python reads
like; pydantic's alias generator bridges the two, so neither side has to
compromise. `extra="forbid"` is deliberate: a caller that misspells a feature
should be told, not quietly given a valuation computed without it.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.pipelines.enums import (
    BUILDING_TYPES,
    CONDITIONS,
    HEATING_TYPES,
    OWNERSHIP_DOCS_STATUSES,
)

# Built from the shared vocabularies rather than retyped, so an enum can only be
# extended in one place.
BuildingType = Literal[BUILDING_TYPES]
Condition = Literal[CONDITIONS]
HeatingType = Literal[HEATING_TYPES]
OwnershipDocs = Literal[OWNERSHIP_DOCS_STATUSES]

#: One request should cover a page of search results and no more.
MAX_BATCH = 100


class CamelModel(BaseModel):
    """Base for every payload: camelCase aliases, strict about unknown fields."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
        # `model_` is a protected prefix in pydantic; `modelVersion` is about the
        # machine-learning model, so the guard is turned off rather than the
        # field renamed into something the API would not recognise.
        protected_namespaces=(),
    )


class ListingFeatures(CamelModel):
    """
    A listing as the model sees it.

    Bounds mirror the Zod contract in `packages/contracts`, so a payload the API
    would accept is a payload this service accepts. Optional fields are genuinely
    optional: a missing kitchen area is treated as unknown, not as zero.
    """

    total_area: Annotated[float, Field(gt=5, le=1000)]
    rooms: Annotated[int, Field(ge=1, le=10)]
    floor: Annotated[int, Field(ge=1, le=60)]
    total_floors: Annotated[int, Field(ge=1, le=60)]
    construction_year: Annotated[int, Field(ge=1850, le=2100)]
    district_slug: Annotated[str, Field(min_length=2, max_length=40)]
    building_type: BuildingType
    condition: Condition
    heating: HeatingType
    ownership_docs: OwnershipDocs = "UNVERIFIED"
    lat: Annotated[float, Field(ge=-90, le=90)]
    lon: Annotated[float, Field(ge=-180, le=180)]

    living_area: Annotated[float | None, Field(default=None, gt=0, le=1000)]
    kitchen_area: Annotated[float | None, Field(default=None, gt=0, le=200)]
    bathrooms: Annotated[int, Field(default=1, ge=1, le=5)]
    ceiling_height: Annotated[float | None, Field(default=None, ge=2, le=5)]
    balcony_count: Annotated[int, Field(default=0, ge=0, le=5)]
    has_loggia: bool = False
    has_parking: bool = False
    has_storage: bool = False
    has_elevator: bool = False
    seismic_retrofit: bool = False

    def to_row(self) -> dict[str, Any]:
        """The snake_case mapping the feature pipeline expects."""
        return self.model_dump(by_alias=False)


class Estimate(CamelModel):
    """A valuation in dram: the point estimate and the range around it."""

    price_per_sqm_amd: float
    price_amd: float
    low_price_amd: float
    high_price_amd: float


class PredictRequest(CamelModel):
    listings: Annotated[list[ListingFeatures], Field(min_length=1, max_length=MAX_BATCH)]


class PredictResponse(CamelModel):
    """Estimates in the order the listings were sent."""

    model_version: str
    estimates: list[Estimate]


class Contribution(CamelModel):
    """
    One reason. `effect` is the multiplier the feature applied, as a fraction:
    0.12 means this feature raised the estimate by 12%.
    """

    feature: str
    value: Any = None
    effect: float
    log_contribution: float


class ExplainRequest(CamelModel):
    listing: ListingFeatures
    #: Supply it to get the deviation and the fair-price verdict as well.
    asking_price_amd: Annotated[float | None, Field(default=None, gt=0)]
    top_k: Annotated[int, Field(default=3, ge=1, le=10)]


class ExplainResponse(CamelModel):
    """The estimate, the reasons behind it, and how an asking price compares."""

    model_version: str
    estimate: Estimate
    #: What the average listing in the training set is worth per m², before any
    #: of this listing's own features are taken into account.
    baseline_price_per_sqm_amd: float
    contributions: list[Contribution]
    #: Asking price against the estimate: 0.12 means asking 12% above it.
    deviation: float | None = None
    verdict: Literal["UNDERPRICED", "FAIR", "OVERPRICED"] | None = None


class ModelInfo(CamelModel):
    """What is loaded, for the readiness probe and for the thesis appendix."""

    model_version: str
    trained_at: str
    training_rows: int
    districts: list[str]
    target: str
    dataset_fingerprint: str
    lightgbm_version: str
    metrics: dict[str, Any]
