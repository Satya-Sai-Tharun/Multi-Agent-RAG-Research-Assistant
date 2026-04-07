"""
Ollama client wrapper for all LLM interactions:
- Text generation (synchronous)
- Streaming text generation (async generator)
- Embedding generation (batch-aware)
"""
import json
import logging
from typing import AsyncGenerator, Optional
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
import httpx

from core.config import settings

logger = logging.getLogger(__name__)


class OllamaClient:
    """Thin async wrapper around the Ollama HTTP API."""

    def __init__(self):
        self.base_url = settings.ollama_base_url
        self.llm_model = settings.llm_model
        self.embedding_model = settings.embedding_model
        self._client = httpx.AsyncClient(timeout=120.0)

    # ─── Health Check ──────────────────────────────────────────────────────────
    async def health_check(self) -> bool:
        """Returns True if Ollama server is reachable."""
        try:
            resp = await self._client.get(f"{self.base_url}/api/tags")
            return resp.status_code == 200
        except Exception:
            return False

    async def list_models(self) -> list[str]:
        """Returns list of locally available Ollama models."""
        try:
            resp = await self._client.get(f"{self.base_url}/api/tags")
            resp.raise_for_status()
            data = resp.json()
            return [m["name"] for m in data.get("models", [])]
        except Exception as e:
            logger.error(f"Failed to list models: {e}")
            return []

    # ─── Text Generation ───────────────────────────────────────────────────────
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type(httpx.HTTPError),
    )
    async def generate(
        self,
        prompt: str,
        model: Optional[str] = None,
        temperature: float = 0.1,
        max_tokens: int = 2048,
    ) -> str:
        """Synchronous (non-streaming) text generation."""
        model = model or self.llm_model
        payload = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
            },
        }
        try:
            resp = await self._client.post(
                f"{self.base_url}/api/generate",
                json=payload,
                timeout=120.0,
            )
            resp.raise_for_status()
            return resp.json().get("response", "")
        except httpx.HTTPStatusError as e:
            logger.error(f"Ollama generate failed [{e.response.status_code}]: {e}")
            raise

    async def stream_generate(
        self,
        prompt: str,
        model: Optional[str] = None,
        temperature: float = 0.1,
        max_tokens: int = 2048,
    ) -> AsyncGenerator[str, None]:
        """Streaming text generation — yields tokens as they are produced."""
        model = model or self.llm_model
        payload = {
            "model": model,
            "prompt": prompt,
            "stream": True,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
            },
        }
        async with self._client.stream(
            "POST",
            f"{self.base_url}/api/generate",
            json=payload,
            timeout=None,
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if line.strip():
                    try:
                        data = json.loads(line)
                        token = data.get("response", "")
                        if token:
                            yield token
                        if data.get("done", False):
                            break
                    except json.JSONDecodeError:
                        continue

    # ─── Embeddings ────────────────────────────────────────────────────────────
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        retry=retry_if_exception_type(httpx.HTTPError),
    )
    async def embed(self, text: str, model: Optional[str] = None) -> list[float]:
        """Generate embedding for a single text string."""
        model = model or self.embedding_model
        payload = {"model": model, "prompt": text}
        resp = await self._client.post(
            f"{self.base_url}/api/embeddings",
            json=payload,
            timeout=60.0,
        )
        resp.raise_for_status()
        return resp.json().get("embedding", [])

    async def embed_batch(
        self, texts: list[str], model: Optional[str] = None, batch_size: int = 8
    ) -> list[list[float]]:
        """
        Embed a list of texts in small batches (sequential) to avoid
        CPU/RAM overload on Mac Intel with constrained resources.
        """
        all_embeddings: list[list[float]] = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            for text in batch:
                emb = await self.embed(text, model=model)
                all_embeddings.append(emb)
            logger.info(
                f"Embedded batch {i // batch_size + 1}/{(len(texts) + batch_size - 1) // batch_size}"
            )
        return all_embeddings

    async def close(self):
        await self._client.aclose()


# Singleton instance
ollama_client = OllamaClient()
