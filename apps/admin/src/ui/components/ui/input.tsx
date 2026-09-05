import type { InputHTMLAttributes, JSX } from "react";

import { cn } from "../../lib/utils.js";

/**
 * shadcn/ui's own `Input`, copied into the tree (design §13.1) — the second
 * component this app carries, after `Button` (task 13b.1). Unlike `Button`,
 * shadcn's stock `Input` needs no Radix primitive at all — a plain `<input>`
 * styled with Tailwind utilities is the whole component — so adding it here
 * costs no new dependency (launch prompt §5: "do not reach for a new
 * dependency when a shadcn primitive already covers it"). Reads
 * `border-border`/`bg-background`/`ring-ring`, the same bridged tokens
 * `Button` already reads, so a text field and a button share one visual
 * language with no separate declaration.
 */
export function Input({ className, type, ...props }: InputHTMLAttributes<HTMLInputElement>): JSX.Element {
  return (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
