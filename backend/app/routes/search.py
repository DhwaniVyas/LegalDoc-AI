"""
Search routes – Semantic Search over user's embedded legal document chunks.
Strict per-user data isolation: users can only search their own indexed documents.
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.database import models
from app.database.session import get_db
from app.schemas.search import (
    SearchResultItem,
    SemanticSearchRequest,
    SemanticSearchResponse,
)
from app.services import embedding_service, vector_store_service

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/semantic", response_model=SemanticSearchResponse)
def semantic_search(
    request: SemanticSearchRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Perform semantic vector search across document chunks owned by the authenticated user.
    Optionally filter by a specific document_id.
    """
    clean_query = request.query.strip()
    if not clean_query:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Search query cannot be empty or whitespace only.",
        )

    # If document_id is provided, verify document exists and is owned by current user
    if request.document_id:
        doc = (
            db.query(models.Document)
            .filter(
                models.Document.id == request.document_id,
                models.Document.user_id == current_user.id,
            )
            .first()
        )
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found or you do not have permission to access it.",
            )

    try:
        # Generate 384-d normalized vector embedding for user query
        query_vector = embedding_service.generate_query_embedding(clean_query)
        if not query_vector:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to generate query embedding.",
            )

        # Retrieve nearest neighbor chunks from ChromaDB filtered by user_id
        raw_results = vector_store_service.query_semantic_chunks(
            user_id=current_user.id,
            query_embedding=query_vector,
            top_k=request.top_k,
            document_id=request.document_id,
        )

        items = [
            SearchResultItem(
                chunk_id=r["chunk_id"],
                document_id=r["document_id"],
                filename=r["filename"],
                page_number=r["page_number"],
                chunk_index=r["chunk_index"],
                content=r["content"],
                distance=r["distance"],
            )
            for r in raw_results
        ]

        return SemanticSearchResponse(
            query=clean_query,
            total_results=len(items),
            results=items,
            document_id=request.document_id,
            top_k=request.top_k,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Semantic search failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while executing the semantic search.",
        )

