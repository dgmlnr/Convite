import { useEffect, useState, type JSX } from "react";

import { getTenantDetail, postTenantGames, postTenantOrigins, type TenantWriteOutcome } from "./api.js";
import { Button } from "./components/ui/button.js";
import { COPY } from "./copy.js";
import { buildTenantDetailView, parseListInput, type TenantDetailApiRow, type TenantDetailView } from "./tenant-detail.js";

export interface TenantDetailScreenProps {
  readonly tenantId: string;
  readonly onBack: () => void;
}

type DetailState =
  | { readonly kind: "loading" }
  | { readonly kind: "not-found" }
  | { readonly kind: "missing-permission" }
  | { readonly kind: "error" }
  | { readonly kind: "loaded"; readonly view: TenantDetailView };

/** Same solid-chip convention `TenantListScreen.tsx`'s own `STATUS_BADGE_CLASS`
 * already establishes — reused rather than reinvented, so a tenant's status
 * reads identically whether seen from the list or from its own detail. */
const STATUS_BADGE_CLASS: Readonly<Record<TenantDetailView["statusKind"], string>> = {
  active: "bg-primary text-primary-foreground",
  expired: "bg-destructive text-primary-foreground",
  "not-yet-active": "bg-muted text-muted-foreground",
  "no-window": "bg-muted text-muted-foreground",
};

interface ListFieldEditorProps {
  readonly label: string;
  readonly emptyCopy: string;
  /** The CURRENT server value, newline-joined (`tenant-detail.ts`'s own
   * `originsText`/`gamesText`) — this component owns its own edit buffer
   * (`text` state below) so keystrokes never round-trip through the parent;
   * it resyncs to a fresh `initialText` whenever the parent's own view
   * changes (a successful save, or a genuinely different tenant loaded). */
  readonly initialText: string;
  readonly onSave: (list: readonly string[]) => Promise<TenantWriteOutcome>;
  readonly onSaved: (tenant: TenantDetailApiRow) => void;
}

/**
 * Shared by the origins and games editors below (tasks 15a.1-15a.4) —
 * structurally identical fields, same save/error/loading shape. Submits
 * through `parseListInput` (never a raw split the caller re-derives), so
 * "created, no origin/game configured yet" (an empty textarea) is a
 * legitimate save, never a client-side validation error (design §1.3).
 */
function ListFieldEditor({ label, emptyCopy, initialText, onSave, onSaved }: ListFieldEditorProps): JSX.Element {
  const [text, setText] = useState(initialText);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    setText(initialText);
  }, [initialText]);

  async function handleSave(): Promise<void> {
    setSaving(true);
    setError(undefined);
    const outcome = await onSave(parseListInput(text));
    setSaving(false);
    if (!outcome.ok) {
      setError(
        outcome.reason === "missing-permission"
          ? COPY.tenantDetailEditMissingPermission
          : outcome.reason === "unknown-tenant"
            ? COPY.tenantDetailEditUnknownTenant
            : COPY.tenantDetailEditGenericError,
      );
      return;
    }
    onSaved(outcome.tenant);
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">{label}</h2>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={emptyCopy}
        rows={4}
        disabled={saving}
        className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm shadow-sm placeholder:text-muted-foreground placeholder:font-sans focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      />
      {error !== undefined ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
        {saving ? COPY.tenantDetailSaving : COPY.tenantDetailSave}
      </Button>
    </section>
  );
}

/**
 * The tenant detail screen (task 15a's own necessary prerequisite) — origins
 * and games are now EDITABLE (tasks 15a.1-15a.4): a free-text field per
 * list, saved through `postTenantOrigins`/`postTenantGames`. The window
 * editor, embed-key rotation, and theme editor all arrive in later PRs of
 * this same slice, extending this exact component rather than replacing it
 * — the identical "grow the same screen incrementally" convention
 * `copy.ts`'s own header already establishes for its string table.
 *
 * SELF-CONTAINED LOADING/ERROR STATE (same shape `LoginScreen.tsx` already
 * establishes for its own submit state): `AppShell` only ever decides WHICH
 * screen renders — session-level `no-session`/`missing-permission` for the
 * WHOLE panel (task 14.2's own docstring) — never per-tenant fetch state,
 * which belongs entirely to the screen that needs it.
 *
 * CLIENT-SIDE GATING IS UX ONLY (launch prompt §5, same discipline
 * `AppShell.tsx`'s own docstring already establishes for the list): a 403
 * here reflects a refusal the server ALREADY made before this component's
 * `useEffect` ever ran — nothing in this file is the thing protecting the
 * route.
 */
export function TenantDetailScreen({ tenantId, onBack }: TenantDetailScreenProps): JSX.Element {
  const [state, setState] = useState<DetailState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    void getTenantDetail(tenantId).then((outcome) => {
      if (cancelled) return;
      if (!outcome.ok) {
        setState(outcome.reason === "unknown-tenant" ? { kind: "not-found" } : outcome.reason === "missing-permission" ? { kind: "missing-permission" } : { kind: "error" });
        return;
      }
      setState({ kind: "loaded", view: buildTenantDetailView(outcome.tenant) });
    });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  return (
    <main className="min-h-screen bg-background text-primary-foreground">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          {COPY.tenantDetailBack}
        </Button>
      </header>
      <div className="p-6">
        {state.kind === "loading" ? <p className="text-sm text-primary-foreground/70">{COPY.tenantDetailLoading}</p> : null}
        {state.kind === "not-found" ? <p className="text-sm text-primary-foreground/70">{COPY.tenantDetailNotFound}</p> : null}
        {state.kind === "missing-permission" ? <p className="text-sm text-primary-foreground/70">{COPY.tenantDetailMissingPermission}</p> : null}
        {state.kind === "error" ? <p className="text-sm text-primary-foreground/70">{COPY.tenantDetailGenericError}</p> : null}
        {state.kind === "loaded" ? (
          <div className="flex max-w-lg flex-col gap-6">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold">{state.view.id}</h1>
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_BADGE_CLASS[state.view.statusKind]}`}>{state.view.statusLabel}</span>
            </div>
            <p className="text-xs text-primary-foreground/70">
              {COPY.tenantEmbedKeyLabel}: {state.view.embedKey}
            </p>
            <ListFieldEditor
              label={COPY.tenantDetailOriginsLabel}
              emptyCopy={COPY.tenantDetailOriginsEmpty}
              initialText={state.view.originsText}
              onSave={(list) => postTenantOrigins(tenantId, list)}
              onSaved={(tenant) => setState({ kind: "loaded", view: buildTenantDetailView(tenant) })}
            />
            <ListFieldEditor
              label={COPY.tenantDetailGamesLabel}
              emptyCopy={COPY.tenantDetailGamesEmpty}
              initialText={state.view.gamesText}
              onSave={(list) => postTenantGames(tenantId, list)}
              onSaved={(tenant) => setState({ kind: "loaded", view: buildTenantDetailView(tenant) })}
            />
            <section className="flex flex-col gap-1">
              <h2 className="text-sm font-semibold">{COPY.tenantDetailValidUntilLabel}</h2>
              <p className="text-sm">{state.view.validUntilInput === "" ? COPY.tenantDetailValidUntilEmpty : state.view.validUntilInput}</p>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
