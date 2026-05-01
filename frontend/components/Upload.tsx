"use client";

import { useState, useCallback } from "react";
import { Upload, Link2, FileText, Loader2, CheckCircle2, AlertCircle, X, ChevronRight } from "lucide-react";
import { uploadPDF, uploadURL, UploadResponse } from "@/lib/api";

interface UploadWidgetProps {
  onSuccess?: () => void;
}

type UploadMode = "file" | "url";

export default function UploadWidget({ onSuccess }: UploadWidgetProps) {
  const [mode, setMode] = useState<UploadMode>("file");
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");

  const resetState = () => {
    setStatusMsg(null);
    setError(null);
    setIsLoading(false);
  };

  // ─── PDF Upload ────────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are supported at this time.");
      return;
    }
    resetState();
    setIsLoading(true);

    try {
      const result = await uploadPDF(file, setStatusMsg);
      setStatusMsg(`Ingested ${result.chunks_processed} chunks successfully`);
      onSuccess?.();
    } catch (err: unknown) {
      setError((err as Error).message || "Upload failed");
    } finally {
      setIsLoading(false);
    }
  }, [onSuccess]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  // ─── URL Upload ────────────────────────────────────────────────────────────
  const handleURLSubmit = async () => {
    if (!url.trim()) return;
    resetState();
    setIsLoading(true);
    setStatusMsg("Fetching and processing content...");

    try {
      const result = await uploadURL(url.trim());
      setStatusMsg(`Ingested ${result.chunks_processed} chunks from source`);
      onSuccess?.();
      setUrl("");
    } catch (err: unknown) {
      setError((err as Error).message || "Source ingestion failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-xs)" }} className="p-4 animate-in">
      <div className="flex items-center gap-2 mb-4">
        <Upload size={13} style={{ color: "var(--accent-primary)" }} />
        <h2 className="text-[11px] font-bold tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
          Add Source
        </h2>
      </div>

      {/* Mode Toggle */}
      <div className="flex p-1 mb-4 gap-1" style={{ background: "var(--bg-input)", borderRadius: "var(--radius-xs)" }}>
        <button
          id="upload-mode-file"
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[12px] font-medium transition-all`}
          style={{
            borderRadius: "3px",
            background: mode === "file" ? "var(--bg-card-high)" : "transparent",
            color: mode === "file" ? "var(--text-primary)" : "var(--text-muted)",
          }}
          onClick={() => setMode("file")}
        >
          <FileText size={11} />
          Document
        </button>
        <button
          id="upload-mode-url"
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[12px] font-medium transition-all`}
          style={{
            borderRadius: "3px",
            background: mode === "url" ? "var(--bg-card-high)" : "transparent",
            color: mode === "url" ? "var(--text-primary)" : "var(--text-muted)",
          }}
          onClick={() => setMode("url")}
        >
          <Link2 size={11} />
          Web Link
        </button>
      </div>

      {/* File Drop Zone */}
      {mode === "file" && (
        <label
          htmlFor="pdf-upload-input"
          className={`drop-zone block ${isDragging ? "drag-over" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <input
            id="pdf-upload-input"
            type="file"
            accept=".pdf"
            className="sr-only"
            onChange={handleFileInput}
            disabled={isLoading}
          />
          <div className="flex flex-col items-center gap-2">
            {isLoading ? (
              <div className="spinner" />
            ) : (
              <div
                className="w-8 h-8 flex items-center justify-center"
                style={{ background: "rgba(46,91,255,0.10)", borderRadius: "var(--radius-xs)" }}
              >
                <FileText size={15} style={{ color: "var(--accent-primary)" }} />
              </div>
            )}
            <div>
              <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
                {isLoading ? "Processing..." : "Drop PDF here"}
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                or click to browse (max 50MB)
              </p>
            </div>
          </div>
        </label>
      )}

      {/* URL Input */}
      {mode === "url" && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2" style={{ background: "var(--bg-input)", border: "1px solid var(--border-medium)", borderRadius: "var(--radius-xs)", padding: "8px 12px" }}>
            <Link2 size={13} style={{ color: "var(--text-muted)" }} />
            <input
              id="url-upload-input"
              type="url"
              style={{ background: "transparent", border: "none", outline: "none", flex: 1, fontSize: "13px", color: "var(--text-primary)", fontFamily: "var(--font-inter)" }}
              placeholder="https://example.com/article"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleURLSubmit()}
              disabled={isLoading}
            />
          </div>
          <button
            id="url-upload-btn"
            className="btn-primary justify-center w-full py-2"
            onClick={handleURLSubmit}
            disabled={isLoading || !url.trim()}
          >
            {isLoading ? <div className="spinner w-4 h-4" /> : <ChevronRight size={13} />}
            {isLoading ? "Processing..." : "Ingest Source"}
          </button>
        </div>
      )}

      {/* Status Messages */}
      {statusMsg && !error && (
        <div className="mt-3 flex items-start gap-2 text-[12px] p-2.5" style={{ color: "var(--success)", background: "rgba(78,222,163,0.06)", border: "1px solid rgba(78,222,163,0.15)", borderRadius: "var(--radius-xs)" }}>
          <CheckCircle2 size={13} className="flex-shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}
      {error && (
        <div className="mt-3 flex items-start gap-2 text-[12px] p-2.5 relative" style={{ color: "var(--error)", background: "rgba(255,180,171,0.06)", border: "1px solid rgba(255,180,171,0.15)", borderRadius: "var(--radius-xs)" }}>
          <AlertCircle size={13} className="flex-shrink-0" />
          <span className="pr-5">{error}</span>
          <button onClick={() => setError(null)} className="absolute top-2.5 right-2.5 opacity-60 hover:opacity-100 transition-opacity">
            <X size={11} style={{ color: "var(--error)" }} />
          </button>
        </div>
      )}
    </div>
  );
}
