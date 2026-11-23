"""
Google ID token verification using google-auth library.
Uses requests transport (required by google-auth).
"""
from typing import Optional

import requests as _requests
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from app.core.config import settings


def verify_google_id_token(token: str) -> Optional[dict]:
    """
    Verify a Google ID token and return its claims.
    Returns None if the token is invalid or GOOGLE_CLIENT_ID is not configured.
    """
    if not settings.GOOGLE_CLIENT_ID:
        return None
    try:
        request = google_requests.Request()
        claims = id_token.verify_oauth2_token(
            token,
            request,
            settings.GOOGLE_CLIENT_ID,
        )
        return claims
    except Exception:
        return None
