import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Reads the Redis connection info `redis-tests/global-setup.ts` writes once
 * per `pnpm test:redis` run — same reasoning and same file-based handoff as
 * `packages/platform-core/src/redis-test-harness.ts`'s own `readRedisTestUrl`
 * (duplicated here rather than imported: that file lives inside
 * `platform-core`'s own `rootDir` and is not exported from its public
 * `index.ts`, so a different package cannot import it directly). Internal to
 * this package's own `*.redis.test.ts` files — not exported from `index.ts`.
 */
export function readRedisUrlForOwnTests(): string {
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
