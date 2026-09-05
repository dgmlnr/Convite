import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Reads the Postgres connection info `postgres-tests/global-setup.ts` writes
 * once per `pnpm run test:postgres` run — same reasoning and same file-based
 * handoff as `redis-test-harness.ts`'s own `readRedisTestUrl`. Not exported
 * from `index.ts`/`node.ts` — internal to this package's own
 * `*.postgres.test.ts` files.
 */
export function readPostgresTestUrl(): string {
  const path = fileURLToPath(new URL("../../../postgres-tests/.harness/info.json", import.meta.url));
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(
      `postgres harness info not found at ${path} — postgres-tests/global-setup.ts did not run or failed before writing it. ` +
        `Run this suite via \`pnpm run test:postgres\`, not vitest directly against a single spec file. Original error: ${String(error)}`,
      { cause: error },
    );
  }
  return (JSON.parse(raw) as { postgresUrl: string }).postgresUrl;
}
