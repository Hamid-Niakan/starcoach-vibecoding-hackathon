FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

RUN groupadd --system gateway && useradd --system --gid gateway --home-dir /app gateway
COPY --from=ghcr.io/astral-sh/uv:0.8.13 /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-dev --no-install-project
COPY src ./src
RUN uv sync --frozen --no-dev
USER gateway
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["/app/.venv/bin/python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:4000/health/readiness', timeout=2)"]
CMD ["/app/.venv/bin/uvicorn", "ai_gateway.main:app", "--host", "0.0.0.0", "--port", "4000", "--workers", "1", "--no-access-log", "--no-server-header", "--log-level", "critical"]
