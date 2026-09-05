import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

/**
 * Hand-rolled migration runner (design §14 rejects Prisma/Drizzle/
 * node-pg-migrate: six tables, no ORM anywhere in this project by design,
 * and a real migration tool's value — branching, rollback, multi-dialect —
 * is value this project cannot use).
 *
 * Every numbered `.sql` file under `../migrations` is applied inside its OWN
 * transaction, on ONE client checked out for the whole run — `pg_advisory_lock`
 * is session-scoped, so the lock and every statement it protects must share
 * that one connection, or a second process could slip a statement in between.
 */
const MIGRATIONS_LOCK_ID = 4_011; // distinct from design §8's 4021 (last-account-manager guard)

const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations", import.meta.url));

function migrationFiles(dir: string): readonly string[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

export async function runMigrations(pool: Pool, dir: string = MIGRATIONS_DIR): Promise<readonly string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query(`SELECT pg_advisory_lock(${String(MIGRATIONS_LOCK_ID)})`);
    try {
      await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
      const { rows } = await client.query<{ version: string }>("SELECT version FROM schema_migrations");
      const already = new Set(rows.map((row) => row.version));

      for (const file of migrationFiles(dir)) {
        const version = file.replace(/\.sql$/, "");
        if (already.has(version)) continue; // re-run is a no-op: never re-execute an applied file
        const sql = readFileSync(join(dir, file), "utf8");
        try {
          await client.query("BEGIN");
          await client.query(sql);
          await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
          await client.query("COMMIT");
          applied.push(version);
        } catch (error) {
          await client.query("ROLLBACK");
          throw new Error(`migration ${file} failed and was rolled back — refusing to continue`, { cause: error });
        }
      }
    } finally {
      await client.query(`SELECT pg_advisory_unlock(${String(MIGRATIONS_LOCK_ID)})`);
    }
  } finally {
    client.release();
  }
  return applied;
}
