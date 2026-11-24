"""
Pydantic schemas for RAG Question Answering.
"""
from typing import List, Literal, Optional
from pydantic import BaseModel, Field


class AskQuestionRequest(BaseModel):
    question: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        description="The legal question to ask about uploaded documents",
    )
    document_id: Optional[str] = Field(
        None,
        description="Optional document UUID to scope the question to a single document",
    )


class SourceItem(BaseModel):
    citation_id: str = Field(..., description="Stable citation ID, e.g. S1")
    document_id: str = Field(..., description="Source document UUID")
    chunk_id: str = Field(..., description="Source chunk UUID")
    filename: str = Field(..., description="Original filename of the document")
    page_number: int = Field(..., description="Page number of the chunk")
    chunk_index: int = Field(..., description="Zero-based index of the chunk on the page")
    content: str = Field(..., description="Extracted chunk text content")
    distance: float = Field(..., description="Cosine distance metric (lower is more relevant)")


class AskQuestionResponse(BaseModel):
    question: str
    answer: str
    status: Literal["answered", "insufficient_evidence", "no_relevant_sources"]
    sources: List[SourceItem] = []
    document_id: Optional[str] = None

