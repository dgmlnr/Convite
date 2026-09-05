import type { JSX } from "react";

import { Button } from "./components/ui/button.js";
import { COPY } from "./copy.js";
import { cn } from "./lib/utils.js";
import type { TenantListRow } from "./tenant-list.js";

export interface TenantListScreenProps {
  readonly rows: readonly TenantListRow[];
  readonly onLogout: () => void;
}

/**
 * One color per real state (launch prompt §5: "who is paid up and who is
 * not, at a glance") — never a fifth color for a state the domain does not
 * have (design's own closed `TenantStatus` union, spec Domain D). Reads the
 * SAME bridged/admin tokens every other component already reads
 * (`bg-primary`/`bg-destructive`/`bg-muted`), never a new literal color.
 *
 * SOLID, not tinted (a real contrast bug found via this slice's own
 * screenshot check, `LoginScreen.tsx`'s own docstring has the full
 * measurement): a translucent `bg-primary/10`/`bg-destructive/10` chip over
 * the dark page background left `active`/`expired` badges measuring under
 * 3:1 — visibly faint in the first screenshot. A SOLID chip
 * (`bg-primary`/`bg-destructive`) with `text-primary-foreground` (white)
 * is the exact same pairing the login button already proves legible.
 * `not-yet-active`/`no-window` were never affected: `bg-muted` is a
 * genuinely light, solid chip (`#f5f5f5`), so `text-muted-foreground`
 * already reads correctly on it.
 */
const STATUS_BADGE_CLASS: Readonly<Record<TenantListRow["statusKind"], string>> = {
  active: "bg-primary text-primary-foreground",
  expired: "bg-destructive text-primary-foreground",
  "not-yet-active": "bg-muted text-muted-foreground",
  "no-window": "bg-muted text-muted-foreground",
};

/**
 * The tenant list (task 14.4) — an operator's first real screen with data.
 * Deliberately DENSE rather than decorated (launch prompt §5): one row per
 * tenant, the id as the primary label, the status badge as the one thing
 * that answers "is this tenant working right now" without reading a
 * sentence. `embedKey` rides along in a smaller, muted line — identifying
 * detail, never the headline (tenant DETAIL, the full snippet and editors,
 * is the next slice's own job).
 */
export function TenantListScreen({ rows, onLogout }: TenantListScreenProps): JSX.Element {
  return (
    <div className="min-h-screen bg-background text-primary-foreground">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <h1 className="text-base font-semibold">{COPY.appName}</h1>
        <Button variant="outline" size="sm" onClick={onLogout}>
          {COPY.logout}
        </Button>
      </header>
      <main className="p-6">
        <h2 className="mb-4 text-lg font-semibold">{COPY.tenantListTitle}</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-primary-foreground/70">{COPY.tenantListEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center justify-between rounded-md border border-border px-4 py-3">
                <div className="flex flex-col">
                  <span className="font-medium">{row.id}</span>
                  <span className="text-xs text-primary-foreground/70">
                    {COPY.tenantEmbedKeyLabel}: {row.embedKey}
                  </span>
                </div>
                <span className={cn("rounded-full px-3 py-1 text-xs font-medium", STATUS_BADGE_CLASS[row.statusKind])}>{row.statusLabel}</span>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
