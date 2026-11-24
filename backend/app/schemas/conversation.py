"""
Pydantic schemas for Phase 7 Conversational Chat and Conversation History.
"""
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class ChatSourceItem(BaseModel):
    citation_id: str
    document_id: str
    chunk_id: str
    filename: str
    page_number: int
    chunk_index: int
    content: str
    distance: float = 0.0


class ChatMessageResponse(BaseModel):
    id: str
    conversation_id: str
    role: Literal["user", "assistant"]
    content: str
    sources: Optional[List[Dict[str, Any]]] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ConversationSummary(BaseModel):
    id: str
    title: str
    document_ids: Optional[List[str]] = None
    created_at: datetime
    updated_at: datetime
    last_message_at: datetime
    message_count: int = 0
    last_message_preview: Optional[str] = None

    class Config:
        from_attributes = True


class ConversationDetail(BaseModel):
    id: str
    title: str
    document_ids: Optional[List[str]] = None
    created_at: datetime
    updated_at: datetime
    last_message_at: datetime
    messages: List[ChatMessageResponse] = []

    class Config:
        from_attributes = True


class ConversationCreate(BaseModel):
    title: Optional[str] = Field(None, max_length=255, description="Optional custom title")
    document_ids: Optional[List[str]] = Field(None, description="Optional document UUIDs to scope chat context")


class ConversationUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255, description="Updated conversation title")
    document_ids: Optional[List[str]] = Field(None, description="Updated document UUIDs scope")


class SendMessageRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000, description="User legal message / question")
    document_ids: Optional[List[str]] = Field(None, description="Optional document UUIDs filter (updates conversation scope if provided)")


class SendMessageResponse(BaseModel):
    user_message: ChatMessageResponse
    assistant_message: ChatMessageResponse
    timings: Optional[Dict[str, float]] = None

