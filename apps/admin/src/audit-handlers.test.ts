import { describe, expect, it } from "vitest";
import type { AuthorizedOperator } from "./authorization.js";
import { createAuditViewHandler, type AuditHandlersDeps } from "./audit-handlers.js";
import type { AuditEntryRow } from "./audit-query.js";

const ACTOR = { id: "op-actor", username: "actor", permissions: new Set(["audit.view"]) } as unknown as AuthorizedOperator;

const SAMPLE_ENTRY: AuditEntryRow = {
  id: 1,
  occurredAt: 1_700_000_000_000,
  actorUsername: "ana",
  action: "tenant.created",
  targetTenantId: "acme",
};

function depsCapturingFilters(entries: readonly AuditEntryRow[] = [SAMPLE_ENTRY]): { readonly deps: AuditHandlersDeps; readonly calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    deps: {
      listAuditEntries: async (filters) => {
        calls.push(filters);
        return entries;
      },
    },
    calls,
  };
}

/**
 * `createAuditViewHandler` (task 16b.2/16b.3) — `GET /audit`, already
 * guarded by `audit.view` since design §6.2's own route table (task 7.7).
 * This suite proves the HTTP-level wiring: query-string parsing into
 * `AuditQueryFilters`, and the closed-vocabulary fence over `action` — the
 * ONE layer allowed to know `AUDIT_ACTIONS` exists, the identical placement
 * `permission-handlers.ts`'s own `isPermission` establishes for a different
 * closed vocabulary.
 */
describe("createAuditViewHandler", () => {
  it("returns every entry listAuditEntries reports, verbatim, under an entries key", async () => {
    const { deps } = depsCapturingFilters();
    const handler = createAuditViewHandler(deps);

    const response = await handler({}, ACTOR);

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ entries: [SAMPLE_ENTRY] });
  });

  it("with no query string, passes empty filters — task 16b.2's own 'no filter' shape", async () => {
    const { deps, calls } = depsCapturingFilters();
    const handler = createAuditViewHandler(deps);

    await handler({}, ACTOR);

    expect(calls).toEqual([{ actorUsername: undefined, targetTenantId: undefined, action: undefined, occurredFrom: undefined, occurredTo: undefined }]);
  });

  it("filtering by target tenant shows only that tenant's entries — task 16b.1's own scenario, at the HTTP layer", async () => {
    const { deps, calls } = depsCapturingFilters();
    const handler = createAuditViewHandler(deps);

    await handler({ query: { tenant: "acme" } }, ACTOR);

    expect((calls[0] as { readonly targetTenantId?: string }).targetTenantId).toBe("acme");
  });

  it("maps actor/action query params through to the filters", async () => {
    const { deps, calls } = depsCapturingFilters();
    const handler = createAuditViewHandler(deps);

    await handler({ query: { actor: "ana", action: "permission.granted" } }, ACTOR);

    expect(calls[0]).toMatchObject({ actorUsername: "ana", action: "permission.granted" });
  });

  it("an action outside the closed AUDIT_ACTIONS vocabulary is silently ignored, never forwarded as a filter", async () => {
    const { deps, calls } = depsCapturingFilters();
    const handler = createAuditViewHandler(deps);

    await handler({ query: { action: "tenant.runtime.refused" } }, ACTOR);

    expect((calls[0] as { readonly action?: string }).action).toBeUndefined();
  });

  it("parses from/to as ISO date-times into epoch-ms bounds", async () => {
    const { deps, calls } = depsCapturingFilters();
    const handler = createAuditViewHandler(deps);

    await handler({ query: { from: "2026-08-01T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z" } }, ACTOR);

    expect(calls[0]).toMatchObject({ occurredFrom: Date.parse("2026-08-01T00:00:00.000Z"), occurredTo: Date.parse("2026-09-01T00:00:00.000Z") });
  });

  it("an unparseable date is ignored rather than crashing or forwarding NaN", async () => {
    const { deps, calls } = depsCapturingFilters();
    const handler = createAuditViewHandler(deps);

    await handler({ query: { from: "not-a-date" } }, ACTOR);

    expect((calls[0] as { readonly occurredFrom?: number }).occurredFrom).toBeUndefined();
  });
});
