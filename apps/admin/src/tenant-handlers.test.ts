import { describe, expect, it } from "vitest";
import type { OperatorId, TenantAdminRepository, TenantId, TenantRecord } from "@hexdev/platform-core";
import { sanitizeThemeOverride, validateThemeContrast } from "@hexdev/widget-protocol";

import type { AuthorizedOperator } from "./authorization.js";
import {
  createTenantCreateHandler,
  createTenantDetailHandler,
  createTenantGamesHandler,
  createTenantListHandler,
  createTenantOriginsHandler,
  createTenantRotateKeyHandler,
  createTenantThemeHandler,
  createTenantWindowHandler,
} from "./tenant-handlers.js";

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
    // Real sanitization + contrast validation, the SAME two
    // `@hexdev/widget-protocol` primitives `sanitizeTenantTheme`
    // (`platform-core`, unexported) composes for the real adapters — this
    // fake reaches for them directly rather than reimplementing or
    // stubbing that behavior, so the handler's OWN "surface themeViolations"
    // property is proven against a genuine sanitizer, never a hand-typed
    // guess of what it would return.
    updateTheme: async (id, theme, w) => {
      if (current === undefined || current.id !== id) return { ok: false, reason: "unknown-tenant" };
      const validated = validateThemeContrast(sanitizeThemeOverride((theme ?? {}) as Readonly<Record<string, unknown>>));
      current = { ...current, theme: validated.theme };
      await w(capturingExec);
      return { ok: true, tenant: current, themeViolations: validated.violations };
    },
    rotateEmbedKey: async (id, embedKey, w) => {
      if (current === undefined || current.id !== id) return { ok: false, reason: "unknown-tenant" };
      current = { ...current, embedKey };
      await w(capturingExec);
      return { ok: true, tenant: current, themeViolations: [] };
    },
    setValidityWindow: async (id, window, w) => {
      if (current === undefined || current.id !== id) return { ok: false, reason: "unknown-tenant" };
      if (window.validFrom !== undefined && window.validUntil !== undefined && window.validFrom >= window.validUntil) {
        return { ok: false, reason: "invalid-window" };
      }
      current = { ...current, validFrom: window.validFrom, validUntil: window.validUntil };
      await w(capturingExec);
      return { ok: true, tenant: current, themeViolations: [] };
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
 * A minimal, PURPOSE-BUILT fake for `createTenantCreateHandler`'s own tests —
 * genuinely tracks id/embedKey collisions with the SAME two-map shape
 * `createStaticTenantAdminRepository`'s own `create` method uses
 * (`tenant-admin.ts`), so a duplicate-id/duplicate-embed-key refusal is
 * PROVEN against a real collision, never merely asserted against a mock's
 * call arguments — and captures every `exec` call the write's own
 * `WriteWitness` makes, the identical division of labor `writableTenantRepo`
 * above already establishes: this fake proves the HTTP-level wiring; the
 * REAL SQLSTATE-23505-backed proof is
 * `postgres-tenant-admin-repository.postgres.test.ts`'s own job.
 */
function creatableTenantRepo(existing: readonly TenantRecord[] = []): { repo: TenantAdminRepository; execCalls: { readonly sql: string; readonly values: readonly unknown[] }[] } {
  const byId = new Map(existing.map((record) => [record.id, record]));
  const byEmbedKey = new Map(existing.map((record) => [record.embedKey, record]));
  const execCalls: { readonly sql: string; readonly values: readonly unknown[] }[] = [];
  const capturingExec = async (sql: string, values: readonly unknown[]): Promise<void> => {
    execCalls.push({ sql, values });
  };
  const repo: TenantAdminRepository = {
    list: async () => [...byId.values()],
    findById: async (id) => byId.get(id),
    create: async (draft, w) => {
      if (byId.has(draft.id)) return { ok: false, reason: "tenant-id-taken" };
      if (byEmbedKey.has(draft.embedKey)) return { ok: false, reason: "embed-key-taken" };
      const record: TenantRecord = { id: draft.id, embedKey: draft.embedKey, allowedOrigins: draft.allowedOrigins, entitledGames: draft.entitledGames, theme: draft.theme };
      byId.set(record.id, record);
      byEmbedKey.set(record.embedKey, record);
      await w(capturingExec);
      return { ok: true, tenant: record, themeViolations: [] };
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
  return { repo, execCalls };
}

/**
 * `createTenantCreateHandler` — `POST /tenants` (the gap slice 15 flagged
 * but never built: design Domain F names "create a tenant" as in-scope CRUD,
 * `tasks-b` never itemized it — closed here, not in a fresh slice 16).
 *
 * Genuine RED, confirmed before this handler existed:
 * `SyntaxError: The requested module './tenant-handlers.js' does not
 * provide an export named 'createTenantCreateHandler'`.
 */
describe("createTenantCreateHandler", () => {
  it("creates a tenant with empty origins/games, no window, and a system-generated embedKey; audits tenant.created", async () => {
    const { repo, execCalls } = creatableTenantRepo([]);
    const handler = createTenantCreateHandler({ clock: () => NOW, tenants: repo, generateEmbedKey: () => "pk_live_fixed" });

    const response = await handler({ body: { id: "acme" } }, ACTOR);

    expect(response.status).toBe(201);
    const body = JSON.parse(response.body) as {
      readonly tenant: { readonly id: string; readonly embedKey: string; readonly allowedOrigins: readonly string[]; readonly entitledGames: readonly string[]; readonly status: { readonly kind: string } };
    };
    // Never operator-typed (design §3's "system-generated" requirement) —
    // the response carries whatever the injected generator produced, never
    // an echo of anything the request body supplied (it supplied nothing).
    expect(body.tenant).toEqual({ id: "acme", embedKey: "pk_live_fixed", allowedOrigins: [], entitledGames: [], status: { kind: "no-window" } });
    // A freshly created tenant is legitimately INACTIVE (design §1.3) — never
    // forced into an "active" status by fabricating a window this handler
    // was never asked to set.
    expect(body.tenant.status.kind).toBe("no-window");

    expect(execCalls).toHaveLength(1);
    const [{ values }] = execCalls;
    expect(values[3]).toBe("tenant.created"); // action, migration 004 column order
  });

  it("refuses a duplicate tenant id with 409, the database-arbitrated collision an operator can actually reach through this screen", async () => {
    const { repo, execCalls } = creatableTenantRepo([{ id: "acme" as TenantId, embedKey: "pk_live_acme", allowedOrigins: [], entitledGames: [] }]);
    const handler = createTenantCreateHandler({ clock: () => NOW, tenants: repo, generateEmbedKey: () => "pk_live_new" });

    const response = await handler({ body: { id: "acme" } }, ACTOR);

    expect(response.status).toBe(409);
    expect(JSON.parse(response.body)).toEqual({ error: "tenant-id-taken" });
    // No audit entry for a refused write (design §9/§10's own "a mutation
    // without its audit entry cannot commit" — here, no mutation happened
    // at all, so the witness itself must never have run).
    expect(execCalls).toHaveLength(0);
  });

  /**
   * `embedKey` is system-generated, never operator-typed (design §3) — this
   * makes a real collision through the actual screen astronomically
   * unlikely (two independent 32-byte random draws), but the discriminated
   * `embed-key-taken` refusal must stay reachable rather than assumed
   * impossible, the SAME discipline `createTenantRotateKeyHandler`'s own
   * docstring already establishes for its own near-unreachable case. Proven
   * here by forcing the injected generator to collide, the only way this
   * branch is reachable at all without a real cryptographic coincidence.
   */
  it("refuses a colliding system-generated embedKey with 409, even though an operator can never type one", async () => {
    const { repo, execCalls } = creatableTenantRepo([{ id: "acme" as TenantId, embedKey: "pk_live_dup", allowedOrigins: [], entitledGames: [] }]);
    const handler = createTenantCreateHandler({ clock: () => NOW, tenants: repo, generateEmbedKey: () => "pk_live_dup" });

    const response = await handler({ body: { id: "beta" } }, ACTOR);

    expect(response.status).toBe(409);
    expect(JSON.parse(response.body)).toEqual({ error: "embed-key-taken" });
    expect(execCalls).toHaveLength(0);
  });

  it("refuses a missing/blank tenant id with 400, never calling the repository at all", async () => {
    const handler = createTenantCreateHandler({ clock: () => NOW, tenants: tenantsWith([]) });

    const missing = await handler({ body: {} }, ACTOR);
    expect(missing.status).toBe(400);
    expect(JSON.parse(missing.body)).toEqual({ error: "missing-tenant-id" });

    const blank = await handler({ body: { id: "   " } }, ACTOR);
    expect(blank.status).toBe(400);
    expect(JSON.parse(blank.body)).toEqual({ error: "missing-tenant-id" });
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

/**
 * `createTenantGamesHandler` — `POST /tenants/:id/games` (task 15a.3/15a.4).
 * Structurally identical to the origins handler above — same shape,
 * different field and `AuditAction`. Genuine RED, confirmed before this
 * handler existed: `createTenantGamesHandler is not a function`.
 */
describe("createTenantGamesHandler", () => {
  it("persists the new games, audits tenant.games.updated, and returns the fresh detail row", async () => {
    const { repo, execCalls } = writableTenantRepo(tenant({ id: "acme" as TenantId, entitledGames: ["truco-argentino"] }));
    const handler = createTenantGamesHandler({ clock: () => NOW, tenants: repo });

    const response = await handler({ params: { id: "acme" }, body: { games: ["escoba"] } }, ACTOR);

    expect(response.status).toBe(200);
    const body = JSON.parse(response.body) as { readonly tenant: { readonly entitledGames: readonly string[] } };
    expect(body.tenant.entitledGames).toEqual(["escoba"]);
    expect((await repo.findById("acme" as TenantId))?.entitledGames).toEqual(["escoba"]);
    expect(execCalls).toHaveLength(1);
    expect(execCalls[0]?.values).toContain("tenant.games.updated");
  });

  it("accepts an empty list — entitlements lapsing to zero is a legitimate state, never forced non-empty", async () => {
    const { repo } = writableTenantRepo(tenant({ id: "acme" as TenantId, entitledGames: ["truco-argentino"] }));
    const handler = createTenantGamesHandler({ clock: () => NOW, tenants: repo });
    const response = await handler({ params: { id: "acme" }, body: { games: [] } }, ACTOR);
    expect(response.status).toBe(200);
    expect((await repo.findById("acme" as TenantId))?.entitledGames).toEqual([]);
  });

  it("returns 404 for a tenant nobody created", async () => {
    const { repo } = writableTenantRepo(undefined);
    const handler = createTenantGamesHandler({ clock: () => NOW, tenants: repo });
    const response = await handler({ params: { id: "ghost" }, body: { games: [] } }, ACTOR);
    expect(response.status).toBe(404);
  });

  it("refuses a malformed payload with 400", async () => {
    const { repo } = writableTenantRepo(tenant({ id: "acme" as TenantId }));
    const handler = createTenantGamesHandler({ clock: () => NOW, tenants: repo });
    expect((await handler({ params: { id: "acme" }, body: { games: "not-an-array" } }, ACTOR)).status).toBe(400);
  });
});

/**
 * `createTenantWindowHandler` — `POST /tenants/:id/window` (tasks
 * 15a.5/15a.6, permission `tenant.window.edit`). Accepts a BA calendar date
 * as an ISO `"YYYY-MM-DD"` string (the client's own `argentineDateToIso`
 * already converts the operator's `DD/MM/AAAA` input before this ever
 * receives it) and converts it to the stored instant via the REAL
 * `paidThroughToInstant` — never a raw instant crossing this boundary.
 * Genuine RED, confirmed before this handler existed:
 * `createTenantWindowHandler is not a function`.
 */
describe("createTenantWindowHandler", () => {
  it("stores the BOUNDARY INSTANT paidThroughToInstant computes for the given date — the exact date typed comes back on the next read", async () => {
    const { repo, execCalls } = writableTenantRepo(tenant({ id: "acme" as TenantId }));
    const handler = createTenantWindowHandler({ clock: () => NOW, tenants: repo });

    const response = await handler({ params: { id: "acme" }, body: { validUntil: "2026-08-30" } }, ACTOR);

    expect(response.status).toBe(200);
    const body = JSON.parse(response.body) as { readonly tenant: { readonly validUntilDisplay?: string } };
    // Echoes the SAME calendar day back — the round-trip the launch prompt
    // warns about, proven at the handler level (the string-level round trip
    // is `tenant-detail.test.ts`'s own job; this proves the SERVER never
    // shifts it either).
    expect(body.tenant.validUntilDisplay).toBe("2026-08-30");
    expect(execCalls).toHaveLength(1);
    expect(execCalls[0]?.values).toContain("tenant.window.updated");
  });

  it("preserves an existing validFrom unchanged — this editor manages validUntil only, never silently clearing the lower bound", async () => {
    const existingValidFrom = Date.UTC(2026, 0, 1, 3, 0, 0);
    const { repo } = writableTenantRepo(tenant({ id: "acme" as TenantId, validFrom: existingValidFrom, validUntil: Date.UTC(2026, 5, 1, 3, 0, 0) }));
    const handler = createTenantWindowHandler({ clock: () => NOW, tenants: repo });

    await handler({ params: { id: "acme" }, body: { validUntil: "2026-12-31" } }, ACTOR);

    expect((await repo.findById("acme" as TenantId))?.validFrom).toBe(existingValidFrom);
  });

  it("returns 400 for a malformed date, never crashing on a raw paidThroughToInstant throw", async () => {
    const { repo } = writableTenantRepo(tenant({ id: "acme" as TenantId }));
    const handler = createTenantWindowHandler({ clock: () => NOW, tenants: repo });
    expect((await handler({ params: { id: "acme" }, body: { validUntil: "30/08/2026" } }, ACTOR)).status).toBe(400);
    expect((await handler({ params: { id: "acme" }, body: {} }, ACTOR)).status).toBe(400);
  });

  it("returns 404 for a tenant nobody created", async () => {
    const { repo } = writableTenantRepo(undefined);
    const handler = createTenantWindowHandler({ clock: () => NOW, tenants: repo });
    const response = await handler({ params: { id: "ghost" }, body: { validUntil: "2026-08-30" } }, ACTOR);
    expect(response.status).toBe(404);
  });
});

/**
 * `createTenantRotateKeyHandler` — `POST /tenants/:id/embed-key/rotate`
 * (task 15b.1/15b.2, permission `tenant.embed-key.rotate`). Rotation is
 * DESTRUCTIVE (launch prompt §3: "breaks the tenant's live page until they
 * update it") — this handler's own job is only to generate a fresh key and
 * persist it atomically with its audit entry; the UI's own confirmation
 * step (`TenantDetailScreen.tsx`, a later commit in this same PR) is what
 * makes the consequence visible BEFORE the operator commits. Genuine RED,
 * confirmed before this handler existed: `createTenantRotateKeyHandler is
 * not a function`.
 */
describe("createTenantRotateKeyHandler", () => {
  it("generates a FRESH pk_live_ key (never the operator's input — there is none), persists it, and audits tenant.embed-key.rotated with the real before/after", async () => {
    const { repo, execCalls } = writableTenantRepo(tenant({ id: "acme" as TenantId, embedKey: "pk_live_old_key" }));
    const handler = createTenantRotateKeyHandler({ clock: () => NOW, tenants: repo, generateEmbedKey: () => "pk_live_freshly_generated" });

    const response = await handler({ params: { id: "acme" } }, ACTOR);

    expect(response.status).toBe(200);
    const body = JSON.parse(response.body) as { readonly tenant: { readonly embedKey: string } };
    expect(body.tenant.embedKey).toBe("pk_live_freshly_generated");
    expect((await repo.findById("acme" as TenantId))?.embedKey).toBe("pk_live_freshly_generated");
    expect(execCalls).toHaveLength(1);
    expect(execCalls[0]?.values).toEqual(expect.arrayContaining(["tenant.embed-key.rotated", JSON.stringify({ embedKey: { before: "pk_live_old_key", after: "pk_live_freshly_generated" } })]));
  });

  it("returns 404 for a tenant nobody created", async () => {
    const { repo } = writableTenantRepo(undefined);
    const handler = createTenantRotateKeyHandler({ clock: () => NOW, tenants: repo, generateEmbedKey: () => "pk_live_whatever" });
    const response = await handler({ params: { id: "ghost" } }, ACTOR);
    expect(response.status).toBe(404);
  });

  it("returns 400 with no id param", async () => {
    const { repo } = writableTenantRepo(tenant({ id: "acme" as TenantId }));
    const handler = createTenantRotateKeyHandler({ clock: () => NOW, tenants: repo, generateEmbedKey: () => "pk_live_whatever" });
    expect((await handler({}, ACTOR)).status).toBe(400);
  });
});

describe("generateEmbedKey (default, production path)", () => {
  it("produces a pk_live_-prefixed key from real crypto.randomBytes(32), unique across two calls", async () => {
    const { generateEmbedKey } = await import("./tenant-handlers.js");
    const a = generateEmbedKey();
    const b = generateEmbedKey();
    expect(a.startsWith("pk_live_")).toBe(true);
    expect(a).not.toBe(b);
    // base64url(32 bytes) is 43 chars, no padding — same encoding
    // `generateSessionToken` (session-cookie.ts) already establishes.
    expect(a.length).toBe("pk_live_".length + 43);
  });
});

/**
 * `createTenantThemeHandler` — `POST /tenants/:id/theme` (task 15b.3/15b.4,
 * permission `tenant.origins.edit` per the route table's own read-route
 * bend, design §19). Forwards the raw payload STRAIGHT to
 * `TenantAdminRepository.updateTheme`, which already runs the REAL
 * `sanitizeTenantTheme` (design §2.3 point 3) — this handler never
 * re-sanitizes or re-validates; its own job is surfacing whatever
 * `themeViolations` the write already computed, moved from a
 * `console.warn` nobody in the panel ever reads (design §2.3) to the
 * response body an operator's own screen renders. Genuine RED, confirmed
 * before this handler existed: `createTenantThemeHandler is not a
 * function`.
 */
describe("createTenantThemeHandler", () => {
  it("persists a genuinely-sanitized theme, audits tenant.theme.updated, and surfaces zero violations for an already-legible theme", async () => {
    const { repo, execCalls } = writableTenantRepo(tenant({ id: "acme" as TenantId }));
    const handler = createTenantThemeHandler({ clock: () => NOW, tenants: repo });

    const response = await handler({ params: { id: "acme" }, body: { theme: { "--gx-color-primary": "#2f6f4f" } } }, ACTOR);

    expect(response.status).toBe(200);
    const body = JSON.parse(response.body) as { readonly tenant: { readonly id: string }; readonly themeViolations: readonly unknown[] };
    expect(body.themeViolations).toEqual([]);
    expect((await repo.findById("acme" as TenantId))?.theme).toEqual({ "--gx-color-primary": "#2f6f4f" });
    expect(execCalls).toHaveLength(1);
    expect(execCalls[0]?.values).toContain("tenant.theme.updated");
  });

  it("surfaces a REAL violation (never invents one) for a theme that fails contrast, and drops the offending tokens back to defaults", async () => {
    const { repo } = writableTenantRepo(tenant({ id: "acme" as TenantId }));
    const handler = createTenantThemeHandler({ clock: () => NOW, tenants: repo });

    // The exact known-bad pairing this slice's own contrast fence
    // (`theme-contrast-fence.test.ts`) already pins as failing AA.
    const response = await handler({ params: { id: "acme" }, body: { theme: { "--gx-color-on-surface": "#1a1a1a", "--gx-color-surface": "#14231d" } } }, ACTOR);

    const body = JSON.parse(response.body) as { readonly themeViolations: readonly { readonly pair: string; readonly reason: string }[] };
    expect(body.themeViolations).toHaveLength(1);
    expect(body.themeViolations[0]).toMatchObject({ pair: "on-surface/surface", reason: "below-minimum" });
    // Dropped back to defaults — never left storing the failing pair.
    expect((await repo.findById("acme" as TenantId))?.theme).toEqual({});
  });

  it("returns 404 for a tenant nobody created", async () => {
    const { repo } = writableTenantRepo(undefined);
    const handler = createTenantThemeHandler({ clock: () => NOW, tenants: repo });
    const response = await handler({ params: { id: "ghost" }, body: { theme: {} } }, ACTOR);
    expect(response.status).toBe(404);
  });

  it("returns 400 for a non-object theme payload, never crashing", async () => {
    const { repo } = writableTenantRepo(tenant({ id: "acme" as TenantId }));
    const handler = createTenantThemeHandler({ clock: () => NOW, tenants: repo });
    expect((await handler({ params: { id: "acme" }, body: { theme: "not-an-object" } }, ACTOR)).status).toBe(400);
  });
});
