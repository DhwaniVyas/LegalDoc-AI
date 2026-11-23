"""
User routes – protected endpoints for user profile management.
"""
from fastapi import APIRouter, Depends
from app.core.dependencies import get_current_user
from app.database import models
from app.schemas.auth import UserPublic

router = APIRouter()


@router.get("/me", response_model=UserPublic)
def get_my_profile(current_user: models.User = Depends(get_current_user)):
    """Return the authenticated user's profile."""
    return UserPublic.model_validate(current_user)

