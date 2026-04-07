"""
Core configuration for the Multi-Agent RAG Research Assistant.
Loads from environment variables or .env file.
"""
from pydantic_settings import BaseSettings
from pydantic import Field
from typing import Optional
import os


class Settings(BaseSettings):
    # ─── App ─────────────────────────────────────────────────────────
    app_name: str = "Multi-Agent RAG Research Assistant"
    app_version: str = "1.0.0"
    debug: bool = Field(default=False)
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # ─── Ollama ───────────────────────────────────────────────────────
    ollama_base_url: str = Field(default="http://localhost:11434")
    llm_model: str = Field(default="gemma:2b")          # synthesis / planning
    embedding_model: str = Field(default="nomic-embed-text")  # embeddings

    # ─── Chunking ─────────────────────────────────────────────────────
    chunk_size: int = Field(default=500)    # tokens per chunk
    chunk_overlap: int = Field(default=50)  # overlap between chunks
    top_k: int = Field(default=5)          # top-k chunks to retrieve

    # ─── ChromaDB ─────────────────────────────────────────────────────
    chroma_persist_dir: str = Field(default="./chroma_db")
    chroma_collection_name: str = Field(default="rag_documents")

    # ─── Uploads ──────────────────────────────────────────────────────
    upload_dir: str = Field(default="./uploads")
    max_file_size_mb: int = Field(default=50)

    # ─── Cache ────────────────────────────────────────────────────────
    cache_max_size: int = Field(default=128)   # LRU cache entries
    cache_ttl_seconds: int = Field(default=3600)

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()

# Ensure necessary directories exist
os.makedirs(settings.upload_dir, exist_ok=True)
os.makedirs(settings.chroma_persist_dir, exist_ok=True)
