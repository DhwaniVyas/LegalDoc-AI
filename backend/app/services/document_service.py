"""
Document service – storage, validation, security, duplicate prevention, and background processing.
"""
from datetime import datetime, timezone
import os
from pathlib import Path
import re
import unicodedata
import uuid
from typing import List, Optional, Tuple

from fastapi import BackgroundTasks, HTTPException, UploadFile, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import models
from app.database.session import SessionLocal
from app.services import chunking_service, embedding_service, pdf_extraction_service, vector_store_service

# Base upload directory: backend/uploads/users/
BASE_DIR = Path(__file__).resolve().parent.parent.parent
UPLOAD_DIR = BASE_DIR / "uploads" / "users"

MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB
MAX_FILES_PER_REQUEST = 5
PDF_MAGIC_BYTES = b"%PDF-"


def normalize_filename(filename: str) -> str:
    """
    Normalize filename for robust case-insensitive duplicate comparison.
    1. Extract file name (strip path separators)
    2. Unicode normalize using NFKC
    3. Trim leading and trailing whitespace
    4. Convert to lowercase
    """
    name = Path(filename).name
    name = unicodedata.normalize("NFKC", name)
    name = name.strip()
    return name.lower()


def sanitize_filename(filename: str) -> str:
    """Sanitize original filename for safe storage and display."""
    name = Path(filename).name
    name = unicodedata.normalize("NFKC", name)
    name = re.sub(r'[^\w\s\.-]', '_', name)
    name = name.strip()
    if not name or name.startswith('.'):
        name = f"document_{name.lstrip('.')}"
    if not name.lower().endswith(".pdf"):
        name = f"{name}.pdf"
    return name[:255]


def get_user_storage_dir(user_id: int) -> Path:
    """Ensure and return the user's isolated storage directory."""
    user_dir = (UPLOAD_DIR / str(user_id)).resolve()
    if not str(user_dir).startswith(str(UPLOAD_DIR.resolve())):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user storage path."
        )
    user_dir.mkdir(parents=True, exist_ok=True)
    return user_dir


