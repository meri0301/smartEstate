"""
Multilingual sentence embeddings, computed here and nowhere else.

The brief forbids calling an external embedding API, so the model runs in this
process. Three decisions follow from that and from the fact that the whole
product has to start with `docker compose up` on an examiner's machine.

**The model is small on purpose.** `multilingual-e5-small` is 118M parameters
and about 470 MB of weights, against 1.1 GB for the `base` variant and 1.8 GB
for LaBSE. It is trained for retrieval rather than for sentence similarity in
general, which is what this is for, and its XLM-RoBERTa vocabulary covers
Armenian and Russian. The cost is 384 dimensions instead of 768, which is why
`listing_embeddings.embedding` is a `vector(384)`.

**The revision is pinned, not floating.** A vector is only comparable with
another vector from the same weights, so the stored `model_version` carries the
commit hash and every row records which weights produced it. Changing either is
a migration and a re-index, not a config change.

**e5 is asymmetric.** It was trained with `query:` and `passage:` prefixes, and
using the wrong one — or neither — quietly costs a large part of the retrieval
quality without any error to notice. That is why `encode` refuses to guess and
takes the kind as an argument.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from pathlib import Path
from typing import TYPE_CHECKING, Literal

if TYPE_CHECKING:  # pragma: no cover - import cost is paid only at runtime
    from sentence_transformers import SentenceTransformer

logger = logging.getLogger("smartestate.ml")

#: The weights. Named and revisioned here so nothing else has to know either.
MODEL_NAME = "intfloat/multilingual-e5-small"
MODEL_REVISION = "614241f622f53c4eeff9890bdc4f31cfecc418b3"

#: Must equal the dimension of `listing_embeddings.embedding` in the database.
EMBEDDING_DIMENSIONS = 384

#: What the model was trained to expect in front of a text, by role.
PREFIXES: dict[str, str] = {"query": "query: ", "passage": "passage: "}
TextKind = Literal["query", "passage"]

#: Repository files that are alternative builds of the same weights. Downloading
#: them would triple the image for no benefit, since only the PyTorch build is used.
IGNORE_PATTERNS = ("onnx/*", "openvino/*", ".eval_results/*", "pytorch_model.bin")


class EmbeddingError(RuntimeError):
    """The model could not be loaded, or could not encode what it was given."""


def model_version() -> str:
    """
    The identifier stored with every vector.

    Name and revision together, because a vector produced by different weights is
    not comparable with one produced by these, and a row that does not say which
    it came from cannot be trusted or selectively rebuilt.
    """
    return f"{MODEL_NAME}@{MODEL_REVISION[:12]}"


def download(cache_dir: Path | None = None) -> Path:
    """
    Fetch the pinned revision into the local hub cache.

    Called from the image build so the container carries its weights and starts
    without a network. Returns the directory the snapshot landed in.
    """
    from huggingface_hub import snapshot_download

    target = snapshot_download(
        MODEL_NAME,
        revision=MODEL_REVISION,
        ignore_patterns=list(IGNORE_PATTERNS),
        **({} if cache_dir is None else {"cache_dir": str(cache_dir)}),
    )
    logger.info("embedding model %s downloaded to %s", model_version(), target)
    return Path(target)


class EmbeddingModel:
    """A loaded encoder, with the version that has to travel with its output."""

    def __init__(self, encoder: SentenceTransformer) -> None:
        self._encoder = encoder
        dimensions = encoder.get_sentence_embedding_dimension()
        if dimensions != EMBEDDING_DIMENSIONS:
            # The database column is fixed width. A model whose output does not
            # fit it would fail one insert at a time, deep inside a backfill.
            raise EmbeddingError(
                f"{MODEL_NAME} produced {dimensions} dimensions, "
                f"but the schema stores {EMBEDDING_DIMENSIONS}"
            )

    @property
    def version(self) -> str:
        """The pinned model identifier, stored alongside every vector."""
        return model_version()

    @property
    def dimensions(self) -> int:
        """Width of the vectors this model produces."""
        return EMBEDDING_DIMENSIONS

    def encode(self, texts: Sequence[str], kind: TextKind) -> list[list[float]]:
        """
        Encode a batch, in order, as unit vectors.

        Normalised because the index is built for cosine distance: with unit
        vectors cosine similarity, inner product and Euclidean distance all agree
        on the ordering, and the caller cannot pick the wrong one by accident.
        """
        if not texts:
            return []
        prefix = PREFIXES[kind]
        vectors = self._encoder.encode(
            [prefix + text for text in texts],
            normalize_embeddings=True,
            convert_to_numpy=True,
            show_progress_bar=False,
        )
        return [[float(value) for value in vector] for vector in vectors]


def load_embedding_model() -> EmbeddingModel:
    """
    Load the pinned revision, from the local cache when it is there.

    Raises `EmbeddingError` rather than any of the several exception types the
    hub and the tokeniser can produce, so the caller has one thing to catch and
    one message to log.
    """
    try:
        from sentence_transformers import SentenceTransformer

        encoder = SentenceTransformer(MODEL_NAME, revision=MODEL_REVISION)
    except EmbeddingError:
        raise
    except Exception as error:
        raise EmbeddingError(f"could not load {model_version()}: {error}") from error
    return EmbeddingModel(encoder)


def main() -> None:
    """Entry point for the image build: fetch the weights and stop."""
    logging.basicConfig(level=logging.INFO)
    download()


if __name__ == "__main__":  # pragma: no cover - build-time entry point
    main()
