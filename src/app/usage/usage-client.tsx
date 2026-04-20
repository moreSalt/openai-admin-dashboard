"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  RefreshCw,
  AlertCircle,
  Loader2,
  KeyRound,
  BarChart3,
} from "lucide-react";

type UsageType =
  | "completions"
  | "embeddings"
  | "moderations"
  | "images"
  | "audio_speeches"
  | "audio_transcriptions"
  | "vector_stores"
  | "code_interpreter_sessions"
  | "costs";

type CompletionsResult = {
  object: string;
  input_tokens?: number;
  output_tokens?: number;
  input_cached_tokens?: number;
  input_audio_tokens?: number;
  output_audio_tokens?: number;
  num_model_requests?: number;
  model?: string | null;
  batch?: boolean | null;
  project_id?: string | null;
};

type CostsResult = {
  object: string;
  amount?: { value: number; currency: string };
  line_item?: string | null;
  project_id?: string | null;
};

type Bucket = {
  object: "bucket";
  start_time: number;
  end_time: number;
  results: (CompletionsResult | CostsResult)[];
};

type UsagePage = {
  object: "page";
  data: Bucket[];
  has_more: boolean;
  next_page: string | null;
};

const TABS: { key: UsageType; label: string }[] = [
  { key: "completions", label: "Completions" },
  { key: "costs", label: "Costs" },
  { key: "embeddings", label: "Embeddings" },
  { key: "images", label: "Images" },
  { key: "audio_speeches", label: "Audio TTS" },
  { key: "audio_transcriptions", label: "Audio STT" },
  { key: "moderations", label: "Moderations" },
  { key: "vector_stores", label: "Vector stores" },
  { key: "code_interpreter_sessions", label: "Code interp." },
];

const RANGES: { key: string; label: string; seconds: number }[] = [
  { key: "24h", label: "Last 24h", seconds: 24 * 60 * 60 },
  { key: "7d", label: "Last 7d", seconds: 7 * 24 * 60 * 60 },
  { key: "30d", label: "Last 30d", seconds: 30 * 24 * 60 * 60 },
  { key: "90d", label: "Last 90d", seconds: 90 * 24 * 60 * 60 },
];

type Row = {
  start_time: number;
  end_time: number;
  input_tokens: number;
  output_tokens: number;
  input_cached_tokens: number;
  requests: number;
  cost_usd: number;
};

function aggregate(buckets: Bucket[], type: UsageType): Row[] {
  return [...buckets].reverse().map((b) => {
    const r: Row = {
      start_time: b.start_time,
      end_time: b.end_time,
      input_tokens: 0,
      output_tokens: 0,
      input_cached_tokens: 0,
      requests: 0,
      cost_usd: 0,
    };
    for (const res of b.results) {
      if (type === "costs") {
        const c = res as CostsResult;
        r.cost_usd += Number(c.amount?.value ?? 0);
      } else {
        const c = res as CompletionsResult;
        r.input_tokens += c.input_tokens ?? 0;
        r.output_tokens += c.output_tokens ?? 0;
        r.input_cached_tokens += c.input_cached_tokens ?? 0;
        r.requests += c.num_model_requests ?? 0;
      }
    }
    return r;
  });
}

