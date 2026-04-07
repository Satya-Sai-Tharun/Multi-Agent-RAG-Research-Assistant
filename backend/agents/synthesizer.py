"""
Synthesizer Agent
Responsibilities:
  - Format retrieved chunks into a context block with citations
  - Use Ollama (streaming) to generate final answers
  - For multi-hop queries, synthesize across sub-query results
  - Ensure grounded, hallucination-minimized responses with inline citations
"""
import logging
from typing import AsyncGenerator, Optional

from agents.base import BaseAgent
from core.ollama_client import ollama_client
from core.prompts import ANSWER_SYNTHESIS_PROMPT, MULTI_HOP_SYNTHESIS_PROMPT

logger = logging.getLogger(__name__)


class SynthesizerAgent(BaseAgent):
    def __init__(self):
        super().__init__("SynthesizerAgent")

    # ─── Streaming Answer ─────────────────────────────────────────────────────
    async def run_stream(
        self,
        *,
        query: str,
        plan: dict,
        retrieval_result: dict,
    ) -> AsyncGenerator[str, None]:
        """
        Async generator that yields answer tokens as they stream from Ollama.
        """
        chunks = retrieval_result.get("retrieved_chunks", [])
        is_multi_hop = plan.get("is_multi_hop", False)

        if not chunks:
            yield "I couldn't find any relevant information in the uploaded documents to answer your question."
            return

        if is_multi_hop:
            prompt = self._build_multi_hop_prompt(
                original_query=query,
                sub_query_results=retrieval_result.get("sub_query_results", []),
            )
        else:
            context = self._format_context(chunks)
            prompt = ANSWER_SYNTHESIS_PROMPT.format(context=context, question=query)

        self.log_info(f"Synthesizing answer | multi-hop={is_multi_hop} | chunks={len(chunks)}")
        async for token in ollama_client.stream_generate(prompt, temperature=0.1):
            yield token

    # ─── Non-Streaming Answer ─────────────────────────────────────────────────
    async def run(
        self,
        *,
        query: str,
        plan: dict,
        retrieval_result: dict,
    ) -> dict:
        """
        Non-streaming synchronous call.
        Returns {"answer": str, "citations": list[dict]}
        """
        chunks = retrieval_result.get("retrieved_chunks", [])
        is_multi_hop = plan.get("is_multi_hop", False)

        if not chunks:
            return {
                "answer": "I couldn't find any relevant information in the uploaded documents.",
                "citations": [],
            }

        if is_multi_hop:
            prompt = self._build_multi_hop_prompt(
                original_query=query,
                sub_query_results=retrieval_result.get("sub_query_results", []),
            )
        else:
            context = self._format_context(chunks)
            prompt = ANSWER_SYNTHESIS_PROMPT.format(context=context, question=query)

        answer = await ollama_client.generate(prompt, temperature=0.1)
        citations = self._extract_citations(chunks)
        return {"answer": answer, "citations": citations}

    # ─── Helpers ─────────────────────────────────────────────────────────────
    def _format_context(self, chunks: list[dict]) -> str:
        """Format chunks into a numbered context block with citation anchors."""
        parts = []
        for i, chunk in enumerate(chunks, start=1):
            meta = chunk.get("metadata", {})
            source = meta.get("source", "Unknown")
            page = meta.get("page", "?")
            score = chunk.get("score", 0)
            parts.append(
                f"[Chunk {i} | Source: {source} | Page {page} | Relevance: {score:.2f}]\n"
                f"{chunk['text']}"
            )
        return "\n\n---\n\n".join(parts)

    def _build_multi_hop_prompt(
        self, original_query: str, sub_query_results: list[dict]
    ) -> str:
        """Build prompt for multi-hop synthesis."""
        sub_results_text = ""
        for i, sr in enumerate(sub_query_results, start=1):
            sq = sr.get("sub_query", "")
            chunks = sr.get("chunks", [])
            context = self._format_context(chunks)
            sub_results_text += f"\n\n### Sub-query {i}: {sq}\n\n{context}"

        return MULTI_HOP_SYNTHESIS_PROMPT.format(
            original_query=original_query,
            sub_results=sub_results_text,
        )

    def _extract_citations(self, chunks: list[dict]) -> list[dict]:
        """Return a structured list of unique citations from retrieved chunks."""
        seen = set()
        citations = []
        for chunk in chunks:
            meta = chunk.get("metadata", {})
            source = meta.get("source", "Unknown")
            page = meta.get("page", "?")
            key = (source, page)
            if key not in seen:
                seen.add(key)
                citations.append(
                    {
                        "source": source,
                        "page": page,
                        "doc_id": meta.get("doc_id", ""),
                        "score": round(chunk.get("score", 0), 4),
                    }
                )
        return citations


synthesizer_agent = SynthesizerAgent()
