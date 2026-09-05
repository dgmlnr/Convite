import { describe, expect, it } from "vitest";
import type { TenantAdminRepository, TenantId, TenantRecord } from "@hexdev/platform-core";

import { createTenantListHandler } from "./tenant-handlers.js";

/** A fixed "now" so every test travels in time via `deps.clock`, never a real
 * timer — same discipline `tenant-validity.test.ts`'s own suite already
 * establishes for the pure function this handler calls. 2026-08-15 12:00 UTC. */
const NOW = Date.UTC(2026, 7, 15, 12, 0, 0);

function tenantsWith(records: readonly TenantRecord[]): TenantAdminRepository {
  return {
    list: async () => records,
    findById: async () => {
      throw new Error("not used by this handler");
    },
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
