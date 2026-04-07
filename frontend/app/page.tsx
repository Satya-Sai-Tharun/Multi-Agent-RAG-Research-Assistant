"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import UploadWidget from "@/components/Upload";
import ChatInterface from "@/components/Chat";
import DocumentManager from "@/components/DocumentManager";
import StatusBar from "@/components/StatusBar";
import { UploadResponse } from "@/lib/api";

export default function HomePage() {
  const [totalChunks, setTotalChunks] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleUploadSuccess = (response: UploadResponse) => {
    // Trigger doc list re-fetch
    setRefreshTrigger((v) => v + 1);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-primary)]">
      {/* Ambient background glows */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 overflow-hidden"
        style={{ zIndex: 0 }}
      >
        <div
          style={{
            position: "absolute", top: "-20%", left: "-10%",
            width: "600px", height: "600px",
            background: "radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)",
            borderRadius: "50%",
          }}
        />
        <div
          style={{
            position: "absolute", bottom: "-20%", right: "-5%",
            width: "500px", height: "500px",
            background: "radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)",
            borderRadius: "50%",
          }}
        />
      </div>

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="sidebar relative z-10 flex flex-col gap-0">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "var(--accent-gradient)" }}
            >
              <Sparkles size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-[var(--text-primary)] leading-tight">
                RAG Research
              </h1>
              <p className="text-[11px] text-[var(--text-muted)]">Multi-Agent Assistant</p>
            </div>
          </div>
        </div>

        {/* Sidebar Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <UploadWidget onUploadSuccess={handleUploadSuccess} />
          <DocumentManager
            refreshTrigger={refreshTrigger}
            onDocumentsChange={setTotalChunks}
          />
        </div>

        {/* Sidebar Footer */}
        <div className="px-4 py-3 border-t border-[var(--border-subtle)]">
          <p className="text-[11px] text-[var(--text-muted)] text-center">
            Powered by Ollama · ChromaDB · FastAPI
          </p>
        </div>
      </aside>

      {/* ── Main Panel ──────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden relative z-10">
        {/* Top Bar */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)] bg-[rgba(10,11,15,0.6)] backdrop-blur-md">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Research Chat
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              {totalChunks > 0
                ? `${totalChunks} chunks indexed and ready`
                : "No documents ingested yet"}
            </p>
          </div>
          <StatusBar />
        </header>

        {/* Chat */}
        <ChatInterface totalChunks={totalChunks} />
      </main>
    </div>
  );
}
