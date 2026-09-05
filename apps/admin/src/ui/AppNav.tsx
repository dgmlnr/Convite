import type { JSX } from "react";

import { Button } from "./components/ui/button.js";
import { COPY } from "./copy.js";

export type AppScreen = "tenants" | "operators" | "audit";

export interface AppNavProps {
  readonly current: AppScreen;
  readonly onNavigate: (screen: AppScreen) => void;
  readonly onLogout: () => void;
}

/**
 * The panel's shared top nav (phases 16a/16b) — three destinations, each
 * rendered by its own top-level screen (`TenantListScreen`/`OperatorsScreen`/
 * a later `AuditViewerScreen`). CLIENT-SIDE GATING IS UX ONLY (same
 * discipline `TenantListScreen.tsx`'s own "Crear inquilino" button already
 * establishes): every destination is ALWAYS shown regardless of the acting
 * operator's own permission set, because the single authorization checkpoint
 * refuses server-side exactly as it always has — this bar never hides a
 * destination an operator lacks the permission for, it lets that
 * destination's own screen render its own honest missing-permission message
 * once requested (the same `missing-permission` state
 * `TenantDetailScreen.tsx` already renders for `tenant.origins.edit`).
 */
export function AppNav({ current, onNavigate, onLogout }: AppNavProps): JSX.Element {
  return (
    <header className="flex items-center justify-between border-b border-border px-6 py-4">
      <div className="flex items-center gap-6">
        <h1 className="text-base font-semibold">{COPY.appName}</h1>
        <nav className="flex gap-1">
          <Button variant={current === "tenants" ? "default" : "ghost"} size="sm" onClick={() => onNavigate("tenants")}>
            {COPY.navTenants}
          </Button>
          <Button variant={current === "operators" ? "default" : "ghost"} size="sm" onClick={() => onNavigate("operators")}>
            {COPY.navOperators}
          </Button>
          <Button variant={current === "audit" ? "default" : "ghost"} size="sm" onClick={() => onNavigate("audit")}>
            {COPY.navAudit}
          </Button>
        </nav>
      </div>
      <Button variant="outline" size="sm" onClick={onLogout}>
        {COPY.logout}
      </Button>
    </header>
  );
}
