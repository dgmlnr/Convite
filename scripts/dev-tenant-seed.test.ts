import { describe, expect, it } from "vitest";

import { buildDevTenantSeed } from "./dev-tenant-seed.mjs";

/**
 * `buildDevTenantSeed` is the pure piece of `scripts/dev-stack.mjs`'s seed
 * construction (tenant-administration slice 3b), extracted for testability
 * the same way `browser-test-include.mjs`/`virtual-display.mjs` already
 * are — `dev-stack.mjs` itself has real subprocess/network side effects and
 * a top-level `await` the instant it runs, so nothing in it is reachable
 * from a test.
 */
describe("buildDevTenantSeed", () => {
  /**
   * THE regression this closes. `dev-stack.mjs` used to import the mint
   * role's checked-in `DEV_TENANT` fixture; that fixture is retired in this
   * slice (both roles' tenant catalogs now live in Postgres), and the
   * replacement MUST NOT become a second, independently-authored game list
   * — the exact shape the old fixture's own docstring records as having
   * rotted once already. Proven by feeding in a list nothing in this
   * codebase would ever produce and asserting it comes back unchanged: a
   * hardcoded/default list inside this function would fail this exact
   * assertion.
   */
  it("never hardcodes entitledGames — returns exactly what the caller sourced from the live registry", () => {
    const seed = buildDevTenantSeed({
      id: "dev-tenant",
      embedKey: "pk_dev_local",
      hostOrigin: "http://192.168.1.5:2567",
      entitledGames: ["a-distinctive-fixture-id", "another-one-nothing-hardcodes"],
    });

    expect(seed.entitledGames).toEqual(["a-distinctive-fixture-id", "another-one-nothing-hardcodes"]);
  });

  it("carries the id and embedKey through unchanged", () => {
    const seed = buildDevTenantSeed({ id: "dev-tenant", embedKey: "pk_dev_local", hostOrigin: "http://localhost:5173", entitledGames: [] });

    expect(seed.id).toBe("dev-tenant");
    expect(seed.embedKey).toBe("pk_dev_local");
  });

  it("widens allowedOrigins to include the served host origin, de-duplicated against the loopback defaults", () => {
    const seed = buildDevTenantSeed({ id: "x", embedKey: "y", hostOrigin: "http://localhost:5173", entitledGames: [] });

    expect(seed.allowedOrigins).toEqual(["http://localhost:5173", "http://localhost:3000"]);
  });

  it("keeps the LAN host origin alongside both loopback origins when served from elsewhere", () => {
    const seed = buildDevTenantSeed({ id: "x", embedKey: "y", hostOrigin: "http://10.0.0.5:2567", entitledGames: [] });

    expect(seed.allowedOrigins).toEqual(["http://10.0.0.5:2567", "http://localhost:5173", "http://localhost:3000"]);
  });
});
