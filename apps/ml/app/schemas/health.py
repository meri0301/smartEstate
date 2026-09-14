"""Schemas for the `/health` and `/health/ready` endpoints."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class HealthResponse(BaseModel):
    """Liveness payload. Mirrors the shape returned by the NestJS `/health` route."""

    status: Literal["ok"]
    service: Literal["ml"]
    version: str
    timestamp: datetime


class ReadinessResponse(BaseModel):
    """Readiness payload: up is not the same as able to value a listing."""

    # `model_` is a protected prefix in pydantic; these fields are about the
    # machine-learning model, not about pydantic, so the guard is turned off.
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, protected_namespaces=()
    )

    status: Literal["ok", "degraded"]
    service: Literal["ml"]
    version: str
    model_loaded: bool
    model_version: str | None
    #: Why it is degraded, in words a developer can act on.
    detail: str | None
