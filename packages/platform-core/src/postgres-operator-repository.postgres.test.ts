import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import type { OperatorId, OperatorRecord } from "./operator-repository.js";
import { connectPostgres } from "./postgres-client.js";
import { createPostgresOperatorRepository } from "./postgres-operator-repository.js";
import { describeOperatorRepositoryContract } from "./operator-repository.contract.js";
import { readPostgresTestUrl } from "./postgres-test-harness.js";

/**
 * Runs the SAME conformance suite the static in-memory adapter runs
 * (`operator-repository.test.ts`), here against real Postgres 17 with
 * migration 003 already applied — mirrors
 * `postgres-tenant-admin-repository.postgres.test.ts`'s own
 * `pool`/`seedOperators`/`TRUNCATE` shape exactly, for the identical reason:
 * the shared contract reuses the same usernames across its own `it` blocks,
 * which would collide with `operators.username`'s UNIQUE constraint on a
 * table that persists across tests.
 */
let pool: Pool;

beforeAll(async () => {
  pool = await connectPostgres(readPostgresTestUrl());
});

afterAll(async () => {
  await pool.end();
});

async function seedOperators(records: readonly OperatorRecord[]): Promise<void> {
  await pool.query("TRUNCATE TABLE operator_sessions, operator_permissions, operators CASCADE");
  for (const record of records) {
    await pool.query("INSERT INTO operators (id, username, password_hash, enabled) VALUES ($1, $2, $3, $4)", [record.id, record.username, record.passwordHash, record.enabled]);
  }
}

describeOperatorRepositoryContract("postgres", async (records) => {
  await seedOperators(records);
  return createPostgresOperatorRepository(pool);
});

describe('createPostgresOperatorRepository — username uniqueness: "the constraint enforces, the catch translates" (design §3, no TOCTOU check-then-write)', () => {
  it("refuses two concurrent creates racing for the SAME username — the datastore's own constraint decides, not a pre-check", async () => {
    await seedOperators([]);
    const repo = createPostgresOperatorRepository(pool);
    const [first, second] = await Promise.all([
      repo.create({ id: "op-race-1" as OperatorId, username: "carrera", passwordHash: "scrypt$32768$8$1$c2FsdA==$a2V5" }),
      repo.create({ id: "op-race-2" as OperatorId, username: "carrera", passwordHash: "scrypt$32768$8$1$c2FsdDI=$a2V5Mg==" }),
    ]);
    const outcomes = [first, second].map((r) => r.ok);
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect(outcomes.filter((ok) => !ok)).toHaveLength(1);
  });
});

describe("createPostgresOperatorRepository — SQL injection (threat matrix: every write is pool.query(text, values), never string interpolation)", () => {
  it("a hostile username round-trips as literal data, never as executed SQL", async () => {
    await seedOperators([]);
    const repo = createPostgresOperatorRepository(pool);
    const payload = "'); DROP TABLE operators;--";

    const result = await repo.create({ id: "op-inj" as OperatorId, username: payload, passwordHash: "scrypt$32768$8$1$c2FsdA==$a2V5" });

    expect(result.ok).toBe(true);
    // The real proof: `operators` still exists and is still queryable at
    // all — a naive string-built query executing the payload would have
    // dropped it.
    const found = await repo.findByUsername(payload);
    expect(found?.username).toBe(payload);
  });
});
