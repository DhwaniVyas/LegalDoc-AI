"""
Authentication routes – email/password and Google OAuth.
Rate-limited login/register to mitigate brute-force attacks.
"""
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from app.core.config import settings
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
limiter = Limiter(key_func=get_remote_address)


# ── Cookie helper ─────────────────────────────────────────────
def _set_auth_cookies(response: Response, user: models.User) -> None:
    """Write JWT tokens into HTTP-only cookies."""
    access_token = create_access_token(str(user.id))
    refresh_token = create_refresh_token(str(user.id))

    cookie_kwargs = dict(
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
    )
    if settings.COOKIE_DOMAIN:
        cookie_kwargs["domain"] = settings.COOKIE_DOMAIN

    response.set_cookie(
        key="access_token",
        value=access_token,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        **cookie_kwargs,
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/auth/refresh",
        **cookie_kwargs,
    )


def _clear_auth_cookies(response: Response) -> None:
    """Remove auth cookies from the client."""
    cookie_kwargs = dict(
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
    )
    if settings.COOKIE_DOMAIN:
        cookie_kwargs["domain"] = settings.COOKIE_DOMAIN

    response.delete_cookie("access_token", **cookie_kwargs)
    response.delete_cookie("refresh_token", path="/api/auth/refresh", **cookie_kwargs)


# ── Register ──────────────────────────────────────────────────
@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
def register(
    request: Request,
    payload: UserRegisterRequest,
    response: Response,
    db: Session = Depends(get_db),
):
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
@limiter.limit("20/minute")
def login(
    request: Request,
    payload: UserLoginRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    user = auth_service.get_user_by_email(db, payload.email)
    # Constant-time failure – do not reveal whether email exists
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
@limiter.limit("20/minute")
def google_login(
    request: Request,
    payload: GoogleTokenRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google authentication is not configured on this server.",
        )

    claims = verify_google_id_token(payload.id_token)
    if not claims:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Google token.",
        )

    # Require email_verified from Google
    if not claims.get("email_verified"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account email is not verified.",
        )

    google_id: str = claims["sub"]
    email: str = claims.get("email", "").lower().strip()
    full_name: str = claims.get("name")
    avatar_url: str = claims.get("picture")

    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google account did not provide an email address.",
        )

    # Find or create the user
    user = auth_service.get_user_by_google_id(db, google_id)
    if not user:
        user = auth_service.get_user_by_email(db, email)
        if user:
            # Link Google sub to existing email account
            user.google_id = google_id
            user.avatar_url = avatar_url or user.avatar_url
            if not user.full_name:
                user.full_name = full_name
            user.is_verified = True
            db.commit()
            db.refresh(user)
        else:
            # Brand new user via Google
            user = auth_service.create_google_user(
                db,
                email=email,
                google_id=google_id,
                full_name=full_name,
                avatar_url=avatar_url,
            )

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled.")

    _set_auth_cookies(response, user)
    return AuthResponse(message="Google login successful.", user=UserPublic.model_validate(user))


# ── Logout ────────────────────────────────────────────────────
@router.post("/logout")
def logout(response: Response):
    _clear_auth_cookies(response)
    return {"message": "Logged out successfully."}


# ── Current user ──────────────────────────────────────────────
@router.get("/me", response_model=UserPublic)
def get_me(current_user: models.User = Depends(get_current_user)):
    return UserPublic.model_validate(current_user)
