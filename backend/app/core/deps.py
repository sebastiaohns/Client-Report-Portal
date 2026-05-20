"""
Reusable FastAPI dependencies via Depends().
"""
from __future__ import annotations

from fastapi import Depends, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError

from app.core.exceptions import ForbiddenException, UnauthorizedException
from app.core.security import decode_token
from app.models.user import User

_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer),
) -> User:
    if not credentials:
        raise UnauthorizedException("Token not provided.")
    try:
        payload = decode_token(credentials.credentials)
        if payload.get("type") != "access":
            raise UnauthorizedException("Invalid token type.")
        user_id: str = payload.get("sub")
    except JWTError:
        raise UnauthorizedException("Invalid or expired token.")

    user = await User.get_or_none(id=int(user_id))
    if not user or not user.is_active:
        raise UnauthorizedException("User not found or inactive.")
    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    return current_user


async def require_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    if not current_user.is_superuser:
        raise ForbiddenException("Admin access required.")
    return current_user
