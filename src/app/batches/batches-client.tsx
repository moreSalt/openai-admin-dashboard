"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatRelative } from "@/lib/utils";
import { BatchDetail } from "@/app/batches/[id]/batch-detail";
import {
  RefreshCw,
  Ban,
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Search,
  X,
  Circle,
  ChevronRight as ArrowRight,
  Tags,
} from "lucide-react";

type Batch = {
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

const RUNNING = new Set(["validating", "in_progress", "finalizing"]);
const PAGE_SIZE = 20;
const CACHE_KEY = "batchdash:batches";

function statusTone(
  s: string,
): "success" | "warn" | "danger" | "info" | "neutral" {
  if (s === "completed") return "success";
  if (s === "failed" || s === "expired" || s === "cancelled") return "danger";
  if (s === "cancelling") return "warn";
  if (RUNNING.has(s)) return "info";
  return "neutral";
}

export function BatchesClient() {
  const [allBatches, setAllBatches] = useState<Batch[]>([]);
  const [modalId, setModalId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [continueCursor, setContinueCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [cancelling, setCancelling] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<
    "all" | "selected" | null
  >(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const saveCache = (batches: Batch[], cursor: string | null) => {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ batches, cursor })); } catch {}
  };

  const load = useCallback(async (force = false) => {
    if (!force) {
      try {
        const raw = sessionStorage.getItem(CACHE_KEY);
        if (raw) {
          const { batches, cursor } = JSON.parse(raw) as { batches: Batch[]; cursor: string | null };
          setAllBatches(batches);
          setContinueCursor(cursor);
          setPage(0);
          setSelected(new Set());
          return;
        }
      } catch {}
    }

    if (force) {
      try { sessionStorage.removeItem(CACHE_KEY); } catch {}
    }

    setLoading(true);
    setLoadingMore(false);
    setContinueCursor(null);
    setError(null);
    setAllBatches([]);
    setSelected(new Set());
    setPage(0);

    const INITIAL = 500;
    const MAX = 5000;

    try {
      // fetch first 500 before showing UI
      const collected: Batch[] = [];
      let cursor: string | null = null;
      while (collected.length < INITIAL) {
        const qs: string = cursor ? `&after=${cursor}` : "";
        const res = await fetch(`/api/batches?limit=100${qs}`, { cache: "no-store" });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        collected.push(...body.batches);
        if (!body.has_more) {
          setAllBatches(collected);
          saveCache(collected, null);
          setLoading(false);
          return;
        }
        cursor = body.next_cursor;
      }
      setAllBatches(collected);
      setLoading(false);

      // background: fetch 500 at a time, append each chunk, stop at MAX
      setLoadingMore(true);
      let total = collected.length;
      let allFetched = [...collected];
      while (cursor && total < MAX) {
        const chunk: Batch[] = [];
        while (chunk.length < 500 && cursor && total + chunk.length < MAX) {
          const r: Response = await fetch(`/api/batches?limit=100&after=${cursor}`, { cache: "no-store" });
          const b = await r.json();
          if (!r.ok) { cursor = null; break; }
          chunk.push(...b.batches);
          cursor = b.has_more ? b.next_cursor : null;
          if (!b.has_more) break;
        }
        if (chunk.length > 0) {
          setAllBatches((prev) => [...prev, ...chunk]);
          allFetched = [...allFetched, ...chunk];
          total += chunk.length;
        }
        if (!cursor) break;
      }
      // stopped at MAX — save cursor so user can continue
      if (cursor) setContinueCursor(cursor);
      saveCache(allFetched, cursor ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setLoading(false);
    } finally {
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadMore = useCallback(async () => {
    if (!continueCursor || loadingMore) return;
    setLoadingMore(true);
    setContinueCursor(null);
    let cursor: string | null = continueCursor;
    let added = 0;
    const newChunks: Batch[] = [];

    // Snapshot existing batches from cache to build the full list for saveCache
    let existingBatches: Batch[] = [];
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) existingBatches = (JSON.parse(raw) as { batches: Batch[] }).batches ?? [];
    } catch {}

    try {
      while (cursor && added < 5000) {
        const chunk: Batch[] = [];
        while (chunk.length < 500 && cursor) {
          const r: Response = await fetch(`/api/batches?limit=100&after=${cursor}`, { cache: "no-store" });
          const b = await r.json();
          if (!r.ok) { cursor = null; break; }
          chunk.push(...b.batches);
          cursor = b.has_more ? b.next_cursor : null;
          if (!b.has_more) break;
        }
        if (chunk.length > 0) {
          setAllBatches((prev) => [...prev, ...chunk]);
          newChunks.push(...chunk);
          added += chunk.length;
        }
        if (!cursor) break;
      }
      if (cursor) setContinueCursor(cursor);
      saveCache([...existingBatches, ...newChunks], cursor ?? null);
    } catch {
      // silently stop; user can retry
    } finally {
      setLoadingMore(false);
    }
  }, [continueCursor, loadingMore]);

  // global stats from all batches
  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const b of allBatches) counts[b.status] = (counts[b.status] ?? 0) + 1;
    const running = allBatches.filter((b) => RUNNING.has(b.status)).length;
    return { counts, running };
  }, [allBatches]);

  // search across all batches, then paginate
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allBatches;
    return allBatches.filter(
      (b) =>
        b.id.toLowerCase().includes(q) ||
        b.status.toLowerCase().includes(q) ||
        b.endpoint.toLowerCase().includes(q) ||
        Object.values(b.metadata ?? {}).some((v) =>
          v.toLowerCase().includes(q),
        ),
    );
  }, [allBatches, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  // reset page when query changes
  useEffect(() => { setPage(0); }, [query]);

  const cancellableSelected = useMemo(
    () =>
      [...selected].filter((id) => {
        const b = allBatches.find((x) => x.id === id);
        return b && RUNNING.has(b.status);
      }),
    [selected, allBatches],
  );

  const allRunning = useMemo(
    () => allBatches.filter((b) => RUNNING.has(b.status)),
    [allBatches],
  );

  const allPageSelected =
    pageRows.length > 0 && pageRows.every((b) => selected.has(b.id));

  const toggleAll = () => {
    if (allPageSelected) {
      setSelected((s) => {
        const next = new Set(s);
        pageRows.forEach((b) => next.delete(b.id));
        return next;
      });
    } else {
      setSelected((s) => {
        const next = new Set(s);
        pageRows.forEach((b) => next.add(b.id));
        return next;
      });
    }
  };

  const toggleOne = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const cancelIds = async (ids: string[]) => {
    setCancelling(true);
    try {
      const res = await fetch("/api/batches/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      showToast(
        `Cancelled ${body.cancelled.length}${body.failed.length ? ` · ${body.failed.length} failed` : ""}.`,
      );
      await load(true);
    } catch (e) {
      showToast(`Error: ${e instanceof Error ? e.message : "cancel failed"}`);
    } finally {
      setCancelling(false);
      setConfirmTarget(null);
    }
  };

  const confirmAndCancel = () => {
    if (confirmTarget === "all") cancelIds(allRunning.map((b) => b.id));
    else if (confirmTarget === "selected") cancelIds(cancellableSelected);
  };

  const cancelCount =
    confirmTarget === "all" ? allRunning.length : cancellableSelected.length;

  return (
    <div className="px-8 py-6 pb-24">
      {/* stat strip */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        {loading ? (
          <>
            <div className="h-16 w-36 rounded-lg bg-[var(--bg-elevated)] animate-pulse" />
            <div className="h-16 w-36 rounded-lg bg-[var(--bg-elevated)] animate-pulse" />
            <div className="h-16 w-36 rounded-lg bg-[var(--bg-elevated)] animate-pulse" />
          </>
        ) : (
          <>
            <StatChip label="Running" count={stats.running} active={stats.running > 0} dot="var(--brand)" />
            <StatChip label="Total" count={allBatches.length} dot="var(--fg-muted)" />
            {(stats.counts["completed"] ?? 0) > 0 && (
              <StatChip label="Completed" count={stats.counts["completed"]} dot="#3ecf8e" tone="success" />
            )}
            {(stats.counts["failed"] ?? 0) > 0 && (
              <StatChip label="Failed" count={stats.counts["failed"]} dot="var(--danger)" tone="danger" />
            )}
            {(stats.counts["cancelled"] ?? 0) > 0 && (
              <StatChip label="Cancelled" count={stats.counts["cancelled"]} dot="var(--fg-muted)" />
            )}
            {loadingMore && (
              <span className="inline-flex items-center gap-1.5 text-xs text-[var(--fg-muted)]">
                <Loader2 className="size-3 animate-spin" />
                Loading more…
              </span>
            )}
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          {stats.running > 0 && (
            <Button variant="danger" size="sm" onClick={() => setConfirmTarget("all")} disabled={cancelling}>
              <Ban className="size-3.5" />
              Cancel all running
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => load(true)} disabled={loading}>
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* search */}
      <div className="relative flex items-center mb-4">
        <Search className="absolute left-3 size-3.5 text-[var(--fg-muted)] pointer-events-none" />
        <input
          type="text"
          placeholder="Search all batches by ID, status, endpoint, metadata…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-9 w-full max-w-lg rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] pl-8 pr-8 text-sm text-[var(--fg)] placeholder:text-[var(--fg-muted)] outline-none focus:border-[var(--border-stronger)] transition-colors"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute left-[calc(min(100%,32rem)-24px)] text-[var(--fg-muted)] hover:text-[var(--fg)]"
          >
            <X className="size-3.5" />
          </button>
        )}
        {query && (
          <span className="ml-3 text-xs text-[var(--fg-muted)]">
            {filtered.length} result{filtered.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-[rgba(229,72,77,0.3)] bg-[rgba(229,72,77,0.05)] text-[var(--danger)] px-4 py-3 flex items-start gap-2 text-sm mb-4">
          <AlertCircle className="size-4 mt-0.5" />
          <div>
            <div className="font-medium">Failed to load batches</div>
            <div className="mono text-xs opacity-80 mt-1">{error}</div>
          </div>
        </div>
      )}

      {/* table */}
      <div className="rounded-lg border border-[var(--border)] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--bg-elevated)] text-[var(--fg-muted)]">
            <tr className="label-mono">
              <th className="px-4 py-2.5 w-10">
                <input
                  type="checkbox"
                  checked={allPageSelected && pageRows.length > 0}
                  onChange={toggleAll}
                  className="accent-[var(--brand)] size-4 cursor-pointer"
                />
              </th>
              <th className="text-left font-normal px-4 py-2.5">Batch ID</th>
              <th className="text-left font-normal px-4 py-2.5">Status</th>
              <th className="text-left font-normal px-4 py-2.5">Endpoint</th>
              <th className="text-right font-normal px-4 py-2.5">Progress</th>
              <th className="text-right font-normal px-4 py-2.5">Created</th>
              <th className="text-left font-normal px-4 py-2.5">Meta</th>
              <th className="w-16 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center">
                  <Loader2 className="size-5 animate-spin inline text-[var(--fg-muted)]" />
                </td>
              </tr>
            )}
            {!loading && pageRows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-[var(--fg-muted)]">
                  {query ? "No batches match." : "No batches yet."}
                </td>
              </tr>
            )}
            {!loading &&
              pageRows.map((b) => {
                const done = b.request_counts?.completed ?? 0;
                const failed = b.request_counts?.failed ?? 0;
                const total = b.request_counts?.total ?? 0;
                const pct = total > 0 ? ((done + failed) / total) * 100 : 0;
                const isRunning = RUNNING.has(b.status);
                const isSelected = selected.has(b.id);
                const meta = b.metadata ? Object.entries(b.metadata) : [];
                const isExpanded = expanded.has(b.id);

                return (
                  <>
                  <tr
                    key={b.id}
                    className={`border-t border-[var(--border)] transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-[rgba(62,207,142,0.04)]"
                        : "hover:bg-[var(--bg-elevated)]/60"
                    }`}
                    onClick={() => setModalId(b.id)}
                  >
                    <td
                      className="px-4 py-3 w-10"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOne(b.id)}
                        className="accent-[var(--brand)] size-4 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/batches/${b.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="mono text-xs text-[var(--fg-secondary)] hover:text-[var(--brand-link)] transition-colors inline-block"
                      >
                        {b.id}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone(b.status)}>{b.status}</Badge>
                    </td>
                    <td className="px-4 py-3 mono text-xs text-[var(--fg-secondary)]">
                      {b.endpoint}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {total > 0 ? (
                        <div className="inline-flex flex-col items-end gap-1 min-w-[120px]">
                          <span className="text-xs text-[var(--fg-secondary)]">
                            {done}/{total}
                            {failed > 0 && (
                              <span className="text-[var(--danger)]">
                                {" "}({failed} failed)
                              </span>
                            )}
                          </span>
                          <div className="h-1 w-full bg-[var(--border)] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[var(--brand)]"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-[var(--fg-muted)] text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-[var(--fg-muted)]">
                      {formatRelative(b.created_at)}
                    </td>
                    <td
                      className="px-4 py-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {meta.length > 0 ? (
                        <button
                          onClick={() =>
                            setExpanded((s) => {
                              const next = new Set(s);
                              next.has(b.id) ? next.delete(b.id) : next.add(b.id);
                              return next;
                            })
                          }
                          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--fg-secondary)] hover:border-[var(--border-stronger)] hover:text-[var(--fg)] transition-colors"
                        >
                          <Tags className="size-3" />
                          {meta.length}
                          <ChevronDown
                            className={`size-3 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          />
                        </button>
                      ) : (
                        <span className="text-[var(--fg-muted)] text-xs">—</span>
                      )}
                    </td>
                    <td
                      className="px-4 py-3 w-16 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        {isRunning && (
                          <button
                            title="Cancel this batch"
                            disabled={cancelling}
                            onClick={() => {
                              setSelected(new Set([b.id]));
                              setConfirmTarget("selected");
                            }}
                            className="text-[var(--fg-muted)] hover:text-[var(--danger)] transition-colors disabled:opacity-40"
                          >
                            <Ban className="size-3.5" />
                          </button>
                        )}
                        <ArrowRight className="size-3.5 text-[var(--fg-muted)]" />
                      </div>
                    </td>
                  </tr>
                  {isExpanded && meta.length > 0 && (
                    <tr className="border-t border-[var(--border)] bg-[var(--bg-elevated)]/40">
                      <td colSpan={8} className="px-6 py-3">
                        <div className="flex flex-wrap gap-x-6 gap-y-2">
                          {meta.map(([k, v]) => (
                            <div key={k} className="flex items-baseline gap-2 min-w-0">
                              <span className="label-mono shrink-0">{k}</span>
                              <span className="mono text-xs text-[var(--fg-secondary)] truncate max-w-[300px]" title={v}>
                                {v}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                  </>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* pagination */}
      <div className="flex items-center justify-between mt-4">
        <span className="label-mono text-[var(--fg-muted)] inline-flex items-center gap-2">
          {query
            ? `${filtered.length} results · page ${safePage + 1} of ${totalPages}`
            : `${allBatches.length}${loadingMore ? "+" : ""} batches · page ${safePage + 1} of ${totalPages}`}
          {loadingMore && <Loader2 className="size-3 animate-spin" />}
        </span>
        <div className="flex items-center gap-2">
          {continueCursor && !loadingMore && (
            <Button variant="outline" size="sm" onClick={loadMore}>
              Load 5,000 more
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0 || loading}>
            <ChevronLeft className="size-4" />
            Prev
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1 || loading}>
            Next
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* floating selection bar */}
      <SelectionBar
        selected={selected}
        cancellable={cancellableSelected}
        busy={cancelling}
        onDeselect={() => setSelected(new Set())}
        onCancel={() => setConfirmTarget("selected")}
      />

      {confirmTarget && (
        <ConfirmDialog
          count={cancelCount}
          busy={cancelling}
          onCancel={() => setConfirmTarget(null)}
          onConfirm={confirmAndCancel}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-40 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-4 py-3 text-sm">
          {toast}
        </div>
      )}

      {/* batch detail modal */}
      {modalId && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-y-auto py-10"
          onClick={() => setModalId(null)}
        >
          <div
            className="relative w-full max-w-5xl mx-4 rounded-xl border border-[var(--border-strong)] bg-[var(--bg)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <BatchDetail id={modalId} onClose={() => setModalId(null)} initialBatch={allBatches.find((b) => b.id === modalId)} />
          </div>
        </div>
      )}
    </div>
  );
}

function StatChip({
  label,
  count,
  dot,
  active,
  tone,
}: {
  label: string;
  count: number;
  dot: string;
  active?: boolean;
  tone?: "success" | "danger";
}) {
  const bg =
    tone === "success"
      ? "bg-[rgba(62,207,142,0.08)] border-[var(--brand-border)]"
      : tone === "danger"
      ? "bg-[rgba(229,72,77,0.08)] border-[rgba(229,72,77,0.3)]"
      : "bg-[var(--bg-elevated)] border-[var(--border-strong)]";

  return (
    <div className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 ${bg}`}>
      {active ? (
        <span className="relative flex size-2">
          <span
            className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
            style={{ backgroundColor: dot }}
          />
          <span
            className="relative inline-flex rounded-full size-2"
            style={{ backgroundColor: dot }}
          />
        </span>
      ) : (
        <Circle className="size-2 fill-current" style={{ color: dot }} />
      )}
      <span className="text-2xl font-light leading-none" style={{ letterSpacing: "-0.5px" }}>
        {count}
      </span>
      <span className="label-mono text-[var(--fg-muted)]">{label}</span>
    </div>
  );
}

function SelectionBar({
  selected,
  cancellable,
  busy,
  onDeselect,
  onCancel,
}: {
  selected: Set<string>;
  cancellable: string[];
  busy: boolean;
  onDeselect: () => void;
  onCancel: () => void;
}) {
  const visible = selected.size > 0;
  return (
    <div
      className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 transition-all duration-200 ${
        visible ? "translate-y-0 opacity-100 pointer-events-auto" : "translate-y-4 opacity-0 pointer-events-none"
      }`}
    >
      <div className="flex items-center gap-3 rounded-xl border border-[var(--border-stronger)] bg-[var(--bg-elevated)] px-4 py-3 shadow-xl">
        <span className="text-sm text-[var(--fg-secondary)]">
          <span className="text-[var(--fg)] font-medium">{selected.size}</span>{" "}
          {selected.size === 1 ? "batch" : "batches"} selected
        </span>
        <div className="w-px h-4 bg-[var(--border-strong)]" />
        <button onClick={onDeselect} className="text-xs text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors">
          Deselect all
        </button>
        {cancellable.length > 0 && (
          <Button variant="danger" size="sm" onClick={onCancel} disabled={busy}>
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            <Ban className="size-3.5" />
            Cancel {cancellable.length} running
          </Button>
        )}
      </div>
    </div>
  );
}

function ConfirmDialog({
  count,
  busy,
  onCancel,
  onConfirm,
}: {
  count: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="w-full max-w-md rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg mb-2" style={{ letterSpacing: "-0.16px" }}>
          Cancel {count} {count === 1 ? "batch" : "batches"}?
        </h2>
        <p className="text-sm text-[var(--fg-secondary)] mb-5">
          Only batches in <span className="mono">validating</span>,{" "}
          <span className="mono">in_progress</span>, or{" "}
          <span className="mono">finalizing</span> will be cancelled. Completed
          work may still be billed.
        </p>
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Keep running
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm} disabled={busy}>
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            {busy ? "Cancelling…" : "Confirm cancel"}
          </Button>
        </div>
      </div>
    </div>
  );
}
