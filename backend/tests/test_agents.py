"""
Backend test suite — basic smoke tests for agents and API endpoints.
Run with: pytest backend/tests/ -v
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ─── Ingestion Agent Tests ────────────────────────────────────────────────────

class TestTextSplitter:
    def test_short_text_not_split(self):
        from agents.ingestion import TextSplitter
        splitter = TextSplitter(chunk_size=500, chunk_overlap=50)
        text = "Hello world"
        result = splitter.split(text)
        assert len(result) == 1
        assert result[0] == "Hello world"

    def test_long_text_split(self):
        from agents.ingestion import TextSplitter
        splitter = TextSplitter(chunk_size=100, chunk_overlap=10)
        text = "word " * 100
        result = splitter.split(text)
        assert len(result) > 1
        for chunk in result:
            assert len(chunk) <= 200  # with overlap tolerance


class TestCleanText:
    def test_clean_extra_newlines(self):
        from agents.ingestion import IngestionAgent
        agent = IngestionAgent.__new__(IngestionAgent)
        dirty = "Hello\n\n\n\nWorld"
        clean = agent._clean_text(dirty)
        assert "\n\n\n" not in clean

    def test_clean_extra_spaces(self):
        from agents.ingestion import IngestionAgent
        agent = IngestionAgent.__new__(IngestionAgent)
        dirty = "Hello   World"
        clean = agent._clean_text(dirty)
        assert "  " not in clean


# ─── Synthesizer Tests ────────────────────────────────────────────────────────

class TestSynthesizer:
    def test_format_context(self):
        from agents.synthesizer import SynthesizerAgent
        agent = SynthesizerAgent.__new__(SynthesizerAgent)
        agent.name = "test"
        agent.logger = MagicMock()
        chunks = [
            {"text": "AI is transforming healthcare.", "metadata": {"source": "paper.pdf", "page": 3}, "score": 0.95},
            {"text": "RAG systems reduce hallucinations.", "metadata": {"source": "rag.pdf", "page": 1}, "score": 0.88},
        ]
        context = agent._format_context(chunks)
        assert "Source: paper.pdf" in context
        assert "Page 3" in context
        assert "AI is transforming" in context

    def test_extract_citations_unique(self):
        from agents.synthesizer import SynthesizerAgent
        agent = SynthesizerAgent.__new__(SynthesizerAgent)
        agent.name = "test"
        agent.logger = MagicMock()
        chunks = [
            {"text": "A", "metadata": {"source": "paper.pdf", "page": 1, "doc_id": "abc"}, "score": 0.9},
            {"text": "B", "metadata": {"source": "paper.pdf", "page": 1, "doc_id": "abc"}, "score": 0.8},
            {"text": "C", "metadata": {"source": "other.pdf", "page": 2, "doc_id": "def"}, "score": 0.75},
        ]
        citations = agent._extract_citations(chunks)
        assert len(citations) == 2  # duplicates removed


# ─── API Schemas Tests ────────────────────────────────────────────────────────

class TestSchemas:
    def test_query_request_valid(self):
        from api.schemas import QueryRequest
        req = QueryRequest(query="What is RAG?", stream=False)
        assert req.query == "What is RAG?"
        assert req.stream is False

    def test_query_request_too_short(self):
        from api.schemas import QueryRequest
        import pydantic
        with pytest.raises(pydantic.ValidationError):
            QueryRequest(query="Hi")  # min_length=3 → "Hi" is only 2
