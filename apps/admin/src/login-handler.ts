import type { OperatorRepository, OperatorSessionRepository, RateLimiter } from "@hexdev/platform-core";
import { authenticateOperator, type AuthenticateOperatorDeps } from "./operator-password.js";
import { buildSessionCookieHeader, generateSessionToken, hashSessionToken, SESSION_MAX_AGE_SECONDS } from "./session-cookie.js";

/**
 * The framework-agnostic core of `POST /login` (design §11.2/§11.3, spec
 * Domain E, tasks 8b.1-8b.4) — mirrors `handleEmbedRequest`'s own shape
 * (`@hexdev/widget-frontdoor`): a pure-ish async function of its inputs and
 * an explicit deps bag, testable with real in-memory adapters and no bound
 * socket. `index.ts` (this app's composition root) is the only caller that
 * ever constructs `LoginRequestDeps` for real.
 */
export interface LoginRequestDeps {
  readonly operators: OperatorRepository;
  readonly sessions: OperatorSessionRepository;
  /** design §11.3: keyed by username, REQUIRED (never optional/defaulted) —
   * the same non-optionality `redis-rate-limiter.ts`'s own `keyPrefix`
   * carries, because a login handler with no throttling at all is not a
   * degraded version of this function, it is a different, unsafe one. */
  readonly userLimiter: RateLimiter;
  /** design §11.3: keyed by the request's source IP. */
  readonly ipLimiter: RateLimiter;
  /** Absent for a request with no discoverable IP (mirrors
   * `handleEmbedRequest`'s own `clientIp: string | undefined` parameter) —
   * `ipLimiter` is simply never consulted in that case, exactly as
   * `handleEmbedRequest`'s own `clientIp !== undefined` guard already
   * establishes for the embed front door. */
  readonly clientIp?: string;
  /** design §11.2: `Secure` is droppable only through the
   * `HEXDEV_ALLOW_DEV_DEFAULTS` opt-in — `config.ts` is the one place that
   * computes this, never a default baked in here. */
  readonly cookieSecure: boolean;
  readonly clock?: () => number;
  /** Test-only seam, identical shape to `authenticateOperator`'s own —
   * production callers never pass this. */
  readonly passwordDeps?: AuthenticateOperatorDeps;
}

export interface LoginRequestResult {
  readonly status: number;
  readonly body: string;
  /** `Set-Cookie` header value. Present ONLY on a successful login — see
   * this module's own docstring on session fixation for why that is not
   * merely a response-shaping choice. */
  readonly setCookie?: string;
}

/**
 * SESSION FIXATION IS STRUCTURALLY ABSENT HERE (task 8b.1, design §11.2's own
 * closing paragraph), not merely "not implemented": `generateSessionToken`
 * and `sessions.create` are called ONLY inside the `if (authenticated)`
 * branch below, after `authenticateOperator` has already returned `true`.
 * There is no earlier branch of this function that can reach either call —
 * a caller cannot walk this code path and end up with a session for a
 * password that was never verified, because the verification IS the
 * precondition for the branch that mints one. `login-handler.test.ts`'s own
 * "establishes NO session at all" assertions are what a session-fixation bug
 * (minting the token unconditionally, or before the check) would break for
 * real — this was verified directly by a deliberate, reverted probe (see
 * that test file's own docstring).
 */
/**
 * THE ORDERING THAT MAKES THROTTLING REAL (design §11.3, tasks 8b.3/8b.4):
 * both limiters are consulted BEFORE `deps.operators.findByUsername` and
 * BEFORE `authenticateOperator` — never after. scrypt at 64 MiB per
 * invocation (`operator-password.ts`'s own `SCRYPT_MAXMEM`) IS the attack
 * surface an unthrottled login endpoint would hand an attacker: reordering
 * these checks to run "only on a real failure" would still let a burst past
 * the intended budget burn one full scrypt derivation per request, at
 * roughly 100 ms and dozens of MiB each — throttling as decoration, not
 * defense. `login-handler.test.ts`'s own throttling suite proves this
 * ordering by COUNTING comparator invocations under an exhausted limiter,
 * not by measuring wall-clock time, and includes a deliberately reverted
 * probe (moving these two checks below `authenticateOperator`) that broke
 * those assertions for real — see that file's own docstring.
 *
 * IP checked before username (mirrors `handleEmbedRequest`'s own
 * IP-then-key ordering): cheap, and catches a distributed burst against many
 * usernames from one source before a second lookup is even attempted.
 */
export async function handleLoginRequest(username: string | undefined, password: string | undefined, deps: LoginRequestDeps): Promise<LoginRequestResult> {
  if (username === undefined || password === undefined || username === "" || password === "") {
    return { status: 400, body: JSON.stringify({ error: "missing credentials" }) };
  }

  if (deps.clientIp !== undefined && !(await deps.ipLimiter.tryConsume(deps.clientIp))) {
    return { status: 429, body: JSON.stringify({ error: "rate-limited" }) };
  }
  if (!(await deps.userLimiter.tryConsume(username))) {
    return { status: 429, body: JSON.stringify({ error: "rate-limited" }) };
  }

  const operator = await deps.operators.findByUsername(username);
  // `authenticateOperator` itself runs the constant-time dummy comparison on
  // the unknown-username/disabled-account paths (operator-password.ts's own
  // docstring, tasks 8a.5/8a.6) — nothing here needs to re-derive that;
  // passing `operator` through UNCHANGED (including `undefined`) is what
  // keeps that guarantee intact across this call boundary.
  const authenticated = authenticateOperator(operator, password, deps.passwordDeps);
  if (!authenticated) {
    // Deliberately IDENTICAL response shape to the unknown-username case —
    // no field here names which of the three refusal causes fired.
    return { status: 401, body: JSON.stringify({ error: "invalid-credentials" }) };
  }

  // `authenticated === true` implies `operator !== undefined && operator.enabled`
  // (operator-password.ts's own contract) — the non-null assertion below is
  // therefore not a hope, it is what that function's return value already
  // proved on this exact call.
  const clock = deps.clock ?? Date.now;
  const now = clock();
  const token = generateSessionToken();
  await deps.sessions.create({
    tokenHash: hashSessionToken(token),
    operatorId: operator!.id,
    createdAt: now,
    expiresAt: now + SESSION_MAX_AGE_SECONDS * 1000,
  });

  return { status: 200, body: JSON.stringify({ ok: true }), setCookie: buildSessionCookieHeader(token, { secure: deps.cookieSecure }) };
}
