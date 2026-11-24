"""
Conversations Route – Multi-turn conversational legal assistant with conversation history.
Enforces strict user ownership, multi-document scoping, and citation persistence.
"""
import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.database import models
from app.database.session import SessionLocal, get_db
from app.schemas.conversation import (
    ChatMessageResponse,
    ConversationCreate,
    ConversationDetail,
    ConversationSummary,
    ConversationUpdate,
    SendMessageRequest,
    SendMessageResponse,
)
from app.services import groq_service, rag_service

logger = logging.getLogger(__name__)

router = APIRouter()


def _validate_user_document_ids(
    db: Session,
    user_id: int,
    document_ids: Optional[List[str]],
) -> List[str]:
    """
    Validate that all requested document IDs belong to the current user and are indexed.
    Raises 404/400 if any document is missing or not owned by user.
    """
    if not document_ids:
        return []

    clean_ids = [str(did).strip() for did in document_ids if did and str(did).strip()]
    if not clean_ids:
        return []

    user_docs = (
        db.query(models.Document)
        .filter(
            models.Document.id.in_(clean_ids),
            models.Document.user_id == user_id,
        )
        .all()
    )

    found_ids = {doc.id for doc in user_docs}
    missing_ids = set(clean_ids) - found_ids

    if missing_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"One or more selected documents do not exist or you do not have permission: {list(missing_ids)}",
        )

    # Verify document processing status
    unindexed = [d.original_filename for d in user_docs if d.processing_status != "completed"]
    if unindexed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"The following documents are not yet indexed: {', '.join(unindexed)}",
        )

    return clean_ids


def _generate_auto_title(first_message: str) -> str:
    """Generate a clean, informative conversation title from the first message."""
    clean = first_message.strip()
    if len(clean) <= 45:
        return clean
    return clean[:42].rsplit(" ", 1)[0] + "..."


@router.post("", response_model=ConversationDetail, status_code=status.HTTP_201_CREATED)
def create_conversation(
    payload: ConversationCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create a new conversation thread.
    Can optionally be pre-scoped to specific documents.
    """
    doc_ids = _validate_user_document_ids(db, current_user.id, payload.document_ids)

    title = payload.title.strip() if payload.title and payload.title.strip() else "New Conversation"

    conversation = models.Conversation(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        title=title,
        document_ids=doc_ids if doc_ids else None,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
        last_message_at=datetime.utcnow(),
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)

    return ConversationDetail(
        id=conversation.id,
        title=conversation.title,
        document_ids=conversation.document_ids or [],
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        last_message_at=conversation.last_message_at,
        messages=[],
    )


@router.get("", response_model=List[ConversationSummary])
def list_conversations(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    List all conversations belonging to the authenticated user,
    ordered with the most recently active conversations first.
    Includes message count and preview of the last message.
    """
    conversations = (
        db.query(models.Conversation)
        .filter(models.Conversation.user_id == current_user.id)
        .order_by(models.Conversation.last_message_at.desc())
        .all()
    )

    summaries = []
    for conv in conversations:
        # Get count and last message
        last_msg = (
            db.query(models.ChatMessage)
            .filter(models.ChatMessage.conversation_id == conv.id)
            .order_by(models.ChatMessage.created_at.desc())
            .first()
        )
        msg_count = (
            db.query(models.ChatMessage)
            .filter(models.ChatMessage.conversation_id == conv.id)
            .count()
        )

        preview = None
        if last_msg:
            preview = last_msg.content[:80] + ("..." if len(last_msg.content) > 80 else "")

        summaries.append(
            ConversationSummary(
                id=conv.id,
                title=conv.title,
                document_ids=conv.document_ids or [],
                created_at=conv.created_at,
                updated_at=conv.updated_at,
                last_message_at=conv.last_message_at,
                message_count=msg_count,
                last_message_preview=preview,
            )
        )

    return summaries


@router.get("/{conversation_id}", response_model=ConversationDetail)
def get_conversation(
    conversation_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get full conversation details and ordered message history.
    Enforces user isolation; users can only retrieve their own conversations.
    """
    conversation = (
        db.query(models.Conversation)
        .filter(
            models.Conversation.id == conversation_id,
            models.Conversation.user_id == current_user.id,
        )
        .first()
    )

    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found or access denied.",
        )

    messages = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.conversation_id == conversation.id)
        .order_by(models.ChatMessage.created_at.asc())
        .all()
    )

    return ConversationDetail(
        id=conversation.id,
        title=conversation.title,
        document_ids=conversation.document_ids or [],
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        last_message_at=conversation.last_message_at,
        messages=[ChatMessageResponse.from_orm(m) for m in messages],
    )


@router.patch("/{conversation_id}", response_model=ConversationSummary)
def update_conversation(
    conversation_id: str,
    payload: ConversationUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Update conversation metadata: rename title or adjust scoped documents.
    """
    conversation = (
        db.query(models.Conversation)
        .filter(
            models.Conversation.id == conversation_id,
            models.Conversation.user_id == current_user.id,
        )
        .first()
    )

    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found or access denied.",
        )

    if payload.title is not None:
        clean_title = payload.title.strip()
        if not clean_title:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Title cannot be empty.",
            )
        conversation.title = clean_title

    if payload.document_ids is not None:
        doc_ids = _validate_user_document_ids(db, current_user.id, payload.document_ids)
        conversation.document_ids = doc_ids if doc_ids else None

    conversation.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(conversation)

    msg_count = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.conversation_id == conversation.id)
        .count()
    )

    last_msg = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.conversation_id == conversation.id)
        .order_by(models.ChatMessage.created_at.desc())
        .first()
    )

    preview = (last_msg.content[:80] + "...") if last_msg and len(last_msg.content) > 80 else (last_msg.content if last_msg else None)

    return ConversationSummary(
        id=conversation.id,
        title=conversation.title,
        document_ids=conversation.document_ids or [],
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        last_message_at=conversation.last_message_at,
        message_count=msg_count,
        last_message_preview=preview,
    )


