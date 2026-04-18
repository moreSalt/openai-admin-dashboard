"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Layers, HardDrive, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/batches", label: "Batches", icon: Layers },
  { href: "/storage", label: "Storage", icon: HardDrive },
];

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="w-60 shrink-0 border-r border-[var(--border)] bg-[var(--bg)] flex flex-col">
      <div className="px-5 h-14 flex items-center gap-2 border-b border-[var(--border)]">
        <CircleDot
          className="size-4"
          style={{ color: "var(--brand)" }}
          strokeWidth={2.5}
        />
        <span className="text-[15px] tracking-tight">OpenAI Console</span>
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
  );
}
