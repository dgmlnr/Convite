import type { JSX } from "react";

import { AppNav, type AppScreen } from "./AppNav.js";
import { Button } from "./components/ui/button.js";
import { COPY } from "./copy.js";
import { cn } from "./lib/utils.js";
import type { TenantListRow } from "./tenant-list.js";

export interface TenantListScreenProps {
  readonly rows: readonly TenantListRow[];
  readonly onLogout: () => void;
  /** Slice 16's own shared nav — switches to the operators or audit screen,
   * the same "shell decides which screen, screen owns its own data" split
   * `AppShell.tsx`'s own docstring already establishes. */
  readonly onNavigate: (screen: AppScreen) => void;
  /** Slice 15's own navigation entry point — clicking a row opens that
   * tenant's detail screen (`TenantDetailScreen.tsx`). Client-side only:
   * this app has no real client-side router (`AppShell.tsx`'s own docstring
   * on why `GET /` doubles as the whole shell's session probe), so the
   * transition is a plain callback into `AppShell`'s own local state, not a
   * URL change. */
  readonly onSelectTenant: (id: string) => void;
  /** The gap slice 15 flagged but never built (`POST /tenants`, permission
   * `tenant.create`) — client-side gating is UX only (launch prompt §4): an
   * operator without the permission still sees this button, and the SAME
   * single authorization checkpoint that already guards every other tenant
   * route refuses the request server-side, exactly as `onSelectTenant`'s own
   * detail-screen fetch already does for `tenant.origins.edit`. */
  readonly onCreateTenant: () => void;
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
export function TenantListScreen({ rows, onLogout, onSelectTenant, onCreateTenant, onNavigate }: TenantListScreenProps): JSX.Element {
  return (
    <div className="min-h-screen bg-background text-primary-foreground">
      <AppNav current="tenants" onNavigate={onNavigate} onLogout={onLogout} />
      <main className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{COPY.tenantListTitle}</h2>
          <Button size="sm" onClick={onCreateTenant}>
            {COPY.tenantListCreateButton}
          </Button>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-primary-foreground/70">{COPY.tenantListEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => onSelectTenant(row.id)}
                  className="flex w-full items-center justify-between rounded-md border border-border px-4 py-3 text-left hover:bg-accent"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{row.id}</span>
                    <span className="text-xs text-primary-foreground/70">
                      {COPY.tenantEmbedKeyLabel}: {row.embedKey}
                    </span>
                  </div>
                  <span className={cn("rounded-full px-3 py-1 text-xs font-medium", STATUS_BADGE_CLASS[row.statusKind])}>{row.statusLabel}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
