"""
Pydantic schemas for authentication request/response bodies.
"""
from typing import Optional
from pydantic import BaseModel, EmailStr, Field, field_validator
import re


# ── Registration ──────────────────────────────────────────────
class UserRegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: Optional[str] = Field(default=None, max_length=255)

    @field_validator("password")
    @classmethod
    def password_complexity(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters.")
        return v


# ── Login ─────────────────────────────────────────────────────
class UserLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


# ── Google OAuth ──────────────────────────────────────────────
class GoogleTokenRequest(BaseModel):
    id_token: str = Field(min_length=1)


# ── Responses ─────────────────────────────────────────────────
class UserPublic(BaseModel):
    id: int
    email: str
    full_name: Optional[str]
    auth_provider: str
    is_active: bool
    is_verified: bool
    avatar_url: Optional[str]

    model_config = {"from_attributes": True}


class AuthResponse(BaseModel):
    message: str
    user: UserPublic
