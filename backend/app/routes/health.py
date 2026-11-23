"""
Health check endpoint.
"""
from fastapi import APIRouter

router = APIRouter(tags=["Health"])


@router.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "LegalDoc AI API",
        "version": "0.1.0",
    }

