"use client";

import { useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function isJson(text: string): { ok: true; value: unknown } | { ok: false } {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch {
    return { ok: false };
  }
}

export function ContentRenderer({ content }: { content: string }) {
  const [raw, setRaw] = useState(false);
  const parsed = useMemo(() => isJson(content), [content]);

  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="flex justify-end">
        <button
          onClick={() => setRaw(r => !r)}
          className="label-mono text-[10px] text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors px-1.5 py-0.5 rounded border border-[var(--border)] hover:border-[var(--border-strong)]"
        >
          {raw ? "rendered" : "raw"}
        </button>
      </div>
      {raw ? (
        <pre className="text-xs text-[var(--fg-secondary)] whitespace-pre-wrap break-words font-mono bg-[var(--bg)] rounded px-2 py-1.5 overflow-auto">
          {content}
        </pre>
      ) : parsed.ok ? (
        <pre className="text-xs text-[var(--fg-secondary)] whitespace-pre-wrap font-mono bg-[var(--bg)] rounded px-2 py-1.5 overflow-auto">
          {JSON.stringify(parsed.value, null, 2)}
        </pre>
      ) : (
        <div className="prose-response text-xs text-[var(--fg-secondary)]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
