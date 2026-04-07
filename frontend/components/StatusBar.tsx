"use client";

import { useEffect, useState, useCallback } from "react";
import { Brain, Cpu, Layers, CheckCircle2, XCircle, ChevronRight } from "lucide-react";
import { checkHealth, HealthStatus } from "@/lib/api";

export default function StatusBar() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [error, setError] = useState(false);

  const fetchHealth = useCallback(async () => {
    try {
      const data = await checkHealth();
      setHealth(data);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30_000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  return (
    <div className="flex items-center gap-5 px-2">
      {/* Ollama Status */}
      <div className="flex items-center gap-2 text-xs">
        <Cpu size={12} className="text-[var(--text-muted)]" />
        <span className="text-[var(--text-muted)]">Ollama</span>
        {error || !health ? (
          <XCircle size={12} className="text-[var(--error)]" />
        ) : health.ollama_connected ? (
          <CheckCircle2 size={12} className="text-[var(--success)]" />
        ) : (
          <XCircle size={12} className="text-[var(--error)]" />
        )}
      </div>

      {/* Chunks in DB */}
      {health && (
        <div className="flex items-center gap-2 text-xs">
          <Layers size={12} className="text-[var(--text-muted)]" />
          <span className="text-[var(--text-muted)]">{health.total_chunks} chunks</span>
        </div>
      )}

      {/* Models */}
      {health && health.models.length > 0 && (
        <div className="flex items-center gap-2 text-xs hidden sm:flex">
          <Brain size={12} className="text-[var(--text-muted)]" />
          <span className="text-[var(--text-muted)] truncate max-w-32" title={health.models.join(", ")}>
            {health.models[0]}
          </span>
        </div>
      )}
    </div>
  );
}
