# 🧠 Multi-Agent RAG Research Assistant

A fully **local**, production-grade **Multi-Agent RAG (Retrieval-Augmented Generation)** system.  
Upload PDFs or provide URLs — then ask complex research questions with **cited, grounded answers** powered entirely by local LLMs via [Ollama](https://ollama.com).

---

## 🏗️ Architecture

```
Frontend (Next.js)
       │
       │  REST + SSE streaming
       ▼
 FastAPI Backend
       │
 ┌─────┴──────────────────────────┐
 │         Agent Pipeline         │
 │  ┌──────────────────────────┐  │
 │  │   Ingestion Agent        │  │  ← PDF / URL → Clean → Chunk
 │  │   Embedding Agent        │  │  ← Ollama (nomic-embed-text)
 │  │   Query Planner Agent    │  │  ← Multi-hop decomposition
 │  │   Retriever Agent        │  │  ← ChromaDB similarity search
 │  │   Synthesizer Agent      │  │  ← Ollama (gemma:2b) + citations
 │  └──────────────────────────┘  │
 └─────────────────────────────────┘
       │
 ChromaDB (local persistent vector store)
```

---

## ⚡ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, TypeScript, Tailwind CSS |
| Backend | FastAPI, Python 3.11+ |
| LLM | Ollama (`gemma:2b` or `llama3:8b`) |
| Embeddings | Ollama (`nomic-embed-text`) |
| Vector DB | ChromaDB (local persistent) |
| PDF Parsing | PyMuPDF |
| Web Scraping | BeautifulSoup4 |

---

## 🚀 Quick Start

### Prerequisites
- **macOS** (Intel i7 / Apple Silicon)
- **Python 3.11+** and **Node.js 20+**
- **[Ollama](https://ollama.com)** installed and running

### 1. Install Ollama Models

```bash
ollama pull gemma4:latest          # LLM for synthesis & planning
ollama pull nomic-embed-text  # Embedding model
ollama serve                  # Start Ollama server (if not already running)
```

### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start FastAPI server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at: http://localhost:8000  
Interactive docs: http://localhost:8000/docs

### 3. Frontend Setup

```bash
cd frontend

# Install npm packages
npm install

# Create env file (if not present)
echo "NEXT_PUBLIC_API_URL=http://localhost:8000/api" > .env.local

# Start Next.js dev server
npm run dev
```

The UI will be available at: http://localhost:3000

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | System health & Ollama status |
| `POST` | `/api/upload` | Upload a PDF file |
| `POST` | `/api/upload/url` | Ingest a web URL |
| `POST` | `/api/query` | RAG query (supports streaming) |
| `GET` | `/api/documents` | List all ingested documents |
| `DELETE` | `/api/documents/{doc_id}` | Delete a document |

---

## 🧩 Agent Pipeline

1. **Ingestion Agent** — Extracts text from PDFs (PyMuPDF) or URLs (BeautifulSoup), cleans, and recursively chunks content.
2. **Embedding Agent** — Batches chunks to Ollama's embedding model for vector generation.
3. **Query Planner Agent** — Decomposes complex queries into atomic sub-queries using LLM reasoning. Decides `broad` vs `deep` search strategy.
4. **Retriever Agent** — Embeds the query and performs cosine similarity search in ChromaDB. Deduplicates and ranks results.
5. **Synthesizer Agent** — Generates grounded, cited answers using Ollama via streaming SSE. Supports multi-hop synthesis.

---

## ⚙️ Configuration

Edit `backend/.env` to change models or chunk settings:

```env
LLM_MODEL=gemma:2b             # or llama3:8b
EMBEDDING_MODEL=nomic-embed-text
CHUNK_SIZE=500                 # tokens per chunk
CHUNK_OVERLAP=50               # overlap between chunks
TOP_K=5                        # chunks retrieved per sub-query
```

---

## 🧪 Running Tests

```bash
cd backend
source .venv/bin/activate
pytest tests/ -v
```

---

## 📂 Project Structure

```
multi-agent-rag/
├── backend/
│   ├── main.py              # FastAPI entry point
│   ├── api/
│   │   ├── routes.py        # All API endpoints
│   │   └── schemas.py       # Pydantic request/response models
│   ├── agents/
│   │   ├── base.py          # Abstract base agent
│   │   ├── ingestion.py     # PDF + URL ingestion & chunking
│   │   ├── planner.py       # Query decomposition & strategy
│   │   ├── retriever.py     # Similarity search
│   │   └── synthesizer.py   # Answer generation + citations
│   ├── core/
│   │   ├── config.py        # Settings / env vars
│   │   ├── ollama_client.py # Async Ollama wrapper
│   │   └── prompts.py       # All prompt templates
│   ├── db/
│   │   └── vector_store.py  # ChromaDB wrapper
│   ├── tests/               # Pytest test suite
│   └── requirements.txt
├── frontend/
│   ├── app/                 # Next.js App Router
│   │   ├── page.tsx         # Main page
│   │   ├── layout.tsx       # Root layout
│   │   └── globals.css      # Global styles
│   ├── components/
│   │   ├── Chat.tsx         # Streaming chat interface
│   │   ├── Upload.tsx       # PDF/URL upload widget
│   │   ├── DocumentManager.tsx
│   │   └── StatusBar.tsx
│   └── lib/
│       └── api.ts           # TypeScript API client
└── README.md
```

---

## 🔮 Advanced Features

- ✅ **Multi-hop query reasoning** — complex questions are decomposed into sub-queries
- ✅ **Streaming responses** — SSE token streaming from Ollama
- ✅ **Inline citations** — every answer cites exact source + page number  
- ✅ **Incremental indexing** — re-upload or add documents without re-processing all
- ✅ **Query caching** — LRU cache prevents redundant LLM calls
- ✅ **Hybrid search** — cosine similarity + keyword-aware chunking

---

## 📊 Performance Tips (Mac Intel i7, 16GB RAM)

- Use `gemma:2b` (not 7B+) for fast CPU inference
- Keep `CHUNK_SIZE=500` to limit context window pressure
- Use `nomic-embed-text` — fastest local embedding model
- Embeddings are processed in batches of 8 to prevent RAM exhaustion
- ChromaDB persists to disk — restarts are instant

---

## 📄 License

MIT
