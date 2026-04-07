"""
Retriever Agent
Responsibilities:
  - Embed the query using Ollama
  - Perform similarity search in ChromaDB
  - Apply retrieval strategy (broad = more chunks, deep = fewer, higher precision)
  - Deduplicate and rank returned chunks
  - Optionally filter by document IDs
"""
import logging
from typing import Optional

from agents.base import BaseAgent
from core.config import settings
from core.ollama_client import ollama_client
from db.vector_store import vector_store

logger = logging.getLogger(__name__)


class RetrieverAgent(BaseAgent):
    def __init__(self):
        super().__init__("RetrieverAgent")

    async def run(
        self,
        *,
        plan: dict,
        filter_doc_ids: Optional[list[str]] = None,
    ) -> dict:
        """
        Execute retrieval based on the query plan.
        Returns:
          {
            "retrieved_chunks": list[dict],   # {text, metadata, score}
            "sub_query_results": list[dict],  # per sub-query results
          }
        """
        strategy = plan.get("strategy", "broad")
        sub_queries = plan.get("sub_queries", [plan["original_query"]])

        # Adjust top-k based on strategy
        top_k = settings.top_k + 3 if strategy == "broad" else settings.top_k

        all_chunks: list[dict] = []
        sub_query_results = []

        for sq in sub_queries:
            self.log_info(f"Retrieving for sub-query: '{sq[:60]}...'")
            chunks = await self._retrieve_for_query(sq, top_k=top_k, filter_doc_ids=filter_doc_ids)
            sub_query_results.append({"sub_query": sq, "chunks": chunks})
            all_chunks.extend(chunks)

        # Deduplicate by chunk text content
        seen_texts = set()
        unique_chunks = []
        for chunk in all_chunks:
            key = chunk["text"][:120]  # first 120 chars as key
            if key not in seen_texts:
                seen_texts.add(key)
                unique_chunks.append(chunk)

        # Sort by descending similarity score
        unique_chunks.sort(key=lambda c: c["score"], reverse=True)

        # Cap at 2 * top_k to avoid overwhelming context window
        final_chunks = unique_chunks[: top_k * 2]

        self.log_info(
            f"Retrieved {len(all_chunks)} raw → {len(final_chunks)} unique chunks after dedup"
        )
        return {
            "retrieved_chunks": final_chunks,
            "sub_query_results": sub_query_results,
        }

    async def _retrieve_for_query(
        self, query: str, top_k: int, filter_doc_ids: Optional[list[str]]
    ) -> list[dict]:
        """Embed a single query and run similarity search."""
        try:
            embedding = await ollama_client.embed(query)
            if not embedding:
                self.log_error("Got empty embedding — Ollama embedding model may not be running")
                return []
            return vector_store.similarity_search(
                query_embedding=embedding,
                top_k=top_k,
                filter_doc_ids=filter_doc_ids,
            )
        except Exception as e:
            self.log_error(f"Retrieval failed: {e}")
            return []


retriever_agent = RetrieverAgent()
