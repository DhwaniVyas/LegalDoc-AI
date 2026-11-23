"""
Document service – storage, validation, security, and lifecycle management.
"""
import os
import re
import uuid
from pathlib import Path
from typing import List, Optional, Tuple

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.database import models

# Base upload directory: backend/uploads/users/
BASE_DIR = Path(__file__).resolve().parent.parent.parent
UPLOAD_DIR = BASE_DIR / "uploads" / "users"

MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB
MAX_FILES_PER_REQUEST = 5
PDF_MAGIC_BYTES = b"%PDF-"


def sanitize_filename(filename: str) -> str:
    """Sanitize filename to prevent path traversal or unsafe characters."""
    # Strip any path component
    name = Path(filename).name
    # Replace any potentially dangerous or control characters with underscore
    name = re.sub(r'[^\w\s\.-]', '_', name)
    # Avoid empty or dot-only filenames
    name = name.strip()
    if not name or name.startswith('.'):
        name = f"document_{name.lstrip('.')}"
    if not name.lower().endswith(".pdf"):
        name = f"{name}.pdf"
    return name[:255]


def get_user_storage_dir(user_id: int) -> Path:
    """Ensure and return the user's isolated storage directory."""
    user_dir = (UPLOAD_DIR / str(user_id)).resolve()
    # Verify no path traversal outside UPLOAD_DIR
    if not str(user_dir).startswith(str(UPLOAD_DIR.resolve())):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user storage path."
        )
    user_dir.mkdir(parents=True, exist_ok=True)
    return user_dir


async def validate_pdf_file(file: UploadFile) -> bytes:
    """
    Validate that an uploaded file is a valid, non-empty PDF <= 20 MB.
    Returns the file content bytes.
    """
    # 1. Filename extension check
    filename = file.filename or ""
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File '{filename}' is not a PDF. Only .pdf files are permitted.",
        )

    # 2. Read file content
    content = await file.read()
    file_size = len(content)

    # 3. Check for empty file
    if file_size == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File '{filename}' is empty.",
        )

    # 4. Check maximum file size
    if file_size > MAX_FILE_SIZE:
        max_mb = MAX_FILE_SIZE // (1024 * 1024)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File '{filename}' exceeds the maximum allowed size of {max_mb} MB.",
        )

    # 5. Check PDF magic byte signature (%PDF-)
    if not content.startswith(PDF_MAGIC_BYTES):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File '{filename}' does not contain a valid PDF signature.",
        )

    return content


async def save_uploaded_documents(
    db: Session,
    user_id: int,
    files: List[UploadFile],
) -> List[models.Document]:
    """
    Validate and save up to 5 uploaded PDF files.
    If database insertion or disk write fails, any written files are removed.
    """
    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No files provided for upload.",
        )

    if len(files) > MAX_FILES_PER_REQUEST:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum {MAX_FILES_PER_REQUEST} files can be uploaded per request.",
        )

    user_dir = get_user_storage_dir(user_id)
    written_paths: List[Path] = []
    created_documents: List[models.Document] = []

    try:
        for file in files:
            content = await validate_pdf_file(file)
            file_size = len(content)
            safe_original_name = sanitize_filename(file.filename or "document.pdf")
            unique_id = str(uuid.uuid4())
            stored_filename = f"{unique_id}.pdf"
            file_path = (user_dir / stored_filename).resolve()

            # Ensure file_path is strictly inside user_dir
            if not str(file_path).startswith(str(user_dir)):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid storage path.",
                )

            # Write file to disk
            with open(file_path, "wb") as f:
                f.write(content)
            written_paths.append(file_path)

            # Create Document ORM record
            doc = models.Document(
                id=unique_id,
                user_id=user_id,
                original_filename=safe_original_name,
                stored_filename=stored_filename,
                file_path=str(file_path),
                file_size=file_size,
                mime_type="application/pdf",
                status="uploaded",
            )
            db.add(doc)
            created_documents.append(doc)

        db.commit()
        for doc in created_documents:
            db.refresh(doc)
        return created_documents

    except Exception:
        db.rollback()
        # Clean up any files written during this batch on error
        for path in written_paths:
            try:
                if path.exists():
                    path.unlink()
            except OSError:
                pass
        raise


def get_user_documents(
    db: Session,
    user_id: int,
    page: int = 1,
    page_size: int = 10,
    search: Optional[str] = None,
) -> Tuple[List[models.Document], int]:
    """Retrieve paginated documents for the specified user."""
    query = db.query(models.Document).filter(models.Document.user_id == user_id)

    if search:
        query = query.filter(models.Document.original_filename.ilike(f"%{search.strip()}%"))

    total = query.count()
    offset = (page - 1) * page_size
    documents = (
        query.order_by(models.Document.created_at.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )
    return documents, total


def get_user_document_by_id(
    db: Session,
    user_id: int,
    document_id: str,
) -> models.Document:
    """
    Retrieve a document ensuring ownership by user_id.
    Raises 404 if not found or if the document belongs to a different user.
    """
    doc = db.query(models.Document).filter(models.Document.id == document_id).first()
    if not doc or doc.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )
    return doc


def delete_user_document(
    db: Session,
    user_id: int,
    document_id: str,
) -> None:
    """Delete document physical file and database entry."""
    doc = get_user_document_by_id(db, user_id, document_id)

    # Remove physical file
    file_path = Path(doc.file_path)
    try:
        if file_path.exists():
            file_path.unlink()
    except OSError:
        pass

    db.delete(doc)
    db.commit()

