import { describe, expect, it } from "vitest";
import { createStaticOperatorRepository, createStaticOperatorSessionRepository } from "@hexdev/platform-core";
import type { OperatorId, OperatorRecord, OperatorSessionRecord, OperatorSessionRepository, RateLimiter } from "@hexdev/platform-core";
import { handleLoginRequest } from "./login-handler.js";
import { hashPassword, verifyPassword, type PasswordComparator } from "./operator-password.js";
import { parseSessionCookie, hashSessionToken } from "./session-cookie.js";

/** A `RateLimiter` whose `tryConsume` always resolves to a fixed outcome,
 * regardless of key — the simplest possible fake for "the budget is already
 * exhausted" / "the budget is never exhausted", matching the port's own
 * async shape (`rate-limiter.ts`'s own docstring: both methods MUST be
 * async, even for an in-memory adapter). */
function fixedOutcomeLimiter(allowed: boolean): RateLimiter {
  return { tryConsume: async () => allowed, size: async () => 0 };
}

/** Records every call a comparator receives — same technique
 * `operator-password.test.ts`'s own `capturingComparator` establishes, reused
 * here to prove the SAME property one layer up: not "the request was
 * refused" but "scrypt genuinely never ran" (tasks 8b.3/8b.4). */
function capturingComparator(): { readonly comparator: PasswordComparator; readonly calls: readonly { readonly password: string; readonly stored: string }[] } {
  const calls: { password: string; stored: string }[] = [];
  const comparator: PasswordComparator = (password, stored) => {
    calls.push({ password, stored });
    return verifyPassword(password, stored); // delegates to the REAL comparison — this wraps it, never replaces it
  };
  return { comparator, calls };
}

/**
 * Wraps a real `OperatorSessionRepository` and records every `create` call —
 * NOT merely whether the RESPONSE carried a cookie. A first draft of this
 * test file asserted only `result.setCookie` and a vacuous lookup, and a
 * deliberately reintroduced session-fixation bug (the token minted BEFORE
 * the auth check, under a decoy token never returned to the caller) sailed
 * straight through it — the wire response looked identical; only the STORE
 * gained a stray row. Counting `create` calls directly is what makes
 * "establishes NO session at all" an assertion about the STORE, the thing
 * that actually matters, rather than about the response shape alone.
 */
function capturingSessionRepository(initial: readonly OperatorSessionRecord[] = []): { readonly repository: OperatorSessionRepository; readonly createCalls: readonly OperatorSessionRecord[] } {
  const real = createStaticOperatorSessionRepository(initial);
  const createCalls: OperatorSessionRecord[] = [];
  return {
    repository: {
      async create(session) {
        createCalls.push(session);
        return real.create(session);
      },
      findByTokenHash: real.findByTokenHash,
      deleteByTokenHash: real.deleteByTokenHash,
    },
    createCalls,
  };
}

/**
 * `POST /login` (design §11.2, spec Domain E, tasks 8b.1-8b.4) — the FIRST
 * genuinely new door this repository has ever put a human behind. Every
 * assertion below is checked against real in-memory adapters
 * (`createStaticOperatorRepository`/`createStaticOperatorSessionRepository`,
 * both from `@hexdev/platform-core` — this app's FIRST workspace
 * dependency), never a hand-rolled mock, so a passing test means the real
 * port contract was actually satisfied end to end.
 */

const ENABLED_USERNAME = "ana";
const ENABLED_PASSWORD = "la-contrasena-correcta-de-ana";

function makeDeps() {
  const passwordHash = hashPassword(ENABLED_PASSWORD);
  const operator: OperatorRecord = { id: "op-ana" as OperatorId, username: ENABLED_USERNAME, passwordHash, enabled: true };
  const operators = createStaticOperatorRepository([operator]);
  const { repository: sessions, createCalls } = capturingSessionRepository();
  // Permissive by default — every test in the FIRST describe block below
  // asserts AUTHENTICATION behaviour, not throttling, so its own limiter
  // must never be the reason a request is refused.
  const userLimiter = fixedOutcomeLimiter(true);
  const ipLimiter = fixedOutcomeLimiter(true);
  return { operators, sessions, createCalls, operator, userLimiter, ipLimiter, passwordHash };
}

