import { useState, type FormEvent, type JSX } from "react";

import { postOwnPasswordChange } from "./api.js";
import { AppNav, type AppScreen } from "./AppNav.js";
import { Button } from "./components/ui/button.js";
import { Input } from "./components/ui/input.js";
import { COPY } from "./copy.js";

export interface AccountScreenProps {
  readonly onNavigate: (screen: AppScreen) => void;
  readonly onLogout: () => void;
}

type ChangeState = { readonly kind: "idle" } | { readonly kind: "submitting" } | { readonly kind: "error"; readonly message: string } | { readonly kind: "success" };

/**
 * Self-service password change (`POST /account/password`, spec Domain J) —
 * sdd-verify's own finding 2: the server side (`own-password-handler.ts`)
 * shipped complete and tested in an earlier slice, but no client function and
 * no screen ever existed to reach it, so an operator could change their own
 * password only through the bootstrap CLI's `--force` recovery path, which is
 * recovery, not routine.
 *
 * REACHABLE WITH ZERO PERMISSIONS, ON PURPOSE (design §6.2's own three-member
 * exemption, `routing.coverage.test.ts`'s own exempt set): `own-password`'s
 * guard is `authenticated`, never `permission` — a permission gate here would
 * be unsatisfiable for an operator holding none. `AppNav.tsx`'s own nav entry
 * for this screen is therefore never conditioned on anything, the same
 * "always reachable" property `logout`'s own nav entry already has.
 *
 * SELF-CONTAINED SUBMIT STATE (same shape `LoginScreen.tsx`/
 * `TenantCreateScreen.tsx` already establish): `AppShell` only ever decides
 * WHETHER this screen is on screen, never its own idle/submitting/error/
 * success state.
 */
export function AccountScreen({ onNavigate, onLogout }: AccountScreenProps): JSX.Element {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [state, setState] = useState<ChangeState>({ kind: "idle" });

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (currentPassword === "" || newPassword === "") {
      setState({ kind: "error", message: COPY.accountMissingFields });
      return;
    }
    setState({ kind: "submitting" });
    const outcome = await postOwnPasswordChange(currentPassword, newPassword);
    if (!outcome.ok) {
      setState({
        kind: "error",
        message:
          outcome.reason === "missing-fields"
            ? COPY.accountMissingFields
            : outcome.reason === "invalid-current-password"
              ? COPY.accountInvalidCurrentPassword
              : COPY.accountGenericError,
      });
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setState({ kind: "success" });
  }

  const submitting = state.kind === "submitting";

  return (
    <div className="min-h-screen bg-background text-primary-foreground">
      <AppNav current="account" onNavigate={onNavigate} onLogout={onLogout} />
      <main className="flex flex-col items-center p-6">
        <form onSubmit={(event) => void handleSubmit(event)} className="flex w-full max-w-sm flex-col gap-4" noValidate>
          <h1 className="text-lg font-semibold">{COPY.accountTitle}</h1>
          <label className="flex flex-col gap-1 text-sm">
            {COPY.accountCurrentPasswordLabel}
            <Input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              disabled={submitting}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {COPY.accountNewPasswordLabel}
            <Input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} disabled={submitting} />
          </label>
          {state.kind === "error" ? (
            <p className="text-sm text-destructive" role="alert">
              {state.message}
            </p>
          ) : null}
          {state.kind === "success" ? <p className="text-sm text-primary">{COPY.accountSuccess}</p> : null}
          <Button type="submit" disabled={submitting}>
            {submitting ? COPY.accountSubmitting : COPY.accountSubmit}
          </Button>
        </form>
      </main>
    </div>
  );
}
