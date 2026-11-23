"""
PDF Text Extraction Service using PyMuPDF.
Extracts clean, structured text page by page preserving legal formatting and page numbers.
"""
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import List

import fitz  # PyMuPDF


class PDFExtractionError(Exception):
    """Base exception for PDF extraction failures."""
    pass


class PDFEncryptedError(PDFExtractionError):
    """Raised when PDF is password protected."""
    pass


class PDFCorruptedError(PDFExtractionError):
    """Raised when PDF structure is invalid or unreadable."""
    pass


class PDFEmptyError(PDFExtractionError):
    """Raised when PDF has zero pages."""
    pass


@dataclass
class ExtractedPage:
    page_number: int          # 1-indexed
    text: str                 # Cleaned text
    character_count: int      # Character length of cleaned text
    has_text: bool            # True if text contains non-whitespace


@dataclass
class ExtractionResult:
    total_pages: int
    extracted_pages: int      # Pages with extractable text
    pages: List[ExtractedPage]
    total_characters: int
    has_extractable_text: bool


def clean_page_text(raw_text: str) -> str:
    """
    Clean extracted text preserving legal section numbering, headings,
    dates, paragraphs, and numbered clauses.
    - Normalizes Unicode (NFKC)
    - Strips non-printable control characters
    - Trims trailing whitespace from lines
    - Collapses 3+ consecutive newlines into 2
    """
    if not raw_text:
        return ""

    # Normalize Unicode characters
    text = unicodedata.normalize("NFKC", raw_text)

    # Remove non-printable control characters (keep \n, \r, \t)
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)

    # Normalize line breaks to \n
    text = text.replace('\r\n', '\n').replace('\r', '\n')

    # Strip trailing whitespace on each line without altering indentation
    lines = [line.rstrip() for line in text.split('\n')]
    text = '\n'.join(lines)

    # Collapse excessive blank lines (3 or more newlines become 2 newlines)
    text = re.sub(r'\n{3,}', '\n\n', text)

    # Trim leading/trailing whitespace
    return text.strip()


def extract_text_from_pdf(file_path: str) -> ExtractionResult:
    """
    Open PDF file with PyMuPDF, extract and clean text page-by-page.
    Preserves 1-indexed page numbering.
    """
    path = Path(file_path)
    if not path.exists():
        raise PDFCorruptedError(f"File not found on disk: {path.name}")

    try:
        doc = fitz.open(str(path))
    except Exception as e:
        raise PDFCorruptedError(f"Failed to open PDF: {str(e)}")

    try:
        # Check encryption
        if doc.is_encrypted:
            raise PDFEncryptedError("Document is password-protected or encrypted.")

        total_pages = len(doc)
        if total_pages == 0:
            raise PDFEmptyError("PDF contains no pages.")

        pages: List[ExtractedPage] = []
        total_chars = 0
        pages_with_text = 0

        for idx in range(total_pages):
            page_num = idx + 1
            try:
                page = doc.load_page(idx)
                raw_text = page.get_text("text")
                cleaned = clean_page_text(raw_text)
                char_count = len(cleaned)
                has_text = len(cleaned.strip()) > 0

                if has_text:
                    pages_with_text += 1
                    total_chars += char_count

                pages.append(
                    ExtractedPage(
                        page_number=page_num,
                        text=cleaned,
                        character_count=char_count,
                        has_text=has_text,
                    )
                )
            except Exception as page_err:
                # Preserve page entry even if extraction failed for that specific page
                pages.append(
                    ExtractedPage(
                        page_number=page_num,
                        text="",
                        character_count=0,
                        has_text=False,
                    )
                )

        return ExtractionResult(
            total_pages=total_pages,
            extracted_pages=pages_with_text,
            pages=pages,
            total_characters=total_chars,
            has_extractable_text=total_chars > 0,
        )

    finally:
        doc.close()

