"""
Application entry point.
Configures FastAPI, middlewares, routes, and the Tortoise ORM lifecycle.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from tortoise.contrib.fastapi import register_tortoise

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import TORTOISE_ORM
from app.core.exceptions import register_exception_handlers
from app.core.logging import setup_logging
from app.middleware.logging_middleware import LoggingMiddleware

setup_logging()

# ── Rate limiter ──────────────────────────────────────────────────────────────
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[f"{settings.RATE_LIMIT_PER_MINUTE}/minute"],
)


# ── App factory ───────────────────────────────────────────────────────────────
def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        docs_url="/docs"        if not settings.is_production else None,
        redoc_url="/redoc"      if not settings.is_production else None,
        openapi_url="/openapi.json" if not settings.is_production else None,
    )

    # ── Tortoise ORM — generate_schemas=False handles table creation at startup
    register_tortoise(
        app,
        config=TORTOISE_ORM,
        generate_schemas=False,
        add_exception_handlers=True,
    )

    # ── Middlewares (order matters — outermost first) ─────────────────────────
    app.add_middleware(LoggingMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.origins_list,
        allow_credentials=True,
        allow_methods=settings.ALLOWED_METHODS.split(","),
        allow_headers=settings.ALLOWED_HEADERS.split(","),
    )

    # ── Rate limiting ─────────────────────────────────────────────────────────
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # ── Exception handlers ────────────────────────────────────────────────────
    register_exception_handlers(app)

    # ── Routers ───────────────────────────────────────────────────────────────
    app.include_router(api_router)

    # ── Health check ──────────────────────────────────────────────────────────
    @app.get("/health", tags=["Health"])
    async def health_check():
        return {
            "status":  "ok",
            "version": settings.APP_VERSION,
            "env":     settings.APP_ENV,
        }

    return app


app = create_app()
