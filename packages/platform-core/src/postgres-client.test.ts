import { describe, expect, it } from "vitest";
import { connectPostgres } from "./postgres-client.js";

/**
 * Deliberately does NOT require a real Postgres (that suite is
 * `postgres-tests`, opt-in via `pnpm run test:postgres`). This is the
 * fail-loud-at-boot behavior (design §15, mirrors `redis-client.ts:33-38`):
 * an unreachable URL must reject with a message naming that exact URL, not
 * hang or resolve silently. `127.0.0.1` with nothing bound on the port
 * refuses the TCP connection immediately, so this stays a fast unit test.
 */
describe("connectPostgres", () => {
  it("rejects with a message naming the URL when Postgres is unreachable", async () => {
    const unreachableUrl = "postgres://convite_readonly@127.0.0.1:1/convite";

    await expect(connectPostgres(unreachableUrl)).rejects.toThrow(unreachableUrl);
  });
});
