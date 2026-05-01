"use client";

import { useEffect, useState, useCallback } from "react";
import { Cpu, Brain, CheckCircle2, XCircle } from "lucide-react";
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

  const connected = !error && health?.ollama_connected;

  return (
    <div className="flex items-center gap-3 animate-in">
      {/* Engine Status */}
      <div className="flex items-center gap-1.5">
        <Cpu size={12} style={{ color: "var(--text-muted)" }} />
        <span
          className="text-[11px] font-medium tracking-wide"
          style={{ color: "var(--text-muted)" }}
        >
          Engine
        </span>
        {connected ? (
          <CheckCircle2 size={11} style={{ color: "var(--success)" }} />
        ) : (
          <XCircle size={11} style={{ color: "var(--error)" }} />
        )}
      </div>

      {health && (
        <>
          <div className="w-px h-3" style={{ background: "var(--border-medium)" }} />
          {/* Active Model */}
          <div className="flex items-center gap-1.5">
            <Brain size={12} style={{ color: "var(--accent-primary)" }} />
            <span
              className="text-[11px] font-medium truncate max-w-[120px]"
              style={{ color: "var(--accent-primary)" }}
              title={health.models.join(", ")}
            >
              {health.models[0] || "No model loaded"}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
