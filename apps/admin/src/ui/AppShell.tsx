import { useCallback, useEffect, useState, type JSX } from "react";

import { getTenants, postLogout } from "./api.js";
import { Button } from "./components/ui/button.js";
import { COPY } from "./copy.js";
import { LoginScreen } from "./LoginScreen.js";
import { buildTenantListRows, type TenantListRow } from "./tenant-list.js";
import { TenantDetailScreen } from "./TenantDetailScreen.js";
import { TenantListScreen } from "./TenantListScreen.js";

type ShellState =
  | { readonly kind: "loading" }
  | { readonly kind: "login" }
  | { readonly kind: "missing-permission" }
  | { readonly kind: "error" }
  | { readonly kind: "tenants"; readonly rows: readonly TenantListRow[] };

/**
 * The session-aware shell (task 14.2) — the single place that decides
 * whether an operator sees the login screen or the tenant list. There is no
 * separate "am I logged in" route: `getTenants` (`GET /`) IS the probe,
 * because that route already passes through the single authorization
 * checkpoint (design §6.3/§7) before any repository call — its own two
 * failure shapes are exactly the two things this shell needs to know
 * (`api.ts`'s own docstring on `TenantListOutcome`).
 *
 * NAV GATED BY THE SERVER'S OWN REPORTED PERMISSION SET (task 14.2): this
 * slice has exactly one screen, so the gate is the fetch itself succeeding
 * or refusing with `missing-permission` — an operator who cannot see
 * `tenant-list` is told so honestly (launch prompt §3: never hide the
 * truth or fake a nicer screen), rather than shown an empty list that looks
 * like "no tenants exist yet". Later slices (operator/permission/audit
 * screens) add their own nav entries the same way, each gated by its own
 * route's own real response.
 *
 * CLIENT-SIDE GATING IS UX ONLY (launch prompt §3): nothing here decides
 * who may see what — `authorize` (`authorization.ts`) already refused
 * before this shell ever received a response. A bug in this component could
 * at most show the wrong LOADING state; it could never grant access the
 * server itself withheld.
 */
export function AppShell(): JSX.Element {
  const [state, setState] = useState<ShellState>({ kind: "loading" });
  // Slice 15's own navigation state — WHICH tenant's detail screen is open,
  // if any. `TenantDetailScreen` owns its own fetch/loading/error state
  // entirely (its own docstring); this shell only ever decides WHETHER it
  // is on screen, the same "shell decides which screen, screen owns its own
  // data" split already established for `LoginScreen`/`TenantListScreen`.
  const [selectedTenantId, setSelectedTenantId] = useState<string | undefined>(undefined);

  const loadTenants = useCallback(async (): Promise<void> => {
    setState({ kind: "loading" });
    const outcome = await getTenants();
    if (!outcome.ok) {
      setState(outcome.reason === "missing-permission" ? { kind: "missing-permission" } : outcome.reason === "no-session" ? { kind: "login" } : { kind: "error" });
      return;
    }
    setState({ kind: "tenants", rows: buildTenantListRows(outcome.tenants) });
  }, []);

  useEffect(() => {
    void loadTenants();
  }, [loadTenants]);

  const handleLogout = useCallback(async (): Promise<void> => {
    await postLogout();
    setState({ kind: "login" });
  }, []);

  // `text-primary-foreground` everywhere below, never `text-foreground`
  // (a real, measured ~1.07:1 contrast bug — `LoginScreen.tsx`'s own
  // docstring has the full account): white reads ~16:1 against
  // `bg-background`, the exact same pairing the login button already
  // proves legible.
  if (state.kind === "loading") {
    return <main className="flex min-h-screen items-center justify-center bg-background text-primary-foreground">{COPY.tenantListLoading}</main>;
  }

  if (state.kind === "login") {
    return <LoginScreen onLoginSuccess={() => void loadTenants()} />;
  }

  if (state.kind === "missing-permission" || state.kind === "error") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-primary-foreground">
        <p className="text-sm text-primary-foreground/70">{state.kind === "missing-permission" ? COPY.tenantListMissingPermission : COPY.tenantListGenericError}</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void loadTenants()}>
            {COPY.retry}
          </Button>
          <Button variant="ghost" onClick={() => void handleLogout()}>
            {COPY.logout}
          </Button>
        </div>
      </main>
    );
  }

  if (selectedTenantId !== undefined) {
    return <TenantDetailScreen tenantId={selectedTenantId} onBack={() => setSelectedTenantId(undefined)} />;
  }

  return <TenantListScreen rows={state.rows} onLogout={() => void handleLogout()} onSelectTenant={setSelectedTenantId} />;
}
