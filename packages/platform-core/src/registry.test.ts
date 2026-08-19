import { describe, expect, it } from "vitest";
import type { ApplyResult, BotStrategy, GameModule, PlayerId } from "@hexdev/platform-contract";
import { createGameModuleRegistry } from "./registry.js";

function fixtureModule(id: string): GameModule<unknown, { readonly playerId: PlayerId }, unknown, unknown> {
  return {
    id,
    metadata: { seatCount: 2, displayNameKey: "fixture.name", assetBase: "/fixture" },
    configOptions: [],
    createMatch: () => ({}),
    applyAction: (): ApplyResult<unknown> => ({ ok: true, state: {} }),
    getLegalActions: () => [],
    getViewFor: () => ({}),
    getOutcome: () => null,
    serialize: () => ({}),
    deserialize: (json) => json,
    createBot: (): BotStrategy<unknown, { readonly playerId: PlayerId }> => ({
      chooseAction: () => ({ playerId: "fixture-actor" as PlayerId }),
    }),
  };
}

describe("createGameModuleRegistry", () => {
  it("resolves a registered module by its id", () => {
    const module = fixtureModule("fixture-a");
    const registry = createGameModuleRegistry([module]);
    expect(registry.get("fixture-a")).toBe(module);
  });

  it("returns undefined for a gameId nothing registered", () => {
    const registry = createGameModuleRegistry([fixtureModule("fixture-a")]);
    expect(registry.get("does-not-exist")).toBeUndefined();
  });

  it("distinguishes between multiple registered games by id", () => {
    const a = fixtureModule("fixture-a");
    const b = fixtureModule("fixture-b");
    const registry = createGameModuleRegistry([a, b]);
    expect(registry.get("fixture-a")).toBe(a);
    expect(registry.get("fixture-b")).toBe(b);
  });

  it("still resolves a module registered as a bare GameModule (no system-action pairing)", () => {
    const registry = createGameModuleRegistry([fixtureModule("fixture-a")]);
    expect(registry.getSystemAction("fixture-a", {}, () => 0)).toBeNull();
  });

  it("returns null from getSystemAction for a gameId nothing registered", () => {
    const registry = createGameModuleRegistry([fixtureModule("fixture-a")]);
    expect(registry.getSystemAction("does-not-exist", {}, () => 0)).toBeNull();
  });

  it("resolves the module and pairs it with an optional requestSystemAction (design: never a platform-contract port member)", () => {
    const module = fixtureModule("fixture-a");
    const requestSystemAction = (state: unknown, rng: () => number) => ({ playerId: `${JSON.stringify(state)}:${rng()}` as PlayerId });
    const registry = createGameModuleRegistry([{ module, requestSystemAction }]);
    expect(registry.get("fixture-a")).toBe(module);
    expect(registry.getSystemAction("fixture-a", { turn: 1 }, () => 0.5)).toEqual({ playerId: '{"turn":1}:0.5' });
  });

  describe("isNonBlockingAction — paired with a module, never a platform-contract port member (same convention as requestSystemAction)", () => {
    it("defaults to false (every action blocks) for a bare GameModule registration with no classifier supplied", () => {
      const registry = createGameModuleRegistry([fixtureModule("fixture-a")]);
      expect(registry.isNonBlockingAction("fixture-a", { playerId: "p" as PlayerId })).toBe(false);
    });

    it("defaults to false for a gameId nothing registered", () => {
      const registry = createGameModuleRegistry([fixtureModule("fixture-a")]);
      expect(registry.isNonBlockingAction("does-not-exist", { playerId: "p" as PlayerId })).toBe(false);
    });

    it("delegates to the paired classifier when one is supplied", () => {
      const module = fixtureModule("fixture-a");
      const isNonBlockingAction = (action: unknown): boolean => (action as { type?: string }).type === "signal";
      const registry = createGameModuleRegistry([{ module, isNonBlockingAction }]);
      expect(registry.isNonBlockingAction("fixture-a", { playerId: "p" as PlayerId, type: "signal" })).toBe(true);
      expect(registry.isNonBlockingAction("fixture-a", { playerId: "p" as PlayerId, type: "play" })).toBe(false);
    });
  });

  /**
   * `metadata.seatCount` is consumed downstream by BOTH transports —
   * `MatchRoom.onCreate` sizes its seats from it, and `PresenceRoom` forms
   * matchmaking groups of it (`MatchmakingPool.tryPairSeats` rejects any
   * seatCount that is not an integer >= 2) — so an invalid value would
   * otherwise only surface at runtime, as an unhandled rejection out of
   * `onJoin` on EVERY join attempt for that game. Fail loud at composition
   * time instead, naming the offending module (the same boot-guard
   * discipline as `PresenceRoom.onCreate`'s unknown-module throw).
   */
  describe("rejects a module whose metadata.seatCount could never form a match — at registration, not at first join", () => {
    function moduleWithSeatCount(seatCount: number): GameModule<unknown, { readonly playerId: PlayerId }, unknown, unknown> {
      const module = fixtureModule("fixture-bad-seats");
      return { ...module, metadata: { ...module.metadata, seatCount } };
    }

    it("throws at registry creation for seatCount 1, 0, and a non-integer, naming the module id", () => {
      for (const seatCount of [1, 0, 2.5]) {
        expect(() => createGameModuleRegistry([moduleWithSeatCount(seatCount)])).toThrowError(/fixture-bad-seats/);
      }
    });

    it("validates the wrapped registration form ({ module, ... }) identically to a bare module", () => {
      expect(() => createGameModuleRegistry([{ module: moduleWithSeatCount(1) }])).toThrowError(/fixture-bad-seats/);
    });

    it("accepts the minimum group size (2) and a team game (4) unchanged", () => {
      const two = fixtureModule("fixture-two");
      const four = { ...fixtureModule("fixture-four"), metadata: { seatCount: 4, displayNameKey: "fixture.name", assetBase: "/fixture" } };
      expect(() => createGameModuleRegistry([two, four])).not.toThrow();
    });
  });
});
