import { useEffect, useState, type JSX } from "react";
import { THEME_TOKEN_NAMES, type ThemeContrastViolation, type ThemeOverride, type ThemeTokenName } from "@hexdev/widget-protocol";

import { getTenantDetail, postRotateEmbedKey, postTenantGames, postTenantOrigins, postTenantTheme, postTenantWindow, type TenantThemeWriteOutcome, type TenantWriteOutcome } from "./api.js";
import { Button } from "./components/ui/button.js";
import { Input } from "./components/ui/input.js";
import { COPY } from "./copy.js";
import { argentineDateToIso, buildEmbedSnippet, buildTenantDetailView, formatThemeViolationMessage, parseListInput, type TenantDetailApiRow, type TenantDetailView } from "./tenant-detail.js";

/** Spanish labels for the closed, security-relevant token vocabulary
 * (`THEME_TOKEN_NAMES`, `@hexdev/widget-protocol`) — this form is the ONLY
 * writer of tenant theme data, so it must offer exactly these 7 fields,
 * never more (design §13.4: widening the vocabulary for admin-only styling
 * needs would expand the tenant-controlled attack surface for a reason that
 * has nothing to do with tenants). */
const THEME_TOKEN_LABELS: Readonly<Record<ThemeTokenName, string>> = {
  "--gx-color-surface": "Color de fondo",
  "--gx-color-on-surface": "Color de texto sobre el fondo",
  "--gx-color-primary": "Color primario",
  "--gx-color-on-primary": "Color de texto sobre el primario",
  "--gx-color-accent": "Color de acento",
  "--gx-radius": "Radio de bordes",
  "--gx-font-family": "Tipografía",
};

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

interface WindowFieldEditorProps {
  readonly label: string;
  readonly emptyCopy: string;
  /** `DD/MM/AAAA`, or `""` when no window has ever been set
   * (`buildTenantDetailView`'s own `validUntilInput`). */
  readonly initialText: string;
  readonly onSave: (validUntilIso: string) => Promise<TenantWriteOutcome>;
  readonly onSaved: (tenant: TenantDetailApiRow) => void;
}

/**
 * The window editor (tasks 15a.5-15a.7) — "the date the operator types is
 * the date the operator reads" (launch prompt §1). Client-side conversion
 * via `argentineDateToIso` happens BEFORE any network call, so a malformed
 * date never reaches the server at all (UX-only validation, same discipline
 * `LoginScreen.tsx`'s own empty-field check already establishes — the
 * server's own `paidThroughToInstant` call is what actually enforces the
 * shape, `tenant-handlers.ts`'s own docstring on why).
 */
