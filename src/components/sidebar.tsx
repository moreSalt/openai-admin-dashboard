"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Layers, HardDrive, CircleDot, X } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/batches", label: "Batches", icon: Layers },
  { href: "/storage", label: "Storage", icon: HardDrive },
];

export function Sidebar({ open, onClose }: { open?: boolean; onClose?: () => void }) {
  const path = usePathname();

  useEffect(() => {
    if (open) onClose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          "w-60 shrink-0 border-r border-[var(--border)] bg-[var(--bg)] flex flex-col",
          "fixed inset-y-0 left-0 z-40 transition-transform duration-200",
          "md:static md:inset-auto md:z-auto md:translate-x-0 md:h-full",
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        <div className="px-5 h-14 flex items-center gap-2 border-b border-[var(--border)]">
          <CircleDot
            className="size-4"
            style={{ color: "var(--brand)" }}
            strokeWidth={2.5}
          />
          <span className="text-[15px] tracking-tight">OpenAI Console</span>
          <button
            onClick={onClose}
            className="ml-auto text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors md:hidden"
            aria-label="Close navigation"
          >
            <X className="size-4" />
          </button>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          <div className="label-mono px-2 py-2">Platform</div>
          {nav.map((item) => {
            const active =
              path === item.href || path?.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm",
                  "text-[var(--fg-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--fg)]",
                  "transition-colors",
                  active &&
                    "bg-[var(--bg-elevated)] text-[var(--fg)] border border-[var(--border-strong)]",
                )}
              >
                <Icon className="size-4" strokeWidth={1.75} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-[var(--border)] text-xs text-[var(--fg-muted)]">
          <div className="label-mono mb-1">Env</div>
          <span className="mono">OPENAI_API_KEY</span>
        </div>
      </aside>
    </>
  );
}
