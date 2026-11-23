"""
Document routes – Upload, list, metadata, preview, download, and delete.
Strictly enforced user ownership on all operations.
"""
from pathlib import Path
from typing import List, Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.database import models
from app.database.session import get_db
from app.schemas.document import DocumentListResponse, DocumentPublic, DocumentUploadResponse
from app.services import document_service

router = APIRouter()


@router.post("/upload", response_model=DocumentUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_documents(
    files: List[UploadFile] = File(...),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Upload up to 5 PDF documents for the authenticated user.
    Validates magic bytes, size (<= 20MB), and isolates files per user.
    """
    docs = await document_service.save_uploaded_documents(
        db=db,
        user_id=current_user.id,
        files=files,
    )
    return DocumentUploadResponse(
        message=f"Successfully uploaded {len(docs)} document(s).",
        documents=[DocumentPublic.model_validate(d) for d in docs],
    )


@router.get("", response_model=DocumentListResponse)
def list_documents(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(10, ge=1, le=100, description="Items per page"),
    search: Optional[str] = Query(None, description="Optional filename filter"),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List authenticated user's documents with optional search and pagination."""
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
    """Get metadata for a specific document owned by the authenticated user."""
    doc = document_service.get_user_document_by_id(
        db=db,
        user_id=current_user.id,
        document_id=document_id,
    )
    return DocumentPublic.model_validate(doc)


@router.get("/{document_id}/preview")
def preview_document(
    document_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Stream PDF for authenticated inline preview.
    Ensures ownership and sets inline Content-Disposition.
    """
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

    # Encode filename for header safety
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
    """
    Download PDF as an attachment, preserving original filename.
    Ensures ownership before returning file.
    """
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
    """
    Delete document database record and physical file.
    Verifies ownership before deletion.
    """
    document_service.delete_user_document(
        db=db,
        user_id=current_user.id,
        document_id=document_id,
    )
    return {"message": "Document deleted successfully."}

