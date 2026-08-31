// Who made the tile artwork, under what license, and what was changed.
//
// DATA, NOT PROSE, and that is the whole shape of this file — the same
// argument `spanish-deck-ui`'s `about.ts` makes, for the same reason. CC BY-SA
// names the things a credit must carry — the author, a link to the license, a
// URI to the material, and a statement that changes were made — and the
// surfaces that show them do not all speak the same language: the widget's
// copy is Spanish, while a license URL and an author's name are neither
// Spanish nor English. So this file holds the FACTS and each surface composes
// its own sentence from them.
//
// TWO CC BY-SA ARTWORKS NOW LIVE IN THIS REPOSITORY AND THEY ARE NOT THE SAME
// TERMS. The cards are 3.0 by Basquetteur; these tiles are 4.0 by 碧海风. A
// single "CC BY-SA" line covering both would be wrong about both, which is
// why `licenseName` carries the version and `about.test.ts` asserts it is not
// the deck's.
//
// `changes` IS THE TERM MOST EASILY DROPPED, so it is a required field. It is
// also the term most easily OVERSTATED here: the deck's own record says the
// face background was completed, because that upstream ships a transparent
// band by mistake. This artwork's transparency is deliberate — each file is
// the face symbol with no tile body behind it — and nothing was repaired.
// Copying the deck's sentence would be a false statement of fact under a
// license term, so the fence next door asserts this record claims no repair.
// See ../assets/LICENSE, which is what actually licenses the files.
import type { TileId } from "./tile.js";

export interface TileAttribution {
  /** The person to credit. */
  readonly author: string;
  /** Where the artwork was taken from. */
  readonly sourceUrl: string;
  /** The license's own name, as it is written, VERSION INCLUDED — "CC BY-SA"
   * alone is ambiguous in a repository that ships both 3.0 and 4.0 artwork. */
  readonly licenseName: string;
  /** The license text itself. Its own field so a surface cannot show the
   * credit while quietly omitting the link the license requires. */
  readonly licenseUrl: string;
  /** What was done to the original, one entry per change. Required, and a
   * LIST rather than a sentence, so a surface can render it without editing. */
  readonly changes: readonly string[];
}

export const TILE_ATTRIBUTION: TileAttribution = {
  author: "碧海风",
  sourceUrl: "https://commons.wikimedia.org/wiki/Special:ListFiles/%E7%A2%A7%E6%B5%B7%E9%A3%8E",
  licenseName: "CC BY-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  changes: ["rasterized to WebP at 195x279, lossless"],
};

/**
 * The Commons page each face was taken from — one entry per file, and the
 * URI CC BY-SA 4.0 §3(a)(1)(E) asks for.
 *
 * WHY A MANIFEST AND NOT JUST `sourceUrl`. `Special:ListFiles/碧海风` covers
 * 41 of the 42, and the gap was measured rather than reasoned: `dragon-red`
 * (0405中.svg) is missing from it because Commons lists a file under whoever
 * uploaded its CURRENT revision, and that one was re-uploaded by a different
 * user as a mechanical SVGO minification (5465 bytes to 2819, Artist and
 * license and viewBox all unchanged). One author still holds, but one link
 * does not reach everything, so each file names its own page.
 *
 * IT IS ALSO THE ONLY PLACE THE UPSTREAM NAMES LIVE. `tools/process-svg-tiles.mjs`
 * reads this map to know what to download and what to rasterize, so there is
 * exactly one copy of the correspondence — which matters because the two
 * orderings genuinely disagree: 0401-0404 run 東 西 南 北 (east, WEST, south,
 * north), not the east/south/west/north order winds are usually listed in. A
 * positional mapping would look right and silently swap two winds.
 */
export const TILE_ART_SOURCES: Readonly<Record<TileId, string>> = {
  "1-characters": "0101一萬.svg",
  "2-characters": "0102二萬.svg",
  "3-characters": "0103三萬.svg",
  "4-characters": "0104四萬.svg",
  "5-characters": "0105五萬.svg",
  "6-characters": "0106六萬.svg",
  "7-characters": "0107七萬.svg",
  "8-characters": "0108八萬.svg",
  "9-characters": "0109九萬.svg",
  "1-circles": "0201一餅.svg",
  "2-circles": "0202二餅.svg",
  "3-circles": "0203三餅.svg",
  "4-circles": "0204四餅.svg",
  "5-circles": "0205五餅.svg",
  "6-circles": "0206六餅.svg",
  "7-circles": "0207七餅.svg",
  "8-circles": "0208八餅.svg",
  "9-circles": "0209九餅.svg",
  "1-bamboo": "0301一條.svg",
  "2-bamboo": "0302二條.svg",
  "3-bamboo": "0303三條.svg",
  "4-bamboo": "0304四條.svg",
  "5-bamboo": "0305五條.svg",
  "6-bamboo": "0306六條.svg",
  "7-bamboo": "0307七條.svg",
  "8-bamboo": "0308八條.svg",
  "9-bamboo": "0309九條.svg",
  "wind-east": "0401東風.svg",
  "wind-west": "0402西風.svg",
  "wind-south": "0403南風.svg",
  "wind-north": "0404北風.svg",
  "dragon-red": "0405中.svg",
  "dragon-green": "0406發.svg",
  "dragon-white": "0407白.svg",
  "season-spring": "0501春.svg",
  "season-summer": "0502夏.svg",
  "season-autumn": "0503秋.svg",
  "season-winter": "0504冬.svg",
  "flower-plum": "0505梅.svg",
  "flower-orchid": "0506蘭.svg",
  "flower-chrysanthemum": "0507菊.svg",
  "flower-bamboo": "0508竹.svg",
};

/** The Commons description page for one upstream title. Percent-encoded, so
 * the URI survives being pasted into a place that cannot carry hanzi. */
export function commonsFilePage(title: string): string {
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(title)}`;
}
