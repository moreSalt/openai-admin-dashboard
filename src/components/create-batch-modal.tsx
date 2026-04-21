"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, Loader2, AlertCircle, CheckCircle2, Upload, FileText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { validateBatchJsonl } from "@/lib/jsonl-validate";

type Mode = "paste" | "upload" | "pick";

const ENDPOINTS = [
  "/v1/chat/completions",
  "/v1/embeddings",
  "/v1/completions",
  "/v1/responses",
] as const;

type Endpoint = (typeof ENDPOINTS)[number];

const SAMPLES: Record<Endpoint, string> = {
  "/v1/chat/completions": [
    `{"custom_id": "req-1", "method": "POST", "url": "/v1/chat/completions", "body": {"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "What is 2+2?"}]}}`,
    `{"custom_id": "req-2", "method": "POST", "url": "/v1/chat/completions", "body": {"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "What is the capital of France?"}]}}`,
    `{"custom_id": "req-3", "method": "POST", "url": "/v1/chat/completions", "body": {"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "Write a haiku about coding."}]}}`,
  ].join("\n"),
  "/v1/embeddings": [
    `{"custom_id": "req-1", "method": "POST", "url": "/v1/embeddings", "body": {"model": "text-embedding-3-small", "input": "Hello world"}}`,
    `{"custom_id": "req-2", "method": "POST", "url": "/v1/embeddings", "body": {"model": "text-embedding-3-small", "input": "Goodbye world"}}`,
  ].join("\n"),
  "/v1/completions": [
    `{"custom_id": "req-1", "method": "POST", "url": "/v1/completions", "body": {"model": "gpt-3.5-turbo-instruct", "prompt": "The capital of France is", "max_tokens": 10}}`,
    `{"custom_id": "req-2", "method": "POST", "url": "/v1/completions", "body": {"model": "gpt-3.5-turbo-instruct", "prompt": "The color of the sky is", "max_tokens": 10}}`,
  ].join("\n"),
  "/v1/responses": [
    `{"custom_id": "req-1", "method": "POST", "url": "/v1/responses", "body": {"model": "gpt-4o-mini", "input": "What is 2+2?"}}`,
    `{"custom_id": "req-2", "method": "POST", "url": "/v1/responses", "body": {"model": "gpt-4o-mini", "input": "What is the capital of France?"}}`,
  ].join("\n"),
};

type OAIFile = {
  id: string;
  filename: string;
  bytes: number;
  created_at: number;
  purpose: string;
};

