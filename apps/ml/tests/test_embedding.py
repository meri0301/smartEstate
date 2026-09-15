"""
The encoder wrapper, without the encoder.

Loading real weights in a unit test would make the suite depend on a 470 MB
download and several seconds per run, and would test sentence-transformers
rather than this code. What is worth testing here is what this code adds: the
prefix that e5 needs, the dimension guard that stops a mismatched model reaching
the database one insert at a time, and the ordering contract.
"""

import pytest

from app.pipelines.embedding import (
    EMBEDDING_DIMENSIONS,
    MODEL_NAME,
    MODEL_REVISION,
    EmbeddingError,
    EmbeddingModel,
    model_version,
)


class FakeEncoder:
    """Records what it was asked to encode and returns vectors of the right width."""

    def __init__(self, dimensions: int = EMBEDDING_DIMENSIONS):
        self.dimensions = dimensions
        self.seen: list[str] = []
        self.kwargs: dict = {}

    def get_sentence_embedding_dimension(self) -> int:
        return self.dimensions

    def encode(self, texts, **kwargs):
        self.seen = list(texts)
        self.kwargs = kwargs
        # One distinguishable vector per text, so ordering is checkable.
        return [[float(index)] * self.dimensions for index, _ in enumerate(texts)]


def test_prefixes_a_passage_the_way_the_model_was_trained():
    encoder = FakeEncoder()

    EmbeddingModel(encoder).encode(["a quiet flat in Kentron"], "passage")

    assert encoder.seen == ["passage: a quiet flat in Kentron"]


def test_prefixes_a_query_differently_from_a_passage():
    # e5 is asymmetric. Using one prefix for both costs retrieval quality with
    # nothing to notice, which is why the kind is an argument and not a default.
    encoder = FakeEncoder()
    model = EmbeddingModel(encoder)

    model.encode(["պայծառ բնակարան"], "query")
    as_query = encoder.seen[0]
    model.encode(["պայծառ բնակարան"], "passage")

    assert as_query != encoder.seen[0]
    assert as_query.startswith("query: ")


def test_returns_one_vector_per_text_in_order():
    vectors = EmbeddingModel(FakeEncoder()).encode(["first", "second", "third"], "passage")

    assert [vector[0] for vector in vectors] == [0.0, 1.0, 2.0]
    assert all(len(vector) == EMBEDDING_DIMENSIONS for vector in vectors)


def test_asks_for_unit_vectors():
    # The index is built for cosine distance. With normalised vectors cosine,
    # inner product and Euclidean all agree, so a query cannot pick the wrong one.
    encoder = FakeEncoder()

    EmbeddingModel(encoder).encode(["anything"], "passage")

    assert encoder.kwargs["normalize_embeddings"] is True


def test_encodes_nothing_without_calling_the_model():
    encoder = FakeEncoder()

    assert EmbeddingModel(encoder).encode([], "passage") == []
    assert encoder.seen == []


def test_refuses_a_model_whose_output_does_not_fit_the_column():
    with pytest.raises(EmbeddingError, match="768"):
        EmbeddingModel(FakeEncoder(dimensions=768))


def test_version_names_the_weights_and_the_revision():
    version = model_version()

    assert version.startswith(MODEL_NAME)
    assert MODEL_REVISION.startswith(version.split("@", 1)[1])


def test_the_wrapper_reports_the_same_version_it_stores():
    model = EmbeddingModel(FakeEncoder())

    assert model.version == model_version()
    assert model.dimensions == EMBEDDING_DIMENSIONS
