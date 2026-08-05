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
});
