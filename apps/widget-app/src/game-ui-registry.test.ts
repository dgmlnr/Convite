import { describe, expect, it } from "vitest";
import type { GameId } from "@hexdev/platform-contract";
import { createGameUiRegistry, familyUiFor } from "./game-ui-registry.js";

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

/** Unit M — lobby second family, completed (spec: `lobby-second-family`).
 * `familyUiFor`, not `createGameUiRegistry`: no lobby screen reads the match
 * registry, which is why these assertions target identity data rather than
 * the `GameUiEntry` records Unit O later added next to `trucoEntry` (see
 * `game-ui-registry.browser.test.ts`'s own escoba wiring tests for those). */
describe("familyUiFor(\"escoba\") — the lobby's finished second family", () => {
  it("declares the family name \"Escoba de 15\" as its heroTitle", () => {
    expect(familyUiFor("escoba")?.heroTitle).toBe("Escoba de 15");
  });

  /* Spec requirement "Escoba's hero art matches its lobby card art": screen
   * one's card and screen two's hero MUST show the identical three cards, no
   * separate art set. Proven here at the data level; game-list.browser.test.ts
   * proves the same fact rendered into both screens' actual DOM. */
  it("screen one's cardArt is the SAME three cards as screen two's hero — no separate art set", () => {
    const family = familyUiFor("escoba");

    expect(family?.cardArt, "reuses the identical array hero already declares").toEqual(family?.hero);
  });

  it("the 7 de oro sits at the centre — the position nothing overlaps (escoba/cartas-insignia-del-lobby)", () => {
    const family = familyUiFor("escoba");

    expect(family?.hero?.[1]).toContain("7-oro");
  });
});
