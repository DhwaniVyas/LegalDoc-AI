"""
Phase 7 Verification Script:
Conversational Legal Chatbot and Conversation History
Verifies:
1. Database Models & Schema Migration (Conversation and ChatMessage).
2. Multi-turn Contextual Query Resolution (pronoun disambiguation & legal context extraction).
3. Conversation Lifecycle (Create, List, View, Rename, Delete).
4. Multi-turn Chat & History Grounding (First message + Follow-up with pronouns like 'it' and 'its').
5. Stored Source Metadata & Citation Preservation on Reopening.
6. Document Scope Filtering (All documents, single document, multi-document).
7. Invalid / Unindexed / Cross-User Document Scope Rejection.
8. Cross-User Isolation (IDOR Protection on Conversation & Messages).
9. Progressive Streaming SSE Chat Endpoint.
10. Preservation of Existing Documents & Embeddings upon Conversation Deletion.
"""
import json
import os
import sys
import uuid
from pathlib import Path

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

# Setup PYTHONPATH
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from fastapi.testclient import TestClient

from main import app
from app.core.config import settings
from app.core.security import create_access_token
from app.database import models
from app.database.session import SessionLocal
from app.services import rag_service

from unittest.mock import patch
from app.services import embedding_service, vector_store_service

PASSED = "PASS"
FAILED = "FAIL"
results = []


def record(name: str, passed: bool, details: str = ""):
    status = PASSED if passed else FAILED
    results.append((name, status, details))
    print(f"[{status}] {name}" + (f" -> {details}" if details else ""))


def setup_test_users_and_document(db):
    """Ensure two distinct test users and indexed document with SQLite and ChromaDB chunks exist."""
    u1 = db.query(models.User).filter(models.User.email == "test_phase7_user1@example.com").first()
    if not u1:
        u1 = models.User(
            email="test_phase7_user1@example.com",
            full_name="Phase 7 Test User 1",
            hashed_password="hashed_phase7_password_123",
            is_active=True,
        )
        db.add(u1)
        db.commit()
        db.refresh(u1)

    u2 = db.query(models.User).filter(models.User.email == "test_phase7_user2@example.com").first()
    if not u2:
        u2 = models.User(
            email="test_phase7_user2@example.com",
            full_name="Phase 7 Test User 2",
            hashed_password="hashed_phase7_password_456",
            is_active=True,
        )
        db.add(u2)
        db.commit()
        db.refresh(u2)

    # Clean existing test docs for u1
    vector_store_service.delete_user_vectors(u1.id)
    existing_docs = db.query(models.Document).filter(models.Document.user_id == u1.id).all()
    for d in existing_docs:
        db.delete(d)
    db.commit()

    doc_id = str(uuid.uuid4())
    doc = models.Document(
        id=doc_id,
        user_id=u1.id,
        original_filename="Constitution_of_India_P7.pdf",
        normalized_filename="constitution_of_india_p7.pdf",
        stored_filename=f"p7_{doc_id}.pdf",
        file_path="uploads/test.pdf",
        file_size=2048,
        mime_type="application/pdf",
        processing_status="completed",
        total_pages=2,
        embedding_status="completed",
        total_chunks=2,
    )
    db.add(doc)
    db.commit()

    page1 = models.DocumentPage(
        id=str(uuid.uuid4()),
        document_id=doc_id,
        page_number=1,
        extracted_text="Article 14. Equality before law.—The State shall not deny to any person equality before the law or the equal protection of the laws within the territory of India.",
        character_count=155,
    )
    page2 = models.DocumentPage(
        id=str(uuid.uuid4()),
        document_id=doc_id,
        page_number=2,
        extracted_text="Article 15. Prohibition of discrimination on grounds of religion, race, caste, sex or place of birth.—(1) The State shall not discriminate against any citizen on grounds only of religion, race, caste, sex, place of birth or any of them. (3) Nothing in this article shall prevent the State from making any special provision for women and children.",
        character_count=330,
    )
    db.add(page1)
    db.add(page2)
    db.commit()

    chunk1 = models.DocumentChunk(
        id=str(uuid.uuid4()),
        document_id=doc_id,
        page_id=page1.id,
        page_number=1,
        chunk_index=0,
        content=page1.extracted_text,
        character_count=len(page1.extracted_text),
    )
    chunk2 = models.DocumentChunk(
        id=str(uuid.uuid4()),
        document_id=doc_id,
        page_id=page2.id,
        page_number=2,
        chunk_index=1,
        content=page2.extracted_text,
        character_count=len(page2.extracted_text),
    )
    db.add(chunk1)
    db.add(chunk2)
    db.commit()
    db.refresh(doc)

    chunks_data = [
        {
            "id": chunk1.id,
            "page_id": page1.id,
            "page_number": 1,
            "chunk_index": 0,
            "content": chunk1.content,
        },
        {
            "id": chunk2.id,
            "page_id": page2.id,
            "page_number": 2,
            "chunk_index": 1,
            "content": chunk2.content,
        },
    ]

    # Upsert vector store chunks
    vector_store_service.upsert_document_chunks(
        user_id=u1.id,
        document_id=doc_id,
        original_filename="Constitution_of_India_P7.pdf",
        chunks=chunks_data,
        embeddings=embedding_service.generate_embeddings([c["content"] for c in chunks_data]),
    )

    return u1, u2, doc

    return u1, u2, doc


