import { describe, expect, it } from "vitest";
import type { GameId } from "@hexdev/platform-contract";
import { createGameUiRegistry, soleFamilyUi } from "./game-ui-registry.js";
import type { GameFamilyUi } from "./game-ui-registry.js";

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

/* WHOSE FACE THE FRONT DOOR WEARS, and why it stopped being decided by array
 * order.
 *
 * This used to be a `.find()` over the registered entries: the first one with
 * art won, for the whole lobby. It was invisible because both truco entries
 * carried the SAME `HERO_CARDS` constant — copy-pasted, so it genuinely did
 * not matter which won. The day two DIFFERENT games declare different art,
 * that `.find()` picks one by array position and paints the other game's door
 * with it. Silently, and only on the screen nobody has a test for: this file
 * had zero coverage of the hero constants before this.
 *
 * The rule now: the door belongs to the sole family, or to nobody. */
describe("soleFamilyUi — the front door's identity, never chosen by array order", () => {
  const family = (id: string, art: readonly string[]): GameFamilyUi => ({ id, heroTitle: `Title of ${id}`, hero: art, credits: [] });

  it("one family with art owns the door", () => {
    const only = family("truco", ["a.webp", "b.webp"]);
    expect(soleFamilyUi([only])).toBe(only);
  });

  /* THE ONE THAT MATTERS. Not "picks the right one" — there IS no right one.
   * Two games are a catalogue, and a catalogue is what the cards below the
   * header already are. Degrading to no hero is the honest answer; picking is
   * the bug wearing a plausible face. */
  it("two families own nothing: the door degrades to no hero rather than picking a winner", () => {
    const first = family("truco", ["truco.webp"]);
    const second = family("escoba", ["escoba.webp"]);

    expect(soleFamilyUi([first, second]), "not the first").toBeUndefined();
    expect(soleFamilyUi([second, first]), "and not the first in the other order either").toBeUndefined();
  });

  it("no families own nothing, which is a lobby and not a hole", () => {
    expect(soleFamilyUi([])).toBeUndefined();
  });

  /* A family that declares no art is still a family — it just has no door to
   * offer. This is the case a game ships with before its art does, and it
   * must not promote the OTHER family to the front door. */
  it("a lone family with no art owns the door and offers nothing, rather than deferring to somebody else", () => {
    const bare = family("escoba", []);
    expect(soleFamilyUi([bare]), "still the sole family").toBe(bare);
    expect(soleFamilyUi([bare])?.hero, "with nothing to show").toEqual([]);
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
