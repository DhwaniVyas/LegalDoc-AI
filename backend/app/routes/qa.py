"""
QA Route – Grounded legal question answering via Gemini RAG pipeline.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.database import models
from app.database.session import get_db
from app.schemas.qa import AskQuestionRequest, AskQuestionResponse
from app.services import gemini_service, rag_service

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/ask", response_model=AskQuestionResponse)
def ask_question(
    request: AskQuestionRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Ask a question grounded in the user's indexed legal documents.
    1. Validates input & verifies document ownership if scoped.
    2. Retrieves relevant chunks via ChromaDB.
    3. Prompts Gemini with strict citation and evidence grounding rules.
    4. Validates and sanitizes inline citations [S1], [S2]...
    """
    clean_q = request.question.strip()
    if not clean_q:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Question cannot be empty or whitespace only.",
        )

    # Validate document_id ownership if provided
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
        result = rag_service.answer_question(
            user_id=current_user.id,
            question=clean_q,
            document_id=request.document_id,
        )
        return AskQuestionResponse(**result)

    except gemini_service.GeminiServiceError as e:
        logger.error("Gemini service error (%s): %s", type(e).__name__, e.message)
        raise HTTPException(
            status_code=e.status_code,
            detail=e.detail,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Unexpected error in /api/qa/ask: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while generating the answer.",
        )

