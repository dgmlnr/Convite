import { useCallback, useEffect, useState, type JSX } from "react";

import { AccountScreen } from "./AccountScreen.js";
import { getTenants, postLogout } from "./api.js";
import { AppNav, type AppScreen } from "./AppNav.js";
import { resolveAppShellView, type ShellProbeState } from "./app-shell-routing.js";
import { AuditViewerScreen } from "./AuditViewerScreen.js";
import { Button } from "./components/ui/button.js";
import { COPY } from "./copy.js";
import { LoginScreen } from "./LoginScreen.js";
import { OperatorsScreen } from "./OperatorsScreen.js";
import { buildTenantListRows } from "./tenant-list.js";
import { TenantCreateScreen } from "./TenantCreateScreen.js";
import { TenantDetailScreen } from "./TenantDetailScreen.js";
import { TenantListScreen } from "./TenantListScreen.js";

type ShellState = ShellProbeState;

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
 *
 * SDD-VERIFY FINDING 1 ("el rbac que no llegaba a ningun lado"), closed
 * here: the actual screen-selection DECISION now lives in
 * `resolveAppShellView` (`app-shell-routing.ts`), a pure function proven by
 * its own unit test — this component only renders whatever it returns. The
 * bug it fixes: `creatingTenant`/`selectedTenantId` used to be checked AFTER
 * `state.kind === "missing-permission" || state.kind === "error"`, so an
 * operator whose OWN tenant-list read was refused (because that read reuses
 * `tenant.origins.edit`, design §19's disclosed vocabulary bend) could never
 * reach `TenantCreateScreen` — the "Crear inquilino" button lived inside
 * `TenantListScreen`, which never rendered for them at all. Granting
 * `tenant.create` alone granted nothing usable. The missing-permission/error
 * screen below now carries its OWN "Crear inquilino" button, reachable
 * regardless of why the tenant list itself failed — clicking it still calls
 * the real `POST /tenants` through the same checkpoint, and a genuine 403 is
 * still handled gracefully by `TenantCreateScreen`'s own existing
 * `missing-permission` state, unchanged by this fix.
 *
 * WHAT THIS FIX DOES NOT CLOSE, DISCLOSED RATHER THAN PAPERED OVER:
 * `tenant.games.edit`/`tenant.window.edit`/`tenant.embed-key.rotate` still
 * cannot be reached ALONE, without also holding `tenant.origins.edit` —
 * their editors live on `TenantDetailScreen`, which needs a tenant id, and
 * this app's only two ways to obtain one (the tenant list, or creating a
 * fresh tenant) both either need `tenant.origins.edit` themselves or hand
 * back a tenant this same operator then cannot open for lack of it. Closing
 * that would mean either inventing a `tenant.view` read permission or
 * widening which permissions satisfy `GET /tenants/:id`'s own guard — both
 * are taxonomy/authorization decisions for a maintainer, not a client
 * reachability bug, so this fix does not invent either.
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
  const view = resolveAppShellView({ shellState: state, screen, creatingTenant, selectedTenantId });

  if (view.kind === "loading") {
    return <main className="flex min-h-screen items-center justify-center bg-background text-primary-foreground">{COPY.tenantListLoading}</main>;
  }

  if (view.kind === "login") {
    return <LoginScreen onLoginSuccess={() => void loadTenants()} />;
  }

  if (view.kind === "operators") {
    return <OperatorsScreen onNavigate={setScreen} onLogout={() => void handleLogout()} />;
  }

  if (view.kind === "audit") {
    return <AuditViewerScreen onNavigate={setScreen} onLogout={() => void handleLogout()} />;
  }

  // sdd-verify finding 2: reachable regardless of ANY permission the acting
  // operator holds — `POST /account/password` is guarded `authenticated`
  // only, never `permission`.
  if (view.kind === "account") {
    return <AccountScreen onNavigate={setScreen} onLogout={() => void handleLogout()} />;
  }

  // sdd-verify finding 1, closed here: reached regardless of the tenant
  // list's own outcome — an operator holding only `tenant.create` gets here
  // even though `state.kind` is `missing-permission`.
  if (view.kind === "create-tenant") {
    return <TenantCreateScreen onBack={() => setCreatingTenant(false)} onCreated={handleTenantCreated} />;
  }

  // Same fix, same reachability: a KNOWN tenant id (from a prior successful
  // list load, or from just having created one) reaches the detail screen
  // even if the list itself is now refused or erroring.
  if (view.kind === "tenant-detail") {
    return <TenantDetailScreen tenantId={view.tenantId} onBack={handleBackFromDetail} />;
  }

  if (view.kind === "tenant-list-missing-permission" || view.kind === "tenant-list-error") {
    return (
      <div className="min-h-screen bg-background text-primary-foreground">
        <AppNav current="tenants" onNavigate={setScreen} onLogout={() => void handleLogout()} />
        <main className="flex flex-col items-center justify-center gap-4 p-6">
          <p className="text-sm text-primary-foreground/70">{view.kind === "tenant-list-missing-permission" ? COPY.tenantListMissingPermission : COPY.tenantListGenericError}</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void loadTenants()}>
              {COPY.retry}
            </Button>
            {/* sdd-verify finding 1: "Crear inquilino" no longer lives ONLY
             * inside `TenantListScreen` — `POST /tenants` needs only
             * `tenant.create`, never the tenant-list read's own
             * `tenant.origins.edit`, so an operator refused HERE can still
             * reach the creation form. A genuine 403 there is still handled
             * gracefully by `TenantCreateScreen`'s own existing state. */}
            <Button onClick={() => setCreatingTenant(true)}>{COPY.tenantListCreateButton}</Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <TenantListScreen
      rows={view.rows}
      onLogout={() => void handleLogout()}
      onSelectTenant={setSelectedTenantId}
      onCreateTenant={() => setCreatingTenant(true)}
      onNavigate={setScreen}
    />
  );
}
