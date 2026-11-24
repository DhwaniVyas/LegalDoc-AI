"""
Document routes – Upload, list, metadata, preview, download, delete, reprocessing, and inspection.
Strictly enforced user ownership on all operations.
"""
from pathlib import Path
from typing import List, Optional
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.database import models
from app.database.session import get_db
from app.schemas.document import (
    DocumentChunkPublic,
    DocumentInspectionResponse,
    DocumentListResponse,
    DocumentPagePublic,
    DocumentPublic,
    DocumentUploadResponse,
    RejectedFileItem,
)
from app.services import document_service

router = APIRouter()


@router.post("/upload", response_model=DocumentUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_documents(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Upload up to 5 PDF documents for the authenticated user.
    Validates magic bytes, size (<= 20MB), prevents duplicates per user,
    isolates storage, and schedules background text extraction and chunking.
    """
    created_docs, rejected_files = await document_service.save_uploaded_documents(
        db=db,
        user_id=current_user.id,
        files=files,
        background_tasks=background_tasks,
    )

    return DocumentUploadResponse(
        message=f"Successfully uploaded {len(created_docs)} document(s).",
        documents=[DocumentPublic.model_validate(d) for d in created_docs],
        rejected=[RejectedFileItem(**r) for r in rejected_files],
    )


@router.get("", response_model=DocumentListResponse)
def list_documents(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(10, ge=1, le=100, description="Items per page"),
    search: Optional[str] = Query(None, description="Optional filename filter"),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List authenticated user's documents with processing status, search, and pagination."""
    docs, total = document_service.get_user_documents(
        db=db,
        user_id=current_user.id,
        page=page,
        page_size=page_size,
        search=search,
    )
    total_pages = (total + page_size - 1) // page_size if total > 0 else 1
    return DocumentListResponse(
        items=[DocumentPublic.model_validate(d) for d in docs],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/{document_id}", response_model=DocumentPublic)
def get_document(
    document_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get metadata and processing status for a specific document owned by current user."""
    doc = document_service.get_user_document_by_id(
        db=db,
        user_id=current_user.id,
        document_id=document_id,
    )
    return DocumentPublic.model_validate(doc)


@router.post("/{document_id}/process", response_model=DocumentPublic)
def reprocess_document(
    document_id: str,
    background_tasks: BackgroundTasks,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Trigger manual text extraction and chunking for a document.
    Clears previous pages/chunks and updates status.
    """
    doc = document_service.reprocess_user_document(
        db=db,
        user_id=current_user.id,
        document_id=document_id,
        background_tasks=background_tasks,
    )
    return DocumentPublic.model_validate(doc)


@router.post("/{document_id}/embed", response_model=DocumentPublic)
def embed_document(
    document_id: str,
    background_tasks: BackgroundTasks,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Trigger manual vector embedding generation and ChromaDB indexing for a document.
    """
    doc = document_service.index_document_embeddings(
        db=db,
        user_id=current_user.id,
        document_id=document_id,
        background_tasks=background_tasks,
    )
    return DocumentPublic.model_validate(doc)


@router.get("/{document_id}/pages", response_model=List[DocumentPagePublic])
def get_document_pages(
    document_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Inspect extracted page text and page statistics for a document."""
    pages = document_service.get_user_document_pages(
        db=db,
        user_id=current_user.id,
        document_id=document_id,
    )
    return [DocumentPagePublic.model_validate(p) for p in pages]


@router.get("/{document_id}/pages/{page_number}", response_model=DocumentPagePublic)
def get_document_page(
    document_id: str,
    page_number: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Inspect extracted page text for a single page of a user-owned document."""
    page = document_service.get_user_document_page(
        db=db,
        user_id=current_user.id,
        document_id=document_id,
        page_number=page_number,
    )
    return DocumentPagePublic.model_validate(page)


@router.get("/{document_id}/chunks", response_model=List[DocumentChunkPublic])
def get_document_chunks(
    document_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Inspect generated text chunks for a document."""
    chunks = document_service.get_user_document_chunks(
        db=db,
        user_id=current_user.id,
        document_id=document_id,
    )
    return [DocumentChunkPublic.model_validate(c) for c in chunks]


@router.get("/{document_id}/inspection", response_model=DocumentInspectionResponse)
def get_document_inspection(
    document_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get complete inspection data: document metadata, extracted pages, and chunks."""
    doc = document_service.get_user_document_by_id(
        db=db,
        user_id=current_user.id,
        document_id=document_id,
    )
    pages = document_service.get_user_document_pages(
        db=db,
        user_id=current_user.id,
        document_id=document_id,
    )
    chunks = document_service.get_user_document_chunks(
        db=db,
        user_id=current_user.id,
        document_id=document_id,
    )
    return DocumentInspectionResponse(
        document=DocumentPublic.model_validate(doc),
        pages=[DocumentPagePublic.model_validate(p) for p in pages],
        chunks=[DocumentChunkPublic.model_validate(c) for c in chunks],
    )


@router.get("/{document_id}/preview")
def preview_document(
    document_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Stream PDF for authenticated inline preview."""
    doc = document_service.get_user_document_by_id(
        db=db,
        user_id=current_user.id,
        document_id=document_id,
    )
    file_path = Path(doc.file_path)
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document file not found on disk.",
        )

    safe_ascii_name = quote(doc.original_filename)
    return FileResponse(
        path=str(file_path),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{safe_ascii_name}"; filename*=UTF-8\'\'{safe_ascii_name}',
            "Cache-Control": "private, no-cache, no-store, must-revalidate",
        },
    )


@router.get("/{document_id}/download")
def download_document(
    document_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Download PDF as an attachment, preserving original filename."""
    doc = document_service.get_user_document_by_id(
        db=db,
        user_id=current_user.id,
        document_id=document_id,
    )
    file_path = Path(doc.file_path)
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document file not found on disk.",
        )

    return FileResponse(
        path=str(file_path),
        media_type="application/pdf",
        filename=doc.original_filename,
    )


@router.delete("/{document_id}")
def delete_document(
    document_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete document database record (with pages and chunks cascade) and physical file."""
    document_service.delete_user_document(
        db=db,
        user_id=current_user.id,
        document_id=document_id,
    )
    return {"message": "Document deleted successfully."}