function WindowFieldEditor({ label, emptyCopy, initialText, onSave, onSaved }: WindowFieldEditorProps): JSX.Element {
  const [text, setText] = useState(initialText);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    setText(initialText);
  }, [initialText]);

  async function handleSave(): Promise<void> {
    const iso = argentineDateToIso(text);
    if (iso === undefined) {
      setError(COPY.tenantDetailWindowInvalidFormat);
      return;
    }
    setSaving(true);
    setError(undefined);
    const outcome = await onSave(iso);
    setSaving(false);
    if (!outcome.ok) {
      setError(
        outcome.reason === "missing-permission"
          ? COPY.tenantDetailEditMissingPermission
          : outcome.reason === "unknown-tenant"
            ? COPY.tenantDetailEditUnknownTenant
            : outcome.reason === "invalid-payload"
              ? COPY.tenantDetailWindowInvalidFormat
              : COPY.tenantDetailEditGenericError,
      );
      return;
    }
    onSaved(outcome.tenant);
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">{label}</h2>
      <Input value={text} onChange={(event) => setText(event.target.value)} placeholder={emptyCopy || COPY.tenantDetailWindowPlaceholder} disabled={saving} className="max-w-40" />
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

interface EmbedKeySectionProps {
  readonly embedKey: string;
  readonly onRotate: () => Promise<TenantWriteOutcome>;
  readonly onRotated: (tenant: TenantDetailApiRow) => void;
}

type RotateState = { readonly kind: "idle" } | { readonly kind: "confirming" } | { readonly kind: "rotating" } | { readonly kind: "rotated" } | { readonly kind: "error"; readonly message: string };

/**
 * Embed key + snippet + rotation (task 15b.1/15b.2). ROTATION IS
 * DESTRUCTIVE AND MADE VISIBLE BEFORE IT COMMITS (launch prompt §3): clicking
 * "Rotar clave" does NOT rotate anything — it only opens a `confirming` gate
 * naming the exact consequence ("the tenant's live page breaks until they
 * update it"), and the network call happens ONLY from the confirm button
 * inside that gate. `copied` resets whenever a rotation actually completes
 * (a stale "¡Copiado!" from the PREVIOUS key would be actively misleading
 * once the visible snippet has changed underneath it).
 */
function EmbedKeySection({ embedKey, onRotate, onRotated }: EmbedKeySectionProps): JSX.Element {
  const [rotateState, setRotateState] = useState<RotateState>({ kind: "idle" });
  const [copied, setCopied] = useState(false);
  const snippet = buildEmbedSnippet(embedKey);

  async function handleConfirmRotate(): Promise<void> {
    setRotateState({ kind: "rotating" });
    setCopied(false);
    const outcome = await onRotate();
    if (!outcome.ok) {
      setRotateState({
        kind: "error",
        message: outcome.reason === "missing-permission" ? COPY.tenantDetailEditMissingPermission : outcome.reason === "unknown-tenant" ? COPY.tenantDetailEditUnknownTenant : COPY.tenantDetailEditGenericError,
      });
      return;
    }
    onRotated(outcome.tenant);
    setRotateState({ kind: "rotated" });
  }

  async function handleCopy(): Promise<void> {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">{COPY.tenantDetailSnippetLabel}</h2>
      <pre className="whitespace-pre-wrap break-all rounded-md border border-border bg-background px-3 py-2 font-mono text-xs">{snippet}</pre>
      <Button variant="outline" size="sm" onClick={() => void handleCopy()}>
        {copied ? COPY.tenantDetailCopied : COPY.tenantDetailCopySnippet}
      </Button>

      {rotateState.kind === "idle" ? (
        <Button variant="outline" size="sm" onClick={() => setRotateState({ kind: "confirming" })}>
          {COPY.tenantDetailRotateButton}
        </Button>
      ) : null}

      {rotateState.kind === "confirming" ? (
        <div className="flex flex-col gap-2 rounded-md border border-destructive p-3">
          <p className="text-sm text-destructive" role="alert">
            {COPY.tenantDetailRotateWarning}
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void handleConfirmRotate()}>
              {COPY.tenantDetailRotateConfirm}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRotateState({ kind: "idle" })}>
              {COPY.tenantDetailRotateCancel}
            </Button>
          </div>
        </div>
      ) : null}

      {rotateState.kind === "rotating" ? <p className="text-sm text-primary-foreground/70">{COPY.tenantDetailRotating}</p> : null}
      {rotateState.kind === "rotated" ? <p className="text-sm text-primary">{COPY.tenantDetailRotateSuccess}</p> : null}
      {rotateState.kind === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {rotateState.message}
        </p>
      ) : null}
    </section>
  );
}

interface ThemeSectionProps {
  readonly theme: ThemeOverride | undefined;
  readonly onSave: (theme: ThemeOverride) => Promise<TenantThemeWriteOutcome>;
  readonly onSaved: (tenant: TenantDetailApiRow) => void;
}

function themeFieldsFrom(theme: ThemeOverride | undefined): Record<ThemeTokenName, string> {
  return Object.fromEntries(THEME_TOKEN_NAMES.map((name) => [name, theme?.[name] ?? ""])) as Record<ThemeTokenName, string>;
}

