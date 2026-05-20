# ══════════════════════════════════════════════
#  Stage 1 — builder
# ══════════════════════════════════════════════
FROM python:3.11-slim AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip \
 && pip install --prefix=/install --no-cache-dir -r requirements.txt


# ══════════════════════════════════════════════
#  Stage 2 — runtime
# ══════════════════════════════════════════════
FROM python:3.11-slim AS runtime

LABEL org.opencontainers.image.title="FinPlan Backend"
LABEL org.opencontainers.image.description="FastAPI + Tortoise ORM financial planning API"

# Non-root user
RUN groupadd -r finplan && useradd -r -g finplan -d /app finplan

WORKDIR /app

# Dependencies from builder stage
COPY --from=builder /install /usr/local

# Application source
COPY --chown=finplan:finplan . .

# SQLite data directory — persisted via Docker volume
RUN mkdir -p /app/data && chown finplan:finplan /app/data

USER finplan

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# Tortoise generate_schemas=True handles DB setup at startup — no aerich needed
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers ${WORKERS:-1} --no-access-log"]
