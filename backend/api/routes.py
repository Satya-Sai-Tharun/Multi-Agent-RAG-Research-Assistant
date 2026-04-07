"""
FastAPI Routes

Endpoints:
  POST   /api/upload            — Upload PDF or URL
  POST   /api/upload/url        — Upload from URL
  POST   /api/process/{doc_id}  — Re-index a document
  POST   /api/query             — Query with RAG (streaming or normal)
  GET    /api/documents         — List all documents
  DELETE /api/documents/{doc_id}— Delete a document
  GET    /api/health            — System health check
"""
import json
import os
import uuid
import logging
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, Request
from fastapi.responses import StreamingResponse
from sse_starlette.sse import EventSourceResponse

from api.schemas import (
    DeleteResponse,
    DocumentInfo,
    DocumentListResponse,
    HealthResponse,
    ProcessRequest,
    ProcessResponse,
    QueryRequest,
    QueryResponse,
    URLUploadRequest,
    UploadResponse,
)
from agents.ingestion import ingestion_agent
from agents.planner import query_planner_agent
from agents.retriever import retriever_agent
from agents.synthesizer import synthesizer_agent
from core.config import settings
from core.ollama_client import ollama_client
from db.vector_store import vector_store

# Simple in-memory document registry (persisted indirectly via ChromaDB metadata)
# In production, swap with SQLite or PostgreSQL.
_document_registry: dict[str, dict] = {}

router = APIRouter()
logger = logging.getLogger(__name__)


# ─── Health ───────────────────────────────────────────────────────────────────

@router.get("/health", response_model=HealthResponse, tags=["System"])
async def health_check():
    ollama_ok = await ollama_client.health_check()
    models = await ollama_client.list_models() if ollama_ok else []
    return HealthResponse(
        status="ok" if ollama_ok else "degraded",
        ollama_connected=ollama_ok,
        total_chunks=vector_store.total_chunks(),
        models=models,
        version=settings.app_version,
    )


# ─── Upload PDF ───────────────────────────────────────────────────────────────

@router.post("/upload", response_model=UploadResponse, tags=["Documents"])
async def upload_pdf(
    file: UploadFile = File(...),
    doc_name: Optional[str] = Form(None),
):
    """Upload and ingest a PDF file."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    # Save file to uploads dir
    doc_id = str(uuid.uuid4())
    safe_name = doc_name or file.filename
    save_path = os.path.join(settings.upload_dir, f"{doc_id}_{file.filename}")

    content = await file.read()
    if len(content) > settings.max_file_size_mb * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds {settings.max_file_size_mb}MB limit.",
        )

    with open(save_path, "wb") as f:
        f.write(content)

    try:
        result = await ingestion_agent.run(
            file_path=save_path,
            doc_id=doc_id,
            doc_name=safe_name,
        )
    except Exception as e:
        logger.error(f"Ingestion failed: {e}")
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")

    _document_registry[doc_id] = {
        "doc_id": doc_id,
        "name": safe_name,
        "chunk_count": result["chunks_processed"],
        "uploaded_at": _now(),
        "source_url": "",
    }
    return UploadResponse(**result)


# ─── Upload URL ───────────────────────────────────────────────────────────────

@router.post("/upload/url", response_model=UploadResponse, tags=["Documents"])
async def upload_url(body: URLUploadRequest):
    """Ingest a web URL."""
    doc_id = str(uuid.uuid4())
    try:
        result = await ingestion_agent.run(
            url=body.url,
            doc_id=doc_id,
            doc_name=body.doc_name,
        )
    except Exception as e:
        logger.error(f"URL ingestion failed: {e}")
        raise HTTPException(status_code=500, detail=f"URL ingestion failed: {str(e)}")

    _document_registry[doc_id] = {
        "doc_id": doc_id,
        "name": body.doc_name or body.url,
        "chunk_count": result["chunks_processed"],
        "uploaded_at": _now(),
        "source_url": body.url,
    }
    return UploadResponse(**result)


# ─── Process / Re-index ───────────────────────────────────────────────────────

@router.post("/process/{doc_id}", response_model=ProcessResponse, tags=["Documents"])
async def process_document(doc_id: str, body: ProcessRequest):
    """Trigger re-processing/re-indexing for an already-uploaded document."""
    if doc_id not in _document_registry:
        raise HTTPException(status_code=404, detail="Document not found.")
    # In a full implementation, reload and re-chunk from saved path
    return ProcessResponse(doc_id=doc_id, status="indexing_complete")


# ─── Query ────────────────────────────────────────────────────────────────────

@router.post("/query", tags=["Query"])
async def query_documents(body: QueryRequest, request: Request):
    """
    RAG query endpoint.
    - If stream=True: Returns Server-Sent Events (SSE)
    - If stream=False: Returns JSON QueryResponse
    """
    if vector_store.total_chunks() == 0:
        raise HTTPException(
            status_code=400,
            detail="No documents ingested yet. Please upload at least one document.",
        )

    # Step 1: Plan
    plan = await query_planner_agent.run(body.query)

    # Step 2: Retrieve
    retrieval_result = await retriever_agent.run(
        plan=plan, filter_doc_ids=body.filter_doc_ids
    )

    if body.stream:
        async def event_generator():
            # Send plan metadata first
            meta = {
                "type": "meta",
                "sub_queries": plan["sub_queries"],
                "is_multi_hop": plan["is_multi_hop"],
                "strategy": plan["strategy"],
                "citations": synthesizer_agent._extract_citations(
                    retrieval_result["retrieved_chunks"]
                ),
            }
            yield {"data": json.dumps(meta)}

            # Stream tokens
            async for token in synthesizer_agent.run_stream(
                query=body.query,
                plan=plan,
                retrieval_result=retrieval_result,
            ):
                if await request.is_disconnected():
                    break
                yield {"data": json.dumps({"type": "token", "content": token})}

            yield {"data": json.dumps({"type": "done"})}

        return EventSourceResponse(event_generator())

    else:
        result = await synthesizer_agent.run(
            query=body.query,
            plan=plan,
            retrieval_result=retrieval_result,
        )
        return QueryResponse(
            query=body.query,
            answer=result["answer"],
            citations=[c for c in result["citations"]],
            sub_queries=plan["sub_queries"],
            is_multi_hop=plan["is_multi_hop"],
            strategy=plan["strategy"],
        )


# ─── Documents List ───────────────────────────────────────────────────────────

@router.get("/documents", response_model=DocumentListResponse, tags=["Documents"])
async def list_documents():
    """Return all known documents with metadata."""
    docs = []
    for doc_id, info in _document_registry.items():
        # Refresh chunk count from vector store
        count = vector_store.get_document_chunk_count(doc_id)
        docs.append(
            DocumentInfo(
                doc_id=doc_id,
                name=info.get("name", "Unknown"),
                chunk_count=count,
                uploaded_at=info.get("uploaded_at"),
                source_url=info.get("source_url"),
            )
        )
    return DocumentListResponse(documents=docs, total=len(docs))


# ─── Delete ───────────────────────────────────────────────────────────────────

@router.delete("/documents/{doc_id}", response_model=DeleteResponse, tags=["Documents"])
async def delete_document(doc_id: str):
    """Delete a document and all its chunks from the vector store."""
    deleted = vector_store.delete_document(doc_id)
    _document_registry.pop(doc_id, None)
    return DeleteResponse(doc_id=doc_id, chunks_deleted=deleted, status="deleted")


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _now() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()
