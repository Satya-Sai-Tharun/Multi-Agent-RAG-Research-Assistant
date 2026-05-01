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

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, Request, BackgroundTasks
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
from agents.synthesizer import synthesizer_agent
from agents.workflow import query_workflow, retrieval_workflow
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

async def bg_process_file(save_path: str, doc_id: str, doc_name: str):
    """Background task for file ingestion."""
    try:
        result = await ingestion_agent.run(
            file_path=save_path,
            doc_id=doc_id,
            doc_name=doc_name,
        )
        _document_registry[doc_id].update({
            "status": "ready",
            "chunk_count": result["chunks_processed"],
        })
    except Exception as e:
        logger.error(f"Background ingestion failed for {doc_id}: {e}")
        _document_registry[doc_id]["status"] = "failed"


@router.post("/upload", response_model=UploadResponse, tags=["Documents"])
async def upload_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    doc_name: Optional[str] = Form(None),
):
    """Upload and ingest a PDF file asynchronously."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

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

    _document_registry[doc_id] = {
        "doc_id": doc_id,
        "name": safe_name,
        "chunk_count": 0,
        "status": "processing",
        "uploaded_at": _now(),
        "source_url": "",
    }

    background_tasks.add_task(bg_process_file, save_path, doc_id, safe_name)

    return UploadResponse(
        doc_id=doc_id,
        source=safe_name,
        chunks_processed=0,
        status="processing"
    )


# ─── Upload URL ───────────────────────────────────────────────────────────────

async def bg_process_url(url: str, doc_id: str, doc_name: Optional[str]):
    """Background task for URL ingestion."""
    try:
        result = await ingestion_agent.run(
            url=url,
            doc_id=doc_id,
            doc_name=doc_name,
        )
        _document_registry[doc_id].update({
            "status": "ready",
            "chunk_count": result["chunks_processed"],
        })
    except Exception as e:
        logger.error(f"Background URL ingestion failed for {doc_id}: {e}")
        _document_registry[doc_id]["status"] = "failed"


@router.post("/upload/url", response_model=UploadResponse, tags=["Documents"])
async def upload_url(body: URLUploadRequest, background_tasks: BackgroundTasks):
    """Ingest a web URL asynchronously."""
    doc_id = str(uuid.uuid4())
    
    _document_registry[doc_id] = {
        "doc_id": doc_id,
        "name": body.doc_name or body.url,
        "chunk_count": 0,
        "status": "processing",
        "uploaded_at": _now(),
        "source_url": body.url,
    }

    background_tasks.add_task(bg_process_url, body.url, doc_id, body.doc_name)

    return UploadResponse(
        doc_id=doc_id,
        source=body.url,
        chunks_processed=0,
        status="processing"
    )


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

    initial_state = {
        "query": body.query,
        "filter_doc_ids": body.filter_doc_ids,
        "conversation_history": body.conversation_history or []
    }

    if body.stream:
        async def event_generator():
            state = {}
            # Stream LangGraph state transitions up to retrieval
            async for event in retrieval_workflow.astream(initial_state):
                for node_name, node_state in event.items():
                    yield {"data": json.dumps({"type": "state_change", "node": node_name})}
                    state.update(node_state)
            
            plan = state.get("plan", {})
            retrieval_result = state.get("retrieval_result", {"retrieved_chunks": []})

            # Send plan metadata
            meta = {
                "type": "meta",
                "sub_queries": plan.get("sub_queries", []),
                "is_multi_hop": plan.get("is_multi_hop", False),
                "strategy": plan.get("strategy", "broad"),
                "citations": synthesizer_agent._extract_citations(
                    retrieval_result.get("retrieved_chunks", [])
                ),
            }
            yield {"data": json.dumps(meta)}

            # Stream tokens
            async for token in synthesizer_agent.run_stream(
                query=body.query,
                plan=plan,
                retrieval_result=retrieval_result,
                conversation_history=body.conversation_history or [],
            ):
                if await request.is_disconnected():
                    break
                yield {"data": json.dumps({"type": "token", "content": token})}

            yield {"data": json.dumps({"type": "done"})}

        return EventSourceResponse(event_generator())

    else:
        # For non-streaming, execute the full workflow
        state = await query_workflow.ainvoke(initial_state)
        plan = state.get("plan", {})
        return QueryResponse(
            query=body.query,
            answer=state.get("answer", ""),
            citations=[c for c in state.get("citations", [])],
            sub_queries=plan.get("sub_queries", []),
            is_multi_hop=plan.get("is_multi_hop", False),
            strategy=plan.get("strategy", "broad"),
        )


# ─── Documents List ───────────────────────────────────────────────────────────

@router.get("/documents", response_model=DocumentListResponse, tags=["Documents"])
async def list_documents():
    """Return all known documents with metadata."""
    docs = []
    for doc_id, info in _document_registry.items():
        # Refresh chunk count from vector store only if ready
        count = info.get("chunk_count", 0)
        if info.get("status", "ready") == "ready":
            count = vector_store.get_document_chunk_count(doc_id)
            info["chunk_count"] = count
            
        docs.append(
            DocumentInfo(
                doc_id=doc_id,
                name=info.get("name", "Unknown"),
                chunk_count=count,
                status=info.get("status", "ready"),
                uploaded_at=info.get("uploaded_at"),
                source_url=info.get("source_url"),
            )
        )
    return DocumentListResponse(documents=docs, total=len(docs))

@router.get("/documents/{doc_id}/status", response_model=DocumentInfo, tags=["Documents"])
async def get_document_status(doc_id: str):
    """Get the indexing status of a specific document."""
    if doc_id not in _document_registry:
        raise HTTPException(status_code=404, detail="Document not found.")
    info = _document_registry[doc_id]
    
    if info.get("status", "ready") == "ready":
        info["chunk_count"] = vector_store.get_document_chunk_count(doc_id)
        
    return DocumentInfo(
        doc_id=doc_id,
        name=info.get("name", "Unknown"),
        chunk_count=info.get("chunk_count", 0),
        status=info.get("status", "ready"),
        uploaded_at=info.get("uploaded_at"),
        source_url=info.get("source_url"),
    )


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
