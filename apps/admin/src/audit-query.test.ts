import { describe, expect, it } from "vitest";
import { listAuditEntries, type AuditQueryExec } from "./audit-query.js";

/**
 * `listAuditEntries` (spec Domain L, task 16b.2) — the audit viewer's own
 * read side, proven with a FAKE `exec`, never real Postgres: the property
 * under test is the SQL SHAPE (which `WHERE` clauses a given filter
 * combination produces, in which parameter order) and the response
 * mapping, not the driver's own marshalling — `audit-query.postgres.test.ts`
 * proves the real round trip against real `timestamptz`/`jsonb` columns.
 *
 * `audit-query.ts` NEVER imports `pg` (this file's own module docstring):
 * `AuditQueryExec` is a narrow structural type, the SAME discipline
 * `audit-log.ts`'s own `AuditExec` already establishes for the write side —
 * this is what keeps `apps/admin` off `.dependency-cruiser.cjs`'s
 * `no-pg-outside-platform-core` fence.
 */
function fakeExec(rows: readonly Record<string, unknown>[]) {
  const calls: Array<{ readonly sql: string; readonly values: readonly unknown[] }> = [];
  const exec: AuditQueryExec = async (sql, values) => {
    calls.push({ sql, values });
    return { rows: rows as never };
  };
  return { exec, calls };
}

describe("listAuditEntries", () => {
  it("with no filters, queries every entry with no WHERE clause", async () => {
    const { exec, calls } = fakeExec([]);

    await listAuditEntries(exec, {});

    expect(calls).toHaveLength(1);
    expect(calls[0]!.sql).not.toMatch(/WHERE/i);
    expect(calls[0]!.values).toEqual([]);
  });

  it("filtering by target tenant shows only that tenant's entries — task 16b.1's own scenario", async () => {
    const { exec, calls } = fakeExec([]);

    await listAuditEntries(exec, { targetTenantId: "acme" });

    expect(calls[0]!.sql).toMatch(/WHERE target_tenant_id = \$1/);
    expect(calls[0]!.values).toEqual(["acme"]);
  });

  it("combines actor, action, and date-range filters into one parameterized WHERE, never string interpolation", async () => {
    const { exec, calls } = fakeExec([]);

    await listAuditEntries(exec, { actorUsername: "ana", action: "permission.granted", occurredFrom: 1_700_000_000_000, occurredTo: 1_700_100_000_000 });

    expect(calls[0]!.sql).toMatch(/actor_username = \$1 AND action = \$2 AND occurred_at >= \$3 AND occurred_at < \$4/);
    expect(calls[0]!.values).toEqual(["ana", "permission.granted", new Date(1_700_000_000_000), new Date(1_700_100_000_000)]);
  });

  it("maps every row field, nulls becoming undefined, changes passed through as already-parsed jsonb", async () => {
    const { exec } = fakeExec([
      {
        id: 1,
        occurred_at: new Date(1_700_000_000_000),
        actor_username: "ana",
        action: "tenant.origins.updated",
        target_tenant_id: "acme",
        target_operator_id: null,
        changes: { allowedOrigins: { before: [], after: ["https://a.example"] } },
      },
    ]);

    const result = await listAuditEntries(exec, {});

    expect(result).toEqual([
      {
        id: 1,
        occurredAt: 1_700_000_000_000,
        actorUsername: "ana",
        action: "tenant.origins.updated",
        targetTenantId: "acme",
        targetOperatorId: undefined,
        changes: { allowedOrigins: { before: [], after: ["https://a.example"] } },
      },
    ]);
  });

  it("an invalid or unrecognised action is never validated here — the caller (audit-handlers.ts) owns that fence", async () => {
    // listAuditEntries trusts whatever `action` string it is handed; the
    // closed-vocabulary check lives one layer up, mirroring
    // permission-handlers.ts's own "isPermission checked ONE layer up"
    // placement for the identical reason (task 16b.2's own docstring).
    const { exec, calls } = fakeExec([]);

    await listAuditEntries(exec, { action: "not-a-real-action" as never });

    expect(calls[0]!.values).toEqual(["not-a-real-action"]);
  });
});
