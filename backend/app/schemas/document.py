"""
Pydantic schemas for Document management, processing, and chunk inspection.
"""
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel


class DocumentPublic(BaseModel):
    id: str
    user_id: int
    original_filename: str
    normalized_filename: str
    file_size: int
    mime_type: str
    status: str

    # Processing fields (Phase 4)
    processing_status: str
    total_pages: int
    extracted_pages: int
    total_chunks: int
    processed_at: Optional[datetime]
    processing_error: Optional[str]

    # Embedding fields (Phase 5)
    embedding_status: str = "not_started"
    embedded_chunks: int = 0
    embedding_error: Optional[str] = None
    embedded_at: Optional[datetime] = None

    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DocumentListResponse(BaseModel):
    items: List[DocumentPublic]
    total: int
    page: int
    page_size: int
    total_pages: int


class RejectedFileItem(BaseModel):
    filename: str
    reason: str
    is_duplicate: bool = False


class DocumentUploadResponse(BaseModel):
    message: str
    documents: List[DocumentPublic]
    rejected: List[RejectedFileItem] = []


class DocumentPagePublic(BaseModel):
    id: str
    document_id: str
    page_number: int
    extracted_text: str
    character_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentChunkPublic(BaseModel):
    id: str
    document_id: str
    page_id: str
    chunk_index: int
    page_number: int
    content: str
    character_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentInspectionResponse(BaseModel):
    document: DocumentPublic
    pages: List[DocumentPagePublic]
    chunks: List[DocumentChunkPublic]
