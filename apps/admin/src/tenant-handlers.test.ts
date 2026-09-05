import { describe, expect, it } from "vitest";
import type { TenantAdminRepository, TenantId, TenantRecord } from "@hexdev/platform-core";

import { createTenantDetailHandler, createTenantListHandler } from "./tenant-handlers.js";

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
