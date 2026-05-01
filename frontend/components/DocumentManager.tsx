"use client";

import { useEffect, useState, useCallback } from "react";
import {
  FileText, Trash2, RefreshCw, Database, ExternalLink, Clock, FileCheck2
} from "lucide-react";
import { fetchDocuments, deleteDocument, Document } from "@/lib/api";

interface DocumentManagerProps {
  refreshTrigger: number;
  onDocumentsChange: (count: number) => void;
}

export default function DocumentManager({
  refreshTrigger,
  onDocumentsChange,
}: DocumentManagerProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    setIsLoading(true);
    try {
      const docs = await fetchDocuments();
      setDocuments(docs);
      const total = docs.reduce((sum, d) => sum + d.chunk_count, 0);
      onDocumentsChange(total);
    } catch (err) {
      console.error("Failed to load documents:", err);
    } finally {
      setIsLoading(false);
    }
  }, [onDocumentsChange]);

  useEffect(() => { loadDocuments(); }, [loadDocuments, refreshTrigger]);

  const handleDelete = async (docId: string) => {
    setDeletingId(docId);
    try {
      await deleteDocument(docId);
      setDocuments((prev) => prev.filter((d) => d.doc_id !== docId));
      const remaining = documents.filter((d) => d.doc_id !== docId);
      const total = remaining.reduce((sum, d) => sum + d.chunk_count, 0);
      onDocumentsChange(total);
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (iso?: string) => {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="glass-card p-5 flex flex-col gap-4 animate-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2 tracking-wide uppercase">
          <Database size={14} className="text-[var(--accent-primary)]" />
          KNOWLEDGE BASE
        </h2>
        <div className="flex items-center gap-2">
          {documents.length > 0 && (
            <span className="badge badge-info py-0.5 px-2 bg-[rgba(129,140,248,0.15)] border-none">
              {documents.length}
            </span>
          )}
          <button
            id="refresh-docs-btn"
            className="btn-ghost p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.05)]"
            onClick={loadDocuments}
            disabled={isLoading}
            title="Refresh"
          >
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Document List */}
      {documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 px-4 text-center border border-dashed border-[var(--border-subtle)] rounded-xl bg-[rgba(255,255,255,0.01)]">
          <div className="w-12 h-12 rounded-full bg-[rgba(255,255,255,0.03)] flex items-center justify-center mb-3">
            <FileText size={20} className="text-[var(--text-muted)]" />
          </div>
          <p className="text-sm font-medium text-[var(--text-primary)] mb-1">No Sources Yet</p>
          <p className="text-xs text-[var(--text-muted)]">Upload a document to build your knowledge base.</p>
        </div>
      ) : (
        <ul className="space-y-2.5 max-h-72 overflow-y-auto pr-1 pb-1">
          {documents.map((doc) => (
            <li
              key={doc.doc_id}
              className="flex items-start gap-3 p-3.5 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[var(--border-subtle)] hover:border-[var(--border-medium)] hover:bg-[rgba(255,255,255,0.04)] transition-all group shadow-sm hover:shadow-md relative overflow-hidden"
            >
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-[var(--accent-gradient)] opacity-0 group-hover:opacity-100 transition-opacity" />
              
              {/* Icon */}
              <div className="w-9 h-9 rounded-lg bg-[rgba(129,140,248,0.1)] flex items-center justify-center flex-shrink-0 mt-0.5 border border-[rgba(129,140,248,0.15)]">
                {doc.source_url ? (
                  <ExternalLink size={16} className="text-[var(--accent-primary)]" />
                ) : (
                  <FileCheck2 size={16} className="text-[var(--accent-primary)]" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <p
                  className="text-[13px] font-medium text-[var(--text-primary)] truncate"
                  title={doc.name}
                >
                  {doc.name}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] font-medium text-[var(--success)] bg-[rgba(52,211,153,0.1)] px-1.5 py-0.5 rounded uppercase tracking-wider">
                    {doc.chunk_count} {doc.chunk_count === 1 ? 'CHUNK' : 'CHUNKS'}
                  </span>
                  {doc.uploaded_at && (
                    <>
                      <span className="text-[var(--border-medium)]">·</span>
                      <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-1 font-medium tracking-wide">
                        <Clock size={10} />
                        {formatDate(doc.uploaded_at)}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Delete */}
              <button
                id={`delete-doc-${doc.doc_id}`}
                className="btn-danger opacity-0 group-hover:opacity-100 transition-all p-2 rounded-lg mt-0.5 bg-[rgba(248,113,113,0.1)] border-transparent hover:border-[rgba(248,113,113,0.3)] hover:bg-[rgba(248,113,113,0.15)]"
                onClick={() => handleDelete(doc.doc_id)}
                disabled={deletingId === doc.doc_id}
                title="Delete document"
              >
                {deletingId === doc.doc_id ? (
                  <div className="spinner w-3.5 h-3.5 border-t-[var(--error)]" />
                ) : (
                  <Trash2 size={14} className="text-[var(--error)]" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Aggregate stats */}
      {documents.length > 0 && (
        <div className="border-t border-[var(--border-subtle)] pt-4 mt-1 flex items-center justify-between text-xs text-[var(--text-muted)] font-medium tracking-wide">
          <span>{documents.length} SOURCE{documents.length > 1 ? "S" : ""} INDEXED</span>
          <span className="text-[var(--accent-primary)]">
            {documents.reduce((s, d) => s + d.chunk_count, 0)} TOTAL CHUNKS
          </span>
        </div>
      )}
    </div>
  );
}
