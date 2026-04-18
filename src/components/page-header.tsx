import * as React from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="border-b border-[var(--border)] px-8 py-6 flex items-start justify-between gap-6">
      <div>
        <h1 className="text-2xl tracking-tight" style={{ letterSpacing: "-0.16px" }}>
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-[var(--fg-muted)]">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
