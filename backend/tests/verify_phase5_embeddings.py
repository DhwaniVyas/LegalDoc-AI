"""
Comprehensive Phase 5 Verification Script:
Sentence Transformers, ChromaDB, Cosine Distance, Per-User Isolation, Idempotency, and API Endpoints.
"""
import math
import os
import sys
from pathlib import Path
import uuid
import io

# Setup PYTHONPATH
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

import fitz  # PyMuPDF
from fastapi.testclient import TestClient

from main import app
from app.database import models
from app.database.session import SessionLocal
from app.core.security import create_access_token
from app.services.auth_service import hash_password
from app.services import embedding_service, vector_store_service, document_service

PASSED = "PASS"
FAILED = "FAIL"
results = []


def record(name: str, passed: bool, details: str = ""):
    status = PASSED if passed else FAILED
    results.append((name, status, details))
    print(f"[{status}] {name}" + (f" -> {details}" if details else ""))


def run_all_tests():
    print("=" * 70)
    print("STARTING PHASE 5 EMBEDDINGS & CHROMADB COMPREHENSIVE VERIFICATION")
    print("=" * 70)

    # ---------------------------------------------------------
    # Test 1: Sentence Transformers model loads and produces 384-d vectors
    # ---------------------------------------------------------
    try:
        sample_texts = [
            "This Agreement shall be terminated immediately upon written notice.",
            "The receiving party agrees to hold all confidential information in strict trust.",
        ]
        embeddings = embedding_service.generate_embeddings(sample_texts)
        is_384 = len(embeddings) == 2 and len(embeddings[0]) == 384 and len(embeddings[1]) == 384
        record("1. Sentence Transformers model loads & generates 384-d vectors", is_384, f"Shape: {len(embeddings)}x{len(embeddings[0])}")
    except Exception as e:
        record("1. Sentence Transformers model loads & generates 384-d vectors", False, str(e))

    # ---------------------------------------------------------
    # Test 2: Embedding vector normalization (unit length)
    # ---------------------------------------------------------
    try:
        norm0 = math.sqrt(sum(x * x for x in embeddings[0]))
        norm1 = math.sqrt(sum(x * x for x in embeddings[1]))
        is_normalized = abs(norm0 - 1.0) < 1e-4 and abs(norm1 - 1.0) < 1e-4
        record("2. Embedding vectors normalized to unit length", is_normalized, f"Norms: {norm0:.5f}, {norm1:.5f}")
    except Exception as e:
        record("2. Embedding vectors normalized to unit length", False, str(e))

    # ---------------------------------------------------------
    # Test 3: ChromaDB initializes and persists to backend/vector_store/
    # ---------------------------------------------------------
    try:
        client = vector_store_service.get_chroma_client()
        collection = vector_store_service.get_collection(client)
        store_exists = vector_store_service.VECTOR_STORE_DIR.exists()
        space = collection.metadata.get("hnsw:space")
        record("3. ChromaDB initializes and persists to backend/vector_store/", store_exists and space == "cosine", f"Path: {vector_store_service.VECTOR_STORE_DIR}, Metric: {space}")
    except Exception as e:
        record("3. ChromaDB initializes and persists to backend/vector_store/", False, str(e))

    # ---------------------------------------------------------
    # Setup Test Users and Documents in DB
    # ---------------------------------------------------------
    db = SessionLocal()
    try:
        user_a = db.query(models.User).filter(models.User.email == "test_user_a_p5@example.com").first()
        if not user_a:
            user_a = models.User(
                email="test_user_a_p5@example.com",
                full_name="User A Phase5",
                hashed_password=hash_password("SecretPassword123!"),
                is_active=True,
            )
            db.add(user_a)

        user_b = db.query(models.User).filter(models.User.email == "test_user_b_p5@example.com").first()
        if not user_b:
            user_b = models.User(
                email="test_user_b_p5@example.com",
                full_name="User B Phase5",
                hashed_password=hash_password("SecretPassword123!"),
                is_active=True,
            )
            db.add(user_b)

        db.commit()
        db.refresh(user_a)
        db.refresh(user_b)

        user_a_id = user_a.id
        user_b_id = user_b.id

        # Clean previous test vectors
        vector_store_service.delete_user_vectors(user_a_id)
        vector_store_service.delete_user_vectors(user_b_id)

        # ---------------------------------------------------------
        # Test 4: Storing embeddings with accurate chunk metadata
        # ---------------------------------------------------------
        doc_a1_id = str(uuid.uuid4())
        chunk_a1_id = str(uuid.uuid4())
        chunk_a2_id = str(uuid.uuid4())

        chunks_a = [
            {
                "id": chunk_a1_id,
                "page_id": str(uuid.uuid4()),
                "page_number": 1,
                "chunk_index": 0,
                "content": "The Vendor shall indemnify, defend, and hold harmless the Client against all claims, liabilities, and damages.",
            },
            {
                "id": chunk_a2_id,
                "page_id": str(uuid.uuid4()),
                "page_number": 2,
                "chunk_index": 1,
                "content": "All notices required under this Agreement shall be given in writing via registered post or courier.",
            },
        ]
        embs_a = embedding_service.generate_embeddings([c["content"] for c in chunks_a])
        count = vector_store_service.upsert_document_chunks(
            user_id=user_a_id,
            document_id=doc_a1_id,
            original_filename="Master_Services_Agreement.pdf",
            chunks=chunks_a,
            embeddings=embs_a,
        )

        # Verify stored items in collection
        coll = vector_store_service.get_collection()
        fetched = coll.get(ids=[chunk_a1_id], include=["metadatas", "documents"])
        meta_valid = (
            len(fetched["ids"]) == 1
            and fetched["metadatas"][0]["user_id"] == user_a_id
            and fetched["metadatas"][0]["document_id"] == doc_a1_id
            and fetched["metadatas"][0]["page_number"] == 1
            and fetched["metadatas"][0]["original_filename"] == "Master_Services_Agreement.pdf"
        )
        record("4. Storing embeddings with accurate chunk metadata", count == 2 and meta_valid, f"Metadata verified for chunk {chunk_a1_id}")

        # ---------------------------------------------------------
        # Test 5: ChromaDB persistence across client re-initialization
        # ---------------------------------------------------------
        import chromadb
        fresh_client = chromadb.PersistentClient(path=str(vector_store_service.VECTOR_STORE_DIR))
        fresh_coll = fresh_client.get_collection(name=vector_store_service.COLLECTION_NAME)
        persisted = fresh_coll.get(ids=[chunk_a1_id, chunk_a2_id])
        is_persisted = len(persisted["ids"]) == 2
        record("5. ChromaDB persistence across client re-initialization", is_persisted, f"Retrieved {len(persisted['ids'])} vectors from fresh client")

        # ---------------------------------------------------------
        # Test 6 & 7: Semantic search query embedding & cosine distance ranking
        # ---------------------------------------------------------
        query_text = "indemnification and hold harmless obligations"
        q_emb = embedding_service.generate_query_embedding(query_text)
        is_q_emb_valid = len(q_emb) == 384

        search_res = vector_store_service.query_semantic_chunks(
            user_id=user_a_id,
            query_embedding=q_emb,
            top_k=5,
        )

        ranked_correctly = (
            len(search_res) >= 2
            and search_res[0]["chunk_id"] == chunk_a1_id
            and search_res[0]["distance"] < search_res[1]["distance"]
        )
        record("6. Semantic search query embedding generation", is_q_emb_valid, f"Vector dimension: {len(q_emb)}")
        record("7. Semantic search retrieval with cosine distance ranking", ranked_correctly, f"Top result: {search_res[0]['chunk_id']}, Dist: {search_res[0]['distance']:.4f} < {search_res[1]['distance']:.4f}")

        # ---------------------------------------------------------
        # Test 8: Semantic search accuracy (paraphrased vs unrelated)
        # ---------------------------------------------------------
        paraphrase_query = "who protects the customer against legal claims and liability?"
        pq_emb = embedding_service.generate_query_embedding(paraphrase_query)
        p_res = vector_store_service.query_semantic_chunks(
            user_id=user_a_id,
            query_embedding=pq_emb,
            top_k=2,
        )
        accuracy_passed = len(p_res) > 0 and p_res[0]["chunk_id"] == chunk_a1_id
        record("8. Semantic search accuracy with paraphrased query", accuracy_passed, f"Top match: '{p_res[0]['content'][:60]}...' (Dist: {p_res[0]['distance']:.4f})")

        # ---------------------------------------------------------
        # Setup Second Document for User A and Document for User B
        # ---------------------------------------------------------
        doc_a2_id = str(uuid.uuid4())
        chunk_a3_id = str(uuid.uuid4())
        chunks_a2 = [
            {
                "id": chunk_a3_id,
                "page_id": str(uuid.uuid4()),
                "page_number": 1,
                "chunk_index": 0,
                "content": "Payment of invoices shall be due net 30 days from invoice date. Late payments incur 1.5% monthly interest.",
            }
        ]
        vector_store_service.upsert_document_chunks(
            user_id=user_a_id,
            document_id=doc_a2_id,
            original_filename="Fee_Schedule.pdf",
            chunks=chunks_a2,
            embeddings=embedding_service.generate_embeddings([c["content"] for c in chunks_a2]),
        )

        # User B document
        doc_b1_id = str(uuid.uuid4())
        chunk_b1_id = str(uuid.uuid4())
        chunks_b = [
            {
                "id": chunk_b1_id,
                "page_id": str(uuid.uuid4()),
                "page_number": 1,
                "chunk_index": 0,
                "content": "Secret Confidential patent application of User B regarding quantum cryptography algorithms.",
            }
        ]
        vector_store_service.upsert_document_chunks(
            user_id=user_b_id,
            document_id=doc_b1_id,
            original_filename="Patent_Confidential_B.pdf",
            chunks=chunks_b,
            embeddings=embedding_service.generate_embeddings([c["content"] for c in chunks_b]),
        )

        # ---------------------------------------------------------
        # Test 9: Filtered semantic search scoped to a specific document
        # ---------------------------------------------------------
        filtered_res = vector_store_service.query_semantic_chunks(
            user_id=user_a_id,
            query_embedding=q_emb,
            top_k=5,
            document_id=doc_a2_id,
        )
        only_doc_a2 = len(filtered_res) == 1 and filtered_res[0]["document_id"] == doc_a2_id
        record("9. Filtered semantic search scoped to a specific document", only_doc_a2, f"Returned {len(filtered_res)} chunk strictly from doc_a2")

        # ---------------------------------------------------------
        # Test 10: Strict per-user isolation (User A cannot get User B's chunks)
        # ---------------------------------------------------------
        b_query_emb = embedding_service.generate_query_embedding("quantum cryptography algorithms patent")
        user_a_b_search = vector_store_service.query_semantic_chunks(
            user_id=user_a_id,
            query_embedding=b_query_emb,
            top_k=10,
        )
        leaked_to_a = any(r["chunk_id"] == chunk_b1_id or r["document_id"] == doc_b1_id for r in user_a_b_search)
        record("10. Strict per-user isolation: User A CANNOT retrieve User B's chunks", not leaked_to_a, f"Zero User B chunks returned in User A search (found {len(user_a_b_search)})")

        # ---------------------------------------------------------
        # Test 11: Strict per-user isolation (User B cannot get User A's chunks)
        # ---------------------------------------------------------
        user_b_a_search = vector_store_service.query_semantic_chunks(
            user_id=user_b_id,
            query_embedding=q_emb,
            top_k=10,
        )
        leaked_to_b = any(r["document_id"] in (doc_a1_id, doc_a2_id) for r in user_b_a_search)
        record("11. Strict per-user isolation: User B CANNOT retrieve User A's chunks", not leaked_to_b, f"Zero User A chunks returned in User B search (found {len(user_b_a_search)})")

        # ---------------------------------------------------------
        # Test 12: Reprocessing idempotency (updates vectors without duplicates)
        # ---------------------------------------------------------
        coll_before = fresh_coll.get(where={"document_id": doc_a1_id})
        count_before = len(coll_before["ids"])
        # Re-upsert doc_a1 chunks
        vector_store_service.delete_document_vectors(doc_a1_id, user_id=user_a_id)
        vector_store_service.upsert_document_chunks(
            user_id=user_a_id,
            document_id=doc_a1_id,
            original_filename="Master_Services_Agreement.pdf",
            chunks=chunks_a,
            embeddings=embs_a,
        )
        coll_after = fresh_coll.get(where={"document_id": doc_a1_id})
        count_after = len(coll_after["ids"])
        idempotent = count_before == 2 and count_after == 2
        record("12. Reprocessing idempotency (no vector duplicates)", idempotent, f"Before: {count_before}, After: {count_after}")

        # ---------------------------------------------------------
        # Test 13: Deleting a document completely removes all vectors
        # ---------------------------------------------------------
        vector_store_service.delete_document_vectors(doc_a2_id, user_id=user_a_id)
        coll_deleted = fresh_coll.get(where={"document_id": doc_a2_id})
        count_deleted = len(coll_deleted["ids"])
        record("13. Deleting document completely removes all its vectors from ChromaDB", count_deleted == 0, f"Remaining vectors for doc_a2: {count_deleted}")

        # ---------------------------------------------------------
        # FastAPI TestClient Setup
        # ---------------------------------------------------------
        client = TestClient(app)
        token_a = create_access_token(subject=str(user_a_id))
        token_b = create_access_token(subject=str(user_b_id))
        cookies_a = {"access_token": token_a}
        cookies_b = {"access_token": token_b}

        # ---------------------------------------------------------
        # Test 14: POST /api/search/semantic with valid and invalid inputs
        # ---------------------------------------------------------
        # Valid search
        resp_valid = client.post(
            "/api/search/semantic",
            json={"query": "written notice of termination", "top_k": 3},
            cookies=cookies_a,
        )
        valid_ok = resp_valid.status_code == 200 and resp_valid.json()["total_results"] >= 1

        # Empty query (invalid)
        resp_empty = client.post(
            "/api/search/semantic",
            json={"query": "   ", "top_k": 3},
            cookies=cookies_a,
        )
        empty_rejected = resp_empty.status_code in (400, 422)

        # Invalid top_k (e.g. 0 or 100)
        resp_bad_k = client.post(
            "/api/search/semantic",
            json={"query": "notice", "top_k": 0},
            cookies=cookies_a,
        )
        bad_k_rejected = resp_bad_k.status_code == 422

        # User A querying User B's document_id
        resp_cross_doc = client.post(
            "/api/search/semantic",
            json={"query": "quantum", "document_id": doc_b1_id},
            cookies=cookies_a,
        )
        cross_doc_blocked = resp_cross_doc.status_code == 404

        record(
            "14. POST /api/search/semantic endpoint validation",
            valid_ok and empty_rejected and bad_k_rejected and cross_doc_blocked,
            f"Valid: {resp_valid.status_code}, Empty: {resp_empty.status_code}, BadK: {resp_bad_k.status_code}, CrossDoc: {resp_cross_doc.status_code}",
        )

        # ---------------------------------------------------------
        # Test 15 & 16: Document Upload, Automatic Chunking & Embedding Pipeline
        # ---------------------------------------------------------
        # Create a sample in-memory PDF using PyMuPDF
        pdf_doc = fitz.open()
        p1 = pdf_doc.new_page()
        p1.insert_text((50, 50), "LEGAL SERVICES AGREEMENT\n\nClause 1: Scope of Legal Research Services.\nThe Consultant will provide automated legal intelligence and statutory analysis.")
        p2 = pdf_doc.new_page()
        p2.insert_text((50, 50), "Clause 2: Force Majeure & Excusable Delay.\nNeither party will be held liable for failure to perform duties due to acts of God or strikes.")
        pdf_bytes = pdf_doc.write()
        pdf_doc.close()

        upload_filename = f"Contract_Test_Phase5_{uuid.uuid4().hex[:6]}.pdf"
        resp_upload = client.post(
            "/api/documents/upload",
            files={"files": (upload_filename, io.BytesIO(pdf_bytes), "application/pdf")},
            cookies=cookies_a,
        )
        upload_ok = resp_upload.status_code == 201
        uploaded_doc_data = resp_upload.json()["documents"][0] if upload_ok else None
        up_doc_id = uploaded_doc_data["id"] if uploaded_doc_data else None

        # Manually invoke background processor to simulate worker completion synchronously
        if up_doc_id:
            document_service.process_document_background(up_doc_id)

            # Check DB state
            doc_rec = db.query(models.Document).filter(models.Document.id == up_doc_id).first()
            auto_embedded = (
                doc_rec is not None
                and doc_rec.processing_status == "completed"
                and doc_rec.embedding_status == "completed"
                and doc_rec.embedded_chunks > 0
                and doc_rec.embedded_at is not None
            )
            record("16. Automatic embedding during document upload & processing pipeline", auto_embedded, f"Status: {doc_rec.embedding_status}, Chunks: {doc_rec.embedded_chunks}")

            # Test 15: POST /api/documents/{id}/embed endpoint
            resp_embed = client.post(f"/api/documents/{up_doc_id}/embed", cookies=cookies_a)
            embed_api_ok = resp_embed.status_code == 200
            # Run background embed task
            document_service.embed_document_background(up_doc_id)
            db.refresh(doc_rec)
            re_embedded = doc_rec.embedding_status == "completed"
            record("15. POST /api/documents/{id}/embed indexing endpoint", embed_api_ok and re_embedded, f"HTTP {resp_embed.status_code}, Status: {doc_rec.embedding_status}")

            # Also perform semantic search via API for Force Majeure clause on the newly uploaded doc
            resp_search_new = client.post(
                "/api/search/semantic",
                json={"query": "acts of God and unexpected strikes delay liability", "document_id": up_doc_id},
                cookies=cookies_a,
            )
            found_new = (
                resp_search_new.status_code == 200
                and resp_search_new.json()["total_results"] > 0
                and "Force Majeure" in resp_search_new.json()["results"][0]["content"]
            )
            print(f"[*] Live search on uploaded document result: HTTP {resp_search_new.status_code}, Match: {found_new}")
        else:
            record("16. Automatic embedding during document upload pipeline", False, "Upload failed")
            record("15. POST /api/documents/{id}/embed indexing endpoint", False, "Skipped")

    finally:
        db.close()

    print("=" * 70)
    total_tests = len(results)
    passed_tests = sum(1 for _, status, _ in results if status == PASSED)
    print(f"VERIFICATION SUMMARY: {passed_tests}/{total_tests} TESTS PASSED")
    print("=" * 70)

    if passed_tests == total_tests:
        print("ALL PHASE 5 VERIFICATION CHECKS PASSED PERFECTLY!")
        sys.exit(0)
    else:
        print("SOME VERIFICATION CHECKS FAILED.")
        sys.exit(1)


if __name__ == "__main__":
    run_all_tests()
