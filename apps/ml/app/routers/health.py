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
    Whether the service can actually do its two jobs.

    Separate from liveness on purpose: a process with no model should not be
    restarted, it should be trained. Returning 503 here keeps it out of a load
    balancer without putting it into a restart loop.

    Either model missing is a degraded service, and the detail says which, so an
    operator is not left comparing two booleans to work out what to fix.
    """
    model = getattr(request.app.state, "valuation_model", None)
    model_error = getattr(request.app.state, "valuation_model_error", None)
    encoder = getattr(request.app.state, "embedding_model", None)
    encoder_error = getattr(request.app.state, "embedding_model_error", None)

    missing = []
    if model is None:
        missing.append(str(model_error) if model_error else "no valuation model has been trained")
    # No encoder and no error means it was switched off on purpose, which is a
    # configuration and not a fault.
    if encoder is None and encoder_error is not None:
        missing.append(str(encoder_error))

    if missing:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return ReadinessResponse(
        status="degraded" if missing else "ok",
        service=SERVICE_NAME,
        version=SERVICE_VERSION,
        model_loaded=model is not None,
        model_version=None if model is None else model.version,
        embeddings_loaded=encoder is not None,
        embedding_model_version=None if encoder is None else encoder.version,
        detail="; ".join(missing) if missing else None,
    )
