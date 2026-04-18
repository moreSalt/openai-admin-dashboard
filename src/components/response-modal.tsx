"use client";

import { useEffect, useState, useCallback } from "react";
import { X, Loader2, AlertCircle } from "lucide-react";
import { ContentRenderer } from "./content-renderer";
import { estimateCost } from "@/lib/pricing";

type ResponseRow = {
  custom_id: string | null;
  status_code: number | null;
  id: string | null;
  model: string | null;
  duration_s: number | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cached_tokens: number;
    reasoning_tokens: number;
  } | null;
  format_type: string | null;
  format_name: string | null;
  reasoning_effort: string | null;
  output_text: string | null;
  raw_body: Record<string, unknown> | null;
  error: unknown;
};

type InputItemContent =
  | { type: "input_text"; text: string }
  | { type: string; [key: string]: unknown };

type InputItem = {
  id: string;
  type: string;
  role: string;
  status: string;
  content: InputItemContent[];
};

type Tab = "conversation" | "raw";

function RoleLabel({ role }: { role: string }) {
  const color =
    role === "system"
      ? "text-[var(--fg-muted)]"
      : role === "assistant"
        ? "text-[var(--brand)]"
        : "text-[var(--fg-secondary)]";
  return (
    <span className={`label-mono shrink-0 pt-0.5 w-16 text-right ${color}`}>
      {role}
    </span>
  );
}

export function ResponseModal({
  row,
  batchModel,
  onClose,
}: {
  row: ResponseRow;
  batchModel: string | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("conversation");
  const [inputItems, setInputItems] = useState<InputItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInputItems = useCallback(async () => {
    if (!row.id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/responses/${row.id}/input_items`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setInputItems(body.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [row.id]);

  useEffect(() => {
    fetchInputItems();
  }, [fetchInputItems]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const model = row.model ?? batchModel ?? "";
  const cost = row.usage && model
    ? estimateCost(
        {
          input_tokens: row.usage.input_tokens,
          output_tokens: row.usage.output_tokens,
          total_tokens: row.usage.total_tokens,
          input_tokens_details: { cached_tokens: row.usage.cached_tokens },
          output_tokens_details: { reasoning_tokens: row.usage.reasoning_tokens },
        },
        model,
      )
    : null;

  const statusOk = (row.status_code ?? 200) < 400;
  const durationLabel = row.duration_s != null
    ? row.duration_s < 1
      ? `${Math.round(row.duration_s * 1000)}ms`
      : `${row.duration_s.toFixed(1)}s`
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-xl border border-[var(--border-strong)] bg-[var(--bg)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4 border-b border-[var(--border)] shrink-0">
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`label-mono text-xs px-1.5 py-0.5 rounded border ${
                  statusOk
                    ? "border-[var(--brand-border)] text-[var(--brand)] bg-[rgba(62,207,142,0.08)]"
                    : "border-[rgba(229,72,77,0.3)] text-[var(--danger)] bg-[rgba(229,72,77,0.05)]"
                }`}
              >
                {row.status_code ?? "—"}
              </span>
              {durationLabel && (
                <span className="label-mono text-xs text-[var(--fg-muted)]">{durationLabel}</span>
              )}
              {model && (
                <span className="label-mono text-xs text-[var(--fg-muted)]">{model}</span>
              )}
              {cost && (
                <span className="label-mono text-xs text-[var(--fg-muted)]">${cost.total.toFixed(4)}</span>
              )}
            </div>
            {row.custom_id && (
              <span className="mono text-xs text-[var(--fg-muted)] truncate">{row.custom_id}</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors mt-0.5"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* tabs */}
        <div className="flex items-center border-b border-[var(--border)] px-5 shrink-0">
          {(["conversation", "raw"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-xs capitalize border-b-2 -mb-px transition-colors ${
                tab === t
                  ? "border-[var(--brand)] text-[var(--fg)]"
                  : "border-transparent text-[var(--fg-muted)] hover:text-[var(--fg)]"
              }`}
            >
              {t === "raw" ? "Raw JSON" : "Conversation"}
            </button>
          ))}
        </div>

        {/* body */}
        <div className="overflow-y-auto flex-1 px-5 py-4">
          {tab === "conversation" && (
            <div className="flex flex-col gap-4">
              {loading && (
                <div className="flex items-center gap-2 text-xs text-[var(--fg-muted)]">
                  <Loader2 className="size-3.5 animate-spin" />
                  Loading messages…
                </div>
              )}
              {error && (
                <div className="flex items-center gap-2 text-xs text-[var(--danger)]">
                  <AlertCircle className="size-3.5" />
                  {error}
                </div>
              )}
              {inputItems && inputItems.length > 0 && (
                <div className="flex flex-col gap-3">
                  <div className="label-mono text-[10px] text-[var(--fg-muted)] uppercase tracking-wider">Request</div>
                  {[...inputItems].reverse().map((item) => (
                    <div key={item.id} className="flex gap-3">
                      <RoleLabel role={item.role} />
                      <div className="flex flex-col gap-1 min-w-0 flex-1">
                        {item.content.map((c, ci) =>
                          c.type === "input_text" ? (
                            <ContentRenderer
                              key={ci}
                              content={(c as { type: "input_text"; text: string }).text}
                            />
                          ) : (
                            <span key={ci} className="text-xs text-[var(--fg-muted)] italic">
                              [{c.type}]
                            </span>
                          )
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {row.output_text && (
                <div className="flex flex-col gap-3 pt-3 border-t border-[var(--border)]">
                  <div className="label-mono text-[10px] text-[var(--fg-muted)] uppercase tracking-wider">Response</div>
                  <div className="flex gap-3">
                    <RoleLabel role="assistant" />
                    <div className="flex-1 min-w-0">
                      <ContentRenderer content={row.output_text} />
                    </div>
                  </div>
                </div>
              )}
              {!loading && !error && !inputItems?.length && !row.output_text && (
                <div className="text-xs text-[var(--fg-muted)]">No content available.</div>
              )}
            </div>
          )}

          {tab === "raw" && (
            <div>
              {row.raw_body ? (
                <pre className="text-xs text-[var(--fg-secondary)] whitespace-pre-wrap font-mono bg-[var(--bg-elevated)] rounded px-3 py-3 overflow-auto">
                  {JSON.stringify(row.raw_body, null, 2)}
                </pre>
              ) : (
                <div className="text-xs text-[var(--fg-muted)]">No raw data available.</div>
              )}
            </div>
          )}
        </div>

        {/* token footer */}
        {row.usage && (
          <div className="flex items-center gap-4 px-5 py-3 border-t border-[var(--border)] shrink-0">
            <span className="label-mono text-[10px] text-[var(--fg-muted)]">
              in <span className="text-[var(--fg-secondary)]">{row.usage.input_tokens.toLocaleString()}</span>
            </span>
            {row.usage.cached_tokens > 0 && (
              <span className="label-mono text-[10px] text-[var(--fg-muted)]">
                cache <span className="text-[var(--fg-secondary)]">{row.usage.cached_tokens.toLocaleString()}</span>
              </span>
            )}
            <span className="label-mono text-[10px] text-[var(--fg-muted)]">
              out <span className="text-[var(--fg-secondary)]">{row.usage.output_tokens.toLocaleString()}</span>
            </span>
            {row.usage.reasoning_tokens > 0 && (
              <span className="label-mono text-[10px] text-[var(--fg-muted)]">
                rsn <span className="text-[var(--fg-secondary)]">{row.usage.reasoning_tokens.toLocaleString()}</span>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
