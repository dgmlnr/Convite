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

describe("the registry keys identity by FAMILY, not by the id you join with", () => {
  it("both truco entries resolve to the one truco family, so their art can never diverge", () => {
    const registry = createGameUiRegistry();
    const a = registry.family("truco-argentino" as GameId);
    const b = registry.family("truco-argentino-2v2" as GameId);

    expect(a, "the same record, not two equal ones — there is nowhere left to copy-paste art into").toBe(b);
    expect(a?.id).toBe("truco");
  });
});
