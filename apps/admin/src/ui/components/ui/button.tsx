import type { ButtonHTMLAttributes, JSX } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils.js";

/**
 * shadcn/ui's own Button, copied into the tree rather than installed
 * (design §13.1) — the first component this app carries, chosen because
 * every later screen (task 13b's own successors: login, tenant list,
 * operator management) needs one before it needs anything more specific.
 * Reads `bg-primary`/`text-primary-foreground`, both of which resolve
 * through `theme-bridge.css` back to `widget-protocol`'s own tokens — this
 * is the component the parity test (`theme-bridge.test.ts`) and the manual
 * visual check (task 13b.10) actually render.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        outline: "border border-border bg-background hover:bg-accent",
        ghost: "hover:bg-accent",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3",
        lg: "h-10 px-6",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Renders the single child element instead of a `<button>` (Radix's
   * Slot pattern), so a caller can make e.g. a styled `<a>` without this
   * component ever needing to know about routing. */
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps): JSX.Element {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
