import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * shadcn/ui's own `cn` helper, copied in verbatim (design §13.1 — shadcn is
 * not a dependency, its components live in this tree as our source). Merges
 * conditional class lists (`clsx`) and then resolves conflicting Tailwind
 * utility classes so the LAST one wins (`tailwind-merge`) instead of both
 * surviving in the DOM, which is what every generated shadcn component
 * expects from its `className` prop.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
