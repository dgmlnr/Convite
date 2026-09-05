import { describe, expect, it } from "vitest";
import type { OperatorId, TenantAdminRepository, TenantId, TenantRecord } from "@hexdev/platform-core";

import type { AuthorizedOperator } from "./authorization.js";
import { createTenantDetailHandler, createTenantListHandler, createTenantOriginsHandler } from "./tenant-handlers.js";

/** Same construction `operator-handlers.test.ts` already establishes — the
 * only place a bare-object `AuthorizedOperator` is ever built outside
 * `authorization.ts`'s own real minting path. */
const ACTOR = { id: "op-actor" as OperatorId, username: "ana", permissions: new Set() } as unknown as AuthorizedOperator;

/** A fixed "now" so every test travels in time via `deps.clock`, never a real
 * timer — same discipline `tenant-validity.test.ts`'s own suite already
 * establishes for the pure function this handler calls. 2026-08-15 12:00 UTC. */
const NOW = Date.UTC(2026, 7, 15, 12, 0, 0);

function tenantsWith(records: readonly TenantRecord[]): TenantAdminRepository {
  return {
    list: async () => records,
    findById: async (id) => records.find((record) => record.id === id),
    create: async () => {
      throw new Error("not used by this handler");
    },
    updateAllowedOrigins: async () => {
      throw new Error("not used by this handler");
    },
    updateEntitledGames: async () => {
      throw new Error("not used by this handler");
    },
    updateTheme: async () => {
      throw new Error("not used by this handler");
    },
    rotateEmbedKey: async () => {
      throw new Error("not used by this handler");
    },
    setValidityWindow: async () => {
      throw new Error("not used by this handler");
    },
  };
}

function tenant(overrides: Partial<TenantRecord> & Pick<TenantRecord, "id">): TenantRecord {
  return { embedKey: `pk_live_${overrides.id}`, allowedOrigins: [], entitledGames: [], ...overrides };
}

/**
 * A minimal, PURPOSE-BUILT fake — genuinely mutates its one record (so a
 * write handler's "persisted, then re-read" property is real, not merely
 * asserted against a mock's call arguments) AND captures every `exec` call
 * the write's own `WriteWitness` makes, so a test can assert the EXACT
 * `AuditAction` an audit-producing handler fires without needing real
 * Postgres (the real transactional coupling between a mutation and its
 * audit INSERT is `postgres-tenant-admin-repository.ts`'s own proof,
 * exercised for real in `*.postgres.test.ts` — this fake only proves the
 * HTTP-level wiring, the identical division of labor
 * `operator-handlers.test.ts`'s own fakes already establish).
 */
function writableTenantRepo(initial: TenantRecord | undefined): { repo: TenantAdminRepository; execCalls: { readonly sql: string; readonly values: readonly unknown[] }[] } {
  let current = initial;
  const execCalls: { readonly sql: string; readonly values: readonly unknown[] }[] = [];
  const capturingExec = async (sql: string, values: readonly unknown[]): Promise<void> => {
    execCalls.push({ sql, values });
  };
  const repo: TenantAdminRepository = {
    list: async () => (current === undefined ? [] : [current]),
    findById: async (id) => (current?.id === id ? current : undefined),
    create: async () => {
      throw new Error("not used by these handlers");
    },
    updateAllowedOrigins: async (id, allowedOrigins, w) => {
      if (current === undefined || current.id !== id) return { ok: false, reason: "unknown-tenant" };
      current = { ...current, allowedOrigins };
      await w(capturingExec);
      return { ok: true, tenant: current, themeViolations: [] };
    },
    updateEntitledGames: async (id, entitledGames, w) => {
      if (current === undefined || current.id !== id) return { ok: false, reason: "unknown-tenant" };
      current = { ...current, entitledGames };
      await w(capturingExec);
      return { ok: true, tenant: current, themeViolations: [] };
    },
    updateTheme: async () => {
      throw new Error("not used by these handlers");
    },
    rotateEmbedKey: async () => {
      throw new Error("not used by these handlers");
    },
    setValidityWindow: async () => {
      throw new Error("not used by these handlers");
    },
  };
  return { repo, execCalls };
}

/**
 * `createTenantListHandler` (task 14.4) — proven with a FAKE
 * `TenantAdminRepository.list()`, never real Postgres (this slice's own
 * work-unit evidence names the manual runtime harness, not `test:postgres`,
 * as the real-database proof — the property this suite pins is the JSON
 * shape and the status DERIVATION, both of which live entirely in this
 * handler and `describeTenantStatus`, neither of which touches SQL).
 *
 * Genuine RED, confirmed before `tenant-handlers.ts` existed: `Cannot find
 * module './tenant-handlers.js'`.
 */
