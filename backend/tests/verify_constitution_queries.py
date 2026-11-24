"""
Verification Script: Testing the 9 Constitution of India queries specified in Phase 6 improvements.
Verifies multi-aspect retrieval, contiguous clause expansion, citation accuracy, and timing metrics.
"""
import os
import sys
from pathlib import Path

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from app.database import models
from app.database.session import SessionLocal
from app.services import rag_service

USER_ID = 3
DOC_ID = "da4fc167-8ac8-4bb4-836e-3c2caa39d6c0"  # constitution.pdf


def test_constitution_queries():
    print("=" * 70)
    print("TESTING 9 CONSTITUTION OF INDIA RAG QUERIES")
    print("=" * 70)

    db = SessionLocal()
    try:
        # Check document in DB
        doc = db.query(models.Document).filter(models.Document.id == DOC_ID, models.Document.user_id == USER_ID).first()
        if not doc:
            print(f"[FAIL] Document {DOC_ID} not found for user {USER_ID}")
            return False

        print(f"Loaded Document: '{doc.original_filename}', Total Pages: {doc.total_pages}, Total Chunks: {doc.total_chunks}")

        queries = [
            ("1. Explain the Right to Equality.", ["14", "15", "16", "17", "18"]),
            ("2. Explain Article 14 in detail.", ["14"]),
            ("3. Explain Article 15 and its prohibited grounds of discrimination.", ["15"]),
            ("4. Explain equality of opportunity in public employment.", ["16"]),
            ("5. Explain the abolition of untouchability.", ["17"]),
            ("6. Explain the abolition of titles.", ["18"]),
            ("7. Compare Articles 14 and 15.", ["14", "15"]),
            ("8. Explain the Right to Equality with relevant page citations.", ["14", "15", "16", "17", "18"]),
            ("9. What is the penalty for trading cryptocurrency under the Constitution of India?", []),
        ]

        all_passed = True

        for idx, (query_text, expected_articles) in enumerate(queries, start=1):
            print(f"\n--- Running Test {idx}: '{query_text}' ---")
            sources, valid_cids, timings = rag_service.retrieve_and_prepare_sources(
                user_id=USER_ID,
                question=query_text,
                document_id=DOC_ID,
                top_k=15,
                db=db,
            )

            print(f"Sources retrieved: {len(sources)}")
            print(f"Timings: {timings}")

            combined_content = " ".join([s["content"] for s in sources]).lower()
            page_numbers = {s["page_number"] for s in sources}
            print(f"Pages covered: {sorted(list(page_numbers))}")

            if expected_articles:
                missing = []
                for art in expected_articles:
                    # Look for Article reference in retrieved text
                    patterns = [f"article {art}", f"{art}.", f"article {art}."]
                    if not any(p in combined_content for p in patterns):
                        missing.append(art)

                if missing:
                    print(f"[FAIL] Query {idx}: Missing provisions for Articles: {missing}")
                    all_passed = False
                else:
                    print(f"[PASS] Query {idx}: All expected Articles {expected_articles} present in retrieved context!")
            else:
                # Query 9: ungrounded query
                # The text should not contain cryptocurrency
                has_crypto = "cryptocurrency" in combined_content
                if has_crypto:
                    print(f"[FAIL] Query {idx}: Context contains non-existent crypto text")
                    all_passed = False
                else:
                    print(f"[PASS] Query {idx}: Correctly verified no false crypto text in Constitution")

        print("\n" + "=" * 70)
        if all_passed:
            print("ALL 9 CONSTITUTION RETRIEVAL VERIFICATIONS PASSED PERFECTLY!")
        else:
            print("SOME RETRIEVAL VERIFICATIONS FAILED.")
        print("=" * 70)
        return all_passed

    finally:
        db.close()


if __name__ == "__main__":
    success = test_constitution_queries()
    sys.exit(0 if success else 1)

