"""
QA Route – Grounded legal question answering via Gemini RAG pipeline.
Supports both standard JSON response and progressive SSE streaming.
"""
import json
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
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


@router.post("/ask-stream")
def ask_question_stream(
    request: AskQuestionRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Stream question answering response progressively via Server-Sent Events (SSE).
    Emits events:
      - 'sources': retrieved document passages and stage timings
      - 'delta': generated text chunk delta
      - 'done': complete sanitized answer, verified citations, status, and full timings
      - 'error': error message if generation fails
    """
    clean_q = request.question.strip()
    if not clean_q:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Question cannot be empty or whitespace only.",
        )

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

    def sse_event_generator():
        try:
            for event in rag_service.answer_question_stream(
                user_id=current_user.id,
                question=clean_q,
                document_id=request.document_id,
                db=db,
            ):
                event_name = event.get("event", "message")
                payload = json.dumps(event.get("data", {}))
                yield f"event: {event_name}\ndata: {payload}\n\n"
        except gemini_service.GeminiServiceError as e:
            err_payload = json.dumps({"detail": e.detail, "status_code": e.status_code})
            yield f"event: error\ndata: {err_payload}\n\n"
        except Exception as e:
            logger.exception("Unexpected error during streaming QA: %s", e)
            err_payload = json.dumps({"detail": "An unexpected error occurred while streaming the answer.", "status_code": 500})
            yield f"event: error\ndata: {err_payload}\n\n"

    return StreamingResponse(
        sse_event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

