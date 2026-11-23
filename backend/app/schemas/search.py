"""
Pydantic schemas for Semantic Search.
"""
from typing import List, Optional
from pydantic import BaseModel, Field


class SemanticSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000, description="Search query text")
    document_id: Optional[str] = Field(None, description="Optional document ID to limit search to a single document")
    top_k: int = Field(5, ge=1, le=50, description="Maximum number of results to return (1-50)")


class SearchResultItem(BaseModel):
    chunk_id: str
    document_id: str
    filename: str
    page_number: int
    chunk_index: int
    content: str
    distance: float


class SemanticSearchResponse(BaseModel):
    query: str
    total_results: int
    results: List[SearchResultItem]
    document_id: Optional[str] = None
    top_k: int

