"""
The wire contract for embeddings.

Same conventions as valuation: camelCase on the wire, snake_case in Python,
unknown fields refused. The one field worth arguing about is `kind`, which has
no default on the request even though defaults are cheap — see the router.
"""

from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.pipelines.embedding import TextKind

#: One request should cover a page of listings and no more. Larger batches make
#: a single request long enough to look like a hang to the caller's timeout.
MAX_BATCH = 64

#: Longer than a listing description needs, short enough that a pathological
#: payload cannot occupy the model for minutes. The encoder truncates anyway.
MAX_TEXT_LENGTH = 4_000


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


class EmbedRequest(CamelModel):
    """A batch of texts, and what they are for."""

    texts: Annotated[
        list[Annotated[str, Field(min_length=1, max_length=MAX_TEXT_LENGTH)]],
        Field(min_length=1, max_length=MAX_BATCH),
    ]
    #: `query` for something somebody typed, `passage` for something being
    #: indexed. Required, because e5 was trained with these prefixes and the
    #: wrong one costs retrieval quality silently.
    kind: TextKind


class EmbedResponse(CamelModel):
    """Vectors in the order the texts were sent, with the weights that made them."""

    model_version: str
    dimensions: int
    embeddings: list[list[float]]


class EmbeddingModelInfo(CamelModel):
    """What the caller needs to decide whether its stored vectors are still valid."""

    model_version: str
    dimensions: int
