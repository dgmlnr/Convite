// Who made the card artwork, under what license, and what was changed.
//
// THIS IS NOT OPTIONAL. The previous deck (Heraclio Fournier's 1878 scans —
// see tools/process-fournier-deck.mjs, still in the repo) was PUBLIC DOMAIN,
// and the note this file used to carry said in as many words that attribution
// "is not legally required". The current artwork is CC BY-SA 3.0, whose first
// term is exactly that requirement.
//
// DATA, NOT PROSE, and that is the whole shape of this file. CC BY-SA names
// three things a credit must carry — the author, a link to the license, and a
// statement that changes were made — and the surfaces that show them do not
// all speak the same language: the widget's copy is Spanish (widget-app's
// `i18n.ts`), while a license URL and an author's name are neither Spanish nor
// English. An English sentence here would have forced every Spanish surface to
// write its own, which is two texts that can disagree about a legal term. So
// this file holds the FACTS and each surface composes its own sentence from
// them — the same reason `GameMetadata` ships `displayNameKey` and not a
// display name.
//
// `changes` IS THE TERM MOST EASILY DROPPED, so it is a required field rather
// than something a renderer may or may not mention. What ships is WebP
// rasterized from vector (tools/process-svg-deck.mjs); that is an adaptation,
// so under ShareAlike the derived files carry the same license — see
// ../assets/LICENSE, which is what actually licenses them.
export interface DeckAttribution {
  /** The person to credit. */
  readonly author: string;
  /** Where the artwork was taken from. */
  readonly sourceUrl: string;
  /** The license's own name, as it is written — not "Creative Commons". */
  readonly licenseName: string;
  /** The license text itself. Its own field so a surface cannot show the
   * credit while quietly omitting the link the license requires. */
  readonly licenseUrl: string;
  /** What was done to the original. Required: see this file's docblock. */
  readonly changes: string;
}

export const DECK_ATTRIBUTION: DeckAttribution = {
  author: "Basquetteur",
  sourceUrl: "https://github.com/gjenkins20/spanish-playing-cards-svg",
  licenseName: "CC BY-SA 3.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
  changes: "rasterized from SVG to WebP at 329x520",
};
