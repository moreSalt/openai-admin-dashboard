"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatRelative } from "@/lib/utils";
import {
  ChevronLeft,
  RefreshCw,
  Ban,
  Loader2,
  AlertCircle,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  X,
  ExternalLink,
  RotateCcw,
} from "lucide-react";
import { estimateCost, type Usage } from "@/lib/pricing";
import { ResponseModal } from "@/components/response-modal";

const RESTARTABLE = new Set(["completed", "failed", "expired", "cancelled"]);

type Batch = {
  id: string;
  object: string;
  endpoint: string;
  model?: string | null;
  status: string;
  input_file_id: string;
  output_file_id: string | null;
  error_file_id: string | null;
  completion_window: string;
  created_at: number;
  in_progress_at: number | null;
  expires_at: number | null;
  finalizing_at: number | null;
  completed_at: number | null;
  failed_at: number | null;
  expired_at: number | null;
  cancelling_at: number | null;
  cancelled_at: number | null;
  request_counts: { total: number; completed: number; failed: number };
  metadata: Record<string, string> | null;
  usage?: Usage | null;
  errors?: {
    object?: string;
    data?: { code: string; message: string; param: string | null; line: number | null }[];
  } | null;
};

const RUNNING = new Set(["validating", "in_progress", "finalizing"]);

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

const RESP_LIMIT = 50;

function statusTone(s: string): "success" | "warn" | "danger" | "info" | "neutral" {
  if (s === "completed") return "success";
  if (s === "failed" || s === "expired" || s === "cancelled") return "danger";
  if (s === "cancelling") return "warn";
  if (RUNNING.has(s)) return "info";
  return "neutral";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="label-mono">{label}</span>
      <span className="text-sm text-[var(--fg-secondary)]">{children}</span>
    </div>
  );
}

function FileChip({ label, id }: { label: string; id: string | null }) {
  if (!id) return <span className="text-[var(--fg-muted)] text-sm">—</span>;
  const href = `/api/files/download?id=${id}&filename=${label.toLowerCase()}-${id}.jsonl`;
  return (
    <a
      href={href}
      download
      className="flex items-center gap-2 rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-2 w-fit hover:border-[var(--brand-border)] hover:bg-[rgba(62,207,142,0.05)] transition-colors group"
    >
      <FileText className="size-3.5 text-[var(--fg-muted)] group-hover:text-[var(--brand)]" />
      <div className="flex flex-col">
        <span className="label-mono text-[var(--fg-muted)] mb-0.5">{label}</span>
        <span className="mono text-xs text-[var(--fg-secondary)]">{id}</span>
      </div>
    </a>
  );
}