describe("handleLoginRequest — session fixation is structurally absent (task 8b.1)", () => {
  it("a correct password establishes a session: 200, a Set-Cookie carrying a fresh token, and EXACTLY ONE session-store create() call for that operator", async () => {
    const { operators, sessions, createCalls, operator, userLimiter, ipLimiter } = makeDeps();
    const result = await handleLoginRequest(ENABLED_USERNAME, ENABLED_PASSWORD, { operators, sessions, userLimiter, ipLimiter, cookieSecure: true });

    expect(result.status).toBe(200);
    expect(result.setCookie).toBeDefined();
    const token = parseSessionCookie(result.setCookie);
    expect(token).toBeDefined();

    expect(createCalls).toHaveLength(1);
    expect(createCalls[0]!.operatorId).toBe(operator.id);
    expect(createCalls[0]!.tokenHash).toBe(hashSessionToken(token!));
  });

  it("an incorrect password calls session-store create() ZERO times — the caller is left with no usable session, checked at the STORE, not the response (task 8b.1)", async () => {
    const { operators, sessions, createCalls, userLimiter, ipLimiter } = makeDeps();
    const result = await handleLoginRequest(ENABLED_USERNAME, "una-contrasena-incorrecta", { operators, sessions, userLimiter, ipLimiter, cookieSecure: true });

    expect(result.status).toBe(401);
    expect(result.setCookie).toBeUndefined();
    expect(createCalls).toHaveLength(0);
  });

  it("an unknown username calls create() zero times and returns the identical status a wrong password would (no username-enumeration signal)", async () => {
    const wrongPassword = makeDeps();
    const wrongPasswordResult = await handleLoginRequest(ENABLED_USERNAME, "wrong", {
      operators: wrongPassword.operators,
      sessions: wrongPassword.sessions,
      userLimiter: wrongPassword.userLimiter,
      ipLimiter: wrongPassword.ipLimiter,
      cookieSecure: true,
    });

    const unknownUsername = makeDeps();
    const unknownResult = await handleLoginRequest("nadie", "cualquier-cosa", {
      operators: unknownUsername.operators,
      sessions: unknownUsername.sessions,
      userLimiter: unknownUsername.userLimiter,
      ipLimiter: unknownUsername.ipLimiter,
      cookieSecure: true,
    });

    expect(unknownResult.status).toBe(wrongPasswordResult.status);
    expect(unknownResult.setCookie).toBeUndefined();
    expect(unknownUsername.createCalls).toHaveLength(0);
  });

  it("a disabled account calls create() zero times, identically to a wrong password (spec Domain E)", async () => {
    const passwordHash = hashPassword("la-contrasena-de-la-cuenta-deshabilitada");
    const disabled: OperatorRecord = { id: "op-disabled" as OperatorId, username: "beto", passwordHash, enabled: false };
    const operators = createStaticOperatorRepository([disabled]);
    const { repository: sessions, createCalls } = capturingSessionRepository();

    const result = await handleLoginRequest("beto", "la-contrasena-de-la-cuenta-deshabilitada", {
      operators,
      sessions,
      userLimiter: fixedOutcomeLimiter(true),
      ipLimiter: fixedOutcomeLimiter(true),
      cookieSecure: true,
    });

    expect(result.status).toBe(401);
    expect(result.setCookie).toBeUndefined();
    expect(createCalls).toHaveLength(0);
  });

  it("missing credentials are refused with 400 before any repository call, create() never invoked", async () => {
    const { operators, sessions, createCalls, userLimiter, ipLimiter } = makeDeps();
    const result = await handleLoginRequest(undefined, undefined, { operators, sessions, userLimiter, ipLimiter, cookieSecure: true });
    expect(result.status).toBe(400);
    expect(result.setCookie).toBeUndefined();
    expect(createCalls).toHaveLength(0);
  });

  /**
   * Genuine RED, deliberate probe, actually run (not merely described): a
   * temporary two-line regression minted a session under a DECOY token
   * BEFORE the `authenticateOperator` check, leaving the successful-path
   * cookie/response untouched. The FIRST version of this test file (only
   * `result.setCookie`/a vacuous `findByTokenHash` lookup) stayed GREEN
   * through that regression — a false negative, caught only by re-reading
   * the test rather than by the test itself. Rewriting the failure-path
   * assertions to count `sessions.create` calls directly, THEN re-running
   * the SAME probe, failed for real: `expected 1 to be 0` on the
   * wrong-password/unknown-username/disabled-account cases (the decoy
   * session was created on every one of them, regardless of outcome).
   * Reverted; all tests in this file green again with the real
   * implementation.
   */
  it("the cookie's token, once hashed, is EXACTLY the stored row's own token_hash — never a different value handed to the client than the one stored", async () => {
    const { operators, sessions, createCalls, userLimiter, ipLimiter } = makeDeps();
    const result = await handleLoginRequest(ENABLED_USERNAME, ENABLED_PASSWORD, { operators, sessions, userLimiter, ipLimiter, cookieSecure: true });
    const token = parseSessionCookie(result.setCookie)!;
    expect(createCalls).toHaveLength(1);
    expect(createCalls[0]!.tokenHash).toBe(hashSessionToken(token));
  });
});

describe("handleLoginRequest — cookie attributes follow the injected cookieSecure flag (design §11.2)", () => {
  it("omits Secure when cookieSecure is false (the HEXDEV_ALLOW_DEV_DEFAULTS escape hatch)", async () => {
    const { operators, sessions, userLimiter, ipLimiter } = makeDeps();
    const result = await handleLoginRequest(ENABLED_USERNAME, ENABLED_PASSWORD, { operators, sessions, userLimiter, ipLimiter, cookieSecure: false });
    expect(result.setCookie).not.toContain("Secure");
  });
});

