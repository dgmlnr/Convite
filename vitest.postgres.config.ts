import { defineConfig } from "vitest/config";

/**
 * A SEPARATE, opt-in vitest project — same reasoning as
 * `vitest.redis.config.ts`'s own doc comment. This suite proves the
 * Postgres-backed adapters and the migration runner against a REAL Postgres,
 * run in a Docker container. Deliberately NOT referenced by
 * `vitest.config.ts`'s `test.projects`, so `pnpm test` (`vitest run`) never
 * discovers it and the default unit suite stays genuinely Postgres-free —
 * `postgres-tests/global-setup.ts`'s own pure argv-building helpers are
 * proven separately, in the default project, with no container involved.
 * Run this suite explicitly with `pnpm run test:postgres`.
 *
 * `globalSetup` starts ONE Docker Postgres container for the whole run and
 * applies every migration against it before any spec file (see
 * `postgres-tests/global-setup.ts`), then tears it down afterward — this
 * suite requires Docker; there is no fallback path.
 *
 * `apps/**` joins the include list at tenant-administration slice 16b —
 * this suite's FIRST app-level member. `audit-query.ts` deliberately lives
 * in `apps/admin`, not `packages/platform-core` (design §10's own layering
 * argument, identical to why `audit-log.ts`'s write side lives there too),
 * so its own real-Postgres proof cannot live under `packages/**` without
 * importing an `apps/admin/src/*` module from outside `apps/admin/` —
 * exactly what `.dependency-cruiser.cjs`'s own `no-admin-internals-outside-admin`
 * rule forbids. The test must sit where the code it proves already lives.
 */
export default defineConfig({
  test: {
    name: "postgres",
    environment: "node",
    include: ["postgres-tests/**/*.postgres.test.ts", "packages/**/*.postgres.test.ts", "apps/**/*.postgres.test.ts"],
    globalSetup: ["./postgres-tests/global-setup.ts"],
    // Serial: every spec file shares ONE Postgres container and its ONE
    // `schema_migrations` row set — running them concurrently would make
    // migration-idempotency assertions race against each other, which is
    // exactly the kind of flakiness `redis-tests`'s own `fileParallelism:
    // false` already avoids for the identical reason.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
