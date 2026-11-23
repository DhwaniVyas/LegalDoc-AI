"""
Authentication routes – email/password and Google OAuth.
"""
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.core.security import create_access_token, create_refresh_token
from app.database.session import get_db
from app.database import models
from app.schemas.auth import (
    AuthResponse,
    GoogleTokenRequest,
    UserLoginRequest,
    UserPublic,
    UserRegisterRequest,
)
from app.services import auth_service
from app.services.google_auth_service import verify_google_id_token

router = APIRouter()

COOKIE_SECURE = False          # Set True in production (HTTPS)
COOKIE_SAMESITE = "lax"


def _set_auth_cookies(response: Response, user: models.User) -> None:
    """Write JWT tokens into HTTP-only cookies."""
    access_token = create_access_token(str(user.id))
    refresh_token = create_refresh_token(str(user.id))

    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=3600,  # 1 hour
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=60 * 60 * 24 * 7,  # 7 days
        path="/api/auth/refresh",
    )


# ── Register ──────────────────────────────────────────────────
@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(payload: UserRegisterRequest, response: Response, db: Session = Depends(get_db)):
    if auth_service.get_user_by_email(db, payload.email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )
    user = auth_service.create_email_user(
        db, email=payload.email, password=payload.password, full_name=payload.full_name
    )
    _set_auth_cookies(response, user)
    return AuthResponse(message="Registration successful.", user=UserPublic.model_validate(user))


# ── Login ─────────────────────────────────────────────────────
@router.post("/login", response_model=AuthResponse)
def login(payload: UserLoginRequest, response: Response, db: Session = Depends(get_db)):
    user = auth_service.get_user_by_email(db, payload.email)
    if not user or not user.hashed_password:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials.")
    if not auth_service.verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials.")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled.")
    _set_auth_cookies(response, user)
    return AuthResponse(message="Login successful.", user=UserPublic.model_validate(user))


# ── Google Login ──────────────────────────────────────────────
@router.post("/google", response_model=AuthResponse)
def google_login(payload: GoogleTokenRequest, response: Response, db: Session = Depends(get_db)):
    claims = verify_google_id_token(payload.id_token)
    if not claims:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google token.",
        )

    google_id: str = claims["sub"]
    email: str = claims.get("email", "")
    full_name: str = claims.get("name")
    avatar_url: str = claims.get("picture")

    # Try to find existing user by Google ID or email
    user = auth_service.get_user_by_google_id(db, google_id)
    if not user:
        user = auth_service.get_user_by_email(db, email)
        if user:
            # Link Google ID to existing email account
            user.google_id = google_id
            user.avatar_url = avatar_url
            if not user.full_name:
                user.full_name = full_name
            db.commit()
            db.refresh(user)
        else:
            # New user via Google
            user = auth_service.create_google_user(
                db, email=email, google_id=google_id, full_name=full_name, avatar_url=avatar_url
            )

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled.")

    _set_auth_cookies(response, user)
    return AuthResponse(message="Google login successful.", user=UserPublic.model_validate(user))


# ── Logout ────────────────────────────────────────────────────
@router.post("/logout")
def logout(response: Response):
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token", path="/api/auth/refresh")
    return {"message": "Logged out successfully."}


# ── Current user ──────────────────────────────────────────────
@router.get("/me", response_model=UserPublic)
def get_me(current_user: models.User = Depends(get_current_user)):
    return UserPublic.model_validate(current_user)