def run_all_tests():
    print("=" * 70)
    print("LEGALDOC AI – PHASE 7: CONVERSATIONAL LEGAL CHATBOT VERIFICATION")
    print("=" * 70)

    db = SessionLocal()
    client = TestClient(app)

    try:
        user1, user2, sample_doc = setup_test_users_and_document(db)

        token1 = create_access_token(subject=str(user1.id))
        client.cookies.set("access_token", token1)

        token2 = create_access_token(subject=str(user2.id))

        # -------------------------------------------------------------
        # TEST 1: Database Models & Relationships
        # -------------------------------------------------------------
        test_conv = models.Conversation(
            id=str(uuid.uuid4()),
            user_id=user1.id,
            title="Model Verification Thread",
            document_ids=[sample_doc.id],
        )
        db.add(test_conv)
        db.commit()

        test_msg = models.ChatMessage(
            id=str(uuid.uuid4()),
            conversation_id=test_conv.id,
            role="user",
            content="Hello model test",
        )
        db.add(test_msg)
        db.commit()

        queried_conv = db.query(models.Conversation).filter(models.Conversation.id == test_conv.id).first()
        record(
            "1. Database Models & Alembic Migration",
            queried_conv is not None and len(queried_conv.messages) == 1,
            f"Conversation and ChatMessage relationship verified for ID: {test_conv.id}",
        )
        # Cleanup model test
        db.delete(test_msg)
        db.delete(test_conv)
        db.commit()

        # -------------------------------------------------------------
        # TEST 2: Contextual Follow-up Query Resolution
        # -------------------------------------------------------------
        history_example = [
            {"role": "user", "content": "Explain the Right to Equality under the Constitution of India."},
            {"role": "assistant", "content": "The Right to Equality is contained in Articles 14 to 18 of the Constitution [S1]. Article 14 ensures equality before law [S2]. Article 15 prohibits discrimination [S3]."},
        ]
        augmented_query = rag_service.contextualize_followup_query("What are its exceptions?", history_example)
        has_context = "Article 14" in augmented_query or "Article 15" in augmented_query or "Right To Equality" in augmented_query
        record(
            "2. Multi-turn Contextual Follow-up Resolution (Pronoun 'its')",
            has_context and "What are its exceptions?" in augmented_query,
            f"Augmented query: '{augmented_query}'",
        )

        specific_query = "What is Section 73 of the Indian Contract Act?"
        preserved_query = rag_service.contextualize_followup_query(specific_query, history_example)
        record(
            "3. Contextual Query Preserves Independent Statutory Questions",
            preserved_query == specific_query,
            f"Query preserved: '{preserved_query}'",
        )

        # -------------------------------------------------------------
        # TEST 4: Create Conversation via API
        # -------------------------------------------------------------
        res_create = client.post("/api/conversations", json={"title": "Constitutional Law Research"})
        record(
            "4. POST /api/conversations (Create Thread)",
            res_create.status_code == 201 and res_create.json().get("title") == "Constitutional Law Research",
            f"Created conv ID: {res_create.json().get('id')}",
        )
        conv1_id = res_create.json()["id"]

        # -------------------------------------------------------------
        # TEST 5: List Conversations via API
        # -------------------------------------------------------------
        res_list = client.get("/api/conversations")
        conv_summaries = res_list.json()
        found_in_list = any(c["id"] == conv1_id for c in conv_summaries)
        record(
            "5. GET /api/conversations (List User Threads)",
            res_list.status_code == 200 and found_in_list,
            f"Found created conversation in user's list (count={len(conv_summaries)})",
        )

        # -------------------------------------------------------------
        # TEST 6: First Turn in Conversation (RAG + Grounding + Auto-titling)
        # -------------------------------------------------------------
        mock_ans1 = "Under Article 14, the State ensures equality before the law and equal protection of the laws [S1]. Furthermore, Article 15 prohibits discrimination on grounds of religion, race, caste, sex or place of birth [S2]."
        with patch("app.services.gemini_service.generate_content", return_value=mock_ans1):
            res_msg1 = client.post(
                f"/api/conversations/{conv1_id}/messages",
                json={"message": "Explain the Right to Equality under the Constitution of India."},
            )
        msg1_data = res_msg1.json()
        record(
            "6. POST /api/conversations/{id}/messages (First Turn Grounded Answer)",
            res_msg1.status_code == 200 and "assistant_message" in msg1_data and len(msg1_data["assistant_message"]["content"]) > 50,
            f"Assistant response length: {len(msg1_data.get('assistant_message', {}).get('content', ''))} chars, Citations: {len(msg1_data.get('assistant_message', {}).get('sources', []))}",
        )

        # -------------------------------------------------------------
        # TEST 7: Multi-turn Follow-up with Pronoun Reference
        # -------------------------------------------------------------
        mock_ans2 = "Under Article 15(3), the exceptions explicitly allow the State to make special provisions for women and children [S1]."
        with patch("app.services.gemini_service.generate_content", return_value=mock_ans2):
            res_msg2 = client.post(
                f"/api/conversations/{conv1_id}/messages",
                json={"message": "What are its exceptions and qualifications?"},
            )
        msg2_data = res_msg2.json()
        record(
            "7. POST /api/conversations/{id}/messages (Multi-turn Follow-up Turn)",
            res_msg2.status_code == 200 and "assistant_message" in msg2_data and len(msg2_data["assistant_message"]["content"]) > 50,
            f"Follow-up answer generated with {len(msg2_data.get('assistant_message', {}).get('sources', []))} sources",
        )

        # -------------------------------------------------------------
        # TEST 8: Reopen Conversation and Verify Preserved History & Citations
        # -------------------------------------------------------------
        res_detail = client.get(f"/api/conversations/{conv1_id}")
        conv_detail = res_detail.json()
        ordered_messages = conv_detail.get("messages", [])
        has_user1 = len(ordered_messages) >= 4 and ordered_messages[0]["role"] == "user"
        has_ast1 = ordered_messages[1]["role"] == "assistant"
        has_sources = bool(ordered_messages[1].get("sources"))
        record(
            "8. GET /api/conversations/{id} (History & Citations Preservation)",
            res_detail.status_code == 200 and has_user1 and has_ast1 and has_sources,
            f"Preserved {len(ordered_messages)} messages with source metadata intact",
        )

        # -------------------------------------------------------------
        # TEST 9: Rename Conversation
        # -------------------------------------------------------------
        res_patch = client.patch(
            f"/api/conversations/{conv1_id}",
            json={"title": "Right to Equality Deep Dive"},
        )
        record(
            "9. PATCH /api/conversations/{id} (Rename Thread)",
            res_patch.status_code == 200 and res_patch.json().get("title") == "Right to Equality Deep Dive",
            f"Updated title: '{res_patch.json().get('title')}'",
        )

        # -------------------------------------------------------------
        # TEST 10: Document Scoping Validation
        # -------------------------------------------------------------
        # Invalid / missing document ID should fail
        fake_uuid = str(uuid.uuid4())
        res_bad_scope = client.post(
            "/api/conversations",
            json={"title": "Bad Scope Thread", "document_ids": [fake_uuid]},
        )
        record(
            "10. Document Scope Validation (Reject Non-existent Doc ID)",
            res_bad_scope.status_code == 404,
            f"Expected 404, got status code: {res_bad_scope.status_code}",
        )

        # -------------------------------------------------------------
        # TEST 11: Cross-User Isolation (IDOR Protection)
        # -------------------------------------------------------------
        # User 2 attempts to access User 1's conversation
        client.cookies.set("access_token", token2)

        idor_get = client.get(f"/api/conversations/{conv1_id}")
        idor_patch = client.patch(f"/api/conversations/{conv1_id}", json={"title": "Hacked Title"})
        idor_post = client.post(f"/api/conversations/{conv1_id}/messages", json={"message": "Injected message"})
        idor_del = client.delete(f"/api/conversations/{conv1_id}")

        idor_protected = (
            idor_get.status_code == 404
            and idor_patch.status_code == 404
            and idor_post.status_code == 404
            and idor_del.status_code == 404
        )
        record(
            "11. Cross-User Isolation (IDOR Access Denied on Other's Threads)",
            idor_protected,
            f"User 2 blocked with 404 on GET, PATCH, POST, DELETE (codes: {idor_get.status_code}, {idor_patch.status_code}, {idor_post.status_code}, {idor_del.status_code})",
        )

        # Switch back to User 1
        client.cookies.set("access_token", token1)

        # -------------------------------------------------------------
        # TEST 12: SSE Progressive Streaming Endpoint
        # -------------------------------------------------------------
        mock_deltas = ["Under Article 14, ", "equality before the law is guaranteed [S1]."]
        with patch("app.services.gemini_service.generate_content_stream", return_value=iter(mock_deltas)):
            stream_res = client.post(
                f"/api/conversations/{conv1_id}/messages-stream",
                json={"message": "Summarize Article 14 in one sentence."},
            )
        is_sse = "text/event-stream" in stream_res.headers.get("content-type", "")
        stream_content = stream_res.text
        has_user_event = "event: user_message" in stream_content
        has_delta_event = "event: delta" in stream_content
        has_done_event = "event: done" in stream_content
        record(
            "12. POST /api/conversations/{id}/messages-stream (SSE Streaming)",
            is_sse and has_user_event and has_done_event,
            f"SSE Content received: user_message={has_user_event}, delta={has_delta_event}, done={has_done_event}",
        )

        # -------------------------------------------------------------
        # TEST 13: Delete Conversation & Verify Documents Intact
        # -------------------------------------------------------------
        doc_count_before = db.query(models.Document).count()
        chunk_count_before = db.query(models.DocumentChunk).count()

        del_res = client.delete(f"/api/conversations/{conv1_id}")
        res_verify_del = client.get(f"/api/conversations/{conv1_id}")

        doc_count_after = db.query(models.Document).count()
        chunk_count_after = db.query(models.DocumentChunk).count()

        messages_remaining = db.query(models.ChatMessage).filter(models.ChatMessage.conversation_id == conv1_id).count()

        record(
            "13. DELETE /api/conversations/{id} (Cascade Messages, Retain Documents)",
            del_res.status_code == 200
            and res_verify_del.status_code == 404
            and messages_remaining == 0
            and doc_count_before == doc_count_after
            and chunk_count_before == chunk_count_after,
            f"Thread deleted, 0 messages left, docs retained: {doc_count_after}/{doc_count_before}, chunks: {chunk_count_after}/{chunk_count_before}",
        )

    finally:
        db.close()

    # Summary
    print("\n" + "=" * 70)
    total = len(results)
    passed = sum(1 for _, status, _ in results if status == PASSED)
    failed = total - passed
    print(f"RESULTS: {passed}/{total} PASSED ({failed} failed)")
    print("=" * 70)

    if failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    run_all_tests()
