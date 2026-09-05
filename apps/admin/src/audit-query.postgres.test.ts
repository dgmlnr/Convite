import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { OperatorId, TenantId } from "@hexdev/platform-core";
import { connectPostgres } from "@hexdev/platform-core/node";
import { appendAuditEntry } from "./audit-log.js";
import { listAuditEntries, type AuditQueryExec } from "./audit-query.js";

const ACTOR_ID = "op-audit-actor" as OperatorId;

/**
 * `readPostgresTestUrl` in `packages/platform-core/src/postgres-test-harness.ts`
 * is deliberately NOT exported publicly — its own docstring: "internal to
 * this package's own `*.postgres.test.ts` files." This is the identical
 * file-based handoff `postgres-tests/global-setup.ts` writes once per
 * `pnpm run test:postgres` run, duplicated here rather than imported: the
 * relative path depth is the same (`apps/admin/src/` and
 * `packages/platform-core/src/` are both two segments below the repo
 * root's own child directories), so this is a faithful copy, not a
 * reimplementation with different behavior.
 */
function readPostgresTestUrl(): string {
  const path = fileURLToPath(new URL("../../../postgres-tests/.harness/info.json", import.meta.url));
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(
      `postgres harness info not found at ${path} — postgres-tests/global-setup.ts did not run or failed before writing it. ` +
        `Run this suite via \`pnpm run test:postgres\`, not vitest directly against a single spec file. Original error: ${String(error)}`,
      { cause: error },
    );
  }
  return (JSON.parse(raw) as { postgresUrl: string }).postgresUrl;
}

/**
 * `listAuditEntries` proven against REAL Postgres (task 16b.2) — the
 * `audit-query.test.ts` suite proves the SQL shape with a fake `exec`; this
 * file proves the real driver round trip: `occurred_at`'s `timestamptz` ->
 * `Date` -> epoch-ms conversion, `changes`'s `jsonb` arriving already
 * parsed (never a string this module has to `JSON.parse` itself), and the
 * real filter predicates against rows actually written through
 * `appendAuditEntry` (`audit-log.ts`'s own write side) — never hand-crafted
 * `INSERT`s bypassing the ONLY module allowed to issue one
 * (`audit-log.test.ts`'s own fence).
 */
// No `import type { Pool } from "pg"` here — `apps/admin` never depends on
// `pg` directly (the same fence `index.ts` itself already respects); the
// pool's type is inferred from `connectPostgres`'s own return type instead,
// identical to how `index.ts`'s own `postgresPool` never annotates one.
let pool: Awaited<ReturnType<typeof connectPostgres>>;
let exec: AuditQueryExec;

beforeAll(async () => {
  pool = await connectPostgres(readPostgresTestUrl());
  exec = (sql, values) => pool.query(sql, values as unknown[]) as unknown as ReturnType<AuditQueryExec>;
});

afterAll(async () => {
  await pool.end();
});

async function resetAuditLog(): Promise<void> {
  await pool.query("TRUNCATE TABLE audit_entries RESTART IDENTITY CASCADE");
  await pool.query("TRUNCATE TABLE operator_sessions, operator_permissions, operators CASCADE");
  await pool.query("INSERT INTO operators (id, username, password_hash) VALUES ($1, $2, $3)", ["op-audit-actor", "ana", "scrypt$32768$8$1$c2FsdA==$a2V5"]);
}

const realExec = (sql: string, values: readonly unknown[]) => pool.query(sql, values as unknown[]).then(() => undefined);

describe("listAuditEntries — task 16b.2, real Postgres", () => {
  it("filtering by target tenant shows only that tenant's entries (task 16b.1's own scenario)", async () => {
    await resetAuditLog();
    await appendAuditEntry(realExec, { occurredAt: 1_700_000_000_000, actorOperatorId: ACTOR_ID, actorUsername: "ana", action: "tenant.created", targetTenantId: "acme" as TenantId });
    await appendAuditEntry(realExec, { occurredAt: 1_700_000_001_000, actorOperatorId: ACTOR_ID, actorUsername: "ana", action: "tenant.created", targetTenantId: "otro" as TenantId });

    const result = await listAuditEntries(exec, { targetTenantId: "acme" });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ targetTenantId: "acme", action: "tenant.created", actorUsername: "ana" });
  });

  it("occurred_at round-trips through the real timestamptz column to the exact epoch-ms instant handed to appendAuditEntry", async () => {
    await resetAuditLog();
    const instant = 1_650_000_000_000;
    await appendAuditEntry(realExec, { occurredAt: instant, actorOperatorId: ACTOR_ID, actorUsername: "ana", action: "session.login" });

    const result = await listAuditEntries(exec, {});

    expect(result[0]!.occurredAt).toBe(instant);
  });

  it("changes arrives already parsed from jsonb, never a string this module has to JSON.parse", async () => {
    await resetAuditLog();
    await appendAuditEntry(realExec, {
      occurredAt: 1,
      actorOperatorId: ACTOR_ID,
      actorUsername: "ana",
      action: "tenant.origins.updated",
      targetTenantId: "acme" as TenantId,
      changes: { allowedOrigins: { before: [], after: ["https://a.example"] } },
    });

    const result = await listAuditEntries(exec, {});

    expect(result[0]!.changes).toEqual({ allowedOrigins: { before: [], after: ["https://a.example"] } });
  });

  it("a date range excludes entries outside the [from, to) bound", async () => {
    await resetAuditLog();
    await appendAuditEntry(realExec, { occurredAt: 1_000, actorOperatorId: ACTOR_ID, actorUsername: "ana", action: "session.login" });
    await appendAuditEntry(realExec, { occurredAt: 2_000, actorOperatorId: ACTOR_ID, actorUsername: "ana", action: "session.login" });
    await appendAuditEntry(realExec, { occurredAt: 3_000, actorOperatorId: ACTOR_ID, actorUsername: "ana", action: "session.login" });

    const result = await listAuditEntries(exec, { occurredFrom: 1_500, occurredTo: 3_000 });

    expect(result).toHaveLength(1);
    expect(result[0]!.occurredAt).toBe(2_000);
  });

  it("results are ordered newest first", async () => {
    await resetAuditLog();
    await appendAuditEntry(realExec, { occurredAt: 1_000, actorOperatorId: ACTOR_ID, actorUsername: "ana", action: "session.login" });
    await appendAuditEntry(realExec, { occurredAt: 3_000, actorOperatorId: ACTOR_ID, actorUsername: "ana", action: "session.logout" });
    await appendAuditEntry(realExec, { occurredAt: 2_000, actorOperatorId: ACTOR_ID, actorUsername: "ana", action: "session.login" });

    const result = await listAuditEntries(exec, {});

    expect(result.map((entry) => entry.occurredAt)).toEqual([3_000, 2_000, 1_000]);
  });
});
