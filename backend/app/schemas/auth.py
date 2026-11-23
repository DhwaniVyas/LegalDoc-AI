"""
Pydantic schemas for authentication request/response bodies.
"""
from typing import Optional
from pydantic import BaseModel, EmailStr, Field


# ── Registration ──────────────────────────────────────────────
class UserRegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: Optional[str] = Field(default=None, max_length=255)


# ── Login ─────────────────────────────────────────────────────
class UserLoginRequest(BaseModel):
    email: EmailStr
    password: str


# ── Google OAuth ──────────────────────────────────────────────
class GoogleTokenRequest(BaseModel):
    id_token: str


# ── Responses ─────────────────────────────────────────────────
class UserPublic(BaseModel):
    id: int
    email: str
    full_name: Optional[str]
    auth_provider: str
    is_active: bool
    avatar_url: Optional[str]

    model_config = {"from_attributes": True}


class AuthResponse(BaseModel):
    message: str
    user: UserPublic

