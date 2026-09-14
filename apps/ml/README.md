# SmartEstate ML service

FastAPI service owning the Python side of the AI layer: the price valuation model and its
explanations. Multilingual embeddings for semantic search arrive with that feature. The
service talks to `apps/api` over HTTP and never touches the database; only training does.

## Endpoints

| Route           | What it does                                                              |
| --------------- | ------------------------------------------------------------------------- |
| `GET /health`   | Liveness. Answers whether or not a model is loaded                        |
| `GET /health/ready` | Readiness. **503** and a reason when no model is loaded                |
| `POST /predict` | Values a batch of listings: point estimate plus an 80% interval            |
| `POST /explain` | Values one listing and names the features that moved the estimate          |
| `GET /model`    | Describes the deployed model: version, training set, metrics              |
| `GET /docs`     | Interactive OpenAPI documentation                                         |

A missing model is a supported state. The service starts, reports itself degraded, and answers
503 on the valuation routes, so the rest of the product runs without one.

## The model

- **Target:** natural log of price per m². Area is divided out so the model cannot score well
  by learning that bigger flats cost more, and the log turns the market's proportional effects
  into additive ones.
- **Estimator:** LightGBM, plus two more boosters at the 10th and 90th percentiles for the
  interval. The interval is then widened by a conformal offset measured out of fold, because the
  raw quantile range covers far less than it promises on a few hundred rows.
- **Explanations:** exact TreeSHAP, computed by LightGBM's own `pred_contrib`. A contribution is
  a log multiplier, so exponentiating it gives the "+12%" form the interface shows.
- **Validation:** random k-fold and leave-one-district-out, side by side, against a linear
  regression on floor area alone. See [`docs/thesis/evaluation.md`](../../docs/thesis/evaluation.md).

## Training

Needs a seeded database. Everything the run produces, the artefact in `app/models` and the
evaluation chapter, is written by the same command so the deployed model and its published
numbers cannot disagree.

```bash
pnpm docker:up && pnpm db:migrate && pnpm db:seed
pnpm ml:train
```

Useful flags, passed through to `python -m app.pipelines.train`:

| Flag            | Why                                                              |
| --------------- | ---------------------------------------------------------------- |
| `--dry-run`     | Print the metrics and write nothing                              |
| `--csv PATH`    | Train from an exported dataset instead of a live database        |
| `--export-csv PATH` | Save the training set so a run can be reproduced without a database |
| `--min-rows N`  | Refuse to train on fewer listings (default 50)                   |

## Layout

```
app/
  models/      trained artefacts: three boosters in LightGBM text format, plus metadata.json
  pipelines/   features, training, evaluation, and the model wrapper used at request time
  routers/     HTTP surface
  schemas/     the wire contract, camelCase on the outside and snake_case inside
notebooks/     EDA for the thesis
tests/
```

The feature pipeline is shared by training and inference on purpose: a feature computed one way
during training and another way at request time is the classic silent failure of a deployed
model, and one implementation is the only reliable defence.

## Run locally with Docker (no Python install required)

```bash
docker compose up -d --build ml
curl http://localhost:8000/health/ready
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
