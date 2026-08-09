import { defineConfig } from "vitest/config";

/**
 * A SEPARATE, opt-in vitest project — same reasoning as `vitest.e2e.config.ts`'s
 * own doc comment. This suite proves the Redis-backed adapters and the
 * cross-instance properties (apply prompt: "the honest test is two server
 * processes sharing one Redis") against a REAL Redis, run in a Docker
 * container. Deliberately NOT referenced by `vitest.config.ts`'s
 * `test.projects`, so `pnpm test` (`vitest run`) never discovers it and the
 * default unit suite stays genuinely Redis-free — the whole point of this
 * unit is that the in-memory default path needs NO new infrastructure. Run
 * this suite explicitly with `pnpm test:redis`.
 *
 * `globalSetup` starts ONE Docker Redis container for the whole run (see
 * `redis-tests/global-setup.ts`) and tears it down afterward — this suite
 * requires Docker; there is no fallback path.
 */
export default defineConfig({
  test: {
    name: "redis",
    environment: "node",
    include: ["redis-tests/**/*.redis.test.ts", "packages/**/*.redis.test.ts"],
    globalSetup: ["./redis-tests/global-setup.ts"],
    // Serial: multiple spec files share ONE Redis container and, in the
    // cross-instance spec, real spawned server processes — running them
    // concurrently would make key-namespace/port contention a possible
    // source of flakiness this suite's own value depends on not having.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
