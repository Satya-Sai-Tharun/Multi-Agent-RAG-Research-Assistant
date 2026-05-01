"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus, MessageSquare, Trash2, Brain, ChevronRight, Layers
} from "lucide-react";
import dynamic from "next/dynamic";
import UploadWidget from "@/components/Upload";
import DocumentManager from "@/components/DocumentManager";
import StatusBar from "@/components/StatusBar";
import { useAppStore } from "@/lib/store";

// Lazy-load Chat to avoid SSR localStorage issues
const ChatInterface = dynamic(() => import("@/components/Chat"), { ssr: false });

export default function HomePage() {
  const { sessions, activeSessionId, createSession, setActiveSession, deleteSession, _hasHydrated } = useAppStore();
  const [totalChunks, setTotalChunks] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Initialize first session if empty
  useEffect(() => {
    // Only run after hydration is complete to prevent overriding persisted state
    if (_hasHydrated) {
      if (sessions.length === 0) {
        createSession();
      } else if (!activeSessionId) {
        setActiveSession(sessions[0].id);
      }
    }
  }, [_hasHydrated, sessions.length, activeSessionId, createSession, setActiveSession]);

  const handleNewChat = useCallback(() => {
    createSession();
  }, [createSession]);

  const handleDeleteSession = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      deleteSession(id);
    },
    [deleteSession]
  );

  const handleUploadSuccess = useCallback(() => {
    setRefreshTrigger((t) => t + 1);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg-primary)" }}>
      {/* ─── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className="sidebar overflow-y-auto flex-col">
        {/* Branding */}
        <div className="px-5 pt-6 pb-4">
          <div className="flex items-center gap-3 mb-1">
            <div
              className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0"
              style={{ background: "var(--accent-gradient)" }}
            >
              <Brain size={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-[13px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
                RAG Research
              </h1>
              <p className="text-[10px] font-medium tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
                Intelligence Layer
              </p>
            </div>
          </div>
        </div>

        <div className="divider mx-4" />

        {/* New Chat Button */}
        <div className="px-3 mb-3">
          <button
            id="new-chat-btn"
            onClick={handleNewChat}
            className="btn-primary w-full text-[13px] py-2.5 rounded"
            style={{ borderRadius: "var(--radius-xs)" }}
          >
            <Plus size={15} strokeWidth={2.5} />
            New Chat
          </button>
        </div>

        {/* Chat Sessions */}
        <div className="flex-1 px-2 mb-2">
          <p className="text-[10px] font-semibold tracking-widest uppercase px-2 mb-2" style={{ color: "var(--text-muted)" }}>
            Sessions
          </p>
          {sessions.length === 0 ? (
            <p className="text-[12px] px-2 py-4 text-center" style={{ color: "var(--text-muted)" }}>
              No sessions yet
            </p>
          ) : (
            <ul className="space-y-0.5">
              {sessions.map((session) => (
                <li key={session.id}>
                  <div
                    className={`session-item w-full text-left group ${activeSessionId === session.id ? "active" : ""}`}
                    onClick={() => setActiveSession(session.id)}
                    id={`session-${session.id}`}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        setActiveSession(session.id);
                      }
                    }}
                  >
                    <MessageSquare
                      size={14}
                      className="flex-shrink-0"
                      style={{ color: activeSessionId === session.id ? "var(--accent-blue)" : "var(--text-muted)" }}
                    />
                    <span
                      className="flex-1 text-[13px] truncate font-medium"
                      style={{ color: activeSessionId === session.id ? "var(--text-primary)" : "var(--text-secondary)" }}
                    >
                      {session.title}
                    </span>
                    {sessions.length > 1 && (
                      <button
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-white/10"
                        onClick={(e) => handleDeleteSession(session.id, e)}
                        title="Delete session"
                      >
                        <Trash2 size={12} style={{ color: "var(--text-muted)" }} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="divider mx-4" />

        {/* Knowledge Base */}
        <div className="px-3 pb-2 space-y-3">
          <UploadWidget onSuccess={handleUploadSuccess} />
          <DocumentManager
            refreshTrigger={refreshTrigger}
            onDocumentsChange={setTotalChunks}
          />
        </div>

        {/* Footer */}
        <div
          className="px-4 py-3 mt-auto border-t"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
            <Layers size={11} />
            <span>{totalChunks} chunks indexed</span>
          </div>
        </div>
      </aside>

      {/* ─── Main Chat Area ───────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden" style={{ background: "var(--bg-primary)" }}>
        {/* Top Bar */}
        <header
          className="flex items-center justify-between px-6 py-3 flex-shrink-0"
          style={{ borderBottom: `1px solid var(--border-subtle)` }}
        >
          <div className="flex items-center gap-2">
            <ChevronRight size={14} style={{ color: "var(--text-muted)" }} />
            <span className="text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>
              {sessions.find((s) => s.id === activeSessionId)?.title ?? "Research Chat"}
            </span>
          </div>
          <StatusBar />
        </header>

        {/* Chat */}
        <div className="flex-1 overflow-hidden">
          {activeSessionId && (
            <ChatInterface
              key={activeSessionId}
              sessionId={activeSessionId}
              totalChunks={totalChunks}
            />
          )}
        </div>
      </main>
    </div>
  );
}
