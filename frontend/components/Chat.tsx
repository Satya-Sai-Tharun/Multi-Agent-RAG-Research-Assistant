"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, Loader2, Bot, User, BookOpen, ChevronDown, ChevronUp, Zap, Network,
} from "lucide-react";
import { queryStream, Citation, StreamMeta } from "@/lib/api";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  citations?: Citation[];
  subQueries?: string[];
  isMultiHop?: boolean;
  strategy?: string;
}

interface ChatInterfaceProps {
  totalChunks: number;
}

export default function ChatInterface({ totalChunks }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [expandedCitations, setExpandedCitations] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => { scrollToBottom(); }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
    }
  }, [input]);

  const toggleCitations = (msgId: string) => {
    setExpandedCitations((prev) => {
      const next = new Set(prev);
      next.has(msgId) ? next.delete(msgId) : next.add(msgId);
      return next;
    });
  };

  const handleSubmit = useCallback(async () => {
    const query = input.trim();
    if (!query || isLoading) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: query,
    };
    const assistantId = `assistant-${Date.now()}`;
    const assistantMsg: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setIsLoading(true);

    let accumulated = "";
    let metaInfo: StreamMeta | null = null;

    await queryStream(query, undefined, {
      onMeta: (meta) => {
        metaInfo = meta;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  citations: meta.citations,
                  subQueries: meta.sub_queries,
                  isMultiHop: meta.is_multi_hop,
                  strategy: meta.strategy,
                }
              : m
          )
        );
      },
      onToken: (token) => {
        accumulated += token;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: accumulated } : m
          )
        );
      },
      onDone: () => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, isStreaming: false } : m
          )
        );
        setIsLoading(false);
      },
      onError: (err) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: `⚠️ Error: ${err.message}`,
                  isStreaming: false,
                }
              : m
          )
        );
        setIsLoading(false);
      },
    });
  }, [input, isLoading]);

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Message Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {isEmpty ? (
          <EmptyState hasDocuments={totalChunks > 0} />
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              showCitations={expandedCitations.has(msg.id)}
              onToggleCitations={() => toggleCitations(msg.id)}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-[var(--border-subtle)] p-4">
        <div className="flex gap-3 items-end max-w-4xl mx-auto">
          <div className="flex-1 relative">
            <textarea
              id="chat-input"
              ref={textareaRef}
              rows={1}
              className="input-field pr-4 min-h-[48px]"
              placeholder={
                totalChunks > 0
                  ? "Ask anything about your documents..."
                  : "Upload a document first to start querying..."
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              disabled={isLoading || totalChunks === 0}
            />
          </div>
          <button
            id="chat-send-btn"
            className="btn-primary h-12 px-5"
            onClick={handleSubmit}
            disabled={isLoading || !input.trim() || totalChunks === 0}
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
        <p className="text-xs text-[var(--text-muted)] text-center mt-2">
          Press <kbd className="px-1 py-0.5 bg-[rgba(255,255,255,0.06)] rounded text-xs">Enter</kbd> to send, <kbd className="px-1 py-0.5 bg-[rgba(255,255,255,0.06)] rounded text-xs">Shift+Enter</kbd> for newline
        </p>
      </div>
    </div>
  );
}

// ─── Message Bubble ────────────────────────────────────────────────────────────

function MessageBubble({
  message,
  showCitations,
  onToggleCitations,
}: {
  message: Message;
  showCitations: boolean;
  onToggleCitations: () => void;
}) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-4 ${isUser ? "flex-row-reverse" : "flex-row"} max-w-4xl mx-auto`}>
      {/* Avatar */}
      <div
        className={`w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center ${
          isUser
            ? "bg-[rgba(99,102,241,0.2)] border border-[rgba(99,102,241,0.3)]"
            : "bg-[rgba(139,92,246,0.15)] border border-[rgba(139,92,246,0.25)]"
        }`}
      >
        {isUser ? (
          <User size={16} className="text-[var(--accent-primary)]" />
        ) : (
          <Bot size={16} className="text-[var(--accent-secondary)]" />
        )}
      </div>

      {/* Content */}
      <div className={`flex-1 ${isUser ? "items-end" : "items-start"} flex flex-col gap-2`}>
        {/* Meta chips (for assistant messages) */}
        {!isUser && (message.isMultiHop || message.strategy) && (
          <div className="flex flex-wrap gap-2">
            {message.isMultiHop && (
              <span className="badge badge-info text-[11px]">
                <Network size={10} /> Multi-hop
              </span>
            )}
            {message.strategy && (
              <span className="badge badge-info text-[11px]">
                <Zap size={10} /> {message.strategy} search
              </span>
            )}
            {message.subQueries && message.subQueries.length > 1 && (
              <span className="badge badge-info text-[11px]">
                {message.subQueries.length} sub-queries
              </span>
            )}
          </div>
        )}

        {/* Bubble */}
        <div
          className={`rounded-2xl px-4 py-3 max-w-[80%] ${
            isUser
              ? "bg-[rgba(99,102,241,0.15)] border border-[rgba(99,102,241,0.25)] ml-auto"
              : "glass-card"
          }`}
        >
          {message.content ? (
            <p
              className={`text-sm leading-relaxed whitespace-pre-wrap ${
                message.isStreaming ? "cursor-blink" : ""
              }`}
              style={{ color: isUser ? "var(--text-primary)" : "var(--text-secondary)" }}
            >
              {message.content}
            </p>
          ) : (
            <div className="flex items-center gap-2 text-[var(--text-muted)]">
              <Loader2 size={14} className="animate-spin" />
              <span className="text-sm">Thinking...</span>
            </div>
          )}
        </div>

        {/* Citations toggle */}
        {!isUser && message.citations && message.citations.length > 0 && (
          <div className="w-full max-w-[80%]">
            <button
              className="flex items-center gap-2 text-xs text-[var(--text-muted)] hover:text-[var(--accent-primary)] transition-colors"
              onClick={onToggleCitations}
            >
              <BookOpen size={12} />
              {message.citations.length} source{message.citations.length > 1 ? "s" : ""}
              {showCitations ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {showCitations && (
              <div className="mt-2 flex flex-col gap-2">
                {message.citations.map((c, i) => (
                  <div key={i} className="citation-card">
                    <BookOpen size={11} className="text-[var(--accent-primary)] flex-shrink-0" />
                    <span><span className="source-name">{c.source}</span>, Page {c.page}</span>
                    <span className="ml-auto text-[var(--text-muted)]">
                      {(c.score * 100).toFixed(0)}% match
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({ hasDocuments }: { hasDocuments: boolean }) {
  const suggestions = [
    "What are the main findings of this paper?",
    "Summarize the methodology used in this research.",
    "What conclusions does the author draw?",
    "Compare the approaches described in section 2 and 3.",
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-6 text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-[rgba(99,102,241,0.1)] border border-[rgba(99,102,241,0.2)] flex items-center justify-center">
        <Bot size={28} className="text-[var(--accent-primary)]" />
      </div>
      <div>
        <h3 className="text-xl font-bold gradient-text mb-2">
          {hasDocuments ? "Ready to answer your questions" : "Start by uploading a document"}
        </h3>
        <p className="text-sm text-[var(--text-muted)] max-w-sm">
          {hasDocuments
            ? "Ask anything about your documents. Multi-hop reasoning and citations are fully supported."
            : "Upload a PDF or provide a URL using the sidebar to get started."}
        </p>
      </div>
      {hasDocuments && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl w-full">
          {suggestions.map((s, i) => (
            <button
              key={i}
              className="text-left px-3 py-2.5 rounded-xl border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] hover:border-[var(--border-accent)] hover:bg-[rgba(99,102,241,0.05)] transition-all"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
