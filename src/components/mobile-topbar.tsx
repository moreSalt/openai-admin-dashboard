"use client";

import { Menu, CircleDot } from "lucide-react";

export function MobileTopbar({ onOpen }: { onOpen: () => void }) {
  return (
    <header className="md:hidden sticky top-0 z-30 flex items-center gap-3 h-14 px-4 border-b border-[var(--border)] bg-[var(--bg)] shrink-0">
      <button
        onClick={onOpen}
        className="text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors"
        aria-label="Open navigation"
      >
        <Menu className="size-5" />
      </button>
      <CircleDot className="size-4" style={{ color: "var(--brand)" }} strokeWidth={2.5} />
      <span className="text-[15px] tracking-tight">OpenAI Console</span>
    </header>
  );
}
