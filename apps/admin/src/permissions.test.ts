import { describe, expect, it } from "vitest";

import { PERMISSIONS } from "./permissions.js";

/**
 * The taxonomy is fixed at SEVEN members, all write-oriented (spec Domain K,
 * design §6.1, decisions #3684). There is deliberately NO read-only
 * permission: that gap is a maintainer decision taken knowingly, not an
 * oversight — permissions are DATA, and a read-only tier arrives later
 * alongside a planned reports module rather than as a patch to this panel
 * (design §19's own open question, accepted non-blocking). This test pins
 * the count so an eighth member cannot slip in silently, and pins the exact
 * seven names so a rename is a visible, deliberate diff here rather than a
 * side effect discovered later by `routing.coverage.test.ts`'s closure check.
 */
describe("PERMISSIONS", () => {
  it("has exactly seven members", () => {
    expect(PERMISSIONS).toHaveLength(7);
  });

  it("has no duplicate member", () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });

  it("is exactly the taxonomy spec Domain K names, in this order", () => {
    expect(PERMISSIONS).toEqual([
      "tenant.create",
      "tenant.origins.edit",
      "tenant.games.edit",
      "tenant.window.edit",
      "tenant.embed-key.rotate",
      "operators.manage",
      "audit.view",
    ]);
  });

  it("carries no read-only permission — a read-only tier is a deferred product decision, not this test's job to invent", () => {
    expect(PERMISSIONS.some((permission) => permission.includes("view") && permission !== "audit.view")).toBe(false);
    expect(PERMISSIONS).not.toContain("tenant.view");
  });
});
