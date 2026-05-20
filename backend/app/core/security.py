"""
Security utilities:
- Password hashing (argon2)
- JWT generation and validation (access + refresh tokens)
- Symmetric field-level encryption via Fernet (SSN at rest)
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

# ── Password ──────────────────────────────────────────────────────────────────

_pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")


def hash_password(plain: str) -> str:
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


# ── JWT ───────────────────────────────────────────────────────────────────────

def _create_token(subject: str | int, token_type: str, expires_delta: timedelta) -> str:
    expire = datetime.now(timezone.utc) + expires_delta
    payload: dict[str, Any] = {
        "sub":  str(subject),
        "type": token_type,
        "exp":  expire,
        "iat":  datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_access_token(subject: str | int) -> str:
    return _create_token(
        subject,
        token_type="access",
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )


def create_refresh_token(subject: str | int) -> str:
    return _create_token(
        subject,
        token_type="refresh",
        expires_delta=timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )


def decode_token(token: str) -> dict[str, Any]:
    """Raises JWTError if token is invalid or expired."""
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])


# ── Field-level encryption (SSN) ──────────────────────────────────────────────

def _get_fernet():
    """Lazy-load Fernet — raises RuntimeError if ENCRYPTION_KEY is not set."""
    if not settings.ENCRYPTION_KEY:
        raise RuntimeError(
            "ENCRYPTION_KEY is not configured. "
            "Generate one with: python -c \"from cryptography.fernet import Fernet; "
            "print(Fernet.generate_key().decode())\""
        )
    try:
        from cryptography.fernet import Fernet
        return Fernet(settings.ENCRYPTION_KEY.encode())
    except Exception as exc:
        raise RuntimeError(f"Invalid ENCRYPTION_KEY: {exc}") from exc


def encrypt_field(value: str) -> str:
    """Returns the value encrypted and base64-encoded (safe to store as text)."""
    return _get_fernet().encrypt(value.encode()).decode()


def decrypt_field(encrypted: str) -> str:
    return _get_fernet().decrypt(encrypted.encode()).decode()
