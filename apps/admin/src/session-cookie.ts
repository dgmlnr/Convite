import crypto from "node:crypto";

/**
 * The session cookie's shape and lifecycle mechanics (design §11.2, spec
 * Domain E): its name, lifetime, the token/hash pair, and how to render or
 * parse the `Set-Cookie`/`Cookie` header text. `login-handler.ts` and
 * `logout-handler.ts` both depend on this module rather than hand-rolling
 * their own header strings, so the two can never drift on an attribute.
 *
 * WHY A RANDOM TOKEN, NEVER A JWT/SIGNED VALUE: design §7 already settled
 * this for AUTHORIZATION state (no cache, one query per request); the same
 * argument applies here to the token's own IDENTITY. A signed cookie can
 * prove "this token was issued by us" without a database round trip, but
 * that is exactly the property this design refuses — revocation (logout,
 * disable, mid-session permission changes) must take effect on the very next
 * request, and a self-verifying token has no revocation hook short of a
 * blocklist, which is a database round trip anyway, with extra machinery on
 * top. A bare random token that MUST be looked up is the simpler mechanism
 * that already has the property the signed alternative would have to bolt
 * on.
 */

/** design §11.2's own name — not configurable, so a route never has to
 * guess which cookie a request means. */
export const SESSION_COOKIE_NAME = "convite_admin_session";

/** 8 hours (design §11.2's `Max-Age=28800`), the cookie's ABSOLUTE lifetime.
 * The cookie attribute is a hint for the browser to stop sending it; the
 * `operator_sessions.expires_at` row is the actual authority (design §11.2's
 * own closing line) — this constant feeds BOTH, so they cannot drift apart. */
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

const TOKEN_BYTES = 32; // design §11.2: "32 bytes from crypto.randomBytes"

/**
 * A fresh, unpredictable session token — generated ONLY after a successful
 * `authenticateOperator` call (session fixation, design §11.2's own closing
 * paragraph: "the token is generated fresh AFTER successful authentication
 * and there is no pre-login session to promote"). `login-handler.ts` is the
 * ONLY caller; nothing else in this app should ever need a fresh token.
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * SHA-256 hex of the raw token — the ONLY form ever handed to
 * `OperatorSessionRepository` (design §3: "a database dump is then not a set
 * of live sessions"). Deterministic and one-way: the same raw token always
 * hashes to the same value, so `findByTokenHash`/`deleteByTokenHash` can look
 * up a row by re-hashing an incoming cookie, but a stolen row can never be
 * turned back into a working cookie.
 */
export function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Renders the `Set-Cookie` header value that mints a session (design §11.2's
 * full attribute table).
 *
 * `secure` is a parameter, not a hardcoded `true`, ONLY because of the
 * existing `HEXDEV_ALLOW_DEV_DEFAULTS` dev escape hatch (design §11.2: "The
 * repo's established dev escape hatch, reused rather than reinvented") — a
 * developer running `pnpm dev:server`-style plain-HTTP localhost cannot
 * receive a `Secure` cookie at all, since no browser will store one over a
 * non-HTTPS origin. Production always passes `true`; `config.ts` is the ONLY
 * caller that computes the flag.
 */
export function buildSessionCookieHeader(token: string, options: { readonly secure: boolean }): string {
  return buildCookieHeader(token, SESSION_MAX_AGE_SECONDS, options.secure);
}

/**
 * Renders the `Set-Cookie` header value that REVOKES a session client-side
 * (`Max-Age=0`, an empty value) — `logout-handler.ts`'s own half of "the old
 * cookie stops working" (tasks 8b.7/8b.8). This alone is NOT what makes
 * logout secure: a client that ignores this header (or a copy of the old
 * cookie taken before logout) still needs the SERVER-SIDE row gone, which is
 * `OperatorSessionRepository.deleteByTokenHash`'s job, not this function's.
 * This header is convenience for a well-behaved browser, never the security
 * boundary.
 */
export function buildLogoutCookieHeader(options: { readonly secure: boolean }): string {
  return buildCookieHeader("", 0, options.secure);
}

function buildCookieHeader(value: string, maxAgeSeconds: number, secure: boolean): string {
  const attributes = [
    `${SESSION_COOKIE_NAME}=${value}`,
    "HttpOnly", // design §11.2: no script path to the token, an XSS cannot exfiltrate it
    "SameSite=Strict", // design §11.2: first half of CSRF defence; no cross-site entry flow to preserve
    "Path=/",
    `Max-Age=${String(maxAgeSeconds)}`,
    // `Domain` is deliberately ABSENT (design §11.2): a host-only cookie is
    // narrower than one scoped to a parent domain.
  ];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

/**
 * Extracts the raw session token from a request's `Cookie` header, or
 * `undefined` if the header is absent or names no session cookie. A `Cookie`
 * header packs multiple cookies as `name=value; name2=value2` (no quoting,
 * unlike `Set-Cookie`), so this is a simple split-and-match, not a full RFC
 * 6265 parser — this app sets exactly one cookie, so it never needs to
 * parse anyone else's.
 */
export function parseSessionCookie(cookieHeader: string | undefined): string | undefined {
  if (cookieHeader === undefined) return undefined;
  for (const pair of cookieHeader.split(";")) {
    const separatorIndex = pair.indexOf("=");
    if (separatorIndex === -1) continue;
    const name = pair.slice(0, separatorIndex).trim();
    if (name !== SESSION_COOKIE_NAME) continue;
    const value = pair.slice(separatorIndex + 1).trim();
    return value === "" ? undefined : value;
  }
  return undefined;
}
