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
    app_version: str = "2.0.0"
    debug: bool = Field(default=False)
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # ─── Ollama ───────────────────────────────────────────────────────
    ollama_base_url: str = Field(default="http://localhost:11434")
    # Upgrade to llama3.2:3b — significantly better reasoning than gemma:2b
    # while still fast on Apple Silicon / CPU. Falls back to gemma:2b if unavailable.
    llm_model: str = Field(default="llama3.2:3b")
    embedding_model: str = Field(default="nomic-embed-text")

    # ─── LLM Performance Tuning ───────────────────────────────────────
    llm_temperature: float = Field(default=0.05)     # low = more deterministic/accurate
    llm_num_ctx: int = Field(default=4096)            # context window (supports long chats)
    llm_repeat_penalty: float = Field(default=1.15)  # reduce repetition
    llm_top_p: float = Field(default=0.9)            # nucleus sampling
    llm_num_predict: int = Field(default=2048)        # max output tokens

    # ─── Chunking ─────────────────────────────────────────────────────
    chunk_size: int = Field(default=500)
    chunk_overlap: int = Field(default=50)
    top_k: int = Field(default=8)   # increased for better recall

    # ─── ChromaDB ─────────────────────────────────────────────────────
    chroma_persist_dir: str = Field(default="./chroma_db")
    chroma_collection_name: str = Field(default="rag_documents")

    # ─── Uploads ──────────────────────────────────────────────────────
    upload_dir: str = Field(default="./uploads")
    max_file_size_mb: int = Field(default=50)

    # ─── Cache ────────────────────────────────────────────────────────
    cache_max_size: int = Field(default=128)
    cache_ttl_seconds: int = Field(default=3600)

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()

# Ensure necessary directories exist
os.makedirs(settings.upload_dir, exist_ok=True)
os.makedirs(settings.chroma_persist_dir, exist_ok=True)
