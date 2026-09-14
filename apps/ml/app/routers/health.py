"""Liveness and readiness probes, used by Docker and by the NestJS ML client."""

from datetime import UTC, datetime

from fastapi import APIRouter, Request, Response, status

from app import SERVICE_NAME, SERVICE_VERSION
from app.schemas.health import HealthResponse, ReadinessResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Report that the process is up. Whether it can value a listing is `/health/ready`."""
    return HealthResponse(
        status="ok",
        service=SERVICE_NAME,
        version=SERVICE_VERSION,
        timestamp=datetime.now(UTC),
    )


@router.get("/health/ready", response_model=ReadinessResponse)
def ready(request: Request, response: Response) -> ReadinessResponse:
    """
    Whether the service can actually answer a valuation.

    Separate from liveness on purpose: a process with no model should not be
    restarted, it should be trained. Returning 503 here keeps it out of a load
    balancer without putting it into a restart loop.
    """
    model = getattr(request.app.state, "valuation_model", None)
    error = getattr(request.app.state, "valuation_model_error", None)
    if model is None:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return ReadinessResponse(
            status="degraded",
            service=SERVICE_NAME,
            version=SERVICE_VERSION,
            model_loaded=False,
            model_version=None,
            detail=str(error) if error else "no valuation model has been trained",
        )
    return ReadinessResponse(
        status="ok",
        service=SERVICE_NAME,
        version=SERVICE_VERSION,
        model_loaded=True,
        model_version=model.version,
        detail=None,
    )
