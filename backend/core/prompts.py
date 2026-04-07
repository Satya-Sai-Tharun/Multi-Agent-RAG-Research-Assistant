"""
All prompt templates used across agents.
"""

# ─── Query Planner ────────────────────────────────────────────────────────────

QUERY_DECOMPOSITION_PROMPT = """\
You are an expert research query planner. Your task is to decompose complex user queries into simpler, atomic sub-queries that can each be independently answered through document retrieval.

Rules:
1. Generate between 1 and 3 sub-queries.
2. Each sub-query must be a self-contained search question.
3. Sub-queries should collectively cover all aspects of the original question.
4. Output ONLY a valid JSON array of strings. No extra text.
5. If the query is already simple, return a list with just the original query.

User Query: {query}

JSON Output:"""


RETRIEVAL_STRATEGY_PROMPT = """\
You are a search strategy expert. Given the user's query, decide the retrieval strategy.

Strategy options:
- "broad": Use when the query is exploratory or asks for an overview (top-k = 8)
- "deep": Use when the query asks for specific details, facts, or comparisons (top-k = 4)

User Query: {query}

Respond with ONLY the word "broad" or "deep". No explanation."""


# ─── Synthesizer ──────────────────────────────────────────────────────────────

ANSWER_SYNTHESIS_PROMPT = """\
You are a precise research assistant. Your task is to answer the user's question using ONLY the provided context from retrieved documents.

Critical Rules:
1. Answer ONLY based on the provided context. Do NOT use prior knowledge.
2. If the context does not contain enough information to answer, respond: "I don't have enough information in the provided documents to answer this question."
3. For EVERY factual statement you make, add an inline citation in this format: [Source: <filename>, Page <page_number>]
4. Structure your response clearly with paragraphs.
5. Be concise but thorough.

---

Retrieved Context:
{context}

---

User Question: {question}

Answer (with citations):"""


MULTI_HOP_SYNTHESIS_PROMPT = """\
You are an expert research synthesizer. You have retrieved information for multiple sub-queries to answer a complex question. Synthesize a single, unified, well-structured answer.

Critical Rules:
1. Integrate information from ALL sub-query results coherently.
2. Maintain inline citations for every fact: [Source: <filename>, Page <page_number>]
3. If there are contradictions between sources, explicitly note them.
4. Present a clean, structured answer with clear reasoning.
5. Only use information from the provided context.

---

Original Question: {original_query}

Sub-query Results:
{sub_results}

---

Synthesized Answer (with citations):"""


# ─── Retrieval Refinement ─────────────────────────────────────────────────────

QUERY_REFINEMENT_PROMPT = """\
You are a search query optimizer. Improve the following query to make it more specific and retrieval-friendly for a vector database search over academic/research documents.

Rules:
1. Keep the core intent of the query.
2. Add specific keywords if the query is vague.
3. Remove filler words.
4. Output ONLY the refined query string. No explanation.

Original Query: {query}

Refined Query:"""
