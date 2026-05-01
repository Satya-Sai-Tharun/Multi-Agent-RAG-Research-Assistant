"""
Query Planner Agent
Responsibilities:
  - Detect if a query is simple or multi-hop
  - Decompose complex queries into atomic sub-queries
  - Decide retrieval strategy (broad vs deep)
  - Optionally refine queries for better vector search precision
"""
import json
import logging
import re
from typing import Literal

from agents.base import BaseAgent
from core.ollama_client import ollama_client
from core.config import settings
from core.prompts import (
    QUERY_DECOMPOSITION_PROMPT,
    RETRIEVAL_STRATEGY_PROMPT,
    QUERY_REFINEMENT_PROMPT,
    HYDE_PROMPT,
)

logger = logging.getLogger(__name__)

RetrievalStrategy = Literal["broad", "deep"]


class QueryPlannerAgent(BaseAgent):
    def __init__(self):
        super().__init__("QueryPlannerAgent")

    async def run(self, query: str) -> dict:
        """
        Plan the retrieval for a given query.
        Returns:
          {
            "original_query": str,
            "sub_queries": list[str],
            "strategy": "broad" | "deep",
            "is_multi_hop": bool
          }
        """
        self.log_info(f"Planning query: '{query[:80]}...'")

        # Step 1: Decompose
        sub_queries = await self._decompose(query)
        is_multi_hop = len(sub_queries) > 1

        # Step 2: Decide strategy
        strategy = await self._decide_strategy(query)

        # Step 3: Refine each sub-query and generate HyDE
        refined_queries = []
        for sq in sub_queries:
            refined = await self._refine_query(sq)
            hyde_doc = await self._generate_hyde(refined)
            # Combine the refined query with the hypothetical document for better vector search
            final_search_query = f"{refined}\n\n{hyde_doc}" if hyde_doc else refined
            refined_queries.append(final_search_query)

        plan = {
            "original_query": query,
            "sub_queries": refined_queries,
            "strategy": strategy,
            "is_multi_hop": is_multi_hop,
        }
        self.log_info(
            f"Plan: {len(sub_queries)} sub-queries | strategy={strategy} | multi-hop={is_multi_hop}"
        )
        return plan

    async def _decompose(self, query: str) -> list[str]:
        """Use LLM to decompose query into sub-queries."""
        prompt = QUERY_DECOMPOSITION_PROMPT.format(query=query)
        try:
            raw = await ollama_client.generate(
                prompt, 
                temperature=0.0,
                model=settings.planner_model
            )
            # Extract JSON array from response
            json_match = re.search(r"\[.*?\]", raw, re.DOTALL)
            if json_match:
                sub_queries = json.loads(json_match.group())
                if isinstance(sub_queries, list) and sub_queries:
                    return [str(q).strip() for q in sub_queries if str(q).strip()]
        except Exception as e:
            self.log_warning(f"Decomposition failed, using original query: {e}")
        return [query]

    async def _decide_strategy(self, query: str) -> RetrievalStrategy:
        """Use LLM to decide retrieval strategy."""
        prompt = RETRIEVAL_STRATEGY_PROMPT.format(query=query)
        try:
            raw = (await ollama_client.generate(
                prompt, 
                temperature=0.0,
                model=settings.planner_model
            )).strip().lower()
            if "deep" in raw:
                return "deep"
        except Exception as e:
            self.log_warning(f"Strategy decision failed, defaulting to 'broad': {e}")
        return "broad"

    async def _refine_query(self, query: str) -> str:
        """Refine a query to be more retrieval-friendly."""
        prompt = QUERY_REFINEMENT_PROMPT.format(query=query)
        try:
            refined = (await ollama_client.generate(
                prompt, 
                temperature=0.0,
                model=settings.planner_model
            )).strip()
            # Sanity: if refinement is too long or failed, use original
            if refined and len(refined) < 300 and "\n" not in refined:
                return refined
        except Exception as e:
            self.log_warning(f"Refinement failed, using original: {e}")
        return query

    async def _generate_hyde(self, query: str) -> str:
        """Generate a hypothetical document (HyDE) to improve semantic search recall."""
        prompt = HYDE_PROMPT.format(query=query)
        try:
            hyde_doc = (await ollama_client.generate(
                prompt, 
                temperature=0.3, # slightly higher temp for creative hypothetical generation
                model=settings.planner_model,
                max_tokens=300
            )).strip()
            return hyde_doc
        except Exception as e:
            self.log_warning(f"HyDE generation failed: {e}")
            return ""


query_planner_agent = QueryPlannerAgent()
