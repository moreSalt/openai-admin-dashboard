"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const button = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-stronger)]",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--fg)] text-[var(--bg-button)] hover:bg-[var(--fg-secondary)] rounded-full px-4 py-1.5 border border-[var(--fg)]",
        secondary:
          "bg-[var(--bg-button)] text-[var(--fg)] border border-[var(--border-strong)] hover:border-[var(--border-stronger)] rounded-full px-4 py-1.5",
        danger:
          "bg-[var(--bg-button)] text-[var(--danger)] border border-[var(--danger)]/40 hover:border-[var(--danger)] rounded-md px-3 py-1.5",
        ghost:
          "text-[var(--fg-secondary)] hover:text-[var(--fg)] hover:bg-[var(--bg-elevated)] rounded-md px-2.5 py-1.5",
        outline:
          "bg-transparent border border-[var(--border-strong)] hover:border-[var(--border-stronger)] rounded-md px-3 py-1.5",
      },
      size: {
        sm: "h-8 text-xs",
        md: "h-9",
        lg: "h-10 px-5",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(button({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
