"""
`/embed` and `/embed/model` — vectors for hybrid search.

Same shape as the valuation routes, for the same reason: the encoder is loaded
once at start-up and held on `app.state`, and a service that could not load it
answers **503 with a readable message** rather than failing one request at a
time. The API treats that 503 as "search lexically today", which is the whole
point of putting the fallback in the contract rather than in a comment.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.pipelines.embedding import EmbeddingError, EmbeddingModel
from app.schemas.embed import EmbeddingModelInfo, EmbedRequest, EmbedResponse

router = APIRouter(tags=["embeddings"])

_NO_MODEL = (
    "No embedding model is loaded. The image build fetches it; "
    "outside the container it is downloaded on first start and needs network access."
)


def require_model(request: Request) -> EmbeddingModel:
    """Dependency that turns a missing encoder into a 503 rather than a 500."""
    model: EmbeddingModel | None = getattr(request.app.state, "embedding_model", None)
    if model is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=_NO_MODEL)
    return model


ModelDependency = Annotated[EmbeddingModel, Depends(require_model)]


@router.post("/embed", response_model=EmbedResponse)
def embed(payload: EmbedRequest, model: ModelDependency) -> EmbedResponse:
    """Encode a batch. Vectors come back in the order the texts were sent."""
    try:
        embeddings = model.encode(payload.texts, payload.kind)
    except EmbeddingError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)
        ) from error
    return EmbedResponse(
        model_version=model.version,
        dimensions=model.dimensions,
        embeddings=embeddings,
    )


@router.get("/embed/model", response_model=EmbeddingModelInfo)
def embedding_model(model: ModelDependency) -> EmbeddingModelInfo:
    """
    Which weights are loaded.

    The API asks before a backfill: rows stored under a different version are the
    ones that need rebuilding, and rows under this one can be left alone.
    """
    return EmbeddingModelInfo(model_version=model.version, dimensions=model.dimensions)
