"""
FastAPI Application Entry Point
- CORS configuration for Next.js frontend
- Lifespan events (startup/shutdown)
- Routers
- Global exception handlers
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from core.config import settings
from api.routes import router

# ─── Logging ─────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


# ─── Lifespan ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"🚀 Starting {settings.app_name} v{settings.app_version}")
    from core.ollama_client import ollama_client
    from db.vector_store import vector_store

    ok = await ollama_client.health_check()
    if ok:
        models = await ollama_client.list_models()
        logger.info(f"✅ Ollama connected — available models: {models}")
    else:
        logger.warning(
            "⚠️  Ollama not reachable. Ensure 'ollama serve' is running on port 11434."
        )

    logger.info(f"📦 Vector store ready — {vector_store.total_chunks()} chunks loaded")
    yield
    await ollama_client.close()
    logger.info("🛑 Shutdown complete")


# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Multi-Agent RAG Research Assistant — fully local, modular, production-grade.",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — allow Next.js dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routes
app.include_router(router, prefix="/api")


# ─── Exception Handlers ───────────────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred.", "error": str(exc)},
    )


# ─── Root ─────────────────────────────────────────────────────────────────────
@app.get("/", tags=["Root"])
async def root():
    return {
        "message": f"Welcome to {settings.app_name}",
        "version": settings.app_version,
        "docs": "/docs",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
