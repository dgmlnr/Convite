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

/**
 * A NARROW STRUCTURAL TYPE, never `pg`'s own `Pool`/`PoolClient` — the same
 * discipline `audit-query.ts`'s own `AuditQueryExec` already establishes,
 * and the reason this function is trivially callable from a role-swapped
 * `PoolClient` in tests (`SET ROLE convite_admin`) with no cast: both `Pool`
 * and `PoolClient`'s own `.query(sql)` overloads are structurally assignable
 * to this shape with no import of `pg`'s own types needed at any call site.
 */
export type SchemaMigrationsQuery = (sql: string) => Promise<{ readonly rows: readonly { readonly version: string }[] }>;

/**
 * Design Part A §4 / Part B §15 (sdd-verify's own finding 3, WARNING 3 in
 * its report): `apps/admin` boot must compare `schema_migrations`'s own
 * recorded state against this package's bundled migration set and CRASH
 * LOUDLY if the database is behind — a READ, never a migration run. Only
 * `pnpm db:migrate`, using the OWNER url, may ever apply one (§4's own
 * "apps/admin does not run migrations" argument: a process holding DDL can
 * `DROP TABLE audit_entries`, defeating the INSERT-only grant that is the
 * audit log's only real append-only enforcement).
 *
 * `apps/admin`'s own connection holds `convite_admin`, which by default has
 * NO grant on `schema_migrations` at all — migration 001 now grants it
 * `SELECT`, right alongside its own two roles, so this function actually
 * works from the connection that will really call it, not merely from the
 * migration owner's.
 */
export async function assertSchemaUpToDate(query: SchemaMigrationsQuery, dir: string = MIGRATIONS_DIR): Promise<void> {
  const bundledVersions = migrationFiles(dir).map((file) => file.replace(/\.sql$/, ""));
  const latestBundled = bundledVersions.length > 0 ? bundledVersions[bundledVersions.length - 1] : undefined;

  const { rows } = await query("SELECT version FROM schema_migrations ORDER BY version");
  const appliedVersions = rows.map((row) => row.version);
  const latestApplied = appliedVersions.length > 0 ? appliedVersions[appliedVersions.length - 1] : undefined;
  const applied = new Set(appliedVersions);

  const isBehind = bundledVersions.some((version) => !applied.has(version));
  if (isBehind) {
    throw new Error(
      `apps/admin refuses to boot: the database schema is behind this app's own bundled migrations. ` +
        `Latest applied migration: ${latestApplied ?? "none"}. Latest bundled migration: ${latestBundled ?? "none"}. ` +
        "Run `pnpm db:migrate` before starting this app.",
    );
  }
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
