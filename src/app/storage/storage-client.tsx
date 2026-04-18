"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatBytes, formatRelative } from "@/lib/utils";
import { RefreshCw, AlertCircle, Loader2, FileText, Download } from "lucide-react";

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

export function StorageClient() {
  const [files, setFiles] = useState<FileObj[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async (force = false) => {
    if (!force) {
      try {
        const raw = sessionStorage.getItem(FILES_CACHE_KEY);
        if (raw) {
          setFiles(JSON.parse(raw));
          return;
        }
      } catch {}
    }

    if (force) {
      try { sessionStorage.removeItem(FILES_CACHE_KEY); } catch {}
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/files", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setFiles(body.files);
      setSelected(new Set());
      try { sessionStorage.setItem(FILES_CACHE_KEY, JSON.stringify(body.files)); } catch {}
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalBytes = files?.reduce((a, f) => a + (f.bytes || 0), 0) ?? 0;

  const allSelected = files != null && files.length > 0 && selected.size === files.length;
  const someSelected = selected.size > 0 && !allSelected;

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(files!.map((f) => f.id)));
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
        <span className="label-mono">
          {files == null
            ? "loading"
            : `${files.length} files · ${formatBytes(totalBytes)}`}
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
            {files?.map((f) => (
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
    </div>
  );
}