@router.delete("/{conversation_id}")
def delete_conversation(
    conversation_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Delete a conversation and its messages.
    Does NOT delete uploaded documents or vector embeddings.
    """
    conversation = (
        db.query(models.Conversation)
        .filter(
            models.Conversation.id == conversation_id,
            models.Conversation.user_id == current_user.id,
        )
        .first()
    )

    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found or access denied.",
        )

    # Delete messages first
    db.query(models.ChatMessage).filter(models.ChatMessage.conversation_id == conversation.id).delete()
    db.delete(conversation)
    db.commit()

    return {"message": "Conversation deleted successfully", "id": conversation_id}


@router.post("/{conversation_id}/messages", response_model=SendMessageResponse)
def send_message(
    conversation_id: str,
    payload: SendMessageRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Send a message within an existing conversation:
    1. Validates ownership and document scoping.
    2. Persists the user message.
    3. Fetches conversation history to contextually ground retrieval.
    4. Executes RAG QA with Gemini.
    5. Persists the assistant message with complete source citations.
    """
    clean_msg = payload.message.strip()
    if not clean_msg:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message cannot be empty or whitespace only.",
        )

    conversation = (
        db.query(models.Conversation)
        .filter(
            models.Conversation.id == conversation_id,
            models.Conversation.user_id == current_user.id,
        )
        .first()
    )

    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found or access denied.",
        )

    # If payload specified document_ids, update the conversation's document scope
    if payload.document_ids is not None:
        doc_ids = _validate_user_document_ids(db, current_user.id, payload.document_ids)
        conversation.document_ids = doc_ids if doc_ids else None

    active_doc_ids = conversation.document_ids

    # Query prior messages for conversation history
    prior_messages = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.conversation_id == conversation.id)
        .order_by(models.ChatMessage.created_at.asc())
        .all()
    )
    history = [{"role": m.role, "content": m.content} for m in prior_messages]

    # Save user message
    user_msg_id = str(uuid.uuid4())
    now = datetime.utcnow()
    user_msg = models.ChatMessage(
        id=user_msg_id,
        conversation_id=conversation.id,
        role="user",
        content=clean_msg,
        sources=None,
        created_at=now,
    )
    db.add(user_msg)

    # Auto-generate title if still default
    if conversation.title in ("New Conversation", "Untitled Conversation"):
        conversation.title = _generate_auto_title(clean_msg)

    conversation.last_message_at = now
    conversation.updated_at = now
    db.commit()

    # Execute RAG QA
    try:
        rag_result = rag_service.answer_question(
            user_id=current_user.id,
            question=clean_msg,
            document_ids=active_doc_ids,
            conversation_history=history,
            db=db,
        )
    except groq_service.GroqServiceError as e:
        logger.error("Groq service error: %s", e.message)
        raise HTTPException(status_code=e.status_code, detail=e.detail)
    except Exception as e:
        logger.exception("Unexpected error in conversational QA: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while answering your legal question.",
        )

    # Save assistant message
    assistant_msg_id = str(uuid.uuid4())
    assistant_msg = models.ChatMessage(
        id=assistant_msg_id,
        conversation_id=conversation.id,
        role="assistant",
        content=rag_result["answer"],
        sources=rag_result["sources"],
        created_at=datetime.utcnow(),
    )
    db.add(assistant_msg)
    conversation.last_message_at = assistant_msg.created_at
    db.commit()
    db.refresh(assistant_msg)

    return SendMessageResponse(
        user_message=ChatMessageResponse.from_orm(user_msg),
        assistant_message=ChatMessageResponse.from_orm(assistant_msg),
        timings=rag_result.get("timings"),
    )


