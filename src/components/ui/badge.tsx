import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "success" | "warn" | "danger" | "info";

const tones: Record<Tone, string> = {
  neutral:
    "bg-[var(--bg-elevated)] text-[var(--fg-secondary)] border-[var(--border-strong)]",
  success:
    "bg-[rgba(62,207,142,0.08)] text-[var(--brand)] border-[var(--brand-border)]",
  warn: "bg-[rgba(245,165,36,0.08)] text-[var(--warn)] border-[rgba(245,165,36,0.3)]",
  danger:
    "bg-[rgba(229,72,77,0.08)] text-[var(--danger)] border-[rgba(229,72,77,0.3)]",
  info: "bg-[rgba(120,113,198,0.1)] text-[#a5a1e0] border-[rgba(120,113,198,0.3)]",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
