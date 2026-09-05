import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import type { OperatorId } from "./operator-repository.js";
import type { OperatorSessionRecord } from "./operator-session-repository.js";
import { connectPostgres } from "./postgres-client.js";
import { createPostgresOperatorSessionRepository } from "./postgres-operator-session-repository.js";
import { describeOperatorSessionRepositoryContract } from "./operator-session-repository.contract.js";
import { readPostgresTestUrl } from "./postgres-test-harness.js";

/**
 * Runs the SAME conformance suite the static in-memory adapter runs
 * (`operator-session-repository.test.ts`), here against real Postgres 17
 * with migration 003 already applied — mirrors
 * `postgres-operator-repository.postgres.test.ts`'s own `pool`/`seed*`/
 * `TRUNCATE` shape. `operator_sessions.operator_id` is a foreign key to
 * `operators`, so seeding a session first requires an owning operator row —
 * unlike the operator/tenant contracts, this seed has TWO tables to insert
 * into, in dependency order.
 */
let pool: Pool;

beforeAll(async () => {
  pool = await connectPostgres(readPostgresTestUrl());
});

afterAll(async () => {
  await pool.end();
});

/**
 * The shared contract (`operator-session-repository.contract.ts`) always
 * uses the SAME fixed `operatorId` ("op-ana") for its own session fixture —
 * including in the "a created session is findable" scenario, which calls
 * `create([])` for the SEED (no sessions pre-exist) and only THEN calls
 * `repo.create(session)` directly inside the `it` block. A first version of
 * this harness only inserted an owning `operators` row for ids already
 * present in the SEED array, so that scenario hit a real, honest
 * `operator_sessions_operator_id_fkey` violation — the seed was empty, so no
 * operator existed yet for the session the test was about to create.
 * Unconditionally ensuring `CONTRACT_OPERATOR_ID` exists, regardless of what
 * the seed itself contains, is the fix: it never depends on a specific
 * scenario's own seed shape.
 */
const CONTRACT_OPERATOR_ID = "op-ana";

async function seedSessions(records: readonly OperatorSessionRecord[]): Promise<void> {
  await pool.query("TRUNCATE TABLE operator_sessions, operator_permissions, operators CASCADE");
  const operatorIds = new Set([CONTRACT_OPERATOR_ID, ...records.map((r) => r.operatorId)]);
  for (const operatorId of operatorIds) {
    await pool.query("INSERT INTO operators (id, username, password_hash) VALUES ($1, $2, $3)", [operatorId, `${operatorId}-username`, "scrypt$32768$8$1$c2FsdA==$a2V5"]);
  }
  for (const record of records) {
    await pool.query("INSERT INTO operator_sessions (token_hash, operator_id, created_at, expires_at) VALUES ($1, $2, to_timestamp($3::double precision / 1000), to_timestamp($4::double precision / 1000))", [
      record.tokenHash,
      record.operatorId,
      record.createdAt,
      record.expiresAt,
    ]);
  }
}

describeOperatorSessionRepositoryContract("postgres", async (records) => {
  await seedSessions(records);
  return createPostgresOperatorSessionRepository(pool);
});

describe("createPostgresOperatorSessionRepository — epoch-ms round trip through timestamptz", () => {
  it("createdAt/expiresAt survive a real Postgres round trip to the exact millisecond (design §2.2's Clock-as-epoch-ms convention, not merely asserted in-memory)", async () => {
    await seedSessions([]);
    await pool.query("INSERT INTO operators (id, username, password_hash) VALUES ($1, $2, $3)", ["op-roundtrip", "roundtrip-username", "scrypt$32768$8$1$c2FsdA==$a2V5"]);
    const repo = createPostgresOperatorSessionRepository(pool);
    const session: OperatorSessionRecord = { tokenHash: "c".repeat(64), operatorId: "op-roundtrip" as OperatorId, createdAt: 1_735_689_600_123, expiresAt: 1_735_718_400_123 };
    await repo.create(session);
    expect(await repo.findByTokenHash(session.tokenHash)).toEqual(session);
  });
});

describe("createPostgresOperatorSessionRepository — cascade delete (design §3: ON DELETE CASCADE from operators)", () => {
  it("deleting the owning operator removes its sessions too — never an orphaned session row after an operator is gone", async () => {
    await seedSessions([]);
    await pool.query("INSERT INTO operators (id, username, password_hash) VALUES ($1, $2, $3)", ["op-cascade", "cascade-username", "scrypt$32768$8$1$c2FsdA==$a2V5"]);
    const repo = createPostgresOperatorSessionRepository(pool);
    const session: OperatorSessionRecord = { tokenHash: "d".repeat(64), operatorId: "op-cascade" as OperatorId, createdAt: 1_700_000_000_000, expiresAt: 1_700_028_800_000 };
    await repo.create(session);
    await pool.query("DELETE FROM operators WHERE id = $1", ["op-cascade"]);
    expect(await repo.findByTokenHash(session.tokenHash)).toBeUndefined();
  });
});
