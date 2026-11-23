"""
Pydantic schemas for Document management.
"""
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel


class DocumentPublic(BaseModel):
    id: str
    user_id: int
    original_filename: str
    file_size: int
    mime_type: str
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DocumentListResponse(BaseModel):
    items: List[DocumentPublic]
    total: int
    page: int
    page_size: int
    total_pages: int


class DocumentUploadResponse(BaseModel):
    message: str
    documents: List[DocumentPublic]

