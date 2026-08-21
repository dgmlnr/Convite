import { describe, expect, it } from "vitest";

import { routesToMint } from "./front-proxy.js";

/**
 * Pure, so the routing can be pinned without binding three ports.
 *
 * Sending a path to the wrong role does not throw: a front-door path sent to
 * the match role 404s, and a matchmaking path sent to the mint role 404s or
 * hangs on its upgrade. Both read, from a browser, as a broken game rather
 * than a broken harness — which is the same failure shape that has already
 * cost this project a day more than once.
 */
describe("routesToMint", () => {
  it("gives the mint role the whole front door", () => {
    expect(routesToMint("/embed")).toBe(true);
    expect(routesToMint("/session/renew")).toBe(true);
    expect(routesToMint("/loader.js")).toBe(true);
    expect(routesToMint("/assets/widget-app.js")).toBe(true);
    expect(routesToMint("/assets/fronts/1-espada.webp")).toBe(true);
  });

  /**
   * The match role owns colyseus. If this ever returns true for a matchmake
   * path, every spec still loads its page and then hangs the instant a match
   * starts — the worst shape to debug.
   */
  it("leaves colyseus to the match role", () => {
    expect(routesToMint("/matchmake/joinOrCreate/presence")).toBe(false);
    expect(routesToMint("/matchmake/joinById/abc")).toBe(false);
    expect(routesToMint("/")).toBe(false);
  });

  /** A path that merely starts with the same letters is not the front door. */
  it("does not match a lookalike path", () => {
    expect(routesToMint("/embedded")).toBe(false);
    expect(routesToMint("/session/renewal")).toBe(false);
    expect(routesToMint("/loader.js.map")).toBe(false);
    expect(routesToMint("/assetsomething")).toBe(false);
  });
});
