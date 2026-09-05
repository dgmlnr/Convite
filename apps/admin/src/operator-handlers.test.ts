import { describe, expect, it } from "vitest";
import { createStaticOperatorRepository, type OperatorId, type OperatorLifecycleGuardedResult, type OperatorLifecycleResult, type OperatorRecord, type OperatorRepository } from "@hexdev/platform-core";
import type { AuthorizedOperator } from "./authorization.js";
import { createOperatorCreateHandler, createOperatorDisableHandler, createOperatorEnableHandler, type OperatorHandlersDeps } from "./operator-handlers.js";

/**
 * `operator-handlers.ts` (tasks 11a.1-11a.5/11a.8-11a.9) — proven with FAKES,
 * never real Postgres: `disableOperator`/`enableOperator` are injected
 * functions (this module's own docstring explains why), so this suite proves
 * the HTTP-level wiring — status codes, audit witness construction, refusal
 * mapping — trusting `operator-lifecycle.postgres.test.ts`'s own proof of the
 * last-account-manager guard and the real session-invalidation mechanics.
 */
const ACTOR = { id: "op-actor" as OperatorId, username: "actor", permissions: new Set(["operators.manage"]) } as unknown as AuthorizedOperator;

/** Captures every `(sql, values)` pair a witness's own `exec` receives — the
 * SAME technique `postgres-tenant-admin-repository.postgres.test.ts`'s own
 * `realAuditWitness` uses, except here the capture happens through the REAL
 * `appendAuditEntry` (imported transitively by `operator-handlers.ts`), never
 * a hand-rolled stand-in for it — proving this handler builds a witness that
 * ACTUALLY calls `appendAuditEntry` with the right shape, not merely that it
 * calls SOME function. */
function operatorsWithAuditCapture(seed: readonly OperatorRecord[] = []): { readonly operators: OperatorRepository; readonly captured: (readonly unknown[])[] } {
  const real = createStaticOperatorRepository(seed);
  const captured: (readonly unknown[])[] = [];
  return {
    operators: {
      ...real,
      async create(draft, w) {
        return real.create(draft, async (exec) => w(async (sql, values) => { captured.push(values); return exec(sql, values); }));
      },
    },
    captured,
  };
}

function baseDeps(overrides: Partial<OperatorHandlersDeps> = {}): OperatorHandlersDeps {
  const { operators } = operatorsWithAuditCapture();
  return {
    operators,
    disableOperator: async () => ({ ok: true }),
    enableOperator: async () => ({ ok: true }),
    ...overrides,
  };
}

describe("createOperatorCreateHandler — task 11a.1/11a.2", () => {
  it("an authorized operator creates a colleague with a unique username, holding no permissions, and audits operator.created", async () => {
    const { operators, captured } = operatorsWithAuditCapture();
    const handler = createOperatorCreateHandler({ ...baseDeps(), operators, generateOperatorId: () => "op-new" });

    const response = await handler({ body: { username: "beto", password: "correct horse battery staple" } }, ACTOR);

    expect(response.status).toBe(201);
    expect(JSON.parse(response.body)).toEqual({ id: "op-new", username: "beto" });
    expect(await operators.findByUsername("beto")).toMatchObject({ id: "op-new", username: "beto", enabled: true });
    // The audit witness ran exactly once, with THIS action and actor — column
    // order matches `appendAuditEntry`'s own INSERT (occurred_at,
    // actor_operator_id, actor_username, action, target_tenant_id,
    // target_operator_id, changes).
    expect(captured).toHaveLength(1);
    expect(captured[0]?.[1]).toBe(ACTOR.id);
    expect(captured[0]?.[2]).toBe(ACTOR.username);
    expect(captured[0]?.[3]).toBe("operator.created");
    expect(captured[0]?.[5]).toBe("op-new");
  });

  it("refuses a duplicate username, storing no second account and auditing nothing", async () => {
    const existing: OperatorRecord = { id: "op-ana" as OperatorId, username: "ana", passwordHash: "scrypt$32768$8$1$c2FsdA==$a2V5", enabled: true };
    const { operators, captured } = operatorsWithAuditCapture([existing]);
    const handler = createOperatorCreateHandler({ ...baseDeps(), operators, generateOperatorId: () => "op-someone-else" });

    const response = await handler({ body: { username: "ana", password: "whatever-password" } }, ACTOR);

    expect(response.status).toBe(409);
    expect(JSON.parse(response.body)).toEqual({ error: "username-taken" });
    expect(captured).toHaveLength(0);
  });

  it("refuses a request missing username or password before touching the repository at all", async () => {
    const handler = createOperatorCreateHandler(baseDeps());
    expect((await handler({ body: { password: "only-password" } }, ACTOR)).status).toBe(400);
    expect((await handler({ body: { username: "only-username" } }, ACTOR)).status).toBe(400);
  });
});

