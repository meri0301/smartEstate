# syntax=docker/dockerfile:1
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1
# LightGBM's wheels link against OpenMP at runtime, which the slim image omits.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libgomp1 \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /srv
# The CPU build of torch, before anything can ask for the default one. The CUDA
# wheels are several gigabytes and this service never sees a GPU.
RUN pip install --index-url https://download.pytorch.org/whl/cpu "torch>=2.14,<3.0"
COPY pyproject.toml README.md ./
COPY app ./app
RUN pip install .

# --- test stage: adds dev tooling, used by `pnpm ml:test` / `pnpm ml:lint` and CI
FROM base AS test
RUN pip install ".[dev]"
COPY tests ./tests
CMD ["pytest"]

# --- training stage: the database driver and the analysis stack, never shipped
FROM base AS train
RUN pip install ".[train]"
ENTRYPOINT ["python", "-m", "app.pipelines.train"]

# --- runtime stage
FROM base AS runtime
# The weights, baked in at the pinned revision, so the container starts without a
# network and every image of this tag embeds identically. Only this stage needs
# them: the tests use a fake encoder and training does not embed anything.
ENV HF_HOME=/opt/huggingface
RUN python -m app.pipelines.embedding \
 && chmod -R a+rX /opt/huggingface
RUN useradd --system --uid 10001 --no-create-home app
# The cache is read-only to the service: it was filled at build time, and a
# running container has no business fetching weights nobody reviewed.
ENV HF_HUB_OFFLINE=1
USER app
EXPOSE 8000
# The encoder takes roughly half a minute to load, and the server answers only
# once start-up has finished, so the grace period has to cover it — otherwise
# the container is called unhealthy while it is doing exactly what it should.
HEALTHCHECK --interval=10s --timeout=3s --start-period=90s --retries=5 \
  CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2).status == 200 else 1)"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
