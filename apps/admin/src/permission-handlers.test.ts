import { describe, expect, it } from "vitest";
import type { OperatorId, OperatorMutationResult, RevokePermissionGuardedResult } from "@hexdev/platform-core";
import type { AuthorizedOperator } from "./authorization.js";
import { createPermissionGrantHandler, createPermissionRevokeHandler, type PermissionHandlersDeps } from "./permission-handlers.js";

/**
 * `permission-handlers.ts` (spec Domain K, design §6.2/§8, tasks
 * 12.1-12.6) — proven with FAKES, never real Postgres: `grantPermission`/
 * `revokePermission` are injected functions (the identical DI seam
 * `operator-handlers.ts`'s own docstring establishes for
 * `disableOperator`/`enableOperator`), so this suite proves the HTTP-level
 * wiring — mass-assignment refusal, status codes, audit witness
 * construction — trusting `operator-permissions.postgres.test.ts`'s own
 * proof of the guard reuse and the real transactional atomicity.
 */
const ACTOR = { id: "op-actor" as OperatorId, username: "actor", permissions: new Set(["operators.manage"]) } as unknown as AuthorizedOperator;

function baseDeps(overrides: Partial<PermissionHandlersDeps> = {}): PermissionHandlersDeps {
  return {
    grantPermission: async (): Promise<OperatorMutationResult> => ({ ok: true }),
    revokePermission: async (): Promise<RevokePermissionGuardedResult> => ({ ok: true }),
    ...overrides,
  };
}

describe("createPermissionGrantHandler — task 12.1/12.2", () => {
  it("grants a valid permission and audits permission.granted with the before/after pair", async () => {
    const calls: (readonly unknown[])[] = [];
    const grantPermission = async (operatorId: OperatorId, permission: string, grantedBy: OperatorId, w: (exec: (sql: string, values: readonly unknown[]) => Promise<void>) => Promise<void>): Promise<OperatorMutationResult> => {
      await w(async (sql, values) => {
        calls.push(values);
      });
      expect(operatorId).toBe("op-target");
      expect(permission).toBe("tenant.window.edit");
      expect(grantedBy).toBe(ACTOR.id);
      return { ok: true };
    };
    const handler = createPermissionGrantHandler({ ...baseDeps(), grantPermission });

    const response = await handler({ params: { id: "op-target" }, body: { permission: "tenant.window.edit" } }, ACTOR);

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[3]).toBe("permission.granted");
    expect(calls[0]?.[5]).toBe("op-target");
  });

  it("REFUSES a permission string outside the closed PERMISSIONS taxonomy, before grantPermission is ever called (threat: mass assignment on permission grant)", async () => {
    let called = false;
    const grantPermission = async (): Promise<OperatorMutationResult> => {
      called = true;
      return { ok: true };
    };
    const handler = createPermissionGrantHandler({ ...baseDeps(), grantPermission });

    const response = await handler({ params: { id: "op-target" }, body: { permission: "tenant.*" } }, ACTOR);

    expect(response.status).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ error: "invalid-permission" });
    expect(called).toBe(false);
  });

  it("refuses a request with no operator id, before calling grantPermission at all", async () => {
    let called = false;
    const grantPermission = async (): Promise<OperatorMutationResult> => {
      called = true;
      return { ok: true };
    };
    const handler = createPermissionGrantHandler({ ...baseDeps(), grantPermission });

    const response = await handler({ body: { permission: "tenant.create" } }, ACTOR);

    expect(response.status).toBe(400);
    expect(called).toBe(false);
  });

  it("maps an unknown-operator refusal to 404", async () => {
    const grantPermission = async (): Promise<OperatorMutationResult> => ({ ok: false, reason: "unknown-operator" });
    const handler = createPermissionGrantHandler({ ...baseDeps(), grantPermission });

    const response = await handler({ params: { id: "does-not-exist" }, body: { permission: "tenant.create" } }, ACTOR);

    expect(response.status).toBe(404);
    expect(JSON.parse(response.body)).toEqual({ error: "unknown-operator" });
  });
});

describe("createPermissionRevokeHandler — task 12.5/12.6", () => {
  it("revokes a valid permission and audits permission.revoked with the before/after pair", async () => {
    const calls: (readonly unknown[])[] = [];
    const revokePermission = async (operatorId: OperatorId, permission: string, w: (exec: (sql: string, values: readonly unknown[]) => Promise<void>) => Promise<void>): Promise<RevokePermissionGuardedResult> => {
      await w(async (sql, values) => {
        calls.push(values);
      });
      expect(operatorId).toBe("op-target");
      expect(permission).toBe("tenant.window.edit");
      return { ok: true };
    };
    const handler = createPermissionRevokeHandler({ ...baseDeps(), revokePermission });

    const response = await handler({ params: { id: "op-target" }, body: { permission: "tenant.window.edit" } }, ACTOR);

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[3]).toBe("permission.revoked");
    expect(calls[0]?.[5]).toBe("op-target");
  });

  it("REFUSES a permission string outside PERMISSIONS, before revokePermission is ever called", async () => {
    let called = false;
    const revokePermission = async (): Promise<RevokePermissionGuardedResult> => {
      called = true;
      return { ok: true };
    };
    const handler = createPermissionRevokeHandler({ ...baseDeps(), revokePermission });

    const response = await handler({ params: { id: "op-target" }, body: { permission: "invented.permission" } }, ACTOR);

    expect(response.status).toBe(400);
    expect(called).toBe(false);
  });

  it("maps a last-account-manager refusal to 409 (task 12.5, spec Domain K's own last-holder scenario)", async () => {
    const revokePermission = async (): Promise<RevokePermissionGuardedResult> => ({ ok: false, reason: "last-account-manager" });
    const handler = createPermissionRevokeHandler({ ...baseDeps(), revokePermission });

    const response = await handler({ params: { id: "op-sole-holder" }, body: { permission: "operators.manage" } }, ACTOR);

    expect(response.status).toBe(409);
    expect(JSON.parse(response.body)).toEqual({ error: "last-account-manager" });
  });

  it("maps a not-granted refusal to 404", async () => {
    const revokePermission = async (): Promise<RevokePermissionGuardedResult> => ({ ok: false, reason: "not-granted" });
    const handler = createPermissionRevokeHandler({ ...baseDeps(), revokePermission });

    const response = await handler({ params: { id: "op-target" }, body: { permission: "tenant.create" } }, ACTOR);

    expect(response.status).toBe(404);
  });

  it("refuses a request with no operator id, before calling revokePermission at all", async () => {
    let called = false;
    const revokePermission = async (): Promise<RevokePermissionGuardedResult> => {
      called = true;
      return { ok: true };
    };
    const handler = createPermissionRevokeHandler({ ...baseDeps(), revokePermission });

    const response = await handler({ body: { permission: "tenant.create" } }, ACTOR);

    expect(response.status).toBe(400);
    expect(called).toBe(false);
  });
});