describe("createTenantListHandler", () => {
  it("returns 200 with every tenant's id, embedKey, and DERIVED status — never a raw instant", async () => {
    const handler = createTenantListHandler({
      clock: () => NOW,
      tenants: tenantsWith([
        tenant({ id: "acme" as TenantId, validFrom: undefined, validUntil: undefined }), // no-window
        tenant({ id: "beta" as TenantId, validUntil: Date.UTC(2026, 6, 1, 3, 0, 0) }), // expired long before NOW
        tenant({ id: "gamma" as TenantId, validFrom: Date.UTC(2026, 8, 1, 3, 0, 0), validUntil: Date.UTC(2027, 0, 1, 3, 0, 0) }), // not yet active
        tenant({ id: "delta" as TenantId, validUntil: Date.UTC(2027, 0, 1, 3, 0, 0) }), // active
      ]),
    });

    const response = await handler({}, {} as never);

    expect(response.status).toBe(200);
    const body = JSON.parse(response.body) as { readonly tenants: readonly { readonly id: string; readonly embedKey: string; readonly status: { readonly kind: string } }[] };
    expect(body.tenants).toHaveLength(4);
    expect(body.tenants.map((row) => row.status.kind)).toEqual(["no-window", "expired", "not-yet-active", "active"]);
    // Never a raw epoch instant leaking through: every field this response
    // carries for a tenant is either an id string, an embedKey string, or the
    // closed `TenantStatus` shape `describeTenantStatus` itself produces.
    expect(body.tenants[0]).toEqual({ id: "acme", embedKey: "pk_live_acme", status: { kind: "no-window" } });
  });

  it("returns an empty list, not an error, when Postgres holds no tenants yet", async () => {
    const handler = createTenantListHandler({ clock: () => NOW, tenants: tenantsWith([]) });
    const response = await handler({}, {} as never);
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ tenants: [] });
  });
});

/**
 * `createTenantDetailHandler` — `GET /tenants/:id` (task 15a's own implied
 * prerequisite: an origin/game/window editor needs a screen to render into,
 * and that screen needs ONE tenant's full record, not the list's trimmed
 * `id`/`embedKey`/`status` triple). Not itemized as its own numbered task in
 * Phase 15a — the same class of necessary, disclosed plumbing PR4e's own
 * "remediation, not itemized originally" already established for this chain.
 *
 * Genuine RED, confirmed before this handler existed: `createTenantDetailHandler
 * is not exported` (`Cannot find module` would have fired had the whole
 * file been missing; here the SYMBOL was missing from an existing file, so
 * the real failure was a `SyntaxError`-shaped import error from the test
 * runner reporting the missing named export).
 */
describe("createTenantDetailHandler", () => {
  it("returns 200 with the full record — origins, games, embedKey, status, and the CURRENT paid-through date even while active", async () => {
    const handler = createTenantDetailHandler({
      clock: () => NOW,
      tenants: tenantsWith([
        tenant({
          id: "acme" as TenantId,
          allowedOrigins: ["https://acme.example"],
          entitledGames: ["truco-argentino"],
          validUntil: Date.UTC(2027, 0, 1, 3, 0, 0), // active at NOW, paid through 2026-12-31 (BA)
        }),
      ]),
    });

    const response = await handler({ params: { id: "acme" } }, {} as never);

    expect(response.status).toBe(200);
    const body = JSON.parse(response.body) as {
      readonly tenant: {
        readonly id: string;
        readonly embedKey: string;
        readonly allowedOrigins: readonly string[];
        readonly entitledGames: readonly string[];
        readonly status: { readonly kind: string };
        readonly validUntilDisplay?: string;
      };
    };
    expect(body.tenant).toEqual({
      id: "acme",
      embedKey: "pk_live_acme",
      allowedOrigins: ["https://acme.example"],
      entitledGames: ["truco-argentino"],
      status: { kind: "active" },
      // `describeTenantStatus`'s own `active` branch carries no date at all
      // (design §1.9 — the panel answers "why isn't it working", nothing
      // more) — the window editor still needs the CURRENT paid-through date
      // to pre-fill even for an already-active tenant, so this handler
      // derives it directly from `validUntil` via `instantToPaidThrough`,
      // separately from `status`.
      validUntilDisplay: "2026-12-31",
    });
  });

  it("omits validUntilDisplay entirely when no window has ever been configured — never a null or a raw instant", async () => {
    const handler = createTenantDetailHandler({ clock: () => NOW, tenants: tenantsWith([tenant({ id: "acme" as TenantId })]) });
    const response = await handler({ params: { id: "acme" } }, {} as never);
    const body = JSON.parse(response.body) as { readonly tenant: { readonly validUntilDisplay?: string } };
    expect(body.tenant.validUntilDisplay).toBeUndefined();
  });

  it("returns 404 for a tenant id nobody created — a legitimate miss, not a server fault", async () => {
    const handler = createTenantDetailHandler({ clock: () => NOW, tenants: tenantsWith([]) });
    const response = await handler({ params: { id: "ghost" } }, {} as never);
    expect(response.status).toBe(404);
    expect(JSON.parse(response.body)).toEqual({ error: "unknown-tenant" });
  });

  it("returns 400 when the route resolves with no id param at all — defense in depth, routing.ts never resolves it that way", async () => {
    const handler = createTenantDetailHandler({ clock: () => NOW, tenants: tenantsWith([]) });
    const response = await handler({}, {} as never);
    expect(response.status).toBe(400);
  });
});

