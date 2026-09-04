import { describe, expect, it } from "vitest";
import type { OperatorAuthorizationContext } from "@hexdev/platform-core";

import { authorize, authorizeAndDispatch, type AdminHandler, type AuthorizationQuery } from "./authorization.js";
import type { Permission } from "./permissions.js";
import { buildSessionCookieHeader, generateSessionToken } from "./session-cookie.js";

/**
 * `authorize` (design §6.3 Layer 2/3, §7, spec Domain K, tasks 9.1-9.9) —
 * the single authorization checkpoint. Every assertion below is checked
 * against the injected `AuthorizationQuery` seam directly, never a real
 * Postgres pool (`postgres-operator-authorization.postgres.test.ts` proves
 * the real one-query join separately) — the same "prove the pure logic with
 * a fake, prove the real adapter with real Postgres" split
 * `operator-password.test.ts`/`login-handler.test.ts` already establish.
 *
 * `buildSessionCookieHeader` (not a hand-built string) produces every
 * request-side `Cookie` header this file uses: `parseSessionCookie` only
 * reads the first `name=value` segment regardless of the other `Set-Cookie`
 * attributes riding along, so reusing it here needs no second, parallel
 * cookie-string builder.
 */
const ROTATE_PERMISSION = "tenant.embed-key.rotate" as Permission;

function cookieFor(token: string): string {
  return buildSessionCookieHeader(token, { secure: true });
}

function contextFixture(overrides: Partial<OperatorAuthorizationContext> = {}): OperatorAuthorizationContext {
  return {
    operatorId: "op-ana" as OperatorAuthorizationContext["operatorId"],
    username: "ana",
    enabled: true,
    expiresAt: Date.now() + 60_000,
    permissions: [ROTATE_PERMISSION],
    ...overrides,
  };
}

function stubQuery(context: OperatorAuthorizationContext | undefined): { readonly query: AuthorizationQuery; readonly calls: string[] } {
  const calls: string[] = [];
  return {
    query: async (tokenHash) => {
      calls.push(tokenHash);
      return context;
    },
    calls,
  };
}

describe("authorize — the fixed check order (design §7, task 9.2): no row -> expired -> disabled -> missing permission -> mint", () => {
  it("no session cookie at all is refused as no-session WITHOUT ever consulting the query — genuinely zero repository/DB work on the cheapest refusal path", async () => {
    const { query, calls } = stubQuery(contextFixture());
    const result = await authorize(undefined, { access: "authenticated" }, { query });
    expect(result).toEqual({ ok: false, reason: "no-session" });
    expect(calls).toHaveLength(0);
  });

  it("a cookie whose token hash matches no row is refused as no-session", async () => {
    const { query } = stubQuery(undefined);
    const result = await authorize(cookieFor(generateSessionToken()), { access: "authenticated" }, { query });
    expect(result).toEqual({ ok: false, reason: "no-session" });
  });

  it("an expired session is refused as session-expired, even with a real row and an enabled account", async () => {
    const { query } = stubQuery(contextFixture({ expiresAt: Date.now() - 1 }));
    const result = await authorize(cookieFor(generateSessionToken()), { access: "authenticated" }, { query });
    expect(result).toEqual({ ok: false, reason: "session-expired" });
  });

  it("a disabled account is refused as account-disabled, even holding the route's required permission", async () => {
    const { query } = stubQuery(contextFixture({ enabled: false, permissions: [ROTATE_PERMISSION] }));
    const result = await authorize(cookieFor(generateSessionToken()), { access: "permission", permission: ROTATE_PERMISSION }, { query });
    expect(result).toEqual({ ok: false, reason: "account-disabled" });
  });

  it("ORDER PROOF: a disabled account that ALSO lacks the permission is refused as account-disabled, never missing-permission — it must not learn which permissions it would have held", async () => {
    const { query } = stubQuery(contextFixture({ enabled: false, permissions: [] }));
    const result = await authorize(cookieFor(generateSessionToken()), { access: "permission", permission: ROTATE_PERMISSION }, { query });
    expect(result).toEqual({ ok: false, reason: "account-disabled" });
  });

  it("an enabled account lacking the route's permission is refused as missing-permission", async () => {
    const { query } = stubQuery(contextFixture({ permissions: [] }));
    const result = await authorize(cookieFor(generateSessionToken()), { access: "permission", permission: ROTATE_PERMISSION }, { query });
    expect(result).toEqual({ ok: false, reason: "missing-permission" });
  });

  it("an enabled, unexpired, permitted operator is authorized, minting an AuthorizedOperator carrying its permission set", async () => {
    const { query } = stubQuery(contextFixture());
    const result = await authorize(cookieFor(generateSessionToken()), { access: "permission", permission: ROTATE_PERMISSION }, { query });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable — asserted above");
    expect(result.actor.id).toBe("op-ana");
    expect(result.actor.username).toBe("ana");
    expect(result.actor.permissions.has(ROTATE_PERMISSION)).toBe(true);
  });

  it("an authenticated-only guard never consults the permission set at all — an operator holding ZERO permissions still passes", async () => {
    const { query } = stubQuery(contextFixture({ permissions: [] }));
    const result = await authorize(cookieFor(generateSessionToken()), { access: "authenticated" }, { query });
    expect(result.ok).toBe(true);
  });
});