/**
 * The theme editor (task 15b.3/15b.4) — SURFACES `themeViolations` TO THE
 * OPERATOR (design §2.3's own closing argument), moved off a `console.warn`
 * nobody in this panel ever reads. Sends ONLY the non-empty fields — an
 * empty field means "use the widget's own default", never an attempt to
 * write an empty string (which `sanitizeThemeOverride`'s own regexes would
 * reject anyway, server-side). This form is deliberately NOT the place
 * enforcing the closed vocabulary or the contrast minimum: both already run
 * inside `updateTheme` (`sanitizeTenantTheme`, design §2.3 point 3) — this
 * component only renders whatever violations that write already computed.
 */
function ThemeSection({ theme, onSave, onSaved }: ThemeSectionProps): JSX.Element {
  const [values, setValues] = useState<Record<ThemeTokenName, string>>(() => themeFieldsFrom(theme));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [violations, setViolations] = useState<readonly ThemeContrastViolation[]>([]);

  // GENUINE BUG FOUND AND FIXED BY THE LIVE DEMO (not merely by reading the
  // code): this effect must NOT reset `violations` here. `onSaved` below
  // calls the PARENT's `setState`, which re-renders this component with a
  // FRESH `theme` object reference (`buildTenantDetailView` builds a new
  // object every call) — under React 18's automatic batching, that parent
  // update and this component's own `setViolations(outcome.themeViolations)`
  // land in the SAME commit, so an effect resetting `violations` on every
  // `theme` reference change wiped the very violations `handleSave` had
  // just set, one render later. Caught live: the server's own response
  // carried the real violation, `psql`/the response body proved it, but the
  // screen rendered nothing — confirmed by inspecting the actual network
  // response before assuming the bug was server-side. Violations now clear
  // only at the START of a new save attempt (below), never from this sync
  // effect.
  useEffect(() => {
    setValues(themeFieldsFrom(theme));
  }, [theme]);

  async function handleSave(): Promise<void> {
    setSaving(true);
    setError(undefined);
    setViolations([]);
    const nextTheme: ThemeOverride = {};
    for (const name of THEME_TOKEN_NAMES) {
      const trimmed = values[name].trim();
      if (trimmed !== "") nextTheme[name] = trimmed;
    }
    const outcome = await onSave(nextTheme);
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
    setViolations(outcome.themeViolations);
    onSaved(outcome.tenant);
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">{COPY.tenantDetailThemeLabel}</h2>
      <p className="text-xs text-primary-foreground/70">{COPY.tenantDetailThemeHint}</p>
      <div className="grid grid-cols-2 gap-3">
        {THEME_TOKEN_NAMES.map((name) => (
          <label key={name} className="flex flex-col gap-1 text-xs">
            {THEME_TOKEN_LABELS[name]}
            <Input value={values[name]} onChange={(event) => setValues((prev) => ({ ...prev, [name]: event.target.value }))} disabled={saving} />
          </label>
        ))}
      </div>
      {error !== undefined ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {violations.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {violations.map((violation) => (
            <li key={violation.pair} className="text-sm text-destructive" role="alert">
              {formatThemeViolationMessage(violation)}
            </li>
          ))}
        </ul>
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
            <EmbedKeySection
              embedKey={state.view.embedKey}
              onRotate={() => postRotateEmbedKey(tenantId)}
              onRotated={(tenant) => setState({ kind: "loaded", view: buildTenantDetailView(tenant) })}
            />
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
            <WindowFieldEditor
              label={COPY.tenantDetailValidUntilLabel}
              emptyCopy={COPY.tenantDetailValidUntilEmpty}
              initialText={state.view.validUntilInput}
              onSave={(iso) => postTenantWindow(tenantId, iso)}
              onSaved={(tenant) => setState({ kind: "loaded", view: buildTenantDetailView(tenant) })}
            />
            <ThemeSection
              theme={state.view.theme}
              onSave={(theme) => postTenantTheme(tenantId, theme)}
              onSaved={(tenant) => setState({ kind: "loaded", view: buildTenantDetailView(tenant) })}
            />
          </div>
        ) : null}
      </div>
    </main>
  );
}
