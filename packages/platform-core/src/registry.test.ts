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
});
