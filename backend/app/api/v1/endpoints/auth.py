from fastapi import APIRouter

from app.schemas.auth import LoginRequest, RefreshRequest, TokenResponse
from app.services.auth_service import auth_service

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest):
    """Authenticate a user and return access + refresh tokens."""
    return await auth_service.login(payload)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(payload: RefreshRequest):
    """Issue a new token pair from a valid refresh token."""
    return await auth_service.refresh(payload.refresh_token)
