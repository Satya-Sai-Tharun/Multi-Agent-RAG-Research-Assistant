"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Loader2, Bot, User, BookOpen, ChevronDown, ChevronUp, Zap, Network, ArrowUp, Sparkles
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { queryStream, Citation, StreamMeta } from "@/lib/api";
import { useAppStore, HistoryMessage } from "@/lib/store";

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
  sessionId: string;
  totalChunks: number;
}

export default function ChatInterface({
  sessionId,
  totalChunks,
}: ChatInterfaceProps) {
  const { messages: storeMessages, appendMessage, updateMessage } = useAppStore();
  const sessionMessages = storeMessages[sessionId] || [];
  
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [expandedCitations, setExpandedCitations] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);



  const scrollToBottom = () =>
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });

  useEffect(() => { scrollToBottom(); }, [sessionMessages]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
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

    const userMsgId = `user-${Date.now()}`;
    const assistantId = `assistant-${Date.now()}`;

    appendMessage(sessionId, { id: userMsgId, role: "user", content: query });
    
    // Add empty assistant message that will stream
    appendMessage(sessionId, { id: assistantId, role: "assistant", content: "", isStreaming: true });
    
    setInput("");
    setIsLoading(true);

    // Build history (last 6 messages before the user message we just added)
    const history = (storeMessages[sessionId] || []).slice(-7, -1);
    
    let accumulated = "";

    await queryStream(
      query,
      undefined,
      {
        onMeta: (meta) => {
          updateMessage(sessionId, assistantId, {
            citations: meta.citations,
            subQueries: meta.sub_queries,
            isMultiHop: meta.is_multi_hop,
            strategy: meta.strategy,
          });
        },
        onToken: (token) => {
          accumulated += token;
          updateMessage(sessionId, assistantId, { content: accumulated });
        },
        onDone: () => {
          updateMessage(sessionId, assistantId, { isStreaming: false });
          setIsLoading(false);
        },
        onError: (err) => {
          const errMsg = `⚠️ Error: ${err.message}`;
          updateMessage(sessionId, assistantId, { content: errMsg, isStreaming: false });
          setIsLoading(false);
        },
      },
      history
    );
  }, [input, isLoading, sessionId, appendMessage, updateMessage, storeMessages]);

  const isEmpty = sessionMessages.length === 0;

  return (
    <div className="flex flex-col h-full relative">
      {/* Message Area */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-10 pt-8 pb-4">
        {isEmpty ? (
          <EmptyState hasDocuments={totalChunks > 0} setInput={setInput} />
        ) : (
          <div className="space-y-8 max-w-5xl mx-auto">
            <AnimatePresence initial={false}>
              {sessionMessages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <MessageBubble
                    message={msg as Message}
                    showCitations={expandedCitations.has(msg.id)}
                    onToggleCitations={() => toggleCitations(msg.id)}
                  />
                </motion.div>
              ))}
              </AnimatePresence>
            <div ref={bottomRef} className="h-4" />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div
        className="w-full px-4 sm:px-10 pb-6 pt-2 relative flex-shrink-0"
        style={{ background: "var(--bg-primary)" }}
      >
        <div 
          className="absolute top-[-40px] left-0 right-0 h-[40px] pointer-events-none"
          style={{ background: "linear-gradient(to top, var(--bg-primary) 0%, transparent 100%)" }}
        />
        <div className="max-w-5xl mx-auto">
          <div className="floating-input flex items-end gap-2 px-4 py-3">
            <textarea
              id="chat-input"
              ref={textareaRef}
              rows={1}
              className="input-field flex-1 py-1 px-0"
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
            <button
              id="chat-send-btn"
              className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                input.trim() && !isLoading && totalChunks > 0
                  ? "text-white"
                  : "opacity-40"
              }`}
              style={{
                background:
                  input.trim() && !isLoading && totalChunks > 0
                    ? "var(--accent-gradient)"
                    : "var(--bg-card-high)",
                transform:
                  input.trim() && !isLoading && totalChunks > 0
                    ? "scale(1)"
                    : "scale(0.9)",
              }}
              onClick={handleSubmit}
              disabled={isLoading || !input.trim() || totalChunks === 0}
            >
              {isLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <ArrowUp size={17} strokeWidth={2.5} />
              )}
            </button>
          </div>
          <p
            className="text-center mt-2 text-[11px] tracking-wide"
            style={{ color: "var(--text-muted)" }}
          >
            AI can make mistakes — verify important information from citations.
          </p>
        </div>
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
    <div className={`flex gap-4 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      <div
        className="w-9 h-9 rounded flex-shrink-0 flex items-center justify-center"
        style={{
          background: isUser ? "var(--bg-card-high)" : "var(--accent-gradient)",
          border: `1px solid ${isUser ? "var(--border-medium)" : "transparent"}`,
          borderRadius: "var(--radius-xs)",
        }}
      >
        {isUser ? (
          <User size={16} style={{ color: "var(--text-secondary)" }} />
        ) : (
          <Bot size={18} className="text-white" strokeWidth={2} />
        )}
      </div>

      {/* Content */}
      <div className={`flex-1 flex flex-col gap-2 max-w-[95%] ${isUser ? "items-end" : "items-start"}`}>
        {/* Meta chips */}
        {!isUser && (message.isMultiHop || message.strategy) && (
          <div className="flex flex-wrap gap-1.5 mb-1">
            {message.isMultiHop && (
              <span className="badge badge-info">
                <Network size={10} /> Multi-hop reasoning
              </span>
            )}
            {message.strategy && (
              <span className="badge badge-info">
                <Zap size={10} /> {message.strategy}
              </span>
            )}
            {message.subQueries && message.subQueries.length > 1 && (
              <span className="badge badge-info">
                {message.subQueries.length} sub-queries
              </span>
            )}
          </div>
        )}

        {/* Bubble */}
        <div
          className={`rounded px-5 py-4 w-full`}
          style={{
            borderRadius: "var(--radius-sm)",
            background: isUser ? "var(--bg-card-high)" : "transparent",
            border: isUser ? `1px solid var(--border-medium)` : "none",
            padding: isUser ? undefined : "0",
          }}
        >
          {message.content ? (
            <div
              className={`text-[15px] leading-relaxed whitespace-pre-wrap ${message.isStreaming ? "cursor-blink" : ""}`}
              style={{ color: "var(--text-primary)" }}
            >
              {message.content}
            </div>
          ) : (
            <div className="flex items-center gap-3 py-2" style={{ color: "var(--text-secondary)" }}>
              <div className="flex gap-1">
                {[0, 150, 300].map((delay) => (
                  <div
                    key={delay}
                    className="w-2 h-2 rounded-full animate-bounce"
                    style={{ background: "var(--accent-blue)", animationDelay: `${delay}ms` }}
                  />
                ))}
              </div>
              <span className="text-[13px] font-medium tracking-wide">Synthesizing...</span>
            </div>
          )}
        </div>

        {/* Citations */}
        {!isUser && message.citations && message.citations.length > 0 && (
          <div className="w-full mt-1">
            <button
              className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded transition-all"
              style={{
                color: "var(--text-muted)",
                background: "var(--bg-card)",
                border: `1px solid var(--border-subtle)`,
                borderRadius: "var(--radius-xs)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "var(--accent-primary)";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-accent)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-subtle)";
              }}
              onClick={onToggleCitations}
            >
              <BookOpen size={12} />
              {message.citations.length} Source{message.citations.length > 1 ? "s" : ""}
              {showCitations ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>

            {showCitations && (
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 animate-in">
                {message.citations.map((c, i) => (
                  <div key={i} className="citation-card">
                    <BookOpen size={13} style={{ color: "var(--accent-primary)", flexShrink: 0 }} />
                    <div className="min-w-0 flex-1">
                      <p className="source-name truncate text-[13px]">{c.source}</p>
                      {c.page && (
                        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                          Page {c.page}
                        </p>
                      )}
                    </div>
                    <div
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{
                        background: "rgba(78,222,163,0.12)",
                        color: "var(--success)",
                        borderRadius: "3px",
                      }}
                    >
                      {(c.score * 100).toFixed(0)}%
                    </div>
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

function EmptyState({
  hasDocuments,
  setInput,
}: {
  hasDocuments: boolean;
  setInput: (s: string) => void;
}) {
  const suggestions = [
    "What are the main findings of this document?",
    "Summarize the methodology used.",
    "What conclusions does the author draw?",
    "Identify the key risk factors discussed.",
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[500px] gap-8 text-center px-4 animate-in">
      {/* Icon */}
      <div
        className="w-16 h-16 flex items-center justify-center relative overflow-hidden"
        style={{
          background: "var(--bg-card-high)",
          border: `1px solid var(--border-medium)`,
          borderRadius: "var(--radius-md)",
        }}
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{ background: "var(--accent-gradient)" }}
        />
        <Sparkles size={28} style={{ color: "var(--accent-primary)" }} />
      </div>

      <div className="max-w-md">
        <h3
          className="text-2xl font-bold mb-3 tracking-tight"
          style={{ color: "var(--text-primary)" }}
        >
          {hasDocuments ? "How can I help you today?" : "Welcome to RAG Research"}
        </h3>
        <p className="text-[15px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {hasDocuments
            ? "Ask questions about your documents. I can perform multi-hop reasoning across sources and remember our conversation."
            : "Upload a PDF or provide a web link in the sidebar to start building your knowledge base."}
        </p>
      </div>

      {hasDocuments && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl w-full">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => setInput(s)}
              className="text-left px-4 py-3.5 flex items-start gap-3 group transition-all"
              style={{
                background: "var(--bg-card)",
                border: `1px solid var(--border-subtle)`,
                borderRadius: "var(--radius-xs)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-accent)";
                (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-card-high)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-subtle)";
                (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-card)";
              }}
            >
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: "rgba(46,91,255,0.15)" }}
              >
                <ArrowUp size={11} style={{ color: "var(--accent-primary)" }} />
              </div>
              <span className="text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>
                {s}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
