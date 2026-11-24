"""
Embedding Service – Local vector embedding generation using Sentence Transformers.
Model: all-MiniLM-L6-v2 (384-dimensional dense vector embeddings).
Runs locally on CPU; no external API key required.
"""
import logging
import os
import threading
from typing import List, Optional

# Enforce offline mode for SentenceTransformers so cached weights load instantly
# without attempting external HuggingFace network handshakes (avoids 40s timeout)
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

logger = logging.getLogger(__name__)

MODEL_NAME = "all-MiniLM-L6-v2"
EMBEDDING_DIM = 384

_model_instance = None
_model_lock = threading.Lock()


def get_embedding_model():
    """
    Lazy singleton loader for the SentenceTransformer model.
    Guarantees thread-safe single initialization so model weights are loaded only once.
    """
    global _model_instance
    if _model_instance is None:
        with _model_lock:
            if _model_instance is None:
                logger.info("Loading local SentenceTransformer model: %s", MODEL_NAME)
                from sentence_transformers import SentenceTransformer
                _model_instance = SentenceTransformer(MODEL_NAME)
                logger.info("SentenceTransformer model loaded successfully (dimension: %d)", EMBEDDING_DIM)
    return _model_instance


def generate_embeddings(texts: List[str], batch_size: int = 32) -> List[List[float]]:
    """
    Generate 384-dimensional dense vector embeddings for a list of text chunks.
    Embeddings are normalized to unit length for cosine similarity comparisons.

    Args:
        texts: List of text chunk strings.
        batch_size: Batch size for encoding.

    Returns:
        List of 384-float lists.
    """
    if not texts:
        return []

    # Clean text inputs
    cleaned_texts = [t.strip() if t and t.strip() else " " for t in texts]

    model = get_embedding_model()
    embeddings = model.encode(
        cleaned_texts,
        batch_size=batch_size,
        show_progress_bar=False,
        convert_to_numpy=True,
        normalize_embeddings=True,
    )
    return embeddings.tolist()


def generate_query_embedding(query: str) -> List[float]:
    """
    Generate a 384-dimensional dense vector embedding for a search query.

    Args:
        query: User search query string.

    Returns:
        List of 384 floats.
    """
    if not query or not query.strip():
        return []

    model = get_embedding_model()
    embedding = model.encode(
        query.strip(),
        show_progress_bar=False,
        convert_to_numpy=True,
        normalize_embeddings=True,
    )
    return embedding.tolist()

