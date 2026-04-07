"""
NumPy-based Vector Store wrapper.
Handles:
  - In-memory storage backed by a pickle file for persistence.
  - Cosine similarity search using pure NumPy.
  - Upsert chunks with metadata.
  - Document deletion.
This ensures 100% compatibility with Python 3.14 without requiring C++ compilers or SWIG.
"""
import logging
import os
import pickle
import uuid
from typing import Optional

import numpy as np

from core.config import settings

logger = logging.getLogger(__name__)


class NumpyVectorStore:
    """Manages document embeddings using pure NumPy for maximum compatibility."""

    def __init__(self):
        self.persist_path = os.path.join(settings.chroma_persist_dir, "db.pkl")
        self.data = {"ids": [], "embeddings": [], "documents": [], "metadatas": []}
        self.load()

    def save(self):
        """Persist to disk."""
        os.makedirs(settings.chroma_persist_dir, exist_ok=True)
        with open(self.persist_path, "wb") as f:
            pickle.dump(self.data, f)

    def load(self):
        """Load from disk if exists."""
        if os.path.exists(self.persist_path):
            try:
                with open(self.persist_path, "rb") as f:
                    self.data = pickle.load(f)
                logger.info(f"VectorStore loaded — {len(self.data['ids'])} chunks.")
            except Exception as e:
                logger.error(f"Failed to load vector store: {e}")
                self.data = {"ids": [], "embeddings": [], "documents": [], "metadatas": []}
        else:
            logger.info("VectorStore initialized empty.")

    # ─── Upsert ───────────────────────────────────────────────────────────────
    def upsert_chunks(
        self,
        chunks: list[str],
        embeddings: list[list[float]],
        metadatas: list[dict],
        doc_id: str,
    ) -> int:
        if not chunks:
            return 0

        ids = [f"{doc_id}_chunk_{i}" for i in range(len(chunks))]

        for meta in metadatas:
            meta["doc_id"] = doc_id

        # Since it's upsert, first delete existing if they matching these ids
        # (For this simplified flow, we assume fresh doc_ids mostly, but let's be safe)
        existing_ids = set(self.data["ids"])
        for i, idx in enumerate(ids):
            if idx in existing_ids:
                pos = self.data["ids"].index(idx)
                self.data["embeddings"][pos] = embeddings[i]
                self.data["documents"][pos] = chunks[i]
                self.data["metadatas"][pos] = metadatas[i]
            else:
                self.data["ids"].append(idx)
                self.data["embeddings"].append(embeddings[i])
                self.data["documents"].append(chunks[i])
                self.data["metadatas"].append(metadatas[i])

        self.save()
        logger.info(f"Upserted {len(chunks)} chunks for doc_id={doc_id}")
        return len(chunks)

    # ─── Similarity Search ────────────────────────────────────────────────────
    def similarity_search(
        self,
        query_embedding: list[float],
        top_k: int = 5,
        filter_doc_ids: Optional[list[str]] = None,
    ) -> list[dict]:
        
        if not self.data["embeddings"]:
            return []

        # Convert to numpy array for fast mult
        # Normalize the embeddings to compute cosine similarity easily via dot product
        db_emb = np.array(self.data["embeddings"], dtype=np.float32)
        q_emb = np.array(query_embedding, dtype=np.float32)

        # Normalize q_emb
        q_norm = np.linalg.norm(q_emb)
        if q_norm == 0:
            return []
        q_emb = q_emb / q_norm

        # Normalize db_emb
        db_norms = np.linalg.norm(db_emb, axis=1, keepdims=True)
        # avoid division by zero
        db_norms[db_norms == 0] = 1
        db_emb_norm = db_emb / db_norms

        # Cosine similarity is the dot product of normalized vectors
        similarities = np.dot(db_emb_norm, q_emb)

        # Get sorted indices (descending)
        sorted_indices = np.argsort(similarities)[::-1]

        results = []
        for idx in sorted_indices:
            meta = self.data["metadatas"][idx]
            
            # Apply filter if provided
            if filter_doc_ids and meta.get("doc_id") not in filter_doc_ids:
                continue
                
            results.append({
                "text": self.data["documents"][idx],
                "metadata": meta,
                "score": float(similarities[idx]),
            })
            
            if len(results) >= top_k:
                break

        return results

    # ─── Document Management ──────────────────────────────────────────────────
    def delete_document(self, doc_id: str) -> int:
        indices_to_delete = [
            i for i, meta in enumerate(self.data["metadatas"]) if meta.get("doc_id") == doc_id
        ]
        
        if not indices_to_delete:
            return 0
            
        # Delete in reverse so indices don't shift improperly
        for idx in sorted(indices_to_delete, reverse=True):
            self.data["ids"].pop(idx)
            self.data["embeddings"].pop(idx)
            self.data["documents"].pop(idx)
            self.data["metadatas"].pop(idx)
            
        self.save()
        logger.info(f"Deleted {len(indices_to_delete)} chunks for doc_id={doc_id}")
        return len(indices_to_delete)

    def get_document_chunk_count(self, doc_id: str) -> int:
        return sum(1 for meta in self.data["metadatas"] if meta.get("doc_id") == doc_id)

    def total_chunks(self) -> int:
        return len(self.data["ids"])

    def document_exists(self, doc_id: str) -> bool:
        return self.get_document_chunk_count(doc_id) > 0


# Singleton
vector_store = NumpyVectorStore()