function Timeline({ batch }: { batch: Batch }) {
  const steps: { label: string; ts: number | null; icon: React.ReactNode }[] = [
    { label: "Created", ts: batch.created_at, icon: <Clock className="size-3.5" /> },
    { label: "In progress", ts: batch.in_progress_at, icon: <Loader2 className="size-3.5" /> },
    { label: "Finalizing", ts: batch.finalizing_at, icon: <RefreshCw className="size-3.5" /> },
    { label: "Completed", ts: batch.completed_at, icon: <CheckCircle2 className="size-3.5" /> },
    batch.failed_at ? { label: "Failed", ts: batch.failed_at, icon: <XCircle className="size-3.5" /> } : null,
    batch.cancelled_at ? { label: "Cancelled", ts: batch.cancelled_at, icon: <Ban className="size-3.5" /> } : null,
    batch.expired_at ? { label: "Expired", ts: batch.expired_at, icon: <Clock className="size-3.5" /> } : null,
  ].filter(Boolean) as { label: string; ts: number | null; icon: React.ReactNode }[];

  return (
    <div className="flex flex-col">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-start gap-3">
          <div className="flex flex-col items-center">
            <div
              className={`size-7 rounded-full flex items-center justify-center border ${
                step.ts
                  ? "border-[var(--brand-border)] text-[var(--brand)] bg-[rgba(62,207,142,0.08)]"
                  : "border-[var(--border-strong)] text-[var(--fg-muted)] bg-[var(--bg-elevated)]"
              }`}
            >
              {step.icon}
            </div>
            {i < steps.length - 1 && (
              <div className="w-px flex-1 min-h-[24px] bg-[var(--border)]" />
            )}
          </div>
          <div className="pb-5">
            <div className="text-sm text-[var(--fg)]">{step.label}</div>
            {step.ts ? (
              <div className="text-xs text-[var(--fg-muted)] mt-0.5">
                {formatDate(step.ts)}{" "}
                <span className="text-[var(--fg-dim)]">· {formatRelative(step.ts)}</span>
              </div>
            ) : (
              <div className="text-xs text-[var(--fg-muted)] mt-0.5">Pending</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

type InitialBatch = {
  id: string;
  status: string;
  endpoint: string;
  created_at: number;
  completion_window?: string;
  request_counts?: { total?: number; completed?: number; failed?: number };
  input_file_id?: string;
  output_file_id?: string | null;
  error_file_id?: string | null;
  metadata?: Record<string, string> | null;
};

function toFullBatch(b: InitialBatch): Batch {
  return {
    id: b.id,
    object: "batch",
    endpoint: b.endpoint,
    status: b.status,
    input_file_id: b.input_file_id ?? "",
    output_file_id: b.output_file_id ?? null,
    error_file_id: b.error_file_id ?? null,
    completion_window: b.completion_window ?? "24h",
    created_at: b.created_at,
    in_progress_at: null,
    expires_at: null,
    finalizing_at: null,
    completed_at: null,
    failed_at: null,
    expired_at: null,
    cancelling_at: null,
    cancelled_at: null,
    request_counts: {
      total: b.request_counts?.total ?? 0,
      completed: b.request_counts?.completed ?? 0,
      failed: b.request_counts?.failed ?? 0,
    },
    metadata: b.metadata ?? null,
    usage: null,
    errors: null,
  };
}

export function BatchDetail({
  id,
  onClose,
  initialBatch,
  onRestart,
}: {
  id: string;
  onClose?: () => void;
  initialBatch?: InitialBatch;
  onRestart?: (newId: string) => void;
}) {
  const router = useRouter();
  const [batch, setBatch] = useState<Batch | null>(initialBatch ? toFullBatch(initialBatch) : null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialBatch);
  const [cancelling, setCancelling] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [responsesOpen, setResponsesOpen] = useState(false);
  const [responsesLoaded, setResponsesLoaded] = useState(false);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [responsesLoading, setResponsesLoading] = useState(false);
  const [responsesError, setResponsesError] = useState<string | null>(null);
  const [responsesOffset, setResponsesOffset] = useState(0);
  const [responsesTotal, setResponsesTotal] = useState(0);
  const [selectedResponse, setSelectedResponse] = useState<ResponseRow | null>(null);
  const [tab, setTab] = useState<"details" | "responses">("details");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/batches/${id}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setBatch(body.batch);
    } catch (e) {
      if (showSpinner) setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [id]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(!initialBatch); }, [load]);

  // close on Escape when in modal mode
  useEffect(() => {
    if (!onClose) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const cancelBatch = async () => {
    if (!batch) return;
    setCancelling(true);
    try {
      const res = await fetch("/api/batches/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [batch.id] }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      showToast("Cancel requested.");
      await load();
    } catch (e) {
      showToast(`Error: ${e instanceof Error ? e.message : "cancel failed"}`);
    } finally {
      setCancelling(false);
      setConfirmOpen(false);
    }
  };

  const restartBatch = async () => {
    if (!batch) return;
    setRestarting(true);
    try {
      const res = await fetch("/api/batches/restart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [batch.id] }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      if (body.restarted.length > 0) {
        const newId = body.restarted[0].newId;
        if (onRestart) {
          onRestart(newId);
        } else {
          router.push(`/batches/${newId}`);
        }
      } else {
        showToast(`Restart failed: ${body.failed[0]?.error ?? "unknown error"}`);
      }
    } catch (e) {
      showToast(`Error: ${e instanceof Error ? e.message : "restart failed"}`);
    } finally {
      setRestarting(false);
    }
  };

  const loadResponses = useCallback(async (offset: number) => {
    setResponsesLoading(true);
    setResponsesError(null);
    try {
      const res = await fetch(`/api/batches/${id}/responses?limit=${RESP_LIMIT}&offset=${offset}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setResponses(body.responses);
      setResponsesTotal(body.total);
      setResponsesOffset(offset);
      setResponsesLoaded(true);
    } catch (e) {
      setResponsesError(e instanceof Error ? e.message : "Failed to load responses");
    } finally {
      setResponsesLoading(false);
    }
  }, [id]);

  const handleToggleResponses = () => {
    const next = !responsesOpen;
    setResponsesOpen(next);
    if (next && !responsesLoaded && !responsesLoading) {
      loadResponses(0);
    }
  };

  useEffect(() => {
    if (tab === "responses" && !responsesLoaded && !responsesLoading) {
      loadResponses(0);
    }
  }, [tab, responsesLoaded, responsesLoading, loadResponses]);


  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="size-6 animate-spin text-[var(--fg-muted)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={onClose ? "p-6" : "px-8 py-6"}>
        {!onClose && (
          <Link
            href="/batches"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--fg-muted)] hover:text-[var(--fg)] mb-6"
          >
            <ChevronLeft className="size-3.5" />
            Batches
          </Link>
        )}
        <div className="rounded-md border border-[rgba(229,72,77,0.3)] bg-[rgba(229,72,77,0.05)] text-[var(--danger)] px-4 py-3 flex items-start gap-2 text-sm">
          <AlertCircle className="size-4 mt-0.5" />
          <div>
            <div className="font-medium">Failed to load batch</div>
            <div className="mono text-xs opacity-80 mt-1">{error}</div>
          </div>
        </div>
      </div>
    );
  }

  if (!batch) return null;

  const { total, completed, failed } = batch.request_counts;
  const pct = total > 0 ? (completed / total) * 100 : 0;
  const failPct = total > 0 ? (failed / total) * 100 : 0;
  const isRunning = RUNNING.has(batch.status);

  return (
    <div className={onClose ? "p-6" : "px-8 py-6"}>
      {/* nav bar */}
      <div className="flex items-center justify-between mb-6">
        {onClose ? (
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 text-sm text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors"
          >
            <ChevronLeft className="size-3.5" />
            Batches
          </button>
        ) : (
          <Link
            href="/batches"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors"
          >
            <ChevronLeft className="size-3.5" />
            Batches
          </Link>
        )}
        <div className="flex items-center gap-2">
          {onClose && (
            <Link
              href={`/batches/${id}`}
              target="_blank"
              className="inline-flex items-center gap-1.5 text-xs text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors"
            >
              <ExternalLink className="size-3.5" />
              Open page
            </Link>
          )}
          <Button variant="ghost" size="sm" onClick={() => load()} disabled={loading}>
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {RESTARTABLE.has(batch.status) && (
            <Button variant="outline" size="sm" onClick={restartBatch} disabled={restarting}>
              {restarting ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
              {restarting ? "Restarting…" : "Restart"}
            </Button>
          )}
          {isRunning && (
            <Button variant="danger" size="sm" onClick={() => setConfirmOpen(true)} disabled={cancelling}>
              <Ban className="size-3.5" />
              Cancel
            </Button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="ml-1 text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Badge tone={statusTone(batch.status)}>{batch.status}</Badge>
          <span className="label-mono text-[var(--fg-muted)]">{batch.completion_window}</span>
        </div>
        <h1 className="mono text-base text-[var(--fg-secondary)] truncate">{batch.id}</h1>
        <div className="flex items-center gap-3 mt-0.5">
          <p className="mono text-sm text-[var(--fg-muted)]">{batch.endpoint}</p>
          {batch.model && (
            <span className="mono text-sm text-[var(--fg-muted)]">·</span>
          )}
          {batch.model && (
            <p className="mono text-sm text-[var(--fg-muted)]">{batch.model}</p>
          )}
        </div>
      </div>

      {/* tabs */}
      <div className="flex items-center border-b border-[var(--border)] mb-6">
        {(["details", "responses"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm capitalize border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-[var(--brand)] text-[var(--fg)]"
                : "border-transparent text-[var(--fg-muted)] hover:text-[var(--fg)]"
            }`}
          >
            {t}
            {t === "responses" && responsesLoaded && (
              <span className="ml-1.5 label-mono text-[var(--fg-muted)]">{responsesTotal.toLocaleString()}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "details" && (
      <div className="grid grid-cols-3 gap-5">
        {/* left col */}
        <div className="col-span-2 flex flex-col gap-5">
          {/* progress */}
          <div className="rounded-lg border border-[var(--border)] p-5">
            <h2 className="text-sm font-medium mb-4">Requests</h2>
            <div className="flex items-end gap-8 mb-4">
              <div>
                <div className="text-3xl font-light" style={{ letterSpacing: "-0.5px" }}>{completed}</div>
                <div className="label-mono mt-1">Completed</div>
              </div>
              {failed > 0 && (
                <div>
                  <div className="text-3xl font-light text-[var(--danger)]" style={{ letterSpacing: "-0.5px" }}>{failed}</div>
                  <div className="label-mono mt-1">Failed</div>
                </div>
              )}
              <div>
                <div className="text-3xl font-light text-[var(--fg-muted)]" style={{ letterSpacing: "-0.5px" }}>{total}</div>
                <div className="label-mono mt-1">Total</div>
              </div>
            </div>
            {total > 0 && (
              <div className="h-2 rounded-full bg-[var(--border)] overflow-hidden flex">
                <div className="h-full bg-[var(--brand)] transition-all" style={{ width: `${pct}%` }} />
                {failPct > 0 && (
                  <div className="h-full bg-[var(--danger)] transition-all" style={{ width: `${failPct}%` }} />
                )}
              </div>
            )}
          </div>

          {/* usage */}
          {batch.usage && (
            <div className="rounded-lg border border-[var(--border)] p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium">Tokens</h2>
                {batch.model && (() => {
                  const cost = estimateCost(batch.usage!, batch.model!);
                  return cost != null ? (
                    <div className="text-right">
                      <div className="text-lg font-light" style={{ letterSpacing: "-0.3px" }}>
                        ${cost.total.toFixed(4)}
                      </div>
                      <div className="label-mono text-[var(--fg-muted)]">Est. cost</div>
                    </div>
                  ) : null;
                })()}
              </div>
              <div className="flex items-end gap-8 mb-4">
                <div>
                  <div className="text-3xl font-light" style={{ letterSpacing: "-0.5px" }}>
                    {batch.usage.input_tokens.toLocaleString()}
                  </div>
                  <div className="label-mono mt-1">Input</div>
                </div>
                <div>
                  <div className="text-3xl font-light" style={{ letterSpacing: "-0.5px" }}>
                    {batch.usage.output_tokens.toLocaleString()}
                  </div>
                  <div className="label-mono mt-1">Output</div>
                </div>
                <div>
                  <div className="text-3xl font-light text-[var(--fg-muted)]" style={{ letterSpacing: "-0.5px" }}>
                    {batch.usage.total_tokens.toLocaleString()}
                  </div>
                  <div className="label-mono mt-1">Total</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {batch.usage.input_tokens_details?.cached_tokens !== undefined && (
                  <div>
                    <div className="label-mono text-[var(--fg-muted)] mb-1">Cached input</div>
                    <div className="text-[var(--fg-secondary)]">{batch.usage.input_tokens_details.cached_tokens.toLocaleString()}</div>
                  </div>
                )}
                {batch.usage.output_tokens_details?.reasoning_tokens !== undefined && (
                  <div>
                    <div className="label-mono text-[var(--fg-muted)] mb-1">Reasoning output</div>
                    <div className="text-[var(--fg-secondary)]">{batch.usage.output_tokens_details.reasoning_tokens.toLocaleString()}</div>
                  </div>
                )}
              </div>
              {batch.model && (() => {
                const cost = estimateCost(batch.usage!, batch.model!);
                if (!cost) return null;
                const cached = batch.usage!.input_tokens_details?.cached_tokens ?? 0;
                const nonCached = batch.usage!.input_tokens - cached;
                const rows: { label: string; tokens: number; amount: number }[] = [
                  { label: "Input", tokens: nonCached, amount: cost.inputCost },
                  ...(cached > 0 ? [{ label: "Cached input", tokens: cached, amount: cost.cachedCost }] : []),
                  { label: "Output", tokens: batch.usage!.output_tokens, amount: cost.outputCost },
                ];
                return (
                  <div className="mt-4 pt-4 border-t border-[var(--border)]">
                    <div className="label-mono text-[var(--fg-muted)] mb-2">Cost breakdown</div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[var(--fg-muted)]">
                          <th className="label-mono text-left pb-2 font-normal">Type</th>
                          <th className="label-mono text-right pb-2 font-normal">Tokens</th>
                          <th className="label-mono text-right pb-2 font-normal">Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(r => (
                          <tr key={r.label} className="border-t border-[var(--border)]">
                            <td className="py-1.5 text-[var(--fg-secondary)]">{r.label}</td>
                            <td className="py-1.5 text-right mono text-[var(--fg-muted)]">{r.tokens.toLocaleString()}</td>
                            <td className="py-1.5 text-right mono text-[var(--fg-secondary)]">${r.amount.toFixed(4)}</td>
                          </tr>
                        ))}
                        <tr className="border-t border-[var(--border-strong)]">
                          <td className="pt-2 text-[var(--fg)] font-medium" colSpan={2}>Total</td>
                          <td className="pt-2 text-right mono text-[var(--fg)]">${cost.total.toFixed(4)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          )}

          {/* files */}
          <div className="rounded-lg border border-[var(--border)] p-5">
            <h2 className="text-sm font-medium mb-4">Files</h2>
            <div className="flex flex-col gap-3">
              <FileChip label="Input" id={batch.input_file_id} />
              <FileChip label="Output" id={batch.output_file_id} />
              {batch.error_file_id && <FileChip label="Errors" id={batch.error_file_id} />}
            </div>
          </div>

          {/* errors */}
          {(batch.errors?.data?.length ?? 0) > 0 && (
            <div className="rounded-lg border border-[rgba(229,72,77,0.3)] p-5">
              <h2 className="text-sm font-medium text-[var(--danger)] mb-4">Errors</h2>
              <div className="flex flex-col gap-2">
                {batch.errors!.data!.map((e, i) => (
                  <div key={i} className="rounded-md bg-[rgba(229,72,77,0.05)] px-3 py-2 text-xs">
                    <span className="mono text-[var(--danger)]">{e.code}</span>
                    {e.line != null && <span className="text-[var(--fg-muted)] ml-2">line {e.line}</span>}
                    <div className="text-[var(--fg-secondary)] mt-1">{e.message}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* metadata */}
          {batch.metadata && Object.keys(batch.metadata).length > 0 && (
            <div className="rounded-lg border border-[var(--border)] p-5">
              <h2 className="text-sm font-medium mb-4">Metadata</h2>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                {Object.entries(batch.metadata).map(([k, v]) => (
                  <div key={k}>
                    <div className="label-mono mb-0.5">{k}</div>
                    <div className="text-sm text-[var(--fg-secondary)] mono">{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* right col */}
        <div className="flex flex-col gap-5">
          <div className="rounded-lg border border-[var(--border)] p-5">
            <h2 className="text-sm font-medium mb-5">Timeline</h2>
            <Timeline batch={batch} />
          </div>
          <div className="rounded-lg border border-[var(--border)] p-5 flex flex-col gap-4">
            <h2 className="text-sm font-medium mb-1">Details</h2>
            <Field label="ID"><span className="mono break-all">{batch.id}</span></Field>
            <Field label="Endpoint"><span className="mono">{batch.endpoint}</span></Field>
            <Field label="Window">{batch.completion_window}</Field>
            {batch.expires_at && <Field label="Expires">{formatDate(batch.expires_at)}</Field>}
          </div>
        </div>
      </div>
      )} {/* end details tab */}

      {tab === "responses" && (
        <div className="rounded-lg border border-[var(--border)]">
          {!batch.output_file_id ? (
            <div className="p-5 text-sm text-[var(--fg-muted)]">No output file — batch not yet completed.</div>
          ) : responsesLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="size-5 animate-spin text-[var(--fg-muted)]" />
            </div>
          ) : responsesError ? (
            <div className="p-5 text-sm text-[var(--danger)] flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              {responsesError}
            </div>
          ) : responses.length === 0 ? (
            <div className="p-5 text-sm text-[var(--fg-muted)]">No responses found.</div>
          ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[var(--border)]">
                          <th className="label-mono font-normal text-left px-4 py-2.5 text-[var(--fg-muted)]">Custom ID</th>
                          <th className="label-mono font-normal text-left px-4 py-2.5 text-[var(--fg-muted)]">Status</th>
                          <th className="label-mono font-normal text-left px-4 py-2.5 text-[var(--fg-muted)]">Duration</th>
                          <th className="label-mono font-normal text-left px-4 py-2.5 text-[var(--fg-muted)]">Model</th>
                          <th className="label-mono font-normal text-left px-4 py-2.5 text-[var(--fg-muted)]">Format</th>
                          <th className="label-mono font-normal text-left px-4 py-2.5 text-[var(--fg-muted)]">Effort</th>
                          <th className="label-mono font-normal text-right px-4 py-2.5 text-[var(--fg-muted)]">Tokens</th>
                          <th className="label-mono font-normal text-right px-4 py-2.5 text-[var(--fg-muted)]">Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {responses.map((r, i) => {
                          const model = r.model ?? batch.model ?? "";
                          const cost = r.usage && model
                            ? estimateCost(
                                {
                                  input_tokens: r.usage.input_tokens,
                                  output_tokens: r.usage.output_tokens,
                                  total_tokens: r.usage.total_tokens,
                                  input_tokens_details: { cached_tokens: r.usage.cached_tokens },
                                  output_tokens_details: { reasoning_tokens: r.usage.reasoning_tokens },
                                },
                                model,
                              )
                            : null;
                          const statusOk = (r.status_code ?? 200) < 400;
                          const durationLabel = r.duration_s != null
                            ? r.duration_s < 1
                              ? `${Math.round(r.duration_s * 1000)}ms`
                              : `${r.duration_s.toFixed(1)}s`
                            : "—";
                          return (
                            <tr
                              key={i}
                              className="border-b border-[var(--border)] hover:bg-[var(--bg-elevated)] cursor-pointer"
                              onClick={() => setSelectedResponse(r)}
                            >
                              <td className="px-4 py-2.5 mono text-[var(--fg-secondary)] max-w-[180px]">
                                <span className="block truncate" title={r.custom_id ?? ""}>
                                  {r.custom_id ?? "—"}
                                </span>
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={`mono ${statusOk ? "text-[var(--brand)]" : "text-[var(--danger)]"}`}>
                                  {r.status_code ?? "—"}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 mono text-[var(--fg-muted)] whitespace-nowrap">
                                {durationLabel}
                              </td>
                              <td className="px-4 py-2.5 mono text-[var(--fg-muted)] max-w-[160px]">
                                <span className="block truncate" title={r.model ?? ""}>
                                  {r.model ?? "—"}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 mono text-[var(--fg-muted)] max-w-[160px]">
                                <span className="block truncate" title={r.format_name ?? r.format_type ?? ""}>
                                  {r.format_name ?? r.format_type ?? "—"}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 mono text-[var(--fg-secondary)]">
                                {r.reasoning_effort ?? "—"}
                              </td>
                              <td className="px-4 py-2.5 mono text-right">
                                {r.usage ? (
                                  <div className="flex flex-col gap-0.5">
                                    <div className="text-[var(--fg-secondary)]">
                                      <span className="text-[var(--fg-muted)] mr-1">in</span>{r.usage.input_tokens.toLocaleString()}
                                    </div>
                                    {r.usage.cached_tokens > 0 && (
                                      <div className="text-[var(--fg-muted)]">
                                        <span className="mr-1">cache</span>{r.usage.cached_tokens.toLocaleString()}
                                      </div>
                                    )}
                                    <div className="text-[var(--fg-secondary)]">
                                      <span className="text-[var(--fg-muted)] mr-1">out</span>{r.usage.output_tokens.toLocaleString()}
                                    </div>
                                    {r.usage.reasoning_tokens > 0 && (
                                      <div className="text-[var(--fg-muted)]">
                                        <span className="mr-1">rsn</span>{r.usage.reasoning_tokens.toLocaleString()}
                                      </div>
                                    )}
                                  </div>
                                ) : "—"}
                              </td>
                              <td className="px-4 py-2.5 mono text-right text-[var(--fg-secondary)]">
                                {cost ? `$${cost.total.toFixed(4)}` : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {responsesTotal > RESP_LIMIT && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)]">
                      <span className="label-mono text-[var(--fg-muted)]">
                        {responsesOffset + 1}–{Math.min(responsesOffset + RESP_LIMIT, responsesTotal)} of {responsesTotal.toLocaleString()}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => loadResponses(responsesOffset - RESP_LIMIT)}
                          disabled={responsesOffset === 0 || responsesLoading}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => loadResponses(responsesOffset + RESP_LIMIT)}
                          disabled={responsesOffset + RESP_LIMIT >= responsesTotal || responsesLoading}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </>
          )}
        </div>
      )}

      {/* cancel confirm */}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={cancelling ? undefined : () => setConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg mb-2" style={{ letterSpacing: "-0.16px" }}>Cancel this batch?</h2>
            <p className="text-sm text-[var(--fg-secondary)] mb-5">Completed work may still be billed.</p>
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmOpen(false)} disabled={cancelling}>
                Keep running
              </Button>
              <Button variant="danger" size="sm" onClick={cancelBatch} disabled={cancelling}>
                {cancelling && <Loader2 className="size-3.5 animate-spin" />}
                {cancelling ? "Cancelling…" : "Confirm cancel"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-40 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-4 py-3 text-sm">
          {toast}
        </div>
      )}

      {selectedResponse && (
        <ResponseModal
          row={selectedResponse}
          batchModel={batch.model ?? null}
          onClose={() => setSelectedResponse(null)}
        />
      )}
    </div>
  );
}
