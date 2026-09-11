"""FastAPI application factory and ASGI entry point."""

from fastapi import FastAPI

from app import SERVICE_VERSION
from app.routers import health


def create_app() -> FastAPI:
    """Build the application. Routers are registered here and nowhere else."""
    application = FastAPI(
        title="SmartEstate ML",
        version=SERVICE_VERSION,
        description="Price valuation, explanations and multilingual embeddings.",
    )
    application.include_router(health.router)
    return application


app = create_app()
