import { describe, expect, it } from "vitest";
import { DECK_ATTRIBUTION } from "./about.js";

/**
 * THE CREDIT IS A LICENSE TERM NOW, not a courtesy.
 *
 * The previous deck was public domain, and this file's own predecessor
 * asserted that attribution "is not legally required" — true then, and
 * exactly the assertion that had to become false when the artwork changed.
 * CC BY-SA 3.0 names three things: credit the author, link the license, and
 * state that changes were made. Each gets its own test, because a credit that
 * quietly loses one of them still LOOKS like a credit.
 *
 * WHAT THIS FILE CANNOT CHECK, and it is worth naming: that a SURFACE
 * actually shows all three. This fences the data; the widget's own
 * `game-selection.browser.test.ts` fences that the panel renders every field.
 */
describe("about: the deck credit carries every term CC BY-SA requires", () => {
  it("names the author", () => {
    expect(DECK_ATTRIBUTION.author).toBe("Basquetteur");
  });

  it("links the source the artwork was taken from", () => {
    expect(DECK_ATTRIBUTION.sourceUrl).toMatch(/^https:\/\//);
  });

  it("links the license itself", () => {
    expect(DECK_ATTRIBUTION.licenseUrl).toBe("https://creativecommons.org/licenses/by-sa/3.0/");
  });

  it("names the license as it is actually written, not just 'Creative Commons'", () => {
    // "Creative Commons" alone identifies nothing: BY, BY-SA and BY-NC-SA
    // impose different obligations on whoever redistributes this.
    expect(DECK_ATTRIBUTION.licenseName).toBe("CC BY-SA 3.0");
  });

  it("states what was changed, all of it", () => {
    // The third term, and the one easiest to drop. What ships is rasterized
    // from vector AND has a background the source did not draw — both are
    // adaptations, and naming only the first would be a partial statement of
    // a term that is not partially satisfiable.
    expect(DECK_ATTRIBUTION.changes.join(" ")).toMatch(/rasteriz/i);
    expect(DECK_ATTRIBUTION.changes.join(" ")).toMatch(/background/i);
    expect(DECK_ATTRIBUTION.changes.length).toBeGreaterThanOrEqual(2);
  });

  it("holds no prose, so no surface has to translate a legal term twice", () => {
    // The shape this file changed INTO, fenced: every field is a fact a
    // Spanish and an English surface can both render without either one
    // writing its own version of the license statement.
    for (const value of Object.values(DECK_ATTRIBUTION).flat()) {
      expect(typeof value).toBe("string");
      expect((value as string).split(" ").length, `"${String(value)}" reads as a sentence, not a fact`).toBeLessThan(11);
    }
  });
});
