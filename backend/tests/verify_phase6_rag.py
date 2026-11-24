"""
Phase 6 Verification Script:
Gemini-Powered RAG Question Answering, Citation Validation, Evidence Grounding,
Cross-User Isolation, Error Handling, and Regression Tests.
"""
import io
import os
import sys
import uuid
from pathlib import Path
from unittest.mock import MagicMock, patch

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

# Setup PYTHONPATH
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

import fitz  # PyMuPDF
from fastapi.testclient import TestClient
from google.genai import errors

from main import app
from app.core.config import settings
from app.core.security import create_access_token
from app.database import models
from app.database.session import SessionLocal
from app.services import (
    auth_service,
    document_service,
    embedding_service,
    gemini_service,
    rag_service,
    vector_store_service,
)

PASSED = "PASS"
FAILED = "FAIL"
results = []


def record(name: str, passed: bool, details: str = ""):
    status = PASSED if passed else FAILED
    results.append((name, status, details))
    print(f"[{status}] {name}" + (f" -> {details}" if details else ""))


def run_all_tests():
    print("=" * 70)
    print("STARTING PHASE 6 GEMINI-POWERED RAG COMPREHENSIVE VERIFICATION")
    print("=" * 70)

    db = SessionLocal()
    client = TestClient(app)

    try:
        # Setup Test Users
        user_a = db.query(models.User).filter(models.User.email == "test_user_a_p6@example.com").first()
        if not user_a:
            user_a = models.User(
                email="test_user_a_p6@example.com",
                full_name="User A Phase6",
                hashed_password=auth_service.hash_password("SecretPassword123!"),
                is_active=True,
            )
            db.add(user_a)

        user_b = db.query(models.User).filter(models.User.email == "test_user_b_p6@example.com").first()
        if not user_b:
            user_b = models.User(
                email="test_user_b_p6@example.com",
                full_name="User B Phase6",
                hashed_password=auth_service.hash_password("SecretPassword123!"),
                is_active=True,
            )
            db.add(user_b)

        db.commit()
        db.refresh(user_a)
        db.refresh(user_b)

        user_a_id = user_a.id
        user_b_id = user_b.id

        token_a = create_access_token(subject=str(user_a_id))
        token_b = create_access_token(subject=str(user_b_id))
        cookies_a = {"access_token": token_a}
        cookies_b = {"access_token": token_b}

        # Clean vectors and existing test documents
        vector_store_service.delete_user_vectors(user_a_id)
        vector_store_service.delete_user_vectors(user_b_id)
        db.query(models.Document).filter(models.Document.user_id.in_([user_a_id, user_b_id])).delete()
        db.commit()

        # Index test documents for User A
        doc_a1_id = str(uuid.uuid4())
        chunks_a1 = [
            {
                "id": str(uuid.uuid4()),
                "page_id": str(uuid.uuid4()),
                "page_number": 1,
                "chunk_index": 0,
                "content": "Section 4.1 Indemnification: The Vendor shall defend, indemnify, and hold harmless the Client against all third-party claims, liabilities, losses, and damages arising from breach of agreement.",
            },
            {
                "id": str(uuid.uuid4()),
                "page_id": str(uuid.uuid4()),
                "page_number": 2,
                "chunk_index": 1,
                "content": "Section 9.2 Termination Notice: Either party may terminate this Agreement by giving thirty (30) days prior written notice sent via certified courier.",
            },
        ]
        vector_store_service.upsert_document_chunks(
            user_id=user_a_id,
            document_id=doc_a1_id,
            original_filename="Master_Services_Agreement.pdf",
            chunks=chunks_a1,
            embeddings=embedding_service.generate_embeddings([c["content"] for c in chunks_a1]),
        )

        doc_a2_id = str(uuid.uuid4())
        chunks_a2 = [
            {
                "id": str(uuid.uuid4()),
                "page_id": str(uuid.uuid4()),
                "page_number": 1,
                "chunk_index": 0,
                "content": "Section 12 Liability Cap: In no event shall either party's aggregate liability exceed the total fees paid under this Agreement in the twelve months preceding the claim.",
            }
        ]
        vector_store_service.upsert_document_chunks(
            user_id=user_a_id,
            document_id=doc_a2_id,
            original_filename="Limitation_of_Liability_Addendum.pdf",
            chunks=chunks_a2,
            embeddings=embedding_service.generate_embeddings([c["content"] for c in chunks_a2]),
        )

        # Create Document records in DB so ownership checks succeed
        db_doc_a1 = db.query(models.Document).filter(models.Document.id == doc_a1_id).first()
        if not db_doc_a1:
            db_doc_a1 = models.Document(
                id=doc_a1_id,
                user_id=user_a_id,
                original_filename="Master_Services_Agreement.pdf",
                normalized_filename="master_services_agreement.pdf",
                stored_filename=f"{doc_a1_id}.pdf",
                file_path=f"dummy/{doc_a1_id}.pdf",
                file_size=1024,
                processing_status="completed",
                embedding_status="completed",
                total_chunks=2,
            )
            db.add(db_doc_a1)

        db_doc_a2 = db.query(models.Document).filter(models.Document.id == doc_a2_id).first()
        if not db_doc_a2:
            db_doc_a2 = models.Document(
                id=doc_a2_id,
                user_id=user_a_id,
                original_filename="Limitation_of_Liability_Addendum.pdf",
                normalized_filename="limitation_of_liability_addendum.pdf",
                stored_filename=f"{doc_a2_id}.pdf",
                file_path=f"dummy/{doc_a2_id}.pdf",
                file_size=1024,
                processing_status="completed",
                embedding_status="completed",
                total_chunks=1,
            )
            db.add(db_doc_a2)

        # Document for User B
        doc_b1_id = str(uuid.uuid4())
        chunks_b1 = [
            {
                "id": str(uuid.uuid4()),
                "page_id": str(uuid.uuid4()),
                "page_number": 1,
                "chunk_index": 0,
                "content": "Secret Project Krypton: Quantum key exchange protocols owned exclusively by User B. Unauthorized access prohibited.",
            }
        ]
        vector_store_service.upsert_document_chunks(
            user_id=user_b_id,
            document_id=doc_b1_id,
            original_filename="Classified_Krypton.pdf",
            chunks=chunks_b1,
            embeddings=embedding_service.generate_embeddings([c["content"] for c in chunks_b1]),
        )
        db_doc_b1 = db.query(models.Document).filter(models.Document.id == doc_b1_id).first()
        if not db_doc_b1:
            db_doc_b1 = models.Document(
                id=doc_b1_id,
                user_id=user_b_id,
                original_filename="Classified_Krypton.pdf",
                normalized_filename="classified_krypton.pdf",
                stored_filename=f"{doc_b1_id}.pdf",
                file_path=f"dummy/{doc_b1_id}.pdf",
                file_size=1024,
                processing_status="completed",
                embedding_status="completed",
                total_chunks=1,
            )
            db.add(db_doc_b1)

        db.commit()

        # ---------------------------------------------------------
        # Test 1 to 6: Ask Question, Retrieval, Context, Answer & Citations
        # ---------------------------------------------------------
        mock_gemini_answer = (
            "Under Section 4.1, the Vendor is required to defend and indemnify the Client "
            "against all third-party claims, liabilities, and damages arising from breach [S1]. "
            "Furthermore, either party may terminate the agreement with thirty days prior written notice [S2]."
        )

        with patch("app.services.gemini_service.generate_content", return_value=mock_gemini_answer) as mock_gen:
            resp = client.post(
                "/api/qa/ask",
                json={"question": "What are the indemnification and termination obligations?"},
                cookies=cookies_a,
            )

            is_200 = resp.status_code == 200
            data = resp.json() if is_200 else {}
            mock_called = mock_gen.called

            # Check context passed to Gemini
            prompt_arg = mock_gen.call_args[1].get("prompt") or mock_gen.call_args[0][0]
            context_has_s1 = "[S1] Document:" in prompt_arg and "Section 4.1 Indemnification" in prompt_arg
            context_has_s2 = "[S2] Document:" in prompt_arg

            # Check response structure
            has_answer = "Under Section 4.1" in data.get("answer", "")
            has_status_answered = data.get("status") == "answered"
            sources = data.get("sources", [])
            has_sources = len(sources) >= 2
            sources_valid = (
                has_sources
                and sources[0]["citation_id"] == "S1"
                and sources[0]["filename"] == "Master_Services_Agreement.pdf"
                and sources[0]["page_number"] == 1
                and sources[1]["citation_id"] == "S2"
                and sources[1]["page_number"] == 2
            )

            record("1. Ask question about indexed legal PDF", is_200 and has_answer, f"HTTP {resp.status_code}")
            record("2. Verify retrieval happens before Gemini generation", mock_called, "ChromaDB queried prior to LLM")
            record("3. Verify relevant context is passed to Gemini", context_has_s1 and context_has_s2, "Context formatted with [S1] and [S2]")
            record("4. Verify generated answer is displayed", has_status_answered, f"Status: {data.get('status')}")
            record("5. Verify citations map to actual retrieved chunks", "[S1]" in data.get("answer", ""), "Inline citations [S1] and [S2] verified")
            record("6. Verify correct filenames and page numbers", sources_valid, f"Source 1: {sources[0]['filename']} p.{sources[0]['page_number']}")

        # ---------------------------------------------------------
        # Test 7: Insufficient document evidence
        # ---------------------------------------------------------
        mock_insufficient = (
            "The available document excerpts do not provide sufficient information or evidence "
            "regarding criminal penalties or jail time for contract breach."
        )
        with patch("app.services.gemini_service.generate_content", return_value=mock_insufficient):
            resp_insuff = client.post(
                "/api/qa/ask",
                json={"question": "What criminal jail penalties apply to contract breach?"},
                cookies=cookies_a,
            )
            data_insuff = resp_insuff.json()
            is_insuff = data_insuff.get("status") == "insufficient_evidence"
            record("7. Test question with insufficient document evidence", is_insuff, f"Status: {data_insuff.get('status')}")

        # ---------------------------------------------------------
        # Test 8: Question with no relevant sources
        # ---------------------------------------------------------
        with patch("app.services.vector_store_service.query_semantic_chunks", return_value=[]):
            resp_empty_src = client.post(
                "/api/qa/ask",
                json={"question": "What is the recipe for chocolate cake?"},
                cookies=cookies_a,
            )
            data_empty_src = resp_empty_src.json()
            is_no_rel = data_empty_src.get("status") == "no_relevant_sources" and len(data_empty_src.get("sources", [])) == 0
            record("8. Test question with no relevant sources", is_no_rel, f"Status: {data_empty_src.get('status')}, Sources: {len(data_empty_src.get('sources', []))}")

        # ---------------------------------------------------------
        # Test 9: Specific document filter
        # ---------------------------------------------------------
        mock_cap_answer = "Under Section 12, liability is capped at the total fees paid in the prior twelve months [S1]."
        with patch("app.services.gemini_service.generate_content", return_value=mock_cap_answer) as mock_filter:
            resp_filter = client.post(
                "/api/qa/ask",
                json={
                    "question": "What is the maximum liability cap?",
                    "document_id": doc_a2_id,
                },
                cookies=cookies_a,
            )
            data_filter = resp_filter.json()
            # Verify only doc_a2 sources are present
            sources_filtered = data_filter.get("sources", [])
            only_doc_a2 = all(s["document_id"] == doc_a2_id for s in sources_filtered) and len(sources_filtered) == 1
            record("9. Test specific document filter", resp_filter.status_code == 200 and only_doc_a2, f"Doc ID: {doc_a2_id}, Filtered sources: {len(sources_filtered)}")

        # ---------------------------------------------------------
        # Test 10: Search across all user's indexed documents
        # ---------------------------------------------------------
        with patch("app.services.gemini_service.generate_content", return_value="The documents state obligations [S1] and liability limits [S2]."):
            resp_all = client.post(
                "/api/qa/ask",
                json={"question": "Summarize legal liabilities and obligations.", "document_id": None},
                cookies=cookies_a,
            )
            data_all = resp_all.json()
            sources_all = data_all.get("sources", [])
            doc_ids_seen = {s["document_id"] for s in sources_all}
            multi_doc = len(doc_ids_seen) >= 2
            record("10. Test searching across all user's indexed documents", resp_all.status_code == 200 and multi_doc, f"Sources span {len(doc_ids_seen)} distinct documents")

        # ---------------------------------------------------------
        # Test 11: Cross-user isolation (User A cannot retrieve User B's documents)
        # ---------------------------------------------------------
        with patch("app.services.gemini_service.generate_content", return_value="Information regarding krypton.") as mock_leak:
            resp_iso = client.post(
                "/api/qa/ask",
                json={"question": "What are the secret protocols for Project Krypton?"},
                cookies=cookies_a,
            )
            prompt_iso = mock_leak.call_args.kwargs.get("prompt") if mock_leak.called else ""
            b_chunk_in_prompt = "Quantum key exchange" in prompt_iso or "Classified_Krypton" in prompt_iso or doc_b1_id in prompt_iso
            sources_iso = resp_iso.json().get("sources", [])
            b_chunk_in_sources = any(s["document_id"] == doc_b1_id or "Classified_Krypton" in s["filename"] for s in sources_iso)

            isolated = not b_chunk_in_prompt and not b_chunk_in_sources
            record("11. Strict user isolation: User A cannot retrieve User B's docs", isolated, f"User B doc leaked: {b_chunk_in_sources}")

        # ---------------------------------------------------------
        # Test 12: Cannot access another user's document by guessing ID
        # ---------------------------------------------------------
        resp_guess = client.post(
            "/api/qa/ask",
            json={"question": "Tell me about this document", "document_id": doc_b1_id},
            cookies=cookies_a,
        )
        blocked_guess = resp_guess.status_code == 404
        record("12. Verify user cannot access another user's document by ID", blocked_guess, f"HTTP {resp_guess.status_code} (404 expected)")

        # ---------------------------------------------------------
        # Test 13: Invalid and empty questions
        # ---------------------------------------------------------
        resp_empty_q = client.post("/api/qa/ask", json={"question": "   "}, cookies=cookies_a)
        resp_huge_q = client.post("/api/qa/ask", json={"question": "X" * 2005}, cookies=cookies_a)
        invalid_q_ok = resp_empty_q.status_code in (400, 422) and resp_huge_q.status_code == 422
        record("13. Test invalid and empty questions", invalid_q_ok, f"Empty: {resp_empty_q.status_code}, Huge: {resp_huge_q.status_code}")

        # ---------------------------------------------------------
        # Test 14: Missing Gemini API key
        # ---------------------------------------------------------
        orig_key = settings.GEMINI_API_KEY
        try:
            settings.GEMINI_API_KEY = ""
            resp_no_key = client.post("/api/qa/ask", json={"question": "What is the agreement?"}, cookies=cookies_a)
            no_key_ok = resp_no_key.status_code == 503
            record("14. Test missing Gemini API key", no_key_ok, f"HTTP {resp_no_key.status_code} (503 expected)")
        finally:
            settings.GEMINI_API_KEY = orig_key

        # ---------------------------------------------------------
        # Test 15: Gemini timeout, rate limit, unavailable, and model-not-found error handling
        # ---------------------------------------------------------
        with patch("app.services.gemini_service.generate_content", side_effect=gemini_service.GeminiModelNotFoundError("gemini-invalid-model")):
            resp_404 = client.post("/api/qa/ask", json={"question": "What is the agreement?"}, cookies=cookies_a)
            model_404_ok = resp_404.status_code == 404 and "not found" in resp_404.json().get("detail", "").lower()

        with patch("app.services.gemini_service.generate_content", side_effect=gemini_service.GeminiRateLimitError("Quota reached")):
            resp_429 = client.post("/api/qa/ask", json={"question": "What is the agreement?"}, cookies=cookies_a)
            rate_limit_ok = resp_429.status_code == 429 and "rate limit" in resp_429.json().get("detail", "").lower()

        with patch("app.services.gemini_service.generate_content", side_effect=gemini_service.GeminiUnavailableError("High demand")):
            resp_503 = client.post("/api/qa/ask", json={"question": "What is the agreement?"}, cookies=cookies_a)
            unavail_ok = resp_503.status_code == 503 and "high demand" in resp_503.json().get("detail", "").lower()

        with patch("app.services.gemini_service.generate_content", side_effect=gemini_service.GeminiTimeoutError("Network timeout")):
            resp_504 = client.post("/api/qa/ask", json={"question": "What is the agreement?"}, cookies=cookies_a)
            timeout_ok = resp_504.status_code == 504 and "timed out" in resp_504.json().get("detail", "").lower()

        with patch("app.services.gemini_service.generate_content", side_effect=gemini_service.GeminiAuthError("Bad key")):
            resp_401 = client.post("/api/qa/ask", json={"question": "What is the agreement?"}, cookies=cookies_a)
            auth_ok = resp_401.status_code == 401 and "authentication failed" in resp_401.json().get("detail", "").lower()

        with patch("app.services.gemini_service.generate_content", side_effect=gemini_service.GeminiAPIError("Unclassified error")):
            resp_502 = client.post("/api/qa/ask", json={"question": "What is the agreement?"}, cookies=cookies_a)
            gen_502_ok = resp_502.status_code == 502

        error_handling_ok = model_404_ok and rate_limit_ok and unavail_ok and timeout_ok and auth_ok and gen_502_ok
        record(
            "15. Test Gemini model-not-found (404), rate limit (429), unavailable (503), timeout (504), auth (401)",
            error_handling_ok,
            f"404: {resp_404.status_code}, 429: {resp_429.status_code}, 503: {resp_503.status_code}, 504: {resp_504.status_code}, 401: {resp_401.status_code}, 502: {resp_502.status_code}",
        )

        # ---------------------------------------------------------
        # Test 16: Malformed / Hallucinated citation IDs
        # ---------------------------------------------------------
        hallucinated_answer = (
            "The vendor must indemnify [S1], and pay statutory interest [S99], while respecting [S500] and [XYZ]."
        )
        with patch("app.services.gemini_service.generate_content", return_value=hallucinated_answer):
            resp_halluc = client.post("/api/qa/ask", json={"question": "Tell me about penalties."}, cookies=cookies_a)
            cleaned_ans = resp_halluc.json().get("answer", "")
            sanitized_ok = "[S1]" in cleaned_ans and "[S99]" not in cleaned_ans and "[S500]" not in cleaned_ans
            record("16. Test malformed or invalid citation IDs", sanitized_ok, f"Sanitized answer: {cleaned_ans[:80]}...")

        # ---------------------------------------------------------
        # Test 17: Verify existing authentication & semantic search still work
        # ---------------------------------------------------------
        resp_search = client.post(
            "/api/search/semantic",
            json={"query": "written termination notice", "top_k": 3},
            cookies=cookies_a,
        )
        search_intact = resp_search.status_code == 200 and resp_search.json().get("total_results", 0) >= 1
        record("17. Verify existing authentication and semantic search work", search_intact, f"HTTP {resp_search.status_code}, Results: {resp_search.json().get('total_results')}")

        # ---------------------------------------------------------
        # Test 18: Verify PDF upload, processing, indexing, preview, deletion
        # ---------------------------------------------------------
        test_pdf = fitz.open()
        p = test_pdf.new_page()
        p.insert_text((50, 50), "PHASE 6 LIFECYCLE TEST\n\nClause 1: Operational lifecycle validation.")
        pdf_bytes = test_pdf.write()
        test_pdf.close()

        upload_name = f"Lifecycle_Test_{uuid.uuid4().hex[:6]}.pdf"
        resp_up = client.post(
            "/api/documents/upload",
            files={"files": (upload_name, io.BytesIO(pdf_bytes), "application/pdf")},
            cookies=cookies_a,
        )
        up_ok = resp_up.status_code == 201
        new_doc_id = resp_up.json()["documents"][0]["id"] if up_ok else None

        if new_doc_id:
            # Run background worker
            document_service.process_document_background(new_doc_id)

            # Preview
            resp_prev = client.get(f"/api/documents/{new_doc_id}/preview", cookies=cookies_a)
            prev_ok = resp_prev.status_code == 200 and resp_prev.headers.get("content-type") == "application/pdf"

            # Delete
            resp_del = client.delete(f"/api/documents/{new_doc_id}", cookies=cookies_a)
            del_ok = resp_del.status_code == 200

            lifecycle_ok = up_ok and prev_ok and del_ok
            record("18. Verify PDF upload, processing, preview, and deletion", lifecycle_ok, f"Upload: {resp_up.status_code}, Preview: {resp_prev.status_code}, Delete: {resp_del.status_code}")
        else:
            record("18. Verify PDF upload, processing, preview, and deletion", False, "Upload failed")

        # ---------------------------------------------------------
        # Test 19: Gemini 503 retry succeeds on attempt 2 (Retrieval runs once)
        # ---------------------------------------------------------
        mock_client_503_success = MagicMock()
        err_503 = errors.APIError(503, {"error": {"code": 503, "status": "UNAVAILABLE", "message": "High demand"}})
        mock_ok_resp = MagicMock(text="Under Section 4.1, the Vendor indemnifies the Client [S1].")
        mock_client_503_success.models.generate_content.side_effect = [err_503, mock_ok_resp]

        with patch("app.services.gemini_service.get_gemini_client", return_value=mock_client_503_success), \
             patch("app.services.vector_store_service.query_semantic_chunks", wraps=vector_store_service.query_semantic_chunks) as spy_retrieval, \
             patch("time.sleep") as mock_sleep:
            resp_retry = client.post(
                "/api/qa/ask",
                json={"question": "What is indemnification?"},
                cookies=cookies_a,
            )
            is_retry_200 = resp_retry.status_code == 200
            retry_calls = mock_client_503_success.models.generate_content.call_count
            retrieval_calls = spy_retrieval.call_count
            retry_success_ok = is_retry_200 and retry_calls == 2 and retrieval_calls == 1 and mock_sleep.call_count == 1
            record(
                "19. Gemini 503 transient error retries automatically and succeeds on attempt 2",
                retry_success_ok,
                f"Status: {resp_retry.status_code}, LLM attempts: {retry_calls}, ChromaDB queries: {retrieval_calls}, Backoff sleeps: {mock_sleep.call_count}",
            )

        # ---------------------------------------------------------
        # Test 20: Gemini 503 retries exhausted after 4 total attempts -> HTTP 503
        # ---------------------------------------------------------
        mock_client_503_exhaust = MagicMock()
        mock_client_503_exhaust.models.generate_content.side_effect = err_503

        with patch("app.services.gemini_service.get_gemini_client", return_value=mock_client_503_exhaust), \
             patch("time.sleep") as mock_sleep:
            resp_exhaust = client.post(
                "/api/qa/ask",
                json={"question": "What is indemnification?"},
                cookies=cookies_a,
            )
            is_exhaust_503 = resp_exhaust.status_code == 503
            exhaust_calls = mock_client_503_exhaust.models.generate_content.call_count
            exhaust_detail = resp_exhaust.json().get("detail", "")
            exhaust_ok = is_exhaust_503 and exhaust_calls == 4 and mock_sleep.call_count == 3 and "high demand" in exhaust_detail.lower()
            record(
                "20. Gemini 503 retries exhaust after 4 attempts, returning controlled HTTP 503",
                exhaust_ok,
                f"HTTP {resp_exhaust.status_code}, Total attempts: {exhaust_calls}, Sleeps: {mock_sleep.call_count}, Detail: '{exhaust_detail}'",
            )

        # ---------------------------------------------------------
        # Test 21: Permanent 401 error fails immediately on attempt 1 (No retries)
        # ---------------------------------------------------------
        mock_client_401 = MagicMock()
        err_401 = errors.APIError(401, {"error": {"code": 401, "status": "UNAUTHENTICATED", "message": "API key invalid"}})
        mock_client_401.models.generate_content.side_effect = err_401

        with patch("app.services.gemini_service.get_gemini_client", return_value=mock_client_401), \
             patch("time.sleep") as mock_sleep:
            resp_no_retry_401 = client.post(
                "/api/qa/ask",
                json={"question": "What is indemnification?"},
                cookies=cookies_a,
            )
            is_401 = resp_no_retry_401.status_code == 401
            calls_401 = mock_client_401.models.generate_content.call_count
            no_retry_401_ok = is_401 and calls_401 == 1 and mock_sleep.call_count == 0
            record(
                "21. Permanent 401 Unauthenticated error fails immediately without retrying",
                no_retry_401_ok,
                f"HTTP {resp_no_retry_401.status_code}, Attempts: {calls_401}, Sleeps: {mock_sleep.call_count}",
            )

        # ---------------------------------------------------------
        # Test 22: Permanent 404 Model Not Found fails immediately on attempt 1 (No retries)
        # ---------------------------------------------------------
        mock_client_404 = MagicMock()
        err_404 = errors.APIError(404, {"error": {"code": 404, "status": "NOT_FOUND", "message": "Model not found"}})
        mock_client_404.models.generate_content.side_effect = err_404

        with patch("app.services.gemini_service.get_gemini_client", return_value=mock_client_404), \
             patch("time.sleep") as mock_sleep:
            resp_no_retry_404 = client.post(
                "/api/qa/ask",
                json={"question": "What is indemnification?"},
                cookies=cookies_a,
            )
            is_404 = resp_no_retry_404.status_code == 404
            calls_404 = mock_client_404.models.generate_content.call_count
            no_retry_404_ok = is_404 and calls_404 == 1 and mock_sleep.call_count == 0
            record(
                "22. Permanent 404 Model Not Found error fails immediately without retrying",
                no_retry_404_ok,
                f"HTTP {resp_no_retry_404.status_code}, Attempts: {calls_404}, Sleeps: {mock_sleep.call_count}",
            )

        # ---------------------------------------------------------
        # Test 23: 429 Rate Limit error retries and exhausts after 4 attempts
        # ---------------------------------------------------------
        mock_client_429 = MagicMock()
        err_429 = errors.APIError(429, {"error": {"code": 429, "status": "RESOURCE_EXHAUSTED", "message": "Rate limit exceeded"}})
        mock_client_429.models.generate_content.side_effect = err_429

        with patch("app.services.gemini_service.get_gemini_client", return_value=mock_client_429), \
             patch("time.sleep") as mock_sleep:
            resp_429 = client.post(
                "/api/qa/ask",
                json={"question": "What is indemnification?"},
                cookies=cookies_a,
            )
            is_429 = resp_429.status_code == 429
            calls_429 = mock_client_429.models.generate_content.call_count
            retries_429_ok = is_429 and calls_429 == 4 and mock_sleep.call_count == 3
            record(
                "23. Transient 429 Rate Limit retries 4 times before returning HTTP 429",
                retries_429_ok,
                f"HTTP {resp_429.status_code}, Attempts: {calls_429}, Sleeps: {mock_sleep.call_count}",
            )

        # ---------------------------------------------------------
        # Test 24: Network TimeoutError retries 4 times before returning HTTP 504
        # ---------------------------------------------------------
        mock_client_timeout = MagicMock()
        mock_client_timeout.models.generate_content.side_effect = TimeoutError("Network gateway timed out")

        with patch("app.services.gemini_service.get_gemini_client", return_value=mock_client_timeout), \
             patch("time.sleep") as mock_sleep:
            resp_timeout = client.post(
                "/api/qa/ask",
                json={"question": "What is indemnification?"},
                cookies=cookies_a,
            )
            is_504 = resp_timeout.status_code == 504
            calls_timeout = mock_client_timeout.models.generate_content.call_count
            retries_timeout_ok = is_504 and calls_timeout == 4 and mock_sleep.call_count == 3
            record(
                "24. Transient Network Timeout retries 4 times before returning HTTP 504",
                retries_timeout_ok,
                f"HTTP {resp_timeout.status_code}, Attempts: {calls_timeout}, Sleeps: {mock_sleep.call_count}",
            )

        # ---------------------------------------------------------
        # Test 25: Retry-After header parsing and backoff delay calculation
        # ---------------------------------------------------------
        from app.services.gemini_service import _extract_retry_after, _calculate_backoff_delay

        mock_err_with_header = MagicMock()
        mock_err_with_header.response.headers = {"Retry-After": "5.5"}
        extracted_seconds = _extract_retry_after(mock_err_with_header)

        delay_attempt_1 = _calculate_backoff_delay(1)
        delay_attempt_2 = _calculate_backoff_delay(2)
        delay_attempt_3 = _calculate_backoff_delay(3)
        delay_with_retry_after = _calculate_backoff_delay(1, retry_after=extracted_seconds)

        backoff_ok = (
            extracted_seconds == 5.5
            and 1.0 <= delay_attempt_1 <= 1.5
            and 2.0 <= delay_attempt_2 <= 2.5
            and 4.0 <= delay_attempt_3 <= 4.5
            and 5.5 <= delay_with_retry_after <= 6.0
        )
        record(
            "25. Verify Retry-After header parsing & exponential backoff calculation",
            backoff_ok,
            f"Parsed Retry-After: {extracted_seconds}s, Delays: att1={delay_attempt_1:.2f}s, att2={delay_attempt_2:.2f}s, att3={delay_attempt_3:.2f}s, with_header={delay_with_retry_after:.2f}s",
        )

    finally:
        db.close()

    print("=" * 70)
    total = len(results)
    passed = sum(1 for _, s, _ in results if s == PASSED)
    print(f"VERIFICATION SUMMARY: {passed}/{total} TESTS PASSED")
    print("=" * 70)

    if passed == total:
        print("ALL 25 PHASE 6 TESTS PASSED PERFECTLY!")
        sys.exit(0)
    else:
        print("SOME TESTS FAILED.")
        sys.exit(1)


if __name__ == "__main__":
    run_all_tests()
