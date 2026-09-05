#!/usr/bin/env node
/**
 * The ONE entry point allowed to apply migrations (design §4/§14). Every
 * long-running process — mint-server, server, `apps/admin` — reads
 * `HEXDEV_POSTGRES_URL` and holds a role narrower than the owner's; this
 * script alone reads `HEXDEV_POSTGRES_MIGRATE_URL`, a DIFFERENT variable on
 * purpose, so a long-running process can never accidentally boot with DDL
 * rights — the exact mistake design §4 rejects for `apps/admin` ("a writer
 * holding DDL can `DROP TABLE audit_entries`, defeating the INSERT-only
 * grant that is the audit log's only real enforcement").
 *
 * Imports the BUILT dist by relative path, the same way `dev-stack.mjs`
 * imports `apps/mint-server/dist/config.js`: `scripts/` is not a pnpm
 * workspace member, so the bare specifier `@hexdev/platform-core` cannot
 * resolve from here — `pnpm exec tsc -b` must have already run.
 */
import { connectPostgres } from "../packages/platform-core/dist/postgres-client.js";
import { runMigrations } from "../packages/platform-core/dist/postgres-migrations.js";

const url = process.env.HEXDEV_POSTGRES_MIGRATE_URL;
if (url === undefined) {
  console.error("db:migrate — HEXDEV_POSTGRES_MIGRATE_URL must be set: refusing to run migrations with no target database.");
  process.exit(1);
}

const pool = await connectPostgres(url);
try {
  const applied = await runMigrations(pool);
  console.log(applied.length === 0 ? "db:migrate — schema already up to date, nothing applied" : `db:migrate — applied: ${applied.join(", ")}`);
} finally {
  await pool.end();
}
