"""
`/predict`, `/explain` and `/model` — everything the API asks this service for.

The model is loaded once, when the application starts, and held on
`app.state`. A request must never pay for a disk read, and a service that cannot
find its artefact must say so plainly rather than fail one request at a time:
these routes answer **503 with a readable message** when no model is loaded,
which is what lets the rest of the product degrade instead of breaking.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.pipelines.valuation import ValuationModel
from app.schemas.valuation import (
    Contribution,
    Estimate,
    ExplainRequest,
    ExplainResponse,
    ModelInfo,
    PredictRequest,
    PredictResponse,
)

router = APIRouter(tags=["valuation"])

_NO_MODEL = (
    "No valuation model is loaded. Train one with `pnpm ml:train` against a seeded database."
)


def require_model(request: Request) -> ValuationModel:
    """Dependency that turns a missing artefact into a 503 rather than a 500."""
    model: ValuationModel | None = getattr(request.app.state, "valuation_model", None)
    if model is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=_NO_MODEL)
    return model


ModelDependency = Annotated[ValuationModel, Depends(require_model)]


@router.post("/predict", response_model=PredictResponse)
def predict(payload: PredictRequest, model: ModelDependency) -> PredictResponse:
    """Value a batch of listings. Estimates come back in the order they were sent."""
    estimates = model.predict([listing.to_row() for listing in payload.listings])
    return PredictResponse(
        model_version=model.version,
        estimates=[
            Estimate(
                price_per_sqm_amd=estimate.price_per_sqm_amd,
                price_amd=estimate.price_amd,
                low_price_amd=estimate.low_price_amd,
                high_price_amd=estimate.high_price_amd,
            )
            for estimate in estimates
        ],
    )


@router.post("/explain", response_model=ExplainResponse)
def explain(payload: ExplainRequest, model: ModelDependency) -> ExplainResponse:
    """
    Value one listing and say which of its features moved the estimate most.

    With `askingPriceAmd` the response also carries the deviation and the verdict,
    so the interface never has to compute either from the numbers itself.
    """
    result = model.explain(
        payload.listing.to_row(),
        asking_price_amd=payload.asking_price_amd,
        top_k=payload.top_k,
    )
    return ExplainResponse(
        model_version=model.version,
        estimate=Estimate(
            price_per_sqm_amd=result.estimate.price_per_sqm_amd,
            price_amd=result.estimate.price_amd,
            low_price_amd=result.estimate.low_price_amd,
            high_price_amd=result.estimate.high_price_amd,
        ),
        baseline_price_per_sqm_amd=result.baseline_price_per_sqm_amd,
        contributions=[
            Contribution(
                feature=item.feature,
                value=item.value,
                effect=item.effect,
                log_contribution=item.log_contribution,
            )
            for item in result.contributions
        ],
        deviation=result.deviation,
        verdict=result.verdict,
    )


@router.get("/model", response_model=ModelInfo)
def model_info(model: ModelDependency) -> ModelInfo:
    """Describe the loaded model. Every stored valuation cites this version."""
    metadata = model.metadata
    return ModelInfo(
        model_version=metadata.model_version,
        trained_at=metadata.trained_at,
        training_rows=metadata.training_rows,
        districts=list(metadata.districts),
        target=metadata.target,
        dataset_fingerprint=metadata.dataset_fingerprint,
        lightgbm_version=metadata.lightgbm_version,
        metrics=metadata.metrics,
    )
