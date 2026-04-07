"use client";

import { useEffect, useState, useCallback } from "react";
import {
  FileText, Trash2, RefreshCw, Database, ExternalLink, Clock,
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
    <div className="glass-card p-5 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <Database size={16} className="text-[var(--accent-primary)]" />
          Documents
          {documents.length > 0 && (
            <span className="badge badge-info text-[11px]">{documents.length}</span>
          )}
        </h2>
        <button
          id="refresh-docs-btn"
          className="btn-ghost p-2"
          onClick={loadDocuments}
          disabled={isLoading}
          title="Refresh"
        >
          <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Document List */}
      {documents.length === 0 ? (
        <div className="text-center py-6">
          <FileText size={28} className="mx-auto mb-2 text-[var(--text-muted)]" />
          <p className="text-xs text-[var(--text-muted)]">No documents yet</p>
        </div>
      ) : (
        <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {documents.map((doc) => (
            <li
              key={doc.doc_id}
              className="flex items-start gap-3 p-3 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[var(--border-subtle)] hover:border-[var(--border-medium)] transition-colors group"
            >
              {/* Icon */}
              <div className="w-8 h-8 rounded-lg bg-[rgba(99,102,241,0.1)] flex items-center justify-center flex-shrink-0 mt-0.5">
                {doc.source_url ? (
                  <ExternalLink size={13} className="text-[var(--accent-primary)]" />
                ) : (
                  <FileText size={13} className="text-[var(--accent-primary)]" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p
                  className="text-xs font-medium text-[var(--text-primary)] truncate"
                  title={doc.name}
                >
                  {doc.name}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] text-[var(--text-muted)]">
                    {doc.chunk_count} chunks
                  </span>
                  {doc.uploaded_at && (
                    <>
                      <span className="text-[var(--border-medium)]">·</span>
                      <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-1">
                        <Clock size={9} />
                        {formatDate(doc.uploaded_at)}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Delete */}
              <button
                id={`delete-doc-${doc.doc_id}`}
                className="btn-danger opacity-0 group-hover:opacity-100 transition-opacity p-1.5 mt-0.5"
                onClick={() => handleDelete(doc.doc_id)}
                disabled={deletingId === doc.doc_id}
                title="Delete document"
              >
                {deletingId === doc.doc_id ? (
                  <div className="spinner" style={{ width: 12, height: 12 }} />
                ) : (
                  <Trash2 size={12} />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Aggregate stats */}
      {documents.length > 0 && (
        <div className="border-t border-[var(--border-subtle)] pt-3 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
          <span>{documents.length} doc{documents.length > 1 ? "s" : ""}</span>
          <span>
            {documents.reduce((s, d) => s + d.chunk_count, 0)} total chunks
          </span>
        </div>
      )}
    </div>
  );
}
