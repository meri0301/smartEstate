"""Liveness probe used by Docker health checks and the NestJS ML client."""

from datetime import UTC, datetime

from fastapi import APIRouter

from app import SERVICE_NAME, SERVICE_VERSION
from app.schemas.health import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Report that the process is up. Model readiness is reported separately once models exist."""
    return HealthResponse(
        status="ok",
        service=SERVICE_NAME,
        version=SERVICE_VERSION,
        timestamp=datetime.now(UTC),
    )
