"""
Auth service – password hashing, user lookup, token issuance.
"""
from typing import Optional

from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.database import models

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def get_user_by_email(db: Session, email: str) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.email == email).first()


def get_user_by_google_id(db: Session, google_id: str) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.google_id == google_id).first()


def create_email_user(
    db: Session,
    email: str,
    password: str,
    full_name: Optional[str] = None,
) -> models.User:
    user = models.User(
        email=email,
        hashed_password=hash_password(password),
        full_name=full_name,
        auth_provider="email",
        is_verified=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def create_google_user(
    db: Session,
    email: str,
    google_id: str,
    full_name: Optional[str] = None,
    avatar_url: Optional[str] = None,
) -> models.User:
    user = models.User(
        email=email,
        google_id=google_id,
        full_name=full_name,
        avatar_url=avatar_url,
        auth_provider="google",
        is_verified=True,  # Google accounts are pre-verified
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

