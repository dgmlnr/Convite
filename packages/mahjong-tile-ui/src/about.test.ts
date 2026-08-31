import { describe, expect, it } from "vitest";
import { TILE_ART_SOURCES, TILE_ATTRIBUTION, commonsFilePage } from "./about.js";
import { ALL_TILE_FACES } from "./tiles.js";
import { tileId } from "./tile.js";

/**
 * THE CREDIT IS A LICENSE TERM, and this repository now carries TWO of them
 * at once — the cards are CC BY-SA 3.0 by Basquetteur, these tiles are
 * CC BY-SA 4.0 by 碧海风. Different authors, different license VERSIONS.
 * Every case below exists because a credit that quietly loses one term, or
 * borrows the neighbouring artwork's, still LOOKS like a credit.
 */
describe("about: the tile credit carries every term CC BY-SA 4.0 requires", () => {
  it("names the author", () => {
    expect(TILE_ATTRIBUTION.author).toBe("碧海风");
  });

  it("links a source the artwork can be reached from", () => {
    expect(TILE_ATTRIBUTION.sourceUrl).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
  });

  it("links the license itself", () => {
    expect(TILE_ATTRIBUTION.licenseUrl).toBe("https://creativecommons.org/licenses/by-sa/4.0/");
  });

  /**
   * "Creative Commons" alone identifies nothing, and here neither does
   * "CC BY-SA": the deck next door is 3.0 and these are 4.0, so a credit that
   * dropped the version would be ambiguous between two artworks this same
   * repository distributes.
   */
  it("names the license as it is actually written, version included — and it is not the deck's", () => {
    expect(TILE_ATTRIBUTION.licenseName).toBe("CC BY-SA 4.0");
    expect(TILE_ATTRIBUTION.licenseName).not.toBe("CC BY-SA 3.0");
  });

  it("states what was changed", () => {
    expect(TILE_ATTRIBUTION.changes.join(" ")).toMatch(/rasteriz/i);
    expect(TILE_ATTRIBUTION.changes.length).toBeGreaterThanOrEqual(1);
  });

  /**
   * AND STATES NOTHING ELSE, which is the half a copy of the deck's record
   * would get wrong. `DECK_ATTRIBUTION.changes` says the face background was
   * completed, because 36 of those 40 SVGs ship with a transparent band that
   * is an upstream authoring bug. These 42 are transparent ON PURPOSE — they
   * are the face symbol with no tile body — and nothing was repaired,
   * repainted or cropped. Claiming a change that was not made is as false a
   * statement of fact as omitting one that was.
   */
  it("claims no repair, because none was made", () => {
    expect(TILE_ATTRIBUTION.changes.join(" ")).not.toMatch(/background|repair|gradient|corner/i);
  });

  it("holds no prose, so no surface has to translate a legal term twice", () => {
    for (const value of Object.values(TILE_ATTRIBUTION).flat()) {
      expect(typeof value).toBe("string");
      expect((value as string).split(" ").length, `"${String(value)}" reads as a sentence, not a fact`).toBeLessThan(11);
    }
  });
});

/**
 * THE PER-FILE URI, AND WHY ONE LINK IS NOT ENOUGH HERE.
 *
 * CC BY-SA 4.0 §3(a)(1)(E) asks for a URI to the licensed material. A single
 * link to the author's own Commons upload list would normally serve — except
 * it demonstrably does not cover all 42, and that was measured rather than
 * assumed: 41 of the 42 appear under `Special:ListFiles/碧海风`, and the one
 * that does not is `dragon-red`, whose CURRENT Commons revision was uploaded
 * by somebody else as a mechanical SVGO minification. Commons lists a file
 * under whoever uploaded its latest version, so the author's own list loses
 * it. The per-file page is the URI that reaches every one.
 */
describe("about: every face names the Commons page it came from, both ways", () => {
  it("has one source entry per face and no entry without a face", () => {
    const ids = ALL_TILE_FACES.map((tile) => tileId(tile));
    expect(Object.keys(TILE_ART_SOURCES).length).toBe(ids.length);
    expect(ids.filter((id) => TILE_ART_SOURCES[id] === undefined), "face with no source").toEqual([]);
    expect(Object.keys(TILE_ART_SOURCES).filter((id) => !ids.includes(id)), "source for no face").toEqual([]);
  });

  it("points every face at a DIFFERENT upstream file", () => {
    const titles = new Set(Object.values(TILE_ART_SOURCES));
    expect(titles.size).toBe(Object.keys(TILE_ART_SOURCES).length);
  });

  it("names Commons files, not local ones", () => {
    for (const [id, title] of Object.entries(TILE_ART_SOURCES)) {
      expect(title, `source for ${id}`).toMatch(/^\d{4}.+\.svg$/u);
    }
  });

  /**
   * The whole reason the manifest exists rather than one link: this is the
   * file the author's own upload list does not carry.
   */
  it("reaches the one file the author's upload list does not list", () => {
    expect(TILE_ART_SOURCES["dragon-red"]).toBe("0405中.svg");
    expect(commonsFilePage(TILE_ART_SOURCES["dragon-red"])).toBe("https://commons.wikimedia.org/wiki/File:0405%E4%B8%AD.svg");
  });

  it("percent-encodes a title so the URI survives being pasted anywhere", () => {
    expect(commonsFilePage("0101一萬.svg")).toBe("https://commons.wikimedia.org/wiki/File:0101%E4%B8%80%E8%90%AC.svg");
  });
});
