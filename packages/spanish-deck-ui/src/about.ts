// Attribution for the deck artwork, meant for an "about" surface in the
// widget.
//
// THIS IS NO LONGER OPTIONAL. The previous deck (Heraclio Fournier's 1878
// scans — see tools/process-fournier-deck.mjs, still in the repo) was PUBLIC
// DOMAIN, and the note this file used to carry said in as many words that
// attribution "is not legally required". The current artwork is licensed
// CC BY-SA 3.0, whose first term is exactly that requirement: credit the
// author, link the license, and state that changes were made. All three are
// below, and `sourceUrl`/`licenseUrl` are separate fields rather than prose
// so a renderer cannot ship the credit without the link.
//
// "CHANGES WERE MADE" IS NOT A FORMALITY HERE. The source is vector; what
// ships is WebP rasterized to 329x520 (tools/process-svg-deck.mjs). That is
// an adaptation, so under ShareAlike the derived files carry the same
// license — see ../assets/LICENSE, which is what actually licenses them.
export interface DeckAttribution {
  readonly title: string;
  readonly body: string;
  readonly sourceUrl: string;
  readonly licenseUrl: string;
  readonly licenseNote: string;
}

export const DECK_ATTRIBUTION: DeckAttribution = {
  title: "Card artwork",
  body:
    "The card fronts are Spanish playing-card artwork by Basquetteur, " +
    "published on Wikimedia Commons and distributed as SVG by the " +
    "spanish-playing-cards-svg project. Changes were made: the vectors were " +
    "rasterized to WebP at 329x520 for delivery.",
  sourceUrl: "https://github.com/gjenkins20/spanish-playing-cards-svg",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
  licenseNote:
    "Licensed under the Creative Commons Attribution-ShareAlike 3.0 " +
    "Unported License (CC BY-SA 3.0). Attribution is required, and the " +
    "rasterized files distributed here are licensed under the same terms.",
};
