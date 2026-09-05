import { describe, expect, it } from "vitest";
import { containerNameFor, dockerRunArgs } from "./global-setup.js";

/**
 * Threat: Subprocess. `postgres-tests/global-setup.ts` shells out to
 * `docker run`/`docker exec` with the container name and port baked into
 * argv — if either ever derived from an env var or CLI argument, that
 * external input would reach a subprocess command line. Both derive only
 * from `process.pid` and `getFreePorts`'s own numeric return (asserted at
 * the call sites in `setup()`), so this suite pins the two PURE functions
 * that build those argv pieces, run here without touching Docker at all.
 */
describe("postgres-tests container provisioning stays program-generated", () => {
  it("derives the container name from a process id, not from any external string", () => {
    expect(containerNameFor(12345)).toBe("hexdev-postgres-test-12345");
    expect(containerNameFor(1)).toBe("hexdev-postgres-test-1");
  });

  it("builds docker run args as an array binding the given port to Postgres's own 5432 — never a shell string", () => {
    const args = dockerRunArgs("hexdev-postgres-test-12345", 55123);

    expect(Array.isArray(args)).toBe(true);
    expect(args).toContain("hexdev-postgres-test-12345");
    expect(args).toContain("55123:5432");
    // Every element is its own argv token — none of them contains a space,
    // which is what a concatenated shell string would produce instead.
    for (const token of args) expect(token).not.toMatch(/\s/);
  });
});
