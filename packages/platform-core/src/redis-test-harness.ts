import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Reads the Redis connection info `redis-tests/global-setup.ts` writes once
 * per `pnpm test:redis` run — a plain runtime file read (not a TypeScript
 * source import), so this stays entirely inside `packages/platform-core`'s
 * own `rootDir` (`src`) while still reaching a run-scoped artifact that
 * genuinely lives outside any package (`redis-tests/.harness/`, gitignored,
 * same reasoning as `e2e/support/harness-info.ts`). Not exported from
 * `index.ts` — internal to this package's own `.redis.test.ts` files.
 */
export function readRedisTestUrl(): string {
  const path = fileURLToPath(new URL("../../../redis-tests/.harness/info.json", import.meta.url));
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(
      `redis harness info not found at ${path} — redis-tests/global-setup.ts did not run or failed before writing it. ` +
        `Run this suite via \`pnpm test:redis\`, not vitest directly against a single spec file. Original error: ${String(error)}`,
      { cause: error },
    );
  }
  return (JSON.parse(raw) as { redisUrl: string }).redisUrl;
}
