import { useCallback, useEffect, useState, type JSX } from "react";

import { getTenants, postLogout } from "./api.js";
import { AppNav, type AppScreen } from "./AppNav.js";
import { AuditViewerScreen } from "./AuditViewerScreen.js";
import { Button } from "./components/ui/button.js";
import { COPY } from "./copy.js";
import { LoginScreen } from "./LoginScreen.js";
import { OperatorsScreen } from "./OperatorsScreen.js";
import { buildTenantListRows, type TenantListRow } from "./tenant-list.js";
import { TenantCreateScreen } from "./TenantCreateScreen.js";
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
  // The gap slice 15 flagged but never built (`POST /tenants`) — WHETHER the
  // create form is on screen, the same "shell decides which screen, screen
  // owns its own data" split `selectedTenantId` above already establishes.
  const [creatingTenant, setCreatingTenant] = useState(false);
  // Slice 16's own top-level nav state (phases 16a/16b) — WHICH of the three
  // destinations is on screen. Independent of `selectedTenantId`/
  // `creatingTenant` above: those two only ever apply while `screen` is
  // `"tenants"`, and switching away from it never loses that sub-state (a
  // deliberate choice — an operator navigating to check a permission mid-edit
  // and back finds the same tenant detail screen still open).
  const [screen, setScreen] = useState<AppScreen>("tenants");

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

  // Refreshes the list on the way back from a tenant's detail screen — load-
  // bearing for creation specifically: without this, a freshly created
  // tenant would vanish from view the moment the operator leaves its own
  // detail screen, since `state.rows` still holds the pre-creation snapshot.
  const handleBackFromDetail = useCallback((): void => {
    setSelectedTenantId(undefined);
    void loadTenants();
  }, [loadTenants]);

  // The gap slice 15 flagged but never built — on success, land on the
  // freshly created tenant's OWN detail screen (launch prompt: "create, land
  // on the tenant's own detail screen, configure origins/games/window
  // there"), never back on the list.
  const handleTenantCreated = useCallback((id: string): void => {
    setCreatingTenant(false);
    setSelectedTenantId(id);
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

  // Slice 16's own top-level screen switch (phases 16a/16b) — runs BEFORE any
  // tenant-specific state below, so an operator who cannot see the TENANT
  // list (e.g. holds only `operators.manage`) is never stuck on that
  // screen's own missing-permission message with no way out: each
  // destination owns its own independent fetch and permission check via its
  // own `AppNav`, the only way back to any other destination once logged in.
  if (screen === "operators") {
    return <OperatorsScreen onNavigate={setScreen} onLogout={() => void handleLogout()} />;
  }

  if (screen === "audit") {
    return <AuditViewerScreen onNavigate={setScreen} onLogout={() => void handleLogout()} />;
  }

  if (state.kind === "missing-permission" || state.kind === "error") {
    return (
      <div className="min-h-screen bg-background text-primary-foreground">
        <AppNav current="tenants" onNavigate={setScreen} onLogout={() => void handleLogout()} />
        <main className="flex flex-col items-center justify-center gap-4 p-6">
          <p className="text-sm text-primary-foreground/70">{state.kind === "missing-permission" ? COPY.tenantListMissingPermission : COPY.tenantListGenericError}</p>
          <Button variant="outline" onClick={() => void loadTenants()}>
            {COPY.retry}
          </Button>
        </main>
      </div>
    );
  }

  if (creatingTenant) {
    return <TenantCreateScreen onBack={() => setCreatingTenant(false)} onCreated={handleTenantCreated} />;
  }

  if (selectedTenantId !== undefined) {
    return <TenantDetailScreen tenantId={selectedTenantId} onBack={handleBackFromDetail} />;
  }

  return (
    <TenantListScreen
      rows={state.rows}
      onLogout={() => void handleLogout()}
      onSelectTenant={setSelectedTenantId}
      onCreateTenant={() => setCreatingTenant(true)}
      onNavigate={setScreen}
    />
  );
}
