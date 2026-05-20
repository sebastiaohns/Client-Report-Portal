from __future__ import annotations

from jose import JWTError

from app.core.exceptions import UnauthorizedException
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_password,
)
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse


class AuthService:

    async def login(self, payload: LoginRequest) -> TokenResponse:
        user = await User.get_or_none(email=payload.email)
        if not user or not verify_password(payload.password, user.hashed_password):
            raise UnauthorizedException("Invalid credentials.")
        if not user.is_active:
            raise UnauthorizedException("Account is inactive.")

        return TokenResponse(
            access_token=create_access_token(user.id),
            refresh_token=create_refresh_token(user.id),
        )

    async def refresh(self, refresh_token: str) -> TokenResponse:
        try:
            payload = decode_token(refresh_token)
            if payload.get("type") != "refresh":
                raise UnauthorizedException("Invalid refresh token.")
            user_id = int(payload["sub"])
        except (JWTError, KeyError, ValueError):
            raise UnauthorizedException("Invalid or expired refresh token.")

        user = await User.get_or_none(id=user_id)
        if not user or not user.is_active:
            raise UnauthorizedException("User not found or inactive.")

        return TokenResponse(
            access_token=create_access_token(user.id),
            refresh_token=create_refresh_token(user.id),
        )


auth_service = AuthService()