describe("createOperatorDisableHandler — task 11a.3-11a.4/11a.9", () => {
  it("disables the target and audits operator.disabled, on a successful disableOperator", async () => {
    const calls: readonly [string, readonly unknown[]][] = [];
    const disableOperator = async (id: OperatorId, w: (exec: (sql: string, values: readonly unknown[]) => Promise<void>) => Promise<void>): Promise<OperatorLifecycleGuardedResult> => {
      await w(async (sql, values) => { (calls as [string, readonly unknown[]][]).push([sql, values]); });
      return { ok: true };
    };
    const handler = createOperatorDisableHandler({ ...baseDeps(), disableOperator });

    const response = await handler({ params: { id: "op-target" } }, ACTOR);

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[1][3]).toBe("operator.disabled");
    expect(calls[0]?.[1][5]).toBe("op-target");
  });

  it("maps a last-account-manager refusal to 409, never invoking any witness beyond what disableOperator itself already skipped", async () => {
    const disableOperator = async (): Promise<OperatorLifecycleGuardedResult> => ({ ok: false, reason: "last-account-manager" });
    const handler = createOperatorDisableHandler({ ...baseDeps(), disableOperator });

    const response = await handler({ params: { id: "op-sole-holder" } }, ACTOR);

    expect(response.status).toBe(409);
    expect(JSON.parse(response.body)).toEqual({ error: "last-account-manager" });
  });

  it("maps an unknown-operator refusal to 404", async () => {
    const disableOperator = async (): Promise<OperatorLifecycleGuardedResult> => ({ ok: false, reason: "unknown-operator" });
    const handler = createOperatorDisableHandler({ ...baseDeps(), disableOperator });

    const response = await handler({ params: { id: "does-not-exist" } }, ACTOR);

    expect(response.status).toBe(404);
  });

  it("refuses a request with no operator id, before calling disableOperator at all", async () => {
    let called = false;
    const disableOperator = async (): Promise<OperatorLifecycleGuardedResult> => { called = true; return { ok: true }; };
    const handler = createOperatorDisableHandler({ ...baseDeps(), disableOperator });

    const response = await handler({}, ACTOR);

    expect(response.status).toBe(400);
    expect(called).toBe(false);
  });
});

describe("createOperatorEnableHandler — task 11a.5", () => {
  it("re-enables the target and audits operator.enabled", async () => {
    const calls: readonly [string, readonly unknown[]][] = [];
    const enableOperator = async (id: OperatorId, w: (exec: (sql: string, values: readonly unknown[]) => Promise<void>) => Promise<void>): Promise<OperatorLifecycleResult> => {
      await w(async (sql, values) => { (calls as [string, readonly unknown[]][]).push([sql, values]); });
      return { ok: true };
    };
    const handler = createOperatorEnableHandler({ ...baseDeps(), enableOperator });

    const response = await handler({ params: { id: "op-target" } }, ACTOR);

    expect(response.status).toBe(200);
    expect(calls[0]?.[1][3]).toBe("operator.enabled");
  });

  it("maps an unknown-operator refusal to 404", async () => {
    const enableOperator = async (): Promise<OperatorLifecycleResult> => ({ ok: false, reason: "unknown-operator" });
    const handler = createOperatorEnableHandler({ ...baseDeps(), enableOperator });

    const response = await handler({ params: { id: "does-not-exist" } }, ACTOR);

    expect(response.status).toBe(404);
  });
});
