import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import type { OperatorId } from "./operator-repository.js";
import { connectPostgres } from "./postgres-client.js";
import { findOperatorAuthorizationContext } from "./postgres-operator-authorization.js";
import { readPostgresTestUrl } from "./postgres-test-harness.js";

/**
 * Proves design §7's one-query join against REAL Postgres 17, migrations
 * 001-003 already applied. `authorize` (`apps/admin/src/authorization.ts`)
 * is proven cache-free at the unit level with an injected
 * `AuthorizationQuery`; THIS file proves the PRODUCTION query itself
 * reflects a revoke/disable the instant the underlying rows change — no
 * restart, nothing to invalidate, because nothing here is ever cached
 * either.
 */
let pool: Pool;

beforeAll(async () => {
  pool = await connectPostgres(readPostgresTestUrl());
});

afterAll(async () => {
  await pool.end();
});

const OPERATOR_ID = "op-auth-check" as OperatorId;
const TOKEN_HASH = "a".repeat(64); // shape of a real sha256 hex digest — this suite never hashes a real token, only exercises the query

async function seed(options: { readonly enabled?: boolean; readonly permissions?: readonly string[]; readonly expiresAtMs?: number }): Promise<void> {
  await pool.query("TRUNCATE TABLE operator_sessions, operator_permissions, operators CASCADE");
  await pool.query("INSERT INTO operators (id, username, password_hash, enabled) VALUES ($1, $2, $3, $4)", [
    OPERATOR_ID,
    "auth-check",
    "scrypt$32768$8$1$c2FsdA==$a2V5",
    options.enabled ?? true,
  ]);
  for (const permission of options.permissions ?? []) {
    await pool.query("INSERT INTO operator_permissions (operator_id, permission) VALUES ($1, $2)", [OPERATOR_ID, permission]);
  }
  const expiresAtMs = options.expiresAtMs ?? Date.now() + 60_000;
  await pool.query("INSERT INTO operator_sessions (token_hash, operator_id, created_at, expires_at) VALUES ($1, $2, now(), to_timestamp($3::double precision / 1000))", [
    TOKEN_HASH,
    OPERATOR_ID,
    expiresAtMs,
  ]);
}

describe("findOperatorAuthorizationContext — the one-query join, against real Postgres (design §7)", () => {
  it("an unknown token hash resolves to undefined, not a rejection", async () => {
    await pool.query("TRUNCATE TABLE operator_sessions, operator_permissions, operators CASCADE");
    const result = await findOperatorAuthorizationContext(pool, TOKEN_HASH);
    expect(result).toBeUndefined();
  });

  it("resolves session, account state, and the full permission set together, in one call", async () => {
    await seed({ permissions: ["tenant.window.edit", "audit.view"] });
    const result = await findOperatorAuthorizationContext(pool, TOKEN_HASH);
    expect(result?.operatorId).toBe(OPERATOR_ID);
    expect(result?.username).toBe("auth-check");
    expect(result?.enabled).toBe(true);
    expect([...(result?.permissions ?? [])].sort()).toEqual(["audit.view", "tenant.window.edit"]);
  });

  it("a session with zero permission grants resolves to an empty array, never [null] (spec Domain K's own default)", async () => {
    await seed({ permissions: [] });
    const result = await findOperatorAuthorizationContext(pool, TOKEN_HASH);
    expect(result?.permissions).toEqual([]);
  });

  it("revoking a permission is reflected on the VERY NEXT call — no restart, nothing invalidated because nothing is cached here either", async () => {
    await seed({ permissions: ["tenant.window.edit"] });
    const before = await findOperatorAuthorizationContext(pool, TOKEN_HASH);
    expect(before?.permissions).toEqual(["tenant.window.edit"]);

    await pool.query("DELETE FROM operator_permissions WHERE operator_id = $1 AND permission = $2", [OPERATOR_ID, "tenant.window.edit"]);

    const after = await findOperatorAuthorizationContext(pool, TOKEN_HASH);
    expect(after?.permissions).toEqual([]);
  });

  it("disabling the account is reflected on the very next call", async () => {
    await seed({ enabled: true });
    const before = await findOperatorAuthorizationContext(pool, TOKEN_HASH);
    expect(before?.enabled).toBe(true);

    await pool.query("UPDATE operators SET enabled = false WHERE id = $1", [OPERATOR_ID]);

    const after = await findOperatorAuthorizationContext(pool, TOKEN_HASH);
    expect(after?.enabled).toBe(false);
  });

  it("SQL injection (threat matrix): a hostile token hash round-trips as literal data, matching no row rather than executing", async () => {
    await seed({});
    const payload = "'); DROP TABLE operators;--";
    const result = await findOperatorAuthorizationContext(pool, payload);
    expect(result).toBeUndefined();
    // The real proof: `operators` still exists and is still queryable.
    const stillThere = await findOperatorAuthorizationContext(pool, TOKEN_HASH);
    expect(stillThere?.username).toBe("auth-check");
  });
});