/**
 * `createTenantOriginsHandler` — `POST /tenants/:id/origins` (task 15a.1/
 * 15a.2). Genuine RED, confirmed before this handler existed:
 * `createTenantOriginsHandler is not a function`.
 */
describe("createTenantOriginsHandler", () => {
  it("persists the new origins, audits tenant.origins.updated with the real actor, and returns the fresh detail row", async () => {
    const { repo, execCalls } = writableTenantRepo(tenant({ id: "acme" as TenantId, allowedOrigins: ["https://old.example"] }));
    const handler = createTenantOriginsHandler({ clock: () => NOW, tenants: repo });

    const response = await handler({ params: { id: "acme" }, body: { origins: ["https://new.example", "https://second.example"] } }, ACTOR);

    expect(response.status).toBe(200);
    const body = JSON.parse(response.body) as { readonly tenant: { readonly allowedOrigins: readonly string[] } };
    expect(body.tenant.allowedOrigins).toEqual(["https://new.example", "https://second.example"]);
    // Genuinely persisted, not merely echoed in the response:
    expect((await repo.findById("acme" as TenantId))?.allowedOrigins).toEqual(["https://new.example", "https://second.example"]);
    // The witness fired exactly once, carrying the real actor and the real
    // AuditAction — never a hardcoded string, never a second insert.
    expect(execCalls).toHaveLength(1);
    expect(execCalls[0]?.values).toEqual(
      expect.arrayContaining([expect.any(Date), ACTOR.id, ACTOR.username, "tenant.origins.updated", "acme", null, JSON.stringify({ allowedOrigins: { before: ["https://old.example"], after: ["https://new.example", "https://second.example"] } })]),
    );
  });

  it("accepts an empty list — 'created, no origin configured yet' is legitimate, never forced non-empty", async () => {
    const { repo } = writableTenantRepo(tenant({ id: "acme" as TenantId, allowedOrigins: ["https://old.example"] }));
    const handler = createTenantOriginsHandler({ clock: () => NOW, tenants: repo });

    const response = await handler({ params: { id: "acme" }, body: { origins: [] } }, ACTOR);

    expect(response.status).toBe(200);
    expect((await repo.findById("acme" as TenantId))?.allowedOrigins).toEqual([]);
  });

  it("returns 404 for a tenant nobody created, without throwing", async () => {
    const { repo } = writableTenantRepo(undefined);
    const handler = createTenantOriginsHandler({ clock: () => NOW, tenants: repo });
    const response = await handler({ params: { id: "ghost" }, body: { origins: [] } }, ACTOR);
    expect(response.status).toBe(404);
  });

  it("refuses a malformed payload (not an array of strings) with 400, never a crash", async () => {
    const { repo } = writableTenantRepo(tenant({ id: "acme" as TenantId }));
    const handler = createTenantOriginsHandler({ clock: () => NOW, tenants: repo });
    expect((await handler({ params: { id: "acme" }, body: { origins: "not-an-array" } }, ACTOR)).status).toBe(400);
    expect((await handler({ params: { id: "acme" }, body: { origins: [1, 2] } }, ACTOR)).status).toBe(400);
    expect((await handler({ params: { id: "acme" }, body: {} }, ACTOR)).status).toBe(400);
  });
});