@router.post("/{conversation_id}/messages-stream")
def send_message_stream(
    conversation_id: str,
    payload: SendMessageRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Progressive SSE streaming conversational endpoint:
    1. Validates ownership and document scoping.
    2. Saves user message and emits 'user_message' event.
    3. Streams 'sources', 'delta' tokens, and 'done' event.
    4. Automatically saves assistant message and sources to SQLite upon stream completion.
    """
    clean_msg = payload.message.strip()
    if not clean_msg:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message cannot be empty or whitespace only.",
        )

    conversation = (
        db.query(models.Conversation)
        .filter(
            models.Conversation.id == conversation_id,
            models.Conversation.user_id == current_user.id,
        )
        .first()
    )

    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found or access denied.",
        )

    if payload.document_ids is not None:
        doc_ids = _validate_user_document_ids(db, current_user.id, payload.document_ids)
        conversation.document_ids = doc_ids if doc_ids else None

    active_doc_ids = conversation.document_ids

    # Query prior messages for conversation history
    prior_messages = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.conversation_id == conversation.id)
        .order_by(models.ChatMessage.created_at.asc())
        .all()
    )
    history = [{"role": m.role, "content": m.content} for m in prior_messages]

    # Save user message
    user_msg_id = str(uuid.uuid4())
    now = datetime.utcnow()
    user_msg = models.ChatMessage(
        id=user_msg_id,
        conversation_id=conversation.id,
        role="user",
        content=clean_msg,
        sources=None,
        created_at=now,
    )
    db.add(user_msg)

    # Auto-generate title if default
    if conversation.title in ("New Conversation", "Untitled Conversation"):
        conversation.title = _generate_auto_title(clean_msg)

    conversation.last_message_at = now
    conversation.updated_at = now
    db.commit()

    user_msg_data = {
        "id": user_msg.id,
        "conversation_id": user_msg.conversation_id,
        "role": user_msg.role,
        "content": user_msg.content,
        "sources": None,
        "created_at": user_msg.created_at.isoformat(),
    }

    user_id_val = current_user.id

    def event_generator():
        # Emit user message event first
        yield f"event: user_message\ndata: {json.dumps(user_msg_data)}\n\n"

        retrieved_sources = []
        final_answer = ""

        try:
            for event in rag_service.answer_question_stream(
                user_id=user_id_val,
                question=clean_msg,
                document_ids=active_doc_ids,
                conversation_history=history,
            ):
                event_name = event.get("event", "message")
                event_data = event.get("data", {})

                if event_name == "sources":
                    retrieved_sources = event_data.get("sources", [])

                if event_name == "done":
                    final_answer = event_data.get("answer", "")

                yield f"event: {event_name}\ndata: {json.dumps(event_data)}\n\n"

        except Exception as e:
            logger.exception("Error in send_message_stream: %s", e)
            yield f"event: error\ndata: {json.dumps({'detail': str(e)})}\n\n"
            return

        # Save assistant message in isolated DB session
        if final_answer:
            save_db = SessionLocal()
            try:
                ast_msg = models.ChatMessage(
                    id=str(uuid.uuid4()),
                    conversation_id=conversation_id,
                    role="assistant",
                    content=final_answer,
                    sources=retrieved_sources,
                    created_at=datetime.utcnow(),
                )
                save_db.add(ast_msg)
                conv_row = save_db.query(models.Conversation).filter(models.Conversation.id == conversation_id).first()
                if conv_row:
                    conv_row.last_message_at = ast_msg.created_at
                    conv_row.updated_at = datetime.utcnow()
                save_db.commit()
                logger.info("Persisted streamed assistant message for conversation %s", conversation_id)
            except Exception as e:
                save_db.rollback()
                logger.error("Failed to persist streamed assistant message: %s", e)
            finally:
                save_db.close()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

