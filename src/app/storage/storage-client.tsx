"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatBytes, formatRelative } from "@/lib/utils";
import { RefreshCw, AlertCircle, Loader2, FileText, Download, ChevronDown, ChevronLeft, ChevronRight, Search, X } from "lucide-react";

type FileObj = {
  id: string;
  filename: string;
  bytes: number;
  created_at: number;
  purpose: string;
  status?: string;
};

const FILES_CACHE_KEY = "batchdash:files";

function purposeTone(p: string): "success" | "info" | "warn" | "neutral" {
  if (p === "batch") return "info";
  if (p === "batch_output") return "success";
  if (p === "fine-tune" || p === "fine-tune-results") return "warn";
  return "neutral";
}

function downloadUrl(id: string, filename: string) {
  return `/api/files/download?id=${encodeURIComponent(id)}&filename=${encodeURIComponent(filename)}`;
}

function triggerDownload(id: string, filename: string) {
  const a = document.createElement("a");
  a.href = downloadUrl(id, filename);
  a.download = filename;
  a.click();
}

const MAX_FILES = 500;
const PAGE_SIZE = 100;

export function StorageClient() {
  const [files, setFiles] = useState<FileObj[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [continueCursor, setContinueCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");

  const load = useCallback(async (force = false) => {
    if (!force) {
      try {
        const raw = sessionStorage.getItem(FILES_CACHE_KEY);
        if (raw) {
          const { files: cached, cursor } = JSON.parse(raw) as { files: FileObj[]; cursor: string | null };
          setFiles(cached);
          setContinueCursor(cursor);
          return;
        }
      } catch {}
    }

    if (force) {
      try { sessionStorage.removeItem(FILES_CACHE_KEY); } catch {}
    }

    setLoading(true);
    setLoadingMore(false);
    setContinueCursor(null);
    setError(null);
    setFiles(null);
    setSelected(new Set());
    setPage(0);

    try {
      // fetch first 100, show UI
      const res = await fetch("/api/files?limit=100", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setFiles(body.files);
      setLoading(false);

      if (!body.has_more) {
        try { sessionStorage.setItem(FILES_CACHE_KEY, JSON.stringify({ files: body.files, cursor: null })); } catch {}
        return;
      }

      // background: fetch up to MAX_FILES total
      setLoadingMore(true);
      let cursor: string | null = body.next_cursor;
      let collected: FileObj[] = [...body.files];

      while (cursor && collected.length < MAX_FILES) {
        const r = await fetch(`/api/files?limit=100&after=${cursor}`, { cache: "no-store" });
        const b = await r.json();
        if (!r.ok) break;
        collected = [...collected, ...b.files];
        setFiles(collected);
        cursor = b.has_more && collected.length < MAX_FILES ? b.next_cursor : null;
        if (!b.has_more) break;
      }

      const finalCursor = collected.length >= MAX_FILES ? cursor : null;
      setContinueCursor(finalCursor);
      try { sessionStorage.setItem(FILES_CACHE_KEY, JSON.stringify({ files: collected, cursor: finalCursor })); } catch {}
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setLoading(false);
    } finally {
      setLoadingMore(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!continueCursor || loadingMore) return;
    setLoadingMore(true);
    setContinueCursor(null);
    let cursor: string | null = continueCursor;
    let existing: FileObj[] = [];
    try {
      const raw = sessionStorage.getItem(FILES_CACHE_KEY);
      if (raw) existing = (JSON.parse(raw) as { files: FileObj[] }).files ?? [];
    } catch {}

    try {
      let added: FileObj[] = [];
      while (cursor && added.length < MAX_FILES) {
        const r = await fetch(`/api/files?limit=100&after=${cursor}`, { cache: "no-store" });
        const b = await r.json();
        if (!r.ok) break;
        added = [...added, ...b.files];
        setFiles([...existing, ...added]);
        cursor = b.has_more ? b.next_cursor : null;
        if (!b.has_more) break;
      }
      const finalCursor = cursor ?? null;
      setContinueCursor(finalCursor);
      const all = [...existing, ...added];
      try { sessionStorage.setItem(FILES_CACHE_KEY, JSON.stringify({ files: all, cursor: finalCursor })); } catch {}
    } catch {
      // silently stop
    } finally {
      setLoadingMore(false);
    }
  }, [continueCursor, loadingMore]);

  useEffect(() => { load(); }, [load]);

  const totalBytes = files?.reduce((a, f) => a + (f.bytes || 0), 0) ?? 0;

  const filtered = files
    ? query.trim()
      ? files.filter((f) => {
          const q = query.trim().toLowerCase();
          return f.filename.toLowerCase().includes(q) || f.id.toLowerCase().includes(q) || f.purpose.toLowerCase().includes(q);
        })
      : files
    : null;

  const totalPages = Math.max(1, Math.ceil((filtered?.length ?? 0) / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filtered?.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE) ?? [];

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(0); }, [query]);

  const allSelected = pageRows.length > 0 && pageRows.every((f) => selected.has(f.id));
  const someSelected = selected.size > 0 && !pageRows.every((f) => selected.has(f.id)) && pageRows.some((f) => selected.has(f.id));

  function toggleAll() {
    if (allSelected) {
      setSelected((s) => { const n = new Set(s); pageRows.forEach((f) => n.delete(f.id)); return n; });
    } else {
      setSelected((s) => { const n = new Set(s); pageRows.forEach((f) => n.add(f.id)); return n; });
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function downloadSelected() {
    if (!files) return;
    const targets = files.filter((f) => selected.has(f.id));
    setDownloading(true);
    for (const f of targets) {
      triggerDownload(f.id, f.filename);
      await new Promise((r) => setTimeout(r, 300));
    }
    setDownloading(false);
  }

  return (
    <div className="px-8 py-6">
      <div className="flex items-center justify-between mb-4">
        <span className="label-mono inline-flex items-center gap-2">
          {files == null
            ? "loading"
            : `${files.length}${loadingMore ? "+" : ""} files · ${formatBytes(totalBytes)}`}
          {loadingMore && <Loader2 className="size-3 animate-spin text-[var(--fg-muted)]" />}
        </span>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={downloadSelected}
              disabled={downloading}
            >
              {downloading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Download className="size-3.5" />
              )}
              Download {selected.size} file{selected.size !== 1 ? "s" : ""}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => load(true)} disabled={loading}>
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="relative flex items-center mb-4">
        <Search className="absolute left-3 size-3.5 text-[var(--fg-muted)] pointer-events-none" />
        <input
          type="text"
          placeholder="Search by filename, ID, purpose…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-9 w-full max-w-lg rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] pl-8 pr-8 text-sm text-[var(--fg)] placeholder:text-[var(--fg-muted)] outline-none focus:border-[var(--border-stronger)] transition-colors"
        />
        {query && (
          <>
            <button
              onClick={() => setQuery("")}
              className="absolute left-[calc(min(100%,32rem)-24px)] text-[var(--fg-muted)] hover:text-[var(--fg)]"
            >
              <X className="size-3.5" />
            </button>
            <span className="ml-3 text-xs text-[var(--fg-muted)]">
              {filtered?.length ?? 0} result{(filtered?.length ?? 0) !== 1 ? "s" : ""}
            </span>
          </>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-[rgba(229,72,77,0.3)] bg-[rgba(229,72,77,0.05)] text-[var(--danger)] px-4 py-3 flex items-start gap-2 text-sm mb-4">
          <AlertCircle className="size-4 mt-0.5" />
          <div>
            <div className="font-medium">Failed to load files</div>
            <div className="mono text-xs opacity-80 mt-1">{error}</div>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-[var(--border)] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--bg-elevated)] text-[var(--fg-muted)]">
            <tr className="label-mono">
              <th className="px-4 py-2.5 w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected; }}
                  onChange={toggleAll}
                  className="cursor-pointer"
                  aria-label="Select all"
                />
              </th>
              <th className="text-left font-normal px-4 py-2.5">File</th>
              <th className="text-left font-normal px-4 py-2.5">Purpose</th>
              <th className="text-right font-normal px-4 py-2.5">Size</th>
              <th className="text-right font-normal px-4 py-2.5">Created</th>
              <th className="w-10 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {files == null && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center">
                  <Loader2 className="size-5 animate-spin inline text-[var(--fg-muted)]" />
                </td>
              </tr>
            )}
            {files && files.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center text-[var(--fg-muted)]"
                >
                  No files uploaded.
                </td>
              </tr>
            )}
            {pageRows.map((f) => (
              <tr
                key={f.id}
                className="border-t border-[var(--border)] hover:bg-[var(--bg-elevated)]/60"
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(f.id)}
                    onChange={() => toggleOne(f.id)}
                    className="cursor-pointer"
                    aria-label={`Select ${f.filename}`}
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <FileText className="size-4 text-[var(--fg-muted)]" />
                    <div className="flex flex-col">
                      <span className="text-[var(--fg)]">{f.filename}</span>
                      <span className="mono text-xs text-[var(--fg-muted)]">
                        {f.id}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={purposeTone(f.purpose)}>{f.purpose}</Badge>
                </td>
                <td className="px-4 py-3 text-right mono text-xs text-[var(--fg-secondary)]">
                  {formatBytes(f.bytes)}
                </td>
                <td className="px-4 py-3 text-right text-xs text-[var(--fg-muted)]">
                  {formatRelative(f.created_at)}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => triggerDownload(f.id, f.filename)}
                    className="text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors"
                    title="Download"
                    aria-label={`Download ${f.filename}`}
                  >
                    <Download className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4">
        <span className="label-mono text-[var(--fg-muted)] inline-flex items-center gap-2">
          {query
            ? `${filtered?.length ?? 0} results · page ${safePage + 1} of ${totalPages}`
            : `${files?.length ?? 0}${loadingMore ? "+" : ""} files · page ${safePage + 1} of ${totalPages}`}
          {loadingMore && <Loader2 className="size-3 animate-spin" />}
        </span>
        <div className="flex items-center gap-2">
          {continueCursor && !loadingMore && (
            <Button variant="outline" size="sm" onClick={loadMore}>
              <ChevronDown className="size-3.5" />
              Load 500 more
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

    </div>
  );
}
