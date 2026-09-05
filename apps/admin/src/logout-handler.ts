import type { OperatorSessionRepository } from "@hexdev/platform-core";
import { buildLogoutCookieHeader, hashSessionToken, parseSessionCookie } from "./session-cookie.js";

/**
 * The framework-agnostic core of `POST /logout` (design §11.2, spec Domain
 * E, tasks 8b.7/8b.8) — mirrors `login-handler.ts`'s own shape.
 *
 * THE PROPERTY THIS FUNCTION EXISTS TO ESTABLISH, stated plainly because it
 * is easy to build the WRONG thing that looks identical from the outside: a
 * logout that only clears the client-side cookie (`Set-Cookie` with
 * `Max-Age=0`) revokes NOTHING. The raw token still authenticates for
 * anyone who copied it — a browser extension, a proxy log, a shared
 * terminal — before this response ever reached the legitimate caller.
 * `deps.sessions.deleteByTokenHash` below is what actually revokes it;
 * the `Set-Cookie` this function also returns is convenience for a
 * well-behaved browser, never the security boundary by itself.
 */
export interface LogoutRequestDeps {
  readonly sessions: OperatorSessionRepository;
  readonly cookieSecure: boolean;
}

export interface LogoutRequestResult {
  readonly status: number;
  readonly body: string;
  /** Always present, even when the request carried no cookie at all — a
   * caller with a stale/foreign cookie is still entitled to have it cleared
   * client-side. */
  readonly setCookie: string;
}

/**
 * Idempotent by construction: `OperatorSessionRepository.deleteByTokenHash`
 * is a harmless no-op on a token hash with no matching row (the shared
 * contract's own assertion, `operator-session-repository.contract.ts`), so
 * neither a missing cookie, a foreign/unknown cookie, nor a second call with
 * an already-consumed one produces an error here — every case still returns
 * 200 with a clearing cookie. `logout-handler.test.ts`'s own assertions
 * check the STORE after each call (a real `findByTokenHash` re-query), not
 * merely that this function returned without throwing — the same
 * "check the store, not the response" discipline `login-handler.ts`'s own
 * tests establish for session creation.
 */
export async function handleLogoutRequest(cookieHeader: string | undefined, deps: LogoutRequestDeps): Promise<LogoutRequestResult> {
  const token = parseSessionCookie(cookieHeader);
  if (token !== undefined) {
    await deps.sessions.deleteByTokenHash(hashSessionToken(token));
  }
  return { status: 200, body: JSON.stringify({ ok: true }), setCookie: buildLogoutCookieHeader({ secure: deps.cookieSecure }) };
}
