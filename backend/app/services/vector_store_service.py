"""
Vector Store Service – Persistent ChromaDB storage and similarity search for document chunks.
Storage path: backend/vector_store/
Collection: legaldoc_chunks (hnsw:space: cosine)
Strict per-user data isolation enforced on all operations.
"""
import logging
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Default persistent directory: backend/vector_store
VECTOR_STORE_DIR = Path(__file__).resolve().parent.parent.parent / "vector_store"
COLLECTION_NAME = "legaldoc_chunks"

_client_instance = None
_client_lock = threading.Lock()


def get_chroma_client():
    """
    Get or create thread-safe singleton PersistentClient.
    """
    global _client_instance
    if _client_instance is None:
        with _client_lock:
            if _client_instance is None:
                VECTOR_STORE_DIR.mkdir(parents=True, exist_ok=True)
                import chromadb
                logger.info("Initializing ChromaDB PersistentClient at: %s", VECTOR_STORE_DIR)
                _client_instance = chromadb.PersistentClient(path=str(VECTOR_STORE_DIR))
    return _client_instance


def get_collection(client=None):
    """
    Get or create the 'legaldoc_chunks' ChromaDB collection with cosine distance metric.
    """
    if client is None:
        client = get_chroma_client()
    return client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"}
    )


def upsert_document_chunks(
    user_id: int,
    document_id: str,
    original_filename: str,
    chunks: List[Any],
    embeddings: List[List[float]],
    batch_size: int = 100,
) -> int:
    """
    Upsert document chunk embeddings and metadata into ChromaDB.
    Uses chunk.id directly as the vector ID for idempotency.

    Args:
        user_id: Owner user ID.
        document_id: Document UUID.
        original_filename: Original file name.
        chunks: List of DocumentChunk ORM objects or dicts with id, page_id, page_number, chunk_index, content.
        embeddings: List of 384-d float embeddings matching chunks.
        batch_size: Batch size for ChromaDB upsert.

    Returns:
        Number of vectors upserted.
    """
    if not chunks or not embeddings:
        return 0

    if len(chunks) != len(embeddings):
        raise ValueError(f"Chunks count ({len(chunks)}) does not match embeddings count ({len(embeddings)})")

    collection = get_collection()

    ids = []
    documents = []
    metadatas = []

    for chunk in chunks:
        if isinstance(chunk, dict):
            chunk_id = chunk.get("id")
            page_id = chunk.get("page_id", "")
            page_number = chunk.get("page_number", 1)
            chunk_index = chunk.get("chunk_index", 0)
            content = chunk.get("content", "")
        else:
            chunk_id = getattr(chunk, "id", None)
            page_id = getattr(chunk, "page_id", "")
            page_number = getattr(chunk, "page_number", 1)
            chunk_index = getattr(chunk, "chunk_index", 0)
            content = getattr(chunk, "content", "")

        ids.append(str(chunk_id))
        documents.append(content)
        metadatas.append({
            "user_id": int(user_id),
            "document_id": str(document_id),
            "chunk_id": str(chunk_id),
            "page_id": str(page_id),
            "page_number": int(page_number),
            "chunk_index": int(chunk_index),
            "original_filename": str(original_filename),
        })

    total = len(ids)
    for i in range(0, total, batch_size):
        batch_ids = ids[i : i + batch_size]
        batch_docs = documents[i : i + batch_size]
        batch_metas = metadatas[i : i + batch_size]
        batch_embeddings = embeddings[i : i + batch_size]

        collection.upsert(
            ids=batch_ids,
            embeddings=batch_embeddings,
            documents=batch_docs,
            metadatas=batch_metas,
        )

    logger.info("Upserted %d chunk vectors for document_id=%s (user_id=%d)", total, document_id, user_id)
    return total


def delete_document_vectors(document_id: str, user_id: Optional[int] = None) -> int:
    """
    Delete all vector embeddings belonging to a document from ChromaDB.

    Args:
        document_id: Document UUID.
        user_id: Optional user ID for extra scoping.

    Returns:
        1 on success.
    """
    try:
        collection = get_collection()
        if user_id is not None:
            where_clause = {
                "$and": [
                    {"user_id": int(user_id)},
                    {"document_id": str(document_id)}
                ]
            }
        else:
            where_clause = {"document_id": str(document_id)}

        collection.delete(where=where_clause)
        logger.info("Deleted vector embeddings for document_id=%s", document_id)
        return 1
    except Exception as e:
        logger.warning("Error deleting vector embeddings for document %s: %s", document_id, e)
        return 0


def delete_user_vectors(user_id: int) -> int:
    """
    Delete all vector embeddings belonging to a user from ChromaDB.
    """
    try:
        collection = get_collection()
        collection.delete(where={"user_id": int(user_id)})
        logger.info("Deleted all vector embeddings for user_id=%d", user_id)
        return 1
    except Exception as e:
        logger.warning("Error deleting vectors for user %d: %s", user_id, e)
        return 0


def query_semantic_chunks(
    user_id: int,
    query_embedding: List[float],
    top_k: int = 5,
    document_id: Optional[str] = None,
    document_ids: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Query ChromaDB for the most semantically relevant document chunks.
    Strictly filters by user_id to prevent cross-user data leakage.
    Supports single document_id or multi-document document_ids filtering.

    Args:
        user_id: Authenticated user ID (required).
        query_embedding: 384-d query vector.
        top_k: Number of nearest neighbors to retrieve (1-50).
        document_id: Optional single document ID filter.
        document_ids: Optional list of document ID filters.

    Returns:
        List of result dicts with chunk_id, document_id, filename, page_number,
        chunk_index, content, and cosine distance.
    """
    if not query_embedding:
        return []

    collection = get_collection()

    clean_doc_ids = []
    if document_ids:
        clean_doc_ids = [str(d).strip() for d in document_ids if d and str(d).strip()]
    elif document_id and str(document_id).strip():
        clean_doc_ids = [str(document_id).strip()]

    # Enforce strict user isolation
    if len(clean_doc_ids) == 1:
        where_filter = {
            "$and": [
                {"user_id": int(user_id)},
                {"document_id": clean_doc_ids[0]},
            ]
        }
    elif len(clean_doc_ids) > 1:
        where_filter = {
            "$and": [
                {"user_id": int(user_id)},
                {"document_id": {"$in": clean_doc_ids}},
            ]
        }
    else:
        where_filter = {"user_id": int(user_id)}

    # Ensure top_k is within safe bounds
    clamped_k = max(1, min(int(top_k), 50))

    # Query ChromaDB
    raw = collection.query(
        query_embeddings=[query_embedding],
        n_results=clamped_k,
        where=where_filter,
        include=["documents", "metadatas", "distances"],
    )

    ids = raw.get("ids", [[]])[0] if raw.get("ids") else []
    docs = raw.get("documents", [[]])[0] if raw.get("documents") else []
    metas = raw.get("metadatas", [[]])[0] if raw.get("metadatas") else []
    distances = raw.get("distances", [[]])[0] if raw.get("distances") else []

    results = []
    for i in range(len(ids)):
        meta = metas[i] if i < len(metas) and metas[i] else {}
        results.append({
            "chunk_id": ids[i],
            "document_id": meta.get("document_id", ""),
            "filename": meta.get("original_filename", ""),
            "page_number": meta.get("page_number", 1),
            "chunk_index": meta.get("chunk_index", 0),
            "content": docs[i] if i < len(docs) else "",
            "distance": round(float(distances[i]), 4) if i < len(distances) and distances[i] is not None else 0.0,
        })

    return results
