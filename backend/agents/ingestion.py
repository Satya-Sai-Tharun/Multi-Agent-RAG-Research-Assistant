"""
Ingestion Agent
Responsibilities:
  - Extract text from PDFs (PyMuPDF) and URLs (BeautifulSoup)
  - Clean and normalize content
  - Chunk text using recursive character splitting (with token-aware sizing)
  - Generate embeddings via Ollama (batched)
  - Store chunks + embeddings in ChromaDB
"""
import os
import re
import uuid
import logging
from dataclasses import dataclass, field
from typing import Optional

import fitz  # PyMuPDF
import requests
from bs4 import BeautifulSoup

from agents.base import BaseAgent
from core.config import settings
from core.ollama_client import ollama_client
from db.vector_store import vector_store

logger = logging.getLogger(__name__)


@dataclass
class Chunk:
    text: str
    metadata: dict = field(default_factory=dict)


class TextSplitter:
    """
    Recursive character text splitter.
    Tries to split on paragraph, then sentence, then word boundaries
    to preserve semantic coherence.
    """
    SEPARATORS = ["\n\n", "\n", ". ", "! ", "? ", " ", ""]

    def __init__(self, chunk_size: int, chunk_overlap: int):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

    def split(self, text: str) -> list[str]:
        return self._split_recursive(text, self.SEPARATORS)

    def _split_recursive(self, text: str, separators: list[str]) -> list[str]:
        if len(text) <= self.chunk_size:
            return [text.strip()] if text.strip() else []

        separator = separators[0] if separators else ""
        splits = text.split(separator) if separator else list(text)

        chunks = []
        current = ""
        for part in splits:
            candidate = (current + separator + part).strip() if current else part.strip()
            if len(candidate) <= self.chunk_size:
                current = candidate
            else:
                if current:
                    chunks.append(current)
                # Try next separator for the overflow part
                if len(part) > self.chunk_size and len(separators) > 1:
                    sub_chunks = self._split_recursive(part, separators[1:])
                    # Attach overlap from last chunk
                    if chunks and sub_chunks:
                        overlap_text = chunks[-1][-self.chunk_overlap:]
                        sub_chunks[0] = (overlap_text + " " + sub_chunks[0]).strip()
                    chunks.extend(sub_chunks)
                    current = ""
                else:
                    current = part.strip()

        if current:
            chunks.append(current)

        # Add overlap: prefix each chunk (except first) with end of previous chunk
        overlapped = [chunks[0]] if chunks else []
        for i in range(1, len(chunks)):
            overlap = chunks[i - 1][-self.chunk_overlap:].strip()
            overlapped.append((overlap + " " + chunks[i]).strip())

        return [c for c in overlapped if c]


class IngestionAgent(BaseAgent):
    def __init__(self):
        super().__init__("IngestionAgent")
        self.splitter = TextSplitter(
            chunk_size=settings.chunk_size,
            chunk_overlap=settings.chunk_overlap,
        )

    async def run(
        self,
        *,
        file_path: Optional[str] = None,
        url: Optional[str] = None,
        doc_id: Optional[str] = None,
        doc_name: Optional[str] = None,
    ) -> dict:
        """
        Main entry point. Provide either file_path or url.
        Returns dict with doc_id, chunk_count, status.
        """
        if not file_path and not url:
            raise ValueError("Provide either file_path or url")

        doc_id = doc_id or str(uuid.uuid4())

        # ── Step 1: Extract raw text ──────────────────────────────────────────
        if file_path:
            raw_pages = self._extract_pdf(file_path)
            source_name = doc_name or os.path.basename(file_path)
        else:
            raw_pages = self._extract_url(url)
            source_name = doc_name or url

        if not raw_pages:
            return {"doc_id": doc_id, "chunks_processed": 0, "status": "empty_document"}

        self.log_info(f"Extracted {len(raw_pages)} pages/sections from '{source_name}'")

        # ── Step 2: Chunk ─────────────────────────────────────────────────────
        chunks: list[Chunk] = []
        for page_num, page_text in raw_pages:
            page_text = self._clean_text(page_text)
            if not page_text.strip():
                continue
            splits = self.splitter.split(page_text)
            for i, chunk_text in enumerate(splits):
                chunks.append(
                    Chunk(
                        text=chunk_text,
                        metadata={
                            "source": source_name,
                            "page": page_num,
                            "chunk_index": i,
                            "doc_name": source_name,
                            "url": url or "",
                        },
                    )
                )

        self.log_info(f"Created {len(chunks)} chunks")

        if not chunks:
            return {"doc_id": doc_id, "chunks_processed": 0, "status": "no_chunks"}

        # ── Step 3: Embed (batched) ───────────────────────────────────────────
        texts = [c.text for c in chunks]
        embeddings = await ollama_client.embed_batch(texts, batch_size=8)

        # ── Step 4: Store in ChromaDB ─────────────────────────────────────────
        stored = vector_store.upsert_chunks(
            chunks=texts,
            embeddings=embeddings,
            metadatas=[c.metadata for c in chunks],
            doc_id=doc_id,
        )

        self.log_info(f"Stored {stored} chunks for doc_id={doc_id}")
        return {
            "doc_id": doc_id,
            "chunks_processed": stored,
            "status": "success",
            "source": source_name,
        }

    # ─── PDF Extraction ───────────────────────────────────────────────────────
    def _extract_pdf(self, file_path: str) -> list[tuple[int, str]]:
        """Returns list of (page_number, text) tuples."""
        pages = []
        try:
            doc = fitz.open(file_path)
            for page_num, page in enumerate(doc, start=1):
                text = page.get_text("text")
                if text.strip():
                    pages.append((page_num, text))
            doc.close()
        except Exception as e:
            self.log_error(f"PDF extraction failed: {e}")
        return pages

    # ─── URL Extraction ───────────────────────────────────────────────────────
    def _extract_url(self, url: str) -> list[tuple[int, str]]:
        """Fetches URL and extracts clean text. Returns [(1, text)]."""
        try:
            headers = {"User-Agent": "Mozilla/5.0 (RAG-Research-Assistant/1.0)"}
            resp = requests.get(url, headers=headers, timeout=30)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "lxml")

            # Remove boilerplate
            for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
                tag.decompose()

            text = soup.get_text(separator="\n", strip=True)
            return [(1, text)]
        except Exception as e:
            self.log_error(f"URL extraction failed for {url}: {e}")
            return []

    # ─── Text Cleaning ────────────────────────────────────────────────────────
    @staticmethod
    def _clean_text(text: str) -> str:
        text = re.sub(r"\n{3,}", "\n\n", text)       # Collapse 3+ newlines
        text = re.sub(r" {2,}", " ", text)            # Collapse spaces
        text = re.sub(r"-\n", "", text)               # Join hyphenated words
        text = text.strip()
        return text


ingestion_agent = IngestionAgent()
