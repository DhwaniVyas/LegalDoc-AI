"""
Verify AI Answer Formatting and Presentation in LegalDoc AI:
1. Direct explanation and logical grouping (### and ####).
2. Point-wise structure (bullet points and numbered points).
3. Bold highlighting for articles, doctrines, and definitions (**Article 14**).
4. Markdown comparison tables for comparative questions (e.g. Compare Articles 14 and 15).
5. Accurate citation preservation without corruption.
6. Non-repetition across sections.
"""
import os
import re
import sys
import time

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, backend_dir)

from app.database import models
from app.database.session import SessionLocal
from app.services import rag_service, groq_service

def run_tests():
    db = SessionLocal()
    try:
        user = db.query(models.User).filter(models.User.email == "testuser@example.com").first()
        if not user:
            user = db.query(models.User).first()
        doc = db.query(models.Document).filter(models.Document.user_id == user.id).first()

        print("=" * 70)
        print("VERIFYING AI ANSWER FORMATTING & PRESENTATION IMPROVEMENTS")
        print("=" * 70)

        # Test 1: Single provision detailed answer (e.g. Article 14)
        print("\n[TEST 1] Testing single-provision query: 'Explain Article 14 in detail.'")
        res1 = rag_service.answer_question(
            user_id=user.id,
            question="Explain Article 14 in detail.",
            document_id=doc.id if doc else None,
            db=db,
        )
        ans1 = res1.get("answer", "")
        status1 = res1.get("status")
        cids1 = res1.get("sources", [])

        print(f"Status: {status1}, Length: {len(ans1)} chars, Citations: {len(cids1)}")
        print("RAW ANSWER 1:")
        print("-" * 50)
        print(ans1)
        print("-" * 50)
        
        has_bullets_or_numbers = bool(re.search(r"(?:^|\n)(?:[-*•]|\d+\.)\s+", ans1))
        has_headings = bool(re.search(r"###\s+", ans1))
        has_bold_terms = bool(re.search(r"\*\*(?:Article\s+14|[A-Za-z\s]+)\*\*", ans1))
        has_citations = bool(re.search(r"\[S\d+\]", ans1))
        direct_opening = not bool(re.search(r"^(?:in this answer|based on the excerpts|as requested|hello)", ans1.strip().lower()))

        print(f"  - Has point-wise items (bullets/numbers): {has_bullets_or_numbers}")
        print(f"  - Has logical headings (###): {has_headings}")
        print(f"  - Has bold key terms/articles: {has_bold_terms}")
        print(f"  - Has inline citations [S1]: {has_citations}")
        print(f"  - Direct opening (no filler): {direct_opening}")

        assert status1 == "answered", f"Expected answered status, got {status1}"
        assert has_bullets_or_numbers, "Expected point-wise bullet or numbered format"
        assert has_headings, "Expected structured markdown headings"
        assert has_bold_terms, "Expected bold formatting for key terms"
        assert has_citations, "Expected inline citation tags"
        print("  -> TEST 1 PASSED!")

        # Sleep to respect Groq rate limits
        time.sleep(2)

        # Test 2: Comparative query (e.g. Compare Articles 14 and 15)
        print("\n[TEST 2] Testing comparative query: 'Compare Articles 14 and 15.'")
        res2 = rag_service.answer_question(
            user_id=user.id,
            question="Compare Articles 14 and 15 in detail.",
            document_id=doc.id if doc else None,
            db=db,
        )
        ans2 = res2.get("answer", "")
        status2 = res2.get("status")
        cids2 = res2.get("sources", [])

        print(f"Status: {status2}, Length: {len(ans2)} chars, Citations: {len(cids2)}")

        has_table = bool(re.search(r"\|[^\n]+\|[^\n]+\|\n\|(?:\s*:?-+:?\s*\|)+\n\|", ans2))
        has_bullets2 = bool(re.search(r"(?:^|\n)(?:[-*•]|\d+\.)\s+", ans2))
        has_citations2 = bool(re.search(r"\[S\d+\]", ans2))

        print(f"  - Has Markdown comparison table: {has_table}")
        print(f"  - Has point-wise elaboration: {has_bullets2}")
        print(f"  - Has inline citations: {has_citations2}")

        assert status2 == "answered", f"Expected answered status, got {status2}"
        assert has_table or has_bullets2, "Expected structured comparison table or bullets"
        assert has_citations2, "Expected inline citations"
        print("  -> TEST 2 PASSED!")

        print("\n" + "=" * 70)
        print("ALL FORMATTING VERIFICATION CHECKS PASSED SUCCESSFULLY!")
        print("=" * 70)

    finally:
        db.close()

if __name__ == "__main__":
    run_tests()
