"""
API Request / Response Schemas (Pydantic v2)
"""
from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel, Field, HttpUrl


# ─── Upload ───────────────────────────────────────────────────────────────────

class URLUploadRequest(BaseModel):
    url: str = Field(..., description="URL to ingest")
    doc_name: Optional[str] = Field(None, description="Optional display name")


class UploadResponse(BaseModel):
    doc_id: str
    source: str
    chunks_processed: int
    status: str


# ─── Process (re-index) ───────────────────────────────────────────────────────

class ProcessRequest(BaseModel):
    doc_id: str
    strategy: Optional[str] = Field(default="semantic", description="chunking strategy")


class ProcessResponse(BaseModel):
    doc_id: str
    status: str


# ─── Query ────────────────────────────────────────────────────────────────────

class QueryRequest(BaseModel):
    query: str = Field(..., min_length=1, description="User question")
    stream: bool = Field(default=True, description="Use SSE streaming")
    filter_doc_ids: Optional[list[str]] = Field(
        default=None, description="Restrict search to specific document IDs"
    )
    conversation_history: Optional[list[dict]] = Field(
        default=None,
        description="Prior conversation messages [{role: user|assistant, content: str}]"
    )


class Citation(BaseModel):
    source: str
    page: Any
    doc_id: str
    score: float


class QueryResponse(BaseModel):
    query: str
    answer: str
    citations: list[Citation]
    sub_queries: list[str]
    is_multi_hop: bool
    strategy: str


# ─── Documents ────────────────────────────────────────────────────────────────

class DocumentInfo(BaseModel):
    doc_id: str
    name: str
    chunk_count: int
    uploaded_at: Optional[str] = None
    source_url: Optional[str] = None


class DocumentListResponse(BaseModel):
    documents: list[DocumentInfo]
    total: int


# ─── Delete ───────────────────────────────────────────────────────────────────

class DeleteResponse(BaseModel):
    doc_id: str
    chunks_deleted: int
    status: str


# ─── Health ───────────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str
    ollama_connected: bool
    total_chunks: int
    models: list[str]
    version: str
