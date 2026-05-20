from __future__ import annotations

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


# ── Domain exceptions ─────────────────────────────────────────────────────────

class AppException(Exception):
    """Base class for all domain exceptions."""
    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR
    detail: str = "Internal server error."

    def __init__(self, detail: str | None = None):
        self.detail = detail or self.__class__.detail
        super().__init__(self.detail)


class NotFoundException(AppException):
    status_code = status.HTTP_404_NOT_FOUND
    detail = "Resource not found."


class ConflictException(AppException):
    status_code = status.HTTP_409_CONFLICT
    detail = "Conflict with an existing resource."


class UnauthorizedException(AppException):
    status_code = status.HTTP_401_UNAUTHORIZED
    detail = "Not authenticated."


class ForbiddenException(AppException):
    status_code = status.HTTP_403_FORBIDDEN
    detail = "Insufficient permissions."


class BadRequestException(AppException):
    status_code = status.HTTP_400_BAD_REQUEST
    detail = "Invalid request."


# ── Handlers ──────────────────────────────────────────────────────────────────

def _error_response(status_code: int, detail: str | list) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"detail": detail}},
    )


def register_exception_handlers(app: FastAPI) -> None:

    @app.exception_handler(AppException)
    async def app_exception_handler(request: Request, exc: AppException):
        return _error_response(exc.status_code, exc.detail)

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        errors = [
            {"field": ".".join(str(l) for l in e["loc"]), "message": e["msg"]}
            for e in exc.errors()
        ]
        return _error_response(status.HTTP_422_UNPROCESSABLE_ENTITY, errors)

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        from app.core.logging import get_logger
        log = get_logger()
        log.error("unhandled_exception", exc_info=exc, path=str(request.url))
        return _error_response(status.HTTP_500_INTERNAL_SERVER_ERROR, "Internal server error.")
