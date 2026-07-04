# syntax=docker/dockerfile:1

# ---- Stage 1: builder ----
# Install dependencies into a virtualenv, then install the project itself.
FROM python:3.13-slim AS builder

# Install uv via the official recommended image copy.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Ensure uv creates the venv at /app/.venv (also the default, made explicit).
ENV UV_PROJECT_ENVIRONMENT=/app/.venv \
    UV_LINK_MODE=copy

WORKDIR /app

# Install dependencies first (cached layer; do not build/install the project yet).
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# Copy the rest of the backend source and install the project into the venv.
COPY . .
RUN uv sync --frozen --no-dev

# ---- Stage 2: runner (final) ----
FROM python:3.13-slim AS runner

WORKDIR /app

# Copy the virtualenv and application source from the builder.
COPY --from=builder /app /app

# Put the venv on PATH; standard Python runtime flags.
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Create the uploads volume mount point (mounted at runtime via docker-compose).
RUN mkdir -p /app/static/uploads

EXPOSE 8000

CMD [".venv/bin/uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
