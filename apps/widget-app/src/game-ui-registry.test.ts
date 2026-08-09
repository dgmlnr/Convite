import { describe, expect, it } from "vitest";
import type { GameId } from "@hexdev/platform-contract";
import { createGameUiRegistry } from "./game-ui-registry.js";

describe("createGameUiRegistry (design §5: rendering is deliberately outside the platform contract)", () => {
  it("has an entry for truco-argentino", () => {
    const registry = createGameUiRegistry();

    expect(registry.get("truco-argentino" as GameId)).not.toBeUndefined();
  });

  it("has a DISTINCT entry for truco-argentino-2v2 — the same table renderer package, but a game-ui-registry entry of its own", () => {
    const registry = createGameUiRegistry();

    expect(registry.get("truco-argentino-2v2" as GameId)).not.toBeUndefined();
  });

  it("returns undefined for a game with no registered table UI — the composition root falls back honestly, never throws", () => {
    const registry = createGameUiRegistry();

    expect(registry.get("some-other-game" as GameId)).toBeUndefined();
  });
});
