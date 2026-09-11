# SmartEstate ML service

FastAPI service owning the Python-side of the AI layer: price valuation model, SHAP
explanations and local multilingual embeddings. Talks to `apps/api` over HTTP with a
typed contract.

Phase 0 ships the service shell (`/health`) plus tooling. Model code arrives in Phase 7.

## Run locally with Docker (no Python install required)

```bash
docker build -t smartestate-ml apps/ml
docker run --rm -p 8000:8000 smartestate-ml
curl http://localhost:8000/health
```

## Run tests and lint

From the repository root:

```bash
pnpm ml:test
pnpm ml:lint
```

## Run natively (optional)

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
pytest
ruff check . && ruff format --check .
```
