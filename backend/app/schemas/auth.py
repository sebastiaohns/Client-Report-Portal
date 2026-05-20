from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email:    EmailStr
    password: str = Field(min_length=8)


class TokenResponse(BaseModel):
    access_token:  str
    refresh_token: str
    token_type:    str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class UserResponse(BaseModel):
    id:           int
    email:        str
    full_name:    str | None
    is_active:    bool
    is_superuser: bool

    model_config = {"from_attributes": True}
