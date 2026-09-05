import { useState, type FormEvent, type JSX } from "react";

import { postLogin } from "./api.js";
import { Button } from "./components/ui/button.js";
import { Input } from "./components/ui/input.js";
import { COPY } from "./copy.js";

export interface LoginScreenProps {
  /** Called only after `POST /login` genuinely returned `ok:true` — the same
   * "the token is generated fresh AFTER successful authentication" property
   * `login-handler.ts`'s own docstring establishes server-side has a
   * client-side mirror: this callback is the only way `AppShell` learns a
   * session now exists, and it is never invoked speculatively. */
  readonly onLoginSuccess: () => void;
}

/**
 * The login screen (task 14.1, design §11.2). A thin, controlled form: two
 * fields, one submit action, one error slot. Every refusal `postLogin` can
 * report collapses to one of three Spanish sentences — never a fourth that
 * would distinguish "unknown user" from "wrong password" (spec Domain E's
 * own "identically to a wrong password" requirement; `copy.ts`'s own
 * docstring on `loginInvalidCredentials`).
 *
 * CLIENT-SIDE VALIDATION IS UX ONLY (launch prompt §3): the empty-field
 * check below exists so a submit button click gives instant feedback
 * without a round trip, never as a substitute for the server's own `400`
 * (`login-handler.ts`'s "missing credentials" branch) — `postLogin` still
 * hits the real route even if this check were removed entirely.
 *
 * A REAL CONTRAST BUG, FOUND AND FIXED BY THE LIVE SCREENSHOT CHECK (this
 * slice's own manual runtime harness): `text-foreground` (bridged to
 * `DEFAULT_THEME_TOKENS["--gx-color-on-surface"]`, `#1a1a1a`) painted on
 * `bg-background` (`--gx-color-surface`, `#14231d`) measures roughly
 * **1.07:1** — a near-black on a near-black, essentially unreadable. Not a
 * theoretical concern: the first screenshot of this exact screen showed the
 * title and labels barely visible. Measured, not assumed:
 * `apps/widget-app/src/chrome-styles.ts` NEVER pairs raw `--gx-color-surface`
 * with `--gx-color-on-surface` directly either — every real use of
 * `on-surface` there sits on a LIGHTENED `color-mix` derivative, never the
 * raw surface — so this pairing was untested anywhere in the whole
 * codebase before this screen rendered it. `theme-bridge.css`'s own bridged
 * mapping (task 13b.3) and its passing browser test are NOT touched here —
 * that contract is correct on its own terms; the DEFAULT token VALUES it
 * bridges are what need a lighter foreground for actual body copy. Using
 * `text-primary-foreground` (on-primary, white, `#ffffff`) instead reads
 * ~16:1 against this background — the same white the login button's own
 * text already uses, so this is not a new color, only a reused one.
 */
export function LoginScreen({ onLoginSuccess }: LoginScreenProps): JSX.Element {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (username === "" || password === "") {
      setError(COPY.loginMissingFields);
      return;
    }
    setSubmitting(true);
    setError(undefined);
    const outcome = await postLogin(username, password);
    setSubmitting(false);
    if (!outcome.ok) {
      setError(outcome.reason === "rate-limited" ? COPY.loginRateLimited : outcome.reason === "network-error" ? COPY.loginGenericError : COPY.loginInvalidCredentials);
      return;
    }
    onLoginSuccess();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background text-primary-foreground">
      <form onSubmit={(event) => void handleSubmit(event)} className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-border bg-background p-6 shadow-sm" noValidate>
        <h1 className="text-lg font-semibold">{COPY.loginTitle}</h1>
        <label className="flex flex-col gap-1 text-sm">
          {COPY.usernameLabel}
          <Input
            name="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            disabled={submitting}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {COPY.passwordLabel}
          <Input
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={submitting}
          />
        </label>
        {error !== undefined ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        <Button type="submit" disabled={submitting}>
          {submitting ? COPY.loginSubmitting : COPY.loginSubmit}
        </Button>
      </form>
    </main>
  );
}
