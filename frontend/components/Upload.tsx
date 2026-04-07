"use client";

import { useState, useCallback } from "react";
import { Upload, Link2, FileText, Loader2, CheckCircle2, AlertCircle, X } from "lucide-react";
import { uploadPDF, uploadURL, UploadResponse } from "@/lib/api";

interface UploadWidgetProps {
  onUploadSuccess: (response: UploadResponse) => void;
}

type UploadMode = "file" | "url";

export default function UploadWidget({ onUploadSuccess }: UploadWidgetProps) {
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
      setError("Only PDF files are supported.");
      return;
    }
    resetState();
    setIsLoading(true);

    try {
      const result = await uploadPDF(file, setStatusMsg);
      setStatusMsg(`✓ Ingested ${result.chunks_processed} chunks`);
      onUploadSuccess(result);
    } catch (err: unknown) {
      setError((err as Error).message || "Upload failed");
    } finally {
      setIsLoading(false);
    }
  }, [onUploadSuccess]);

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
    setStatusMsg("Fetching URL content...");

    try {
      const result = await uploadURL(url.trim());
      setStatusMsg(`✓ Ingested ${result.chunks_processed} chunks from URL`);
      onUploadSuccess(result);
      setUrl("");
    } catch (err: unknown) {
      setError((err as Error).message || "URL ingestion failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="glass-card p-5">
      <h2 className="text-base font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
        <Upload size={16} className="text-[var(--accent-primary)]" />
        Add Documents
      </h2>

      {/* Mode Toggle */}
      <div className="flex gap-2 mb-4">
        <button
          id="upload-mode-file"
          className={`btn-ghost flex-1 justify-center rounded-lg py-2 text-xs ${
            mode === "file"
              ? "!bg-[rgba(99,102,241,0.12)] !text-[var(--accent-primary)] !border !border-[rgba(99,102,241,0.3)]"
              : ""
          }`}
          onClick={() => setMode("file")}
        >
          <FileText size={13} />
          PDF
        </button>
        <button
          id="upload-mode-url"
          className={`btn-ghost flex-1 justify-center rounded-lg py-2 text-xs ${
            mode === "url"
              ? "!bg-[rgba(99,102,241,0.12)] !text-[var(--accent-primary)] !border !border-[rgba(99,102,241,0.3)]"
              : ""
          }`}
          onClick={() => setMode("url")}
        >
          <Link2 size={13} />
          URL
        </button>
      </div>

      {/* File Drop Zone */}
      {mode === "file" && (
        <label
          htmlFor="pdf-upload-input"
          className={`drop-zone block cursor-pointer ${isDragging ? "drag-over" : ""}`}
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
          <div className="flex flex-col items-center gap-3">
            {isLoading ? (
              <Loader2 size={28} className="animate-spin text-[var(--accent-primary)]" />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-[rgba(99,102,241,0.1)] flex items-center justify-center">
                <FileText size={22} className="text-[var(--accent-primary)]" />
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {isLoading ? "Processing..." : "Drop PDF here"}
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                or click to browse (max 50MB)
              </p>
            </div>
          </div>
        </label>
      )}

      {/* URL Input */}
      {mode === "url" && (
        <div className="flex flex-col gap-3">
          <input
            id="url-upload-input"
            type="url"
            className="input-field text-sm"
            placeholder="https://example.com/article"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleURLSubmit()}
            disabled={isLoading}
          />
          <button
            id="url-upload-btn"
            className="btn-primary justify-center"
            onClick={handleURLSubmit}
            disabled={isLoading || !url.trim()}
          >
            {isLoading ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
            {isLoading ? "Ingesting..." : "Ingest URL"}
          </button>
        </div>
      )}

      {/* Status Messages */}
      {statusMsg && !error && (
        <div className="mt-3 flex items-center gap-2 text-xs text-[var(--success)] bg-[rgba(16,185,129,0.08)] border border-[rgba(16,185,129,0.2)] rounded-lg px-3 py-2">
          <CheckCircle2 size={13} />
          {statusMsg}
        </div>
      )}
      {error && (
        <div className="mt-3 flex items-center justify-between text-xs text-[var(--error)] bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.2)] rounded-lg px-3 py-2">
          <span className="flex items-center gap-2">
            <AlertCircle size={13} />
            {error}
          </span>
          <button onClick={() => setError(null)}><X size={12} /></button>
        </div>
      )}
    </div>
  );
}
