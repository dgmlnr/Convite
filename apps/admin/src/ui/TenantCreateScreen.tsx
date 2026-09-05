import { useState, type JSX } from "react";

import { postTenantCreate } from "./api.js";
import { Button } from "./components/ui/button.js";
import { Input } from "./components/ui/input.js";
import { COPY } from "./copy.js";

export interface TenantCreateScreenProps {
  readonly onBack: () => void;
  /**
   * Fires with the newly created tenant's own id — `AppShell` navigates
   * straight to `TenantDetailScreen` for it (launch prompt: "create, land
   * on the tenant's own detail screen, configure origins/games/window
   * there"). That screen already owns the embed-key snippet block
   * (`EmbedKeySection`, slice 15's own `buildEmbedSnippet`) — this screen
   * never rebuilds a second presentation of the same thing, and never shows
   * the generated key itself.
   */
  readonly onCreated: (id: string) => void;
}

type CreateState = { readonly kind: "idle" } | { readonly kind: "submitting" } | { readonly kind: "error"; readonly message: string };

/**
 * `POST /tenants` (the gap slice 15 flagged but never built — design Domain
 * F names "create a tenant" as in-scope CRUD, `tasks-b` never itemized it).
 * Deliberately a ONE-FIELD form: the operator supplies only the tenant id.
 * `embedKey` is ALWAYS system-generated (design §3's own "system-generated"
 * requirement — never a text field here); `allowedOrigins`/`entitledGames`
 * both start empty and no validity window is set (design §1.3/decisions
 * #3684: "created, no origin configured yet" is a legitimate state, never
 * forced non-empty here) — the freshly created tenant is legitimately
 * INACTIVE until the operator sets a window on the detail screen this form
 * hands off to. This screen never rebuilds an origins/games/window editor of
 * its own (launch prompt: "do not rebuild those editors inside the creation
 * form").
 *
 * UNIQUENESS IS ARBITRATED BY THE DATABASE (launch prompt §1): this screen
 * never pre-checks whether an id is free before submitting — it renders
 * whatever discriminated refusal the server's own SQLSTATE-23505-backed
 * `create` returns, `tenant-id-taken` the reachable case an operator can
 * trigger by typing an id already in use, `embed-key-taken` kept distinct
 * rather than assumed impossible (`api.ts`'s own `postTenantCreate`
 * docstring has the full argument).
 *
 * SELF-CONTAINED SUBMIT STATE (same shape `LoginScreen.tsx`/`ListFieldEditor`
 * already establish): `AppShell` only ever decides WHICH screen renders,
 * never this form's own idle/submitting/error state.
 */
export function TenantCreateScreen({ onBack, onCreated }: TenantCreateScreenProps): JSX.Element {
  const [id, setId] = useState("");
  const [state, setState] = useState<CreateState>({ kind: "idle" });

  async function handleSubmit(): Promise<void> {
    const trimmed = id.trim();
    if (trimmed === "") {
      setState({ kind: "error", message: COPY.tenantCreateMissingId });
      return;
    }
    setState({ kind: "submitting" });
    const outcome = await postTenantCreate(trimmed);
    if (!outcome.ok) {
      const message =
        outcome.reason === "tenant-id-taken"
          ? COPY.tenantCreateIdTaken
          : outcome.reason === "embed-key-taken"
            ? COPY.tenantCreateEmbedKeyTaken
            : outcome.reason === "missing-permission"
              ? COPY.tenantCreateMissingPermission
              : outcome.reason === "invalid-payload"
                ? COPY.tenantCreateMissingId
                : COPY.tenantCreateGenericError;
      setState({ kind: "error", message });
      return;
    }
    onCreated(outcome.tenant.id);
  }

  const submitting = state.kind === "submitting";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background text-primary-foreground">
      <div className="flex w-full max-w-sm flex-col gap-4">
        <Button variant="ghost" size="sm" className="self-start" onClick={onBack}>
          {COPY.tenantDetailBack}
        </Button>
        <h1 className="text-lg font-semibold">{COPY.tenantCreateTitle}</h1>
        <p className="text-xs text-primary-foreground/70">{COPY.tenantCreateHint}</p>
        <label className="flex flex-col gap-1 text-sm">
          {COPY.tenantCreateIdLabel}
          <Input value={id} onChange={(event) => setId(event.target.value)} disabled={submitting} placeholder={COPY.tenantCreateIdPlaceholder} />
        </label>
        {state.kind === "error" ? (
          <p className="text-sm text-destructive" role="alert">
            {state.message}
          </p>
        ) : null}
        <Button onClick={() => void handleSubmit()} disabled={submitting}>
          {submitting ? COPY.tenantCreateSubmitting : COPY.tenantCreateSubmit}
        </Button>
      </div>
    </main>
  );
}