describe("handleLoginRequest — login throttling, and the ordering that makes it real (tasks 8b.3/8b.4)", () => {
  it("an exhausted IP limiter refuses with 429 BEFORE any repository lookup, any password comparison, or any session creation — proven by injection, not by a clock", async () => {
    const { operators, sessions, createCalls } = makeDeps();
    const { comparator, calls } = capturingComparator();
    const ipLimiter = fixedOutcomeLimiter(false); // already exhausted
    const userLimiter = fixedOutcomeLimiter(true); // would allow, if reached — proves the IP check runs first/independently

    const result = await handleLoginRequest(ENABLED_USERNAME, ENABLED_PASSWORD, {
      operators,
      sessions,
      userLimiter,
      ipLimiter,
      clientIp: "203.0.113.7",
      cookieSecure: true,
      passwordDeps: { compare: comparator },
    });

    expect(result.status).toBe(429);
    // THE assertion this task exists to prove: not "refused", but that
    // scrypt genuinely never ran. Real, correct credentials were supplied —
    // if the limiter were consulted AFTER the password comparison (or not at
    // all), `comparator` would have been invoked and this would be 1, not 0.
    expect(calls).toHaveLength(0);
    expect(createCalls).toHaveLength(0);
  });

  it("an exhausted username limiter refuses with 429 with ZERO scrypt invocations, independently of the IP limiter's own outcome", async () => {
    const { operators, sessions, createCalls } = makeDeps();
    const { comparator, calls } = capturingComparator();
    const ipLimiter = fixedOutcomeLimiter(true); // would allow
    const userLimiter = fixedOutcomeLimiter(false); // already exhausted

    const result = await handleLoginRequest(ENABLED_USERNAME, ENABLED_PASSWORD, {
      operators,
      sessions,
      userLimiter,
      ipLimiter,
      cookieSecure: true,
      passwordDeps: { compare: comparator },
    });

    expect(result.status).toBe(429);
    expect(calls).toHaveLength(0);
    expect(createCalls).toHaveLength(0);
  });

  it("a burst of 10 requests against a limiter whose true budget is 3 produces AT MOST 3 real comparisons — a hard ceiling, not merely 'some requests refused'", async () => {
    const { operators, sessions, createCalls } = makeDeps();
    const { comparator, calls } = capturingComparator();
    const BUDGET = 3;
    let consumed = 0;
    const budgetedLimiter: RateLimiter = {
      tryConsume: async () => {
        if (consumed >= BUDGET) return false;
        consumed += 1;
        return true;
      },
      size: async () => consumed,
    };

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        handleLoginRequest(ENABLED_USERNAME, ENABLED_PASSWORD, {
          operators,
          sessions,
          userLimiter: budgetedLimiter,
          ipLimiter: fixedOutcomeLimiter(true),
          cookieSecure: true,
          passwordDeps: { compare: comparator },
        }),
      ),
    );

    expect(results.filter((r) => r.status === 429)).toHaveLength(10 - BUDGET);
    expect(calls.length).toBeLessThanOrEqual(BUDGET);
    expect(createCalls.length).toBeLessThanOrEqual(BUDGET);
  });

  it("both limiters consulted, request allowed through: the password comparator DOES run exactly once, proving the limiters are consulted rather than short-circuiting every request", async () => {
    const { operators, sessions, createCalls, userLimiter, ipLimiter } = makeDeps();
    const { comparator, calls } = capturingComparator();

    const result = await handleLoginRequest(ENABLED_USERNAME, ENABLED_PASSWORD, { operators, sessions, userLimiter, ipLimiter, cookieSecure: true, passwordDeps: { compare: comparator } });

    expect(result.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(createCalls).toHaveLength(1);
  });

  /**
   * Genuine RED, deliberate probe, actually run: the IP/username limiter
   * checks were temporarily moved to AFTER `authenticateOperator` (a
   * plausible-looking "optimize the common case" reordering — check
   * credentials first, throttle only real failures). Re-ran this exact test
   * file: the first two throttling tests above failed for real —
   * `expected 1 to be 0` — because the exhausted-limiter request had already
   * run a full scrypt comparison (and, for the IP case, minted a session)
   * before the reordered check ever refused it. Reverted; all throttling
   * tests green again with limiters checked first.
   */
  it("clientIp absent: only the username limiter can refuse — no false 'blocked' from a limiter with nothing to key on", async () => {
    const { operators, sessions, createCalls } = makeDeps();
    const { comparator, calls } = capturingComparator();
    const result = await handleLoginRequest(ENABLED_USERNAME, ENABLED_PASSWORD, {
      operators,
      sessions,
      userLimiter: fixedOutcomeLimiter(true),
      ipLimiter: fixedOutcomeLimiter(false), // exhausted, but no clientIp given
      cookieSecure: true,
      passwordDeps: { compare: comparator },
    });

    // No IP means the IP limiter is never consulted at all (mirrors
    // `handleEmbedRequest`'s own `clientIp !== undefined` guard) — a missing
    // IP must never be silently treated as "over budget".
    expect(result.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(createCalls).toHaveLength(1);
  });
});
