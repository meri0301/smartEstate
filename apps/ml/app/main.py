"""FastAPI application factory and ASGI entry point."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from app import SERVICE_VERSION
from app.config import get_settings
from app.pipelines.artifact import ArtifactError, load_artifact
from app.pipelines.valuation import ValuationModel
from app.routers import health, valuation

logger = logging.getLogger("smartestate.ml")


def load_valuation_model(app: FastAPI, model_dir: Path) -> None:
    """
    Load the artefact into application state, or record why it could not be.

    A missing or unreadable model is not a reason to refuse to start. The service
    comes up, reports itself degraded on `/health/ready`, and answers 503 on the
    valuation routes, so the rest of the product can run without a trained model
    instead of failing at boot with a stack trace nobody reads.
    """
    try:
        app.state.valuation_model = ValuationModel(load_artifact(model_dir))
        app.state.valuation_model_error = None
        logger.info("valuation model %s loaded", app.state.valuation_model.version)
    except (ArtifactError, OSError, ValueError, KeyError) as error:
        app.state.valuation_model = None
        app.state.valuation_model_error = error
        logger.warning("no valuation model loaded: %s", error)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Load the model once at start-up; a request should never read from disk."""
    load_valuation_model(app, get_settings().model_dir)
    yield


def create_app() -> FastAPI:
    """Build the application. Routers are registered here and nowhere else."""
    application = FastAPI(
        title="SmartEstate ML",
        version=SERVICE_VERSION,
        description="Price valuation, explanations and multilingual embeddings.",
        lifespan=lifespan,
    )
    application.include_router(health.router)
    application.include_router(valuation.router)
    return application


app = create_app()