async def validate_pdf_file(file: UploadFile) -> bytes:
    """
    Validate that an uploaded file is a non-empty, valid PDF <= 20 MB.
    Returns the file content bytes.
    """
    filename = file.filename or ""
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File '{filename}' is not a PDF. Only .pdf files are permitted.",
        )

    content = await file.read()
    file_size = len(content)

    if file_size == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File '{filename}' is empty.",
        )

    if file_size > MAX_FILE_SIZE:
        max_mb = MAX_FILE_SIZE // (1024 * 1024)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File '{filename}' exceeds the maximum allowed size of {max_mb} MB.",
        )

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
    background_tasks: BackgroundTasks,
) -> Tuple[List[models.Document], List[dict]]:
    """
    Validate and save up to 5 uploaded PDF files for the authenticated user.
    Enforces duplicate prevention per user and within the current request batch.
    Queues background text extraction and chunking for each uploaded document.
    Returns (created_documents, rejected_files).
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
    rejected_files: List[dict] = []

    # Track normalized filenames within current request to detect in-batch duplicates
    batch_normalized_names: set = set()

    # Pre-fetch existing normalized filenames for this user
    existing_normalized_names = {
        doc.normalized_filename
        for doc in db.query(models.Document.normalized_filename).filter(models.Document.user_id == user_id).all()
    }

    # If single file upload and it's already in the database, raise 409 immediately
    if len(files) == 1:
        single_norm = normalize_filename(files[0].filename or "")
        if single_norm in existing_normalized_names:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"This document already exists in your library. Duplicate uploads are not allowed: {files[0].filename}",
            )

    try:
        for file in files:
            orig_name = file.filename or "document.pdf"
            norm_name = normalize_filename(orig_name)

            # Check duplicate against existing database records
            if norm_name in existing_normalized_names:
                rejected_files.append({
                    "filename": orig_name,
                    "reason": "This document already exists in your library. Duplicate uploads are not allowed.",
                    "is_duplicate": True,
                })
                continue

            # Check duplicate within the current upload request
            if norm_name in batch_normalized_names:
                rejected_files.append({
                    "filename": orig_name,
                    "reason": f"Duplicate file in the same upload request: {orig_name}",
                    "is_duplicate": True,
                })
                continue

            # Validate PDF structure and size
            try:
                content = await validate_pdf_file(file)
            except HTTPException as e:
                rejected_files.append({
                    "filename": orig_name,
                    "reason": e.detail,
                    "is_duplicate": False,
                })
                continue

            batch_normalized_names.add(norm_name)
            file_size = len(content)
            safe_original_name = sanitize_filename(orig_name)
            unique_id = str(uuid.uuid4())
            stored_filename = f"{unique_id}.pdf"
            file_path = (user_dir / stored_filename).resolve()

            # Verify no path traversal
            if not str(file_path).startswith(str(user_dir)):
                rejected_files.append({
                    "filename": orig_name,
                    "reason": "Invalid storage path.",
                    "is_duplicate": False,
                })
                continue

            # Write file to user disk
            with open(file_path, "wb") as f:
                f.write(content)
            written_paths.append(file_path)

            doc = models.Document(
                id=unique_id,
                user_id=user_id,
                original_filename=safe_original_name,
                normalized_filename=norm_name,
                stored_filename=stored_filename,
                file_path=str(file_path),
                file_size=file_size,
                mime_type="application/pdf",
                status="uploaded",
                processing_status="pending",
                total_pages=0,
                extracted_pages=0,
                total_chunks=0,
                embedding_status="not_started",
                embedded_chunks=0,
                embedding_error=None,
                embedded_at=None,
            )
            db.add(doc)
            created_documents.append(doc)

        # If all files in the batch were duplicates or rejected
        if not created_documents:
            # Check if all rejections were due to duplicates
            if all(r.get("is_duplicate") for r in rejected_files):
                dup_names = ", ".join(r["filename"] for r in rejected_files)
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"This document already exists in your library. Duplicate uploads are not allowed: {dup_names}",
                )
            else:
                first_reason = rejected_files[0]["reason"] if rejected_files else "Upload failed."
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=first_reason,
                )

        db.commit()
        for doc in created_documents:
            db.refresh(doc)
            # Queue background text extraction & chunking
            background_tasks.add_task(process_document_background, doc.id)

        return created_documents, rejected_files

    except IntegrityError:
        db.rollback()
        for path in written_paths:
            try:
                if path.exists():
                    path.unlink()
            except OSError:
                pass
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A document with this filename already exists in your library.",
        )
    except Exception:
        db.rollback()
        for path in written_paths:
            try:
                if path.exists():
                    path.unlink()
            except OSError:
                pass
        raise


def process_document_background(document_id: str) -> None:
    """
    Background worker task to extract text with PyMuPDF, clean it,
    generate chunks via RecursiveCharacterTextSplitter, and persist to SQLite.
    """
    db = SessionLocal()
    try:
        doc = db.query(models.Document).filter(models.Document.id == document_id).first()
        if not doc:
            return

        doc.processing_status = "processing"
        doc.processing_error = None
        db.commit()

        # Step 1: Extract pages
        try:
            extraction_result = pdf_extraction_service.extract_text_from_pdf(doc.file_path)
        except pdf_extraction_service.PDFEncryptedError:
            doc.processing_status = "failed"
            doc.processing_error = "The document is password-protected and cannot be read."
            doc.processed_at = datetime.now(timezone.utc)
            db.commit()
            return
        except pdf_extraction_service.PDFExtractionError as e:
            doc.processing_status = "failed"
            doc.processing_error = f"Extraction failed: {str(e)}"
            doc.processed_at = datetime.now(timezone.utc)
            db.commit()
            return
        except Exception:
            doc.processing_status = "failed"
            doc.processing_error = "An unexpected error occurred while reading the PDF."
            doc.processed_at = datetime.now(timezone.utc)
            db.commit()
            return

        # Clear any prior pages/chunks (safe idempotency)
        db.query(models.DocumentChunk).filter(models.DocumentChunk.document_id == doc.id).delete()
        db.query(models.DocumentPage).filter(models.DocumentPage.document_id == doc.id).delete()

        # Check if the document has extractable text
        if not extraction_result.has_extractable_text:
            # Create page records even if empty to reflect document page structure
            for page_data in extraction_result.pages:
                db.add(
                    models.DocumentPage(
                        document_id=doc.id,
                        page_number=page_data.page_number,
                        extracted_text="",
                        character_count=0,
                    )
                )
            doc.total_pages = extraction_result.total_pages
            doc.extracted_pages = 0
            doc.total_chunks = 0
            doc.processing_status = "needs_ocr"
            doc.processing_error = "The document appears scanned or contains no extractable text."
            doc.processed_at = datetime.now(timezone.utc)
            db.commit()
            return

        # Step 2: Save DocumentPage records
        created_pages: List[models.DocumentPage] = []
        for page_data in extraction_result.pages:
            page_rec = models.DocumentPage(
                document_id=doc.id,
                page_number=page_data.page_number,
                extracted_text=page_data.text,
                character_count=page_data.character_count,
            )
            db.add(page_rec)
            created_pages.append(page_rec)

        db.flush()  # Flush so page IDs are generated for chunk foreign keys

        # Step 3: Chunk each page independently
        chunks_data = chunking_service.chunk_document_pages(
            document_id=doc.id,
            pages=created_pages,
        )

        for chunk in chunks_data:
            chunk_rec = models.DocumentChunk(
                document_id=doc.id,
                page_id=chunk.page_id,
                chunk_index=chunk.chunk_index,
                page_number=chunk.page_number,
                content=chunk.content,
                character_count=chunk.character_count,
            )
            db.add(chunk_rec)

        # Step 4: Update document statistics
        doc.total_pages = extraction_result.total_pages
        doc.extracted_pages = extraction_result.extracted_pages
        doc.total_chunks = len(chunks_data)
        doc.processing_status = "completed"
        doc.processing_error = None
        doc.processed_at = datetime.now(timezone.utc)
        doc.embedding_status = "pending"
        db.commit()

        # Step 5: Automatically generate embeddings and persist to ChromaDB
        if chunks_data:
            try:
                doc.embedding_status = "processing"
                doc.embedding_error = None
                db.commit()

                # Clean any prior vector embeddings for this document (idempotency)
                vector_store_service.delete_document_vectors(doc.id, user_id=doc.user_id)

                created_chunks = (
                    db.query(models.DocumentChunk)
                    .filter(models.DocumentChunk.document_id == doc.id)
                    .order_by(models.DocumentChunk.chunk_index.asc())
                    .all()
                )

                chunk_texts = [c.content for c in created_chunks]
                embeddings = embedding_service.generate_embeddings(chunk_texts)

                vector_store_service.upsert_document_chunks(
                    user_id=doc.user_id,
                    document_id=doc.id,
                    original_filename=doc.original_filename,
                    chunks=created_chunks,
                    embeddings=embeddings,
                )

                doc.embedding_status = "completed"
                doc.embedded_chunks = len(created_chunks)
                doc.embedded_at = datetime.now(timezone.utc)
                doc.embedding_error = None
                db.commit()
            except Exception as emb_err:
                doc.embedding_status = "failed"
                doc.embedding_error = f"Embedding generation failed: {str(emb_err)}"
                db.commit()
        else:
            doc.embedding_status = "not_started"
            doc.embedded_chunks = 0
            db.commit()

    except Exception:
        db.rollback()
        try:
            # Try to record failed status
            err_doc = db.query(models.Document).filter(models.Document.id == document_id).first()
            if err_doc:
                err_doc.processing_status = "failed"
                err_doc.processing_error = "An error occurred while processing the document."
                err_doc.processed_at = datetime.now(timezone.utc)
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


def reprocess_user_document(
    db: Session,
    user_id: int,
    document_id: str,
    background_tasks: BackgroundTasks,
) -> models.Document:
    """
    Trigger manual reprocessing of a document.
    Prevents concurrent reprocessing if already in 'processing' state.
    """
    doc = get_user_document_by_id(db, user_id, document_id)

    if doc.processing_status == "processing":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Document is currently being processed. Please wait until completion.",
        )

    # Reset status
    doc.processing_status = "pending"
    doc.processing_error = None
    doc.embedding_status = "not_started"
    doc.embedded_chunks = 0
    doc.embedding_error = None
    doc.embedded_at = None
    db.commit()
    db.refresh(doc)

    background_tasks.add_task(process_document_background, doc.id)
    return doc


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
    """Retrieve a document ensuring ownership by user_id."""
    doc = db.query(models.Document).filter(models.Document.id == document_id).first()
    if not doc or doc.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )
    return doc


def get_user_document_pages(
    db: Session,
    user_id: int,
    document_id: str,
) -> List[models.DocumentPage]:
    """Retrieve extracted pages for a user-owned document."""
    doc = get_user_document_by_id(db, user_id, document_id)
    return (
        db.query(models.DocumentPage)
        .filter(models.DocumentPage.document_id == doc.id)
        .order_by(models.DocumentPage.page_number.asc())
        .all()
    )


def get_user_document_chunks(
    db: Session,
    user_id: int,
    document_id: str,
) -> List[models.DocumentChunk]:
    """Retrieve extracted chunks for a user-owned document."""
    doc = get_user_document_by_id(db, user_id, document_id)
    return (
        db.query(models.DocumentChunk)
        .filter(models.DocumentChunk.document_id == doc.id)
        .order_by(models.DocumentChunk.chunk_index.asc())
        .all()
    )


def embed_document_background(document_id: str) -> None:
    """
    Background worker task to generate embeddings for a document's chunks
    and persist them to ChromaDB.
    """
    db = SessionLocal()
    try:
        doc = db.query(models.Document).filter(models.Document.id == document_id).first()
        if not doc:
            return

        chunks = (
            db.query(models.DocumentChunk)
            .filter(models.DocumentChunk.document_id == doc.id)
            .order_by(models.DocumentChunk.chunk_index.asc())
            .all()
        )

        if not chunks:
            doc.embedding_status = "failed"
            doc.embedding_error = "No extracted chunks available to embed."
            db.commit()
            return

        doc.embedding_status = "processing"
        doc.embedding_error = None
        db.commit()

        # Remove previous vectors to ensure idempotency
        vector_store_service.delete_document_vectors(doc.id, user_id=doc.user_id)

        chunk_texts = [c.content for c in chunks]
        embeddings = embedding_service.generate_embeddings(chunk_texts)

        vector_store_service.upsert_document_chunks(
            user_id=doc.user_id,
            document_id=doc.id,
            original_filename=doc.original_filename,
            chunks=chunks,
            embeddings=embeddings,
        )

        doc.embedding_status = "completed"
        doc.embedded_chunks = len(chunks)
        doc.embedded_at = datetime.now(timezone.utc)
        doc.embedding_error = None
        db.commit()
    except Exception as e:
        db.rollback()
        try:
            err_doc = db.query(models.Document).filter(models.Document.id == document_id).first()
            if err_doc:
                err_doc.embedding_status = "failed"
                err_doc.embedding_error = f"Embedding generation failed: {str(e)}"
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


def index_document_embeddings(
    db: Session,
    user_id: int,
    document_id: str,
    background_tasks: BackgroundTasks,
) -> models.Document:
    """
    Trigger manual indexing/re-indexing of document embeddings.
    """
    doc = get_user_document_by_id(db, user_id, document_id)

    if doc.processing_status != "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document text extraction must be completed before indexing embeddings.",
        )

    if doc.total_chunks == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document has no text chunks to index.",
        )

    if doc.embedding_status == "processing":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Document is currently being indexed. Please wait until completion.",
        )

    doc.embedding_status = "pending"
    doc.embedding_error = None
    db.commit()
    db.refresh(doc)

    background_tasks.add_task(embed_document_background, doc.id)
    return doc


def delete_user_document(
    db: Session,
    user_id: int,
    document_id: str,
) -> None:
    """Delete document physical file, vector embeddings, and database entry (cascades to pages and chunks)."""
    doc = get_user_document_by_id(db, user_id, document_id)

    # Clean vectors from ChromaDB
    try:
        vector_store_service.delete_document_vectors(doc.id, user_id=doc.user_id)
    except Exception:
        pass

    file_path = Path(doc.file_path)
    try:
        if file_path.exists():
            file_path.unlink()
    except OSError:
        pass

    db.delete(doc)
    db.commit()
