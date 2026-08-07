import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The runtime facts every e2e spec needs to reach the real system this run
 * booted: two genuinely different localhost origins (the widget/server, and
 * the host fixture pretending to be a third-party tenant page), the embed
 * key that origin is allowlisted under, and the session TTL the server is
 * actually running with (see global-setup.ts's own doc comment for why a
 * short TTL is safe to share across every spec, not just the one that tests
 * it directly).
 */
export interface HarnessInfo {
  readonly serverOrigin: string;
  readonly hostOrigin: string;
  readonly embedKey: string;
  readonly sessionTtlSeconds: number;
}

const E2E_DIR = fileURLToPath(new URL("..", import.meta.url));

/**
 * File-based handoff from `global-setup.ts` (which runs once, in the main
 * vitest CLI process, before any test file) to the individual `*.e2e.test.ts`
 * files (which run in separate worker processes and cannot share in-memory
 * state with global setup). Gitignored — see `.gitignore`'s `e2e/.harness/`
 * entry — this is a run-scoped artifact, never committed.
 */
export const HARNESS_INFO_PATH = path.join(E2E_DIR, ".harness", "info.json");

/**
 * Reads the harness info written by `global-setup.ts`. Throws loudly (never
 * a silent `undefined`) if global setup never ran or failed before writing
 * it — a spec with no real server to talk to must not silently no-op.
 */
export function readHarnessInfo(): HarnessInfo {
  let raw: string;
  try {
    raw = readFileSync(HARNESS_INFO_PATH, "utf8");
  } catch (error) {
    throw new Error(
      `e2e harness info not found at ${HARNESS_INFO_PATH} — global-setup.ts did not run or failed before writing it. ` +
        `Run this suite via \`pnpm test:e2e\`, not vitest directly against a single spec file. Original error: ${String(error)}`,
      { cause: error },
    );
  }
  return JSON.parse(raw) as HarnessInfo;
}
