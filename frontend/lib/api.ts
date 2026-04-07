/**
 * API client — thin wrapper over fetch for communicating with the FastAPI backend.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Citation {
  source: string;
  page: string | number;
  doc_id: string;
  score: number;
}

export interface UploadResponse {
  doc_id: string;
  source: string;
  chunks_processed: number;
  status: string;
}

export interface Document {
  doc_id: string;
  name: string;
  chunk_count: number;
  uploaded_at?: string;
  source_url?: string;
}

export interface StreamMeta {
  type: "meta";
  sub_queries: string[];
  is_multi_hop: boolean;
  strategy: string;
  citations: Citation[];
}

export interface StreamToken {
  type: "token";
  content: string;
}

export interface StreamDone {
  type: "done";
}

export type StreamEvent = StreamMeta | StreamToken | StreamDone;

export interface HealthStatus {
  status: string;
  ollama_connected: boolean;
  total_chunks: number;
  models: string[];
  version: string;
}

// ─── API Functions ────────────────────────────────────────────────────────────

export async function uploadPDF(
  file: File,
  onProgress?: (msg: string) => void
): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("doc_name", file.name);

  onProgress?.("Uploading PDF...");
  const res = await fetch(`${API_BASE}/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Upload failed");
  }
  onProgress?.("Processing document...");
  return res.json();
}

export async function uploadURL(
  url: string,
  docName?: string
): Promise<UploadResponse> {
  const res = await fetch(`${API_BASE}/upload/url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, doc_name: docName }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "URL upload failed");
  }
  return res.json();
}

export async function fetchDocuments(): Promise<Document[]> {
  const res = await fetch(`${API_BASE}/documents`);
  if (!res.ok) throw new Error("Failed to fetch documents");
  const data = await res.json();
  return data.documents as Document[];
}

export async function deleteDocument(docId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/documents/${docId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Delete failed");
}

export async function checkHealth(): Promise<HealthStatus> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error("Health check failed");
  return res.json();
}

/**
 * Query with streaming SSE.
 * Calls onMeta once, onToken for each token, onDone when finished.
 */
export async function queryStream(
  query: string,
  filterDocIds?: string[],
  callbacks?: {
    onMeta?: (meta: StreamMeta) => void;
    onToken?: (token: string) => void;
    onDone?: () => void;
    onError?: (err: Error) => void;
  }
): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, stream: true, filter_doc_ids: filterDocIds }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Query failed");
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const event: StreamEvent = JSON.parse(line.slice(6));
            if (event.type === "meta") callbacks?.onMeta?.(event);
            else if (event.type === "token") callbacks?.onToken?.(event.content);
            else if (event.type === "done") callbacks?.onDone?.();
          } catch {
            // Skip parse errors
          }
        }
      }
    }
  } catch (err) {
    callbacks?.onError?.(err as Error);
  }
}