describe("authorize — exactly one query per call, no cache, no TTL (design §7, tasks 9.5-9.8)", () => {
  it("mid-session permission revocation refuses the VERY NEXT call for the SAME token hash — no restart, nothing invalidated because nothing was ever cached", async () => {
    let stored: OperatorAuthorizationContext | undefined = contextFixture({ permissions: [ROTATE_PERMISSION] });
    const calls: string[] = [];
    const query: AuthorizationQuery = async (tokenHash) => {
      calls.push(tokenHash);
      return stored;
    };
    const token = generateSessionToken();
    const guard = { access: "permission" as const, permission: ROTATE_PERMISSION };

    const before = await authorize(cookieFor(token), guard, { query });
    expect(before.ok).toBe(true);

    // The revocation itself: nothing calls back into `authorize` to
    // "invalidate" anything — the underlying store simply changed between
    // the two calls, exactly as a real revoke-then-request sequence would.
    stored = contextFixture({ permissions: [] });

    const after = await authorize(cookieFor(token), guard, { query });
    expect(after).toEqual({ ok: false, reason: "missing-permission" });
    expect(calls).toHaveLength(2); // one query per call, proving there is no cache to bypass
  });

  it("mid-session account disabling refuses the very next call without waiting for the cookie's own expiry", async () => {
    let stored: OperatorAuthorizationContext | undefined = contextFixture({ enabled: true });
    const query: AuthorizationQuery = async () => stored;
    const token = generateSessionToken();
    const guard = { access: "authenticated" as const };

    const before = await authorize(cookieFor(token), guard, { query });
    expect(before.ok).toBe(true);

    stored = contextFixture({ enabled: false });

    const after = await authorize(cookieFor(token), guard, { query });
    expect(after).toEqual({ ok: false, reason: "account-disabled" });
  });
});

describe("authorizeAndDispatch — a refused request never reaches the handler, proven by a call-recording handler (tasks 9.1/9.3)", () => {
  /**
   * Stands in for a real handler closing over `TenantAdminRepository`
   * (design §6.3's own scenario names `rotateEmbedKey`). The assertion that
   * matters is the call COUNT, never the HTTP status alone — a 403 with the
   * mutation already committed underneath it would still pass a
   * status-only assertion, exactly the trap this chain's own slice 8a/8b
   * "assert at the level where the property actually lives" lesson names.
   */
  function recordingHandler(): { readonly handler: AdminHandler; readonly calls: readonly true[] } {
    const calls: true[] = [];
    const handler: AdminHandler = async (_req, actor) => {
      calls.push(true); // stands in for TenantAdminRepository.rotateEmbedKey(...)
      return { status: 200, body: JSON.stringify({ ok: true, actor: actor.username }) };
    };
    return { handler, calls };
  }

  it("an unauthenticated request (no cookie) is refused with 401 and the repository-touching handler runs ZERO times", async () => {
    const { handler, calls } = recordingHandler();
    const { query } = stubQuery(contextFixture());
    const response = await authorizeAndDispatch(undefined, { access: "permission", permission: ROTATE_PERMISSION }, { query }, {}, handler);
    expect(response.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("an authenticated operator LACKING tenant.embed-key.rotate is refused with 403 and the handler runs ZERO times — before rotateEmbedKey would ever run", async () => {
    const { handler, calls } = recordingHandler();
    const { query } = stubQuery(contextFixture({ permissions: [] }));
    const response = await authorizeAndDispatch(cookieFor(generateSessionToken()), { access: "permission", permission: ROTATE_PERMISSION }, { query }, {}, handler);
    expect(response.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it("an authorized operator reaches the handler exactly once, carrying its own identity through", async () => {
    const { handler, calls } = recordingHandler();
    const { query } = stubQuery(contextFixture());
    const response = await authorizeAndDispatch(cookieFor(generateSessionToken()), { access: "permission", permission: ROTATE_PERMISSION }, { query }, {}, handler);
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(JSON.parse(response.body)).toEqual({ ok: true, actor: "ana" });
  });
});