export function CreateBatchModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (batchId: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("paste");
  const [endpoint, setEndpoint] = useState<Endpoint>("/v1/chat/completions");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pickedFileId, setPickedFileId] = useState<string | null>(null);
  const [metaRows, setMetaRows] = useState<{ key: string; value: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<OAIFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [fileSearch, setFileSearch] = useState("");

  const validation = useMemo(
    () => (mode === "paste" && text ? validateBatchJsonl(text, endpoint) : null),
    [mode, text, endpoint],
  );

  const loadFiles = useCallback(async () => {
    setFilesLoading(true);
    setFilesError(null);
    try {
      const res = await fetch("/api/files?purpose=batch&limit=100", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setFiles(body.files ?? []);
    } catch (e) {
      setFilesError(e instanceof Error ? e.message : "Failed to load files");
    } finally {
      setFilesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode === "pick") loadFiles();
  }, [mode, loadFiles]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const filteredFiles = useMemo(() => {
    const q = fileSearch.trim().toLowerCase();
    if (!q) return files;
    return files.filter(
      (f) => f.filename.toLowerCase().includes(q) || f.id.toLowerCase().includes(q),
    );
  }, [files, fileSearch]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }, []);

  const addMetaRow = () => setMetaRows((r) => [...r, { key: "", value: "" }]);
  const removeMetaRow = (i: number) => setMetaRows((r) => r.filter((_, idx) => idx !== i));
  const updateMetaRow = (i: number, field: "key" | "value", val: string) =>
    setMetaRows((r) => r.map((row, idx) => (idx === i ? { ...row, [field]: val } : row)));

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      let input_file_id: string;

      if (mode === "paste") {
        if (!validation?.ok) {
          setError(
            validation?.firstError
              ? `Line ${validation.firstError.line}: ${validation.firstError.message}`
              : "Fix JSONL errors before submitting",
          );
          setSubmitting(false);
          return;
        }
        const blob = new File([text], "batch-input.jsonl", {
          type: "application/x-jsonlines",
        });
        const form = new FormData();
        form.append("file", blob);
        const upRes = await fetch("/api/files/upload", { method: "POST", body: form });
        const upBody = await upRes.json();
        if (!upRes.ok) throw new Error(upBody.error ?? `Upload failed: HTTP ${upRes.status}`);
        input_file_id = upBody.file.id;
      } else if (mode === "upload") {
        if (!file) {
          setError("Select a file");
          setSubmitting(false);
          return;
        }
        const form = new FormData();
        form.append("file", file);
        const upRes = await fetch("/api/files/upload", { method: "POST", body: form });
        const upBody = await upRes.json();
        if (!upRes.ok) throw new Error(upBody.error ?? `Upload failed: HTTP ${upRes.status}`);
        input_file_id = upBody.file.id;
      } else {
        if (!pickedFileId) {
          setError("Select a file");
          setSubmitting(false);
          return;
        }
        input_file_id = pickedFileId;
      }

      const metadata: Record<string, string> | undefined =
        metaRows.filter((r) => r.key.trim()).length > 0
          ? Object.fromEntries(
              metaRows.filter((r) => r.key.trim()).map((r) => [r.key.trim(), r.value]),
            )
          : undefined;

      const res = await fetch("/api/batches/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input_file_id,
          endpoint,
          completion_window: "24h",
          metadata,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);

      onCreated(body.batch.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Batch creation failed");
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit =
    !submitting &&
    ((mode === "paste" && (validation?.ok ?? false)) ||
      (mode === "upload" && file !== null) ||
      (mode === "pick" && pickedFileId !== null));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl border border-[var(--border-strong)] bg-[var(--bg)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[var(--border)] shrink-0">
          <h2 className="text-base font-medium" style={{ letterSpacing: "-0.16px" }}>
            New batch
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 flex flex-col gap-5">
          {/* endpoint + window */}
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
              <label className="label-mono text-xs text-[var(--fg-muted)]">Endpoint</label>
              <select
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value as Endpoint)}
                className="h-9 rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 text-sm text-[var(--fg)] outline-none focus:border-[var(--border-stronger)] transition-colors [color-scheme:dark]"
              >
                {ENDPOINTS.map((ep) => (
                  <option key={ep} value={ep}>
                    {ep}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5 w-28">
              <label className="label-mono text-xs text-[var(--fg-muted)]">Window</label>
              <select
                value="24h"
                disabled
                className="h-9 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm text-[var(--fg-muted)] outline-none opacity-60 cursor-not-allowed [color-scheme:dark]"
              >
                <option value="24h">24h</option>
              </select>
            </div>
          </div>

          {/* input mode tabs */}
          <div className="flex flex-col gap-3">
            <div className="flex border-b border-[var(--border)]">
              {(["paste", "upload", "pick"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-4 py-2 text-xs border-b-2 -mb-px transition-colors ${
                    mode === m
                      ? "border-[var(--brand)] text-[var(--fg)]"
                      : "border-transparent text-[var(--fg-muted)] hover:text-[var(--fg)]"
                  }`}
                >
                  {m === "pick" ? "Pick existing" : m === "paste" ? "Paste JSONL" : "Upload file"}
                </button>
              ))}
            </div>

            {mode === "paste" && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between min-h-[20px]">
                  {validation ? (
                    <span
                      className={`text-xs flex items-center gap-1.5 ${
                        validation.ok ? "text-[var(--brand)]" : "text-[var(--danger)]"
                      }`}
                    >
                      {validation.ok ? (
                        <>
                          <CheckCircle2 className="size-3.5" />
                          {validation.count} request{validation.count !== 1 ? "s" : ""} · all valid
                        </>
                      ) : (
                        <>
                          <AlertCircle className="size-3.5" />
                          Line {validation.firstError!.line}: {validation.firstError!.message}
                          {validation.issues.length > 1
                            ? ` (+${validation.issues.length - 1} more)`
                            : ""}
                        </>
                      )}
                    </span>
                  ) : (
                    <span />
                  )}
                  <button
                    onClick={() => setText(SAMPLES[endpoint])}
                    className="text-xs text-[var(--fg-muted)] hover:text-[var(--brand)] transition-colors"
                  >
                    Load sample
                  </button>
                </div>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={`{"custom_id": "req-1", "method": "POST", "url": "${endpoint}", "body": {...}}`}
                  spellCheck={false}
                  className="font-mono text-xs h-52 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[var(--fg)] placeholder:text-[var(--fg-muted)] outline-none focus:border-[var(--border-stronger)] transition-colors resize-none"
                />
              </div>
            )}

            {mode === "upload" && (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-3 h-44 rounded-md border-2 border-dashed cursor-pointer transition-colors ${
                  isDragging
                    ? "border-[var(--brand)] bg-[rgba(62,207,142,0.05)]"
                    : file
                      ? "border-[var(--brand-border)] bg-[rgba(62,207,142,0.04)]"
                      : "border-[var(--border-strong)] hover:border-[var(--border-stronger)]"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".jsonl,.txt,application/x-jsonlines,text/plain"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                {file ? (
                  <>
                    <FileText className="size-8 text-[var(--brand)]" />
                    <div className="text-center">
                      <div className="text-sm text-[var(--fg)]">{file.name}</div>
                      <div className="text-xs text-[var(--fg-muted)] mt-0.5">
                        {(file.size / 1024).toFixed(1)} KB
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                      }}
                      className="text-xs text-[var(--fg-muted)] hover:text-[var(--danger)] transition-colors"
                    >
                      Remove
                    </button>
                  </>
                ) : (
                  <>
                    <Upload className="size-7 text-[var(--fg-muted)]" />
                    <div className="text-center">
                      <div className="text-sm text-[var(--fg-secondary)]">Drop .jsonl file here</div>
                      <div className="text-xs text-[var(--fg-muted)] mt-0.5">or click to browse</div>
                    </div>
                  </>
                )}
              </div>
            )}

            {mode === "pick" && (
              <div className="flex flex-col gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[var(--fg-muted)] pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search files…"
                    value={fileSearch}
                    onChange={(e) => setFileSearch(e.target.value)}
                    className="h-9 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] pl-8 pr-3 text-sm text-[var(--fg)] placeholder:text-[var(--fg-muted)] outline-none focus:border-[var(--border-stronger)] transition-colors"
                  />
                </div>
                {filesLoading && (
                  <div className="flex items-center justify-center py-8 text-[var(--fg-muted)]">
                    <Loader2 className="size-4 animate-spin" />
                  </div>
                )}
                {filesError && (
                  <div className="flex items-center gap-2 text-xs text-[var(--danger)] py-2">
                    <AlertCircle className="size-3.5" />
                    {filesError}
                  </div>
                )}
                {!filesLoading && !filesError && (
                  <div className="h-44 overflow-y-auto rounded-md border border-[var(--border)] divide-y divide-[var(--border)]">
                    {filteredFiles.length === 0 ? (
                      <div className="flex items-center justify-center h-full text-xs text-[var(--fg-muted)]">
                        {fileSearch ? "No files match." : "No batch files found."}
                      </div>
                    ) : (
                      filteredFiles.map((f) => (
                        <button
                          key={f.id}
                          onClick={() => setPickedFileId(f.id === pickedFileId ? null : f.id)}
                          className={`w-full flex items-start justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--bg-elevated)] ${
                            pickedFileId === f.id ? "bg-[rgba(62,207,142,0.06)]" : ""
                          }`}
                        >
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-xs text-[var(--fg)] truncate">{f.filename}</span>
                            <span className="mono text-[10px] text-[var(--fg-muted)]">{f.id}</span>
                          </div>
                          <span className="label-mono text-[10px] text-[var(--fg-muted)] shrink-0 pt-0.5">
                            {(f.bytes / 1024).toFixed(1)} KB
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* metadata */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="label-mono text-xs text-[var(--fg-muted)]">
                Metadata <span className="opacity-60">(optional)</span>
              </span>
              <button
                onClick={addMetaRow}
                className="text-xs text-[var(--fg-muted)] hover:text-[var(--brand)] transition-colors"
              >
                + Add
              </button>
            </div>
            {metaRows.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {metaRows.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="key"
                      value={row.key}
                      onChange={(e) => updateMetaRow(i, "key", e.target.value)}
                      className="h-8 flex-1 rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-2.5 text-xs text-[var(--fg)] placeholder:text-[var(--fg-muted)] outline-none focus:border-[var(--border-stronger)] font-mono"
                    />
                    <input
                      type="text"
                      placeholder="value"
                      value={row.value}
                      onChange={(e) => updateMetaRow(i, "value", e.target.value)}
                      className="h-8 flex-[2] rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-2.5 text-xs text-[var(--fg)] placeholder:text-[var(--fg-muted)] outline-none focus:border-[var(--border-stronger)]"
                    />
                    <button
                      onClick={() => removeMetaRow(i)}
                      className="text-[var(--fg-muted)] hover:text-[var(--danger)] transition-colors"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* error */}
          {error && (
            <div className="flex items-start gap-2 text-xs text-[var(--danger)] rounded-md border border-[rgba(229,72,77,0.3)] bg-[rgba(229,72,77,0.05)] px-3 py-2.5">
              <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--border)] shrink-0">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleSubmit} disabled={!canSubmit}>
            {submitting && <Loader2 className="size-3.5 animate-spin" />}
            {submitting ? "Creating…" : "Create batch"}
          </Button>
        </div>
      </div>
    </div>
  );
}
