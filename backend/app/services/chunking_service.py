"""
Text chunking service using LangChain's RecursiveCharacterTextSplitter.
Splits each page independently, preserving document_id, page_id, page_number,
chunk_index, character_count, and content.
"""
from dataclasses import dataclass
from typing import List, Sequence

from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.database import models

# Configurable defaults
DEFAULT_CHUNK_SIZE = 1000
DEFAULT_CHUNK_OVERLAP = 150
DEFAULT_SEPARATORS = ["\n\n", "\n", ". ", " ", ""]


@dataclass
class ExtractedChunkData:
    document_id: str
    page_id: str
    page_number: int
    chunk_index: int
    content: str
    character_count: int


def get_text_splitter(
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    chunk_overlap: int = DEFAULT_CHUNK_OVERLAP,
    separators: Sequence[str] = DEFAULT_SEPARATORS,
) -> RecursiveCharacterTextSplitter:
    """Create a configured RecursiveCharacterTextSplitter instance."""
    return RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=list(separators),
        keep_separator=True,
    )


def chunk_document_pages(
    document_id: str,
    pages: List[models.DocumentPage],
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    chunk_overlap: int = DEFAULT_CHUNK_OVERLAP,
) -> List[ExtractedChunkData]:
    """
    Split each DocumentPage independently into chunks.
    Maintains a sequential global chunk_index across the entire document.
    Never blends text from multiple PDF pages into a single chunk.
    """
    splitter = get_text_splitter(chunk_size=chunk_size, chunk_overlap=chunk_overlap)
    all_chunks: List[ExtractedChunkData] = []
    global_chunk_idx = 0

    for page in pages:
        text = (page.extracted_text or "").strip()
        if not text:
            continue

        raw_splits = splitter.split_text(text)
        for split in raw_splits:
            clean_split = split.strip()
            if not clean_split:
                continue

            all_chunks.append(
                ExtractedChunkData(
                    document_id=document_id,
                    page_id=page.id,
                    page_number=page.page_number,
                    chunk_index=global_chunk_idx,
                    content=clean_split,
                    character_count=len(clean_split),
                )
            )
            global_chunk_idx += 1

    return all_chunks

