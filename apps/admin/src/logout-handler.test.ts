import { describe, expect, it } from "vitest";
import { createStaticOperatorSessionRepository } from "@hexdev/platform-core";
import type { OperatorId, OperatorSessionRecord, OperatorSessionRepository } from "@hexdev/platform-core";
import { handleLogoutRequest } from "./logout-handler.js";
import { SESSION_COOKIE_NAME, hashSessionToken } from "./session-cookie.js";

/** Wraps a real session repository, recording every `deleteByTokenHash`
 * call — same discipline `login-handler.test.ts`'s own
 * `capturingSessionRepository` establishes, for the exact same reason: a
 * bug that leaves the RESPONSE looking right (a clearing `Set-Cookie`) while
 * the server-side row survives must be caught at the store, not the wire. */
function capturingSessionRepository(initial: readonly OperatorSessionRecord[]): { readonly repository: OperatorSessionRepository; readonly deleteCalls: readonly string[] } {
  const real = createStaticOperatorSessionRepository(initial);
  const deleteCalls: string[] = [];
  return {
    repository: {
      create: real.create,
      findByTokenHash: real.findByTokenHash,
      async deleteByTokenHash(tokenHash) {
        deleteCalls.push(tokenHash);
        return real.deleteByTokenHash(tokenHash);
      },
    },
    deleteCalls,
  };
}

const RAW_TOKEN = "the-raw-cookie-token-value";
const TOKEN_HASH = hashSessionToken(RAW_TOKEN);

const LIVE_SESSION: OperatorSessionRecord = { tokenHash: TOKEN_HASH, operatorId: "op-ana" as OperatorId, createdAt: 1_700_000_000_000, expiresAt: 1_700_028_800_000 };

/**
 * `POST /logout` (design §11.2, spec Domain E, tasks 8b.7/8b.8). The load-
 * bearing property: a logout that only clears the client-side cookie
 * revokes NOTHING — the token still authenticates for anyone who copied it
 * before logout. Every assertion below checks the SERVER-SIDE row is gone
 * from a real `OperatorSessionRepository`, never merely the response shape.
 */
describe("handleLogoutRequest — the session row is genuinely deleted (tasks 8b.7/8b.8)", () => {
  it("deletes the exact row the cookie's hash names, verified by re-querying the store afterward — not merely a claim about the response", async () => {
    const { repository: sessions, deleteCalls } = capturingSessionRepository([LIVE_SESSION]);

    expect(await sessions.findByTokenHash(TOKEN_HASH)).toBeDefined(); // sanity: the session is genuinely live beforehand

    const result = await handleLogoutRequest(`${SESSION_COOKIE_NAME}=${RAW_TOKEN}`, { sessions, cookieSecure: true });

    expect(result.status).toBe(200);
    expect(deleteCalls).toEqual([TOKEN_HASH]);
    // THE assertion that matters: the row is gone from the STORE, not merely
    // that a delete was attempted — the old cookie's hash now resolves to
    // nothing, which is the entire mechanism "the old cookie stops working"
    // rests on (there is no session-verification endpoint yet, slice 9; this
    // IS the checkable form of that claim at this slice).
    expect(await sessions.findByTokenHash(TOKEN_HASH)).toBeUndefined();
  });

  it("clears the cookie client-side too (Max-Age=0) — convenience for a well-behaved browser, never the security boundary by itself", async () => {
    const { repository: sessions } = capturingSessionRepository([LIVE_SESSION]);
    const result = await handleLogoutRequest(`${SESSION_COOKIE_NAME}=${RAW_TOKEN}`, { sessions, cookieSecure: true });
    expect(result.setCookie).toContain("Max-Age=0");
    expect(result.setCookie).toContain(`${SESSION_COOKIE_NAME}=;`);
  });

  it("is idempotent: logging out with NO cookie at all still succeeds and never calls deleteByTokenHash", async () => {
    const { repository: sessions, deleteCalls } = capturingSessionRepository([LIVE_SESSION]);
    const result = await handleLogoutRequest(undefined, { sessions, cookieSecure: true });
    expect(result.status).toBe(200);
    expect(deleteCalls).toEqual([]);
    // The genuinely live session is UNAFFECTED by a cookie-less logout call.
    expect(await sessions.findByTokenHash(TOKEN_HASH)).toBeDefined();
  });

  it("is idempotent: logging out TWICE with the same cookie never errors on the second call, which finds nothing left to delete", async () => {
    const { repository: sessions, deleteCalls } = capturingSessionRepository([LIVE_SESSION]);
    const first = await handleLogoutRequest(`${SESSION_COOKIE_NAME}=${RAW_TOKEN}`, { sessions, cookieSecure: true });
    const second = await handleLogoutRequest(`${SESSION_COOKIE_NAME}=${RAW_TOKEN}`, { sessions, cookieSecure: true });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(deleteCalls).toEqual([TOKEN_HASH, TOKEN_HASH]);
  });

  it("a foreign/unknown cookie deletes nothing real — only its own (nonexistent) hash is targeted, every other live session survives", async () => {
    const { repository: sessions, deleteCalls } = capturingSessionRepository([LIVE_SESSION]);
    const result = await handleLogoutRequest(`${SESSION_COOKIE_NAME}=some-other-token-nobody-issued`, { sessions, cookieSecure: true });
    expect(result.status).toBe(200);
    expect(deleteCalls).toEqual([hashSessionToken("some-other-token-nobody-issued")]);
    expect(await sessions.findByTokenHash(TOKEN_HASH)).toBeDefined(); // the REAL session is untouched
  });
});

describe("handleLogoutRequest — cookie attributes follow the injected cookieSecure flag", () => {
  it("omits Secure when cookieSecure is false", async () => {
    const { repository: sessions } = capturingSessionRepository([LIVE_SESSION]);
    const result = await handleLogoutRequest(`${SESSION_COOKIE_NAME}=${RAW_TOKEN}`, { sessions, cookieSecure: false });
    expect(result.setCookie).not.toContain("Secure");
  });
});
