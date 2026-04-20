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
    <div className="border-b border-[var(--border)] px-4 py-4 sm:px-6 md:px-8 md:py-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div>
        <h1 className="text-xl sm:text-2xl tracking-tight" style={{ letterSpacing: "-0.16px" }}>
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-[var(--fg-muted)]">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
