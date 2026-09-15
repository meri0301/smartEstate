"""
The `/embed` surface, including how it behaves with no encoder.

The guardrail that runs through the whole product applies here too: a dependency
that is missing must produce a clear 503 that the caller knows how to degrade
around, never a 500 and never a blank page. For search that means the API falls
back to lexical matching, so this 503 is a contract rather than an accident.
"""

import pytest
from fastapi.testclient import TestClient

from app.pipelines.embedding import EMBEDDING_DIMENSIONS, EmbeddingError, model_version
from app.schemas.embed import MAX_BATCH


class FakeEncoder:
    """Returns vectors of the right width, and can be told to fail."""

    def __init__(self, fail: bool = False):
        self.fail = fail
        self.seen: list[str] = []

    def get_sentence_embedding_dimension(self) -> int:
        return EMBEDDING_DIMENSIONS

    def encode(self, texts, **_kwargs):
        if self.fail:
            raise EmbeddingError("the tokeniser is missing")
        self.seen = list(texts)
        return [[0.1] * EMBEDDING_DIMENSIONS for _ in texts]


def make_client(encoder=None):
    from app.main import create_app
    from app.pipelines.embedding import EmbeddingModel

    app = create_app()
    client = TestClient(app)
    client.__enter__()
    client.app.state.embedding_model = None if encoder is None else EmbeddingModel(encoder)
    client.app.state.embedding_model_error = None
    return client


@pytest.fixture
def client():
    started = make_client(FakeEncoder())
    yield started
    started.__exit__(None, None, None)


@pytest.fixture
def client_without_encoder():
    started = make_client(None)
    yield started
    started.__exit__(None, None, None)


def test_returns_one_vector_per_text_with_the_version_that_made_them(client):
    response = client.post("/embed", json={"texts": ["one", "two"], "kind": "passage"})

    assert response.status_code == 200
    body = response.json()
    assert body["modelVersion"] == model_version()
    assert body["dimensions"] == EMBEDDING_DIMENSIONS
    assert len(body["embeddings"]) == 2
    assert len(body["embeddings"][0]) == EMBEDDING_DIMENSIONS


def test_embeds_all_three_scripts(client):
    response = client.post(
        "/embed",
        json={"texts": ["bright flat", "светлая квартира", "պայծառ բնակարան"], "kind": "passage"},
    )

    assert response.status_code == 200
    assert len(response.json()["embeddings"]) == 3


def test_a_query_is_embedded_differently_from_a_passage(client):
    client.post("/embed", json={"texts": ["a flat"], "kind": "query"})

    assert client.app.state.embedding_model._encoder.seen == ["query: a flat"]


def test_requires_the_kind_rather_than_guessing_it(client):
    response = client.post("/embed", json={"texts": ["a flat"]})

    assert response.status_code == 422


def test_rejects_a_kind_the_model_was_not_trained_with(client):
    response = client.post("/embed", json={"texts": ["a flat"], "kind": "document"})

    assert response.status_code == 422


def test_rejects_an_empty_batch(client):
    assert client.post("/embed", json={"texts": [], "kind": "passage"}).status_code == 422


def test_rejects_a_batch_larger_than_one_page(client):
    response = client.post("/embed", json={"texts": ["x"] * (MAX_BATCH + 1), "kind": "passage"})

    assert response.status_code == 422


def test_rejects_an_unknown_field(client):
    response = client.post("/embed", json={"texts": ["x"], "kind": "passage", "normalise": False})

    assert response.status_code == 422


def test_reports_the_loaded_weights(client):
    response = client.get("/embed/model")

    assert response.status_code == 200
    assert response.json() == {
        "modelVersion": model_version(),
        "dimensions": EMBEDDING_DIMENSIONS,
    }


def test_answers_503_with_a_readable_message_when_there_is_no_encoder(client_without_encoder):
    response = client_without_encoder.post("/embed", json={"texts": ["x"], "kind": "query"})

    assert response.status_code == 503
    assert "embedding model" in response.json()["detail"]


def test_asking_which_weights_also_degrades_cleanly(client_without_encoder):
    assert client_without_encoder.get("/embed/model").status_code == 503


def test_an_encoder_that_fails_mid_request_is_a_503_not_a_500():
    started = make_client(FakeEncoder(fail=True))
    try:
        response = started.post("/embed", json={"texts": ["x"], "kind": "passage"})

        assert response.status_code == 503
        assert "tokeniser" in response.json()["detail"]
    finally:
        started.__exit__(None, None, None)


def test_liveness_does_not_depend_on_the_encoder(client_without_encoder):
    assert client_without_encoder.get("/health").status_code == 200


def test_readiness_reports_the_encoder_separately(client):
    body = client.get("/health/ready").json()

    assert body["embeddingsLoaded"] is True
    assert body["embeddingModelVersion"] == model_version()


def test_embeddings_switched_off_is_a_configuration_not_a_fault(client_without_encoder):
    # The suite runs with ML_EMBEDDINGS_ENABLED=false, which leaves no error
    # behind. Readiness must not call that degraded, or every deployment that
    # only wants valuations would look broken.
    body = client_without_encoder.get("/health/ready").json()

    assert body["embeddingsLoaded"] is False
    assert body["embeddingModelVersion"] is None
    assert "embedding" not in (body["detail"] or "")
