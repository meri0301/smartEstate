"""Schema for the `/health` endpoint."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class HealthResponse(BaseModel):
    """Liveness payload. Mirrors the shape returned by the NestJS `/health` route."""

    status: Literal["ok"]
    service: Literal["ml"]
    version: str
    timestamp: datetime
