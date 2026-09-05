import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { connectPostgres } from "./postgres-client.js";
import { listOperatorsWithPermissions } from "./operator-directory.js";
import { readPostgresTestUrl } from "./postgres-test-harness.js";

/**
 * `listOperatorsWithPermissions` (spec Domain K, design §6.1, task 16a.1) —
 * proven against REAL Postgres because its own `array_agg` + `LEFT JOIN` +
 * `coalesce` shape (identical to `postgres-operator-authorization.ts`'s own
 * `AUTHORIZATION_QUERY`, widened from one session-bound operator to every
 * operator at once) needs the real driver's own jsonb/array marshalling —
 * no in-memory double can stand in for it, the same "no port, no static
 * double when the mechanism is unavoidably Postgres-native" precedent this
 * package already establishes for `findOperatorAuthorizationContext`.
 */
let pool: Pool;

beforeAll(async () => {
  pool = await connectPostgres(readPostgresTestUrl());
});

afterAll(async () => {
  await pool.end();
});

async function resetOperators(): Promise<void> {
  await pool.query("TRUNCATE TABLE operator_sessions, operator_permissions, operators CASCADE");
}

describe("listOperatorsWithPermissions — task 16a.1", () => {
  it("returns every operator with its full permission set, ordered by username, in one round trip", async () => {
    await resetOperators();
    await pool.query("INSERT INTO operators (id, username, password_hash) VALUES ($1, $2, $3), ($4, $5, $6)", [
      "op-b",
      "beto",
      "scrypt$32768$8$1$c2FsdA==$a2V5",
      "op-a",
      "ana",
      "scrypt$32768$8$1$c2FsdA==$a2V5",
    ]);
    await pool.query("INSERT INTO operator_permissions (operator_id, permission) VALUES ($1, 'tenant.create'), ($1, 'operators.manage')", ["op-a"]);

    const result = await listOperatorsWithPermissions(pool);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: "op-a", username: "ana", enabled: true });
    expect(result[0]!.permissions).toEqual(expect.arrayContaining(["tenant.create", "operators.manage"]));
    expect(result[0]!.permissions).toHaveLength(2);
    expect(result[1]).toEqual({ id: "op-b", username: "beto", enabled: true, permissions: [] });
  });

  it("a disabled operator with zero permissions still appears, with an empty array rather than [null] (the identical coalesce trap AUTHORIZATION_QUERY's own docstring already names)", async () => {
    await resetOperators();
    await pool.query("INSERT INTO operators (id, username, password_hash, enabled) VALUES ($1, $2, $3, false)", ["op-disabled", "carla", "scrypt$32768$8$1$c2FsdA==$a2V5"]);

    const result = await listOperatorsWithPermissions(pool);

    expect(result).toEqual([{ id: "op-disabled", username: "carla", enabled: false, permissions: [] }]);
  });
});