function formatBucket(ts: number, width: string) {
  const d = new Date(ts * 1000);
  if (width === "1h") {
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function UsageClient() {
  const [type, setType] = useState<UsageType>("completions");
  const [rangeKey, setRangeKey] = useState<string>("7d");
  const [bucketWidth, setBucketWidth] = useState<"1d" | "1h">("1d");
  const [batchOnly, setBatchOnly] = useState(false);

  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);

  const effectiveWidth: "1d" | "1h" = type === "costs" ? "1d" : bucketWidth;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const range = RANGES.find((r) => r.key === rangeKey) ?? RANGES[1];
      const now = Math.floor(Date.now() / 1000);
      const start = now - range.seconds;
      const params = new URLSearchParams({
        type,
        start_time: String(start),
        bucket_width: effectiveWidth,
        limit: effectiveWidth === "1h" ? "168" : "31",
      });
      if (type === "completions" && batchOnly) params.set("batch", "true");

      const res = await fetch(`/api/usage?${params.toString()}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) {
        setError({ status: res.status, message: body.error ?? `HTTP ${res.status}` });
        setRows(null);
        return;
      }
      const page = body as UsagePage;
      setRows(aggregate(page.data ?? [], type));
    } catch (e) {
      setError({ status: 0, message: e instanceof Error ? e.message : "fetch failed" });
      setRows(null);
    } finally {
      setLoading(false);
    }
  }, [type, rangeKey, effectiveWidth, batchOnly]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    if (!rows) return null;
    return rows.reduce(
      (acc, r) => ({
        input_tokens: acc.input_tokens + r.input_tokens,
        output_tokens: acc.output_tokens + r.output_tokens,
        input_cached_tokens: acc.input_cached_tokens + r.input_cached_tokens,
        requests: acc.requests + r.requests,
        cost_usd: acc.cost_usd + r.cost_usd,
      }),
      { input_tokens: 0, output_tokens: 0, input_cached_tokens: 0, requests: 0, cost_usd: 0 },
    );
  }, [rows]);

  return (
    <div className="px-4 py-4 pb-24 sm:px-6 md:px-8 md:py-6">
      {/* type tabs */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {TABS.map((t) => {
          const active = t.key === type;
          return (
            <button
              key={t.key}
              onClick={() => setType(t.key)}
              className={`rounded-full px-3 py-1.5 text-xs transition-colors border ${
                active
                  ? "bg-[var(--fg)] text-[var(--bg-button)] border-[var(--fg)]"
                  : "bg-[var(--bg-elevated)] text-[var(--fg-secondary)] border-[var(--border-strong)] hover:border-[var(--border-stronger)] hover:text-[var(--fg)]"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* controls row */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="inline-flex rounded-md border border-[var(--border-strong)] overflow-hidden">
          {RANGES.map((r) => {
            const active = r.key === rangeKey;
            return (
              <button
                key={r.key}
                onClick={() => setRangeKey(r.key)}
                className={`px-3 py-1.5 text-xs transition-colors ${
                  active
                    ? "bg-[var(--bg-elevated)] text-[var(--fg)]"
                    : "text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--bg-elevated)]/60"
                }`}
              >
                {r.label}
              </button>
            );
          })}
        </div>

        {type !== "costs" && (
          <div className="inline-flex rounded-md border border-[var(--border-strong)] overflow-hidden">
            {(["1d", "1h"] as const).map((w) => {
              const active = w === bucketWidth;
              return (
                <button
                  key={w}
                  onClick={() => setBucketWidth(w)}
                  className={`px-3 py-1.5 text-xs transition-colors ${
                    active
                      ? "bg-[var(--bg-elevated)] text-[var(--fg)]"
                      : "text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--bg-elevated)]/60"
                  }`}
                >
                  {w}
                </button>
              );
            })}
          </div>
        )}

        {type === "completions" && (
          <label className="inline-flex items-center gap-2 rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={batchOnly}
              onChange={(e) => setBatchOnly(e.target.checked)}
              className="accent-[var(--brand)] size-3.5 cursor-pointer"
            />
            <span className="text-[var(--fg-secondary)]">Batch only</span>
          </label>
        )}

        <div className="ml-auto">
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* totals */}
      {totals && !error && (
        <div className="flex flex-wrap gap-3 mb-5">
          {type === "costs" ? (
            <TotalChip label="Total cost" value={`$${Number(totals.cost_usd).toFixed(2)}`} />
          ) : (
            <>
              <TotalChip label="Input tokens" value={totals.input_tokens.toLocaleString()} />
              {totals.input_cached_tokens > 0 && (
                <TotalChip label="Cached input" value={totals.input_cached_tokens.toLocaleString()} />
              )}
              <TotalChip label="Output tokens" value={totals.output_tokens.toLocaleString()} />
              <TotalChip label="Requests" value={totals.requests.toLocaleString()} />
            </>
          )}
        </div>
      )}

      {/* empty / error states */}
      {error?.status === 503 && <AdminKeyEmpty />}
      {error?.status === 401 && <AdminKeyRejected message={error.message} />}
      {error && error.status !== 503 && error.status !== 401 && (
        <div className="rounded-md border border-[rgba(229,72,77,0.3)] bg-[rgba(229,72,77,0.05)] text-[var(--danger)] px-4 py-3 flex items-start gap-2 text-sm mb-4">
          <AlertCircle className="size-4 mt-0.5" />
          <div>
            <div className="font-medium">Failed to load usage</div>
            <div className="mono text-xs opacity-80 mt-1">{error.message}</div>
          </div>
        </div>
      )}

      {/* table */}
      {!error && (
        <div className="rounded-lg border border-[var(--border)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-[var(--bg-elevated)] text-[var(--fg-muted)]">
                <tr className="label-mono">
                  <th className="text-left font-normal px-4 py-2.5">Bucket</th>
                  {type === "costs" ? (
                    <th className="text-right font-normal px-4 py-2.5">Amount</th>
                  ) : (
                    <>
                      <th className="text-right font-normal px-4 py-2.5">Input</th>
                      <th className="text-right font-normal px-4 py-2.5">Cached input</th>
                      <th className="text-right font-normal px-4 py-2.5">Output</th>
                      <th className="text-right font-normal px-4 py-2.5">Requests</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center">
                      <Loader2 className="size-5 animate-spin inline text-[var(--fg-muted)]" />
                    </td>
                  </tr>
                )}
                {!loading && rows && rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-[var(--fg-muted)]">
                      No usage in this window.
                    </td>
                  </tr>
                )}
                {!loading &&
                  rows &&
                  rows.map((r) => (
                    <tr key={r.start_time} className="border-t border-[var(--border)]">
                      <td className="px-4 py-3 text-[var(--fg-secondary)]">
                        {formatBucket(r.start_time, effectiveWidth)}
                      </td>
                      {type === "costs" ? (
                        <td className="px-4 py-3 text-right mono text-[var(--fg)]">
                          ${Number(r.cost_usd).toFixed(4)}
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-3 text-right mono text-[var(--fg-secondary)]">
                            {r.input_tokens.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right mono text-[var(--fg-muted)]">
                            {r.input_cached_tokens > 0 ? r.input_cached_tokens.toLocaleString() : "—"}
                          </td>
                          <td className="px-4 py-3 text-right mono text-[var(--fg-secondary)]">
                            {r.output_tokens.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right mono text-[var(--fg-muted)]">
                            {r.requests.toLocaleString()}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function TotalChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-2">
      <BarChart3 className="size-3.5 text-[var(--fg-muted)]" />
      <span className="text-lg font-light leading-none" style={{ letterSpacing: "-0.3px" }}>
        {value}
      </span>
      <span className="label-mono text-[var(--fg-muted)]">{label}</span>
    </div>
  );
}

function AdminKeyEmpty() {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/40 p-8 flex flex-col items-center text-center">
      <KeyRound className="size-6 text-[var(--fg-muted)] mb-3" />
      <h2 className="text-base font-medium mb-1">Admin key required</h2>
      <p className="text-sm text-[var(--fg-muted)] max-w-md mb-4">
        OpenAI&apos;s Usage API needs an admin key, separate from the project key used for batches and files.
      </p>
      <div className="rounded-md border border-[var(--border-strong)] bg-[var(--bg)] px-3 py-2 mono text-xs text-[var(--fg-secondary)]">
        OPENAI_ADMIN_KEY=sk-admin-...
      </div>
      <p className="text-xs text-[var(--fg-muted)] mt-3">
        Create one at <span className="mono">platform.openai.com → Settings → Admin keys</span>, then restart the dev server.
      </p>
    </div>
  );
}

function AdminKeyRejected({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-[rgba(229,72,77,0.3)] bg-[rgba(229,72,77,0.05)] p-6 flex flex-col items-center text-center">
      <AlertCircle className="size-6 text-[var(--danger)] mb-3" />
      <h2 className="text-base font-medium mb-1">Admin key rejected</h2>
      <p className="text-sm text-[var(--fg-secondary)] max-w-md">
        Verify <span className="mono">OPENAI_ADMIN_KEY</span> is an <span className="mono">sk-admin-…</span> key, not a project key.
      </p>
      <div className="mono text-xs opacity-70 mt-3">{message}</div>
    </div>
  );
}
