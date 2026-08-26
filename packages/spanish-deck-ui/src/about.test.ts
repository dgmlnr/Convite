import { describe, expect, it } from "vitest";
import { DECK_ATTRIBUTION } from "./about.js";

/**
 * THE CREDIT IS A LICENSE TERM NOW, not a courtesy.
 *
 * The previous deck was public domain, and this file's own predecessor
 * asserted that attribution "is not legally required" — true then, and
 * exactly the assertion that had to become false when the artwork changed.
 * CC BY-SA 3.0 names three things: credit the author, link the license, and
 * state that changes were made. Each gets its own test below, because a
 * credit that quietly loses one of them still LOOKS like a credit.
 */
describe("about: the deck credit carries every term CC BY-SA requires", () => {
  it("names the author", () => {
    expect(DECK_ATTRIBUTION.body).toContain("Basquetteur");
  });

  it("links the source the artwork was taken from", () => {
    expect(DECK_ATTRIBUTION.sourceUrl).toMatch(/^https:\/\//);
    expect(DECK_ATTRIBUTION.sourceUrl).toContain("spanish-playing-cards-svg");
  });

  it("links the license itself, as its own field", () => {
    // A separate field rather than a URL buried in prose: a renderer that
    // shows `body` and forgets `licenseUrl` would be shipping an incomplete
    // credit, and this is what makes that omission visible in the type.
    expect(DECK_ATTRIBUTION.licenseUrl).toBe("https://creativecommons.org/licenses/by-sa/3.0/");
  });

  it("names the license by its actual name, not just 'Creative Commons'", () => {
    expect(DECK_ATTRIBUTION.licenseNote).toContain("CC BY-SA 3.0");
    expect(DECK_ATTRIBUTION.licenseNote).toMatch(/attribution/i);
    expect(DECK_ATTRIBUTION.licenseNote).toMatch(/ShareAlike/i);
  });

  it("states that changes were made, and says which", () => {
    // The third term, and the one easiest to drop. What ships is rasterized
    // from vector, which is an adaptation — saying so is not optional.
    expect(DECK_ATTRIBUTION.body).toMatch(/changes were made/i);
    expect(DECK_ATTRIBUTION.body).toMatch(/rasteriz/i);
  });

  it("no longer claims attribution is optional — the old deck's terms are gone with it", () => {
    // The regression this file exists to catch: a copy-paste of the previous
    // public-domain wording would be a false license statement on a
    // licensed work.
    expect(DECK_ATTRIBUTION.licenseNote).not.toMatch(/public domain/i);
    expect(DECK_ATTRIBUTION.licenseNote).not.toMatch(/not.*required/i);
  });

  it("has a non-empty display title for the about surface", () => {
    expect(DECK_ATTRIBUTION.title.length).toBeGreaterThan(0);
  });
});
