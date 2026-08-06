// Attribution text for the deck artwork, meant for an "about" screen in the
// widget — the user's own product decision. The Fournier 1878 deck is
// PUBLIC DOMAIN (verified on the Wikimedia Commons file pages: "This work is
// in the public domain in its country of origin..."), so this attribution is
// NOT legally required. It is included anyway because crediting Heraclio
// Fournier and the Fournier Museum of Playing Cards is the right thing to
// do, and because it documents the asset's provenance for anyone auditing
// the repo — see tools/process-fournier-deck.mjs for the exact retouch
// recipe and how the source files were obtained.
export interface DeckAttribution {
  readonly title: string;
  readonly body: string;
  readonly sourceUrl: string;
  readonly licenseNote: string;
}

export const DECK_ATTRIBUTION: DeckAttribution = {
  title: "Card artwork",
  body:
    "The card fronts reproduce Heraclio Fournier's 1878 Spanish playing-card " +
    "deck, held by the Fournier Museum of Playing Cards (Vitoria-Gasteiz, " +
    "Spain) and digitized on Wikimedia Commons. Two cards keep their original " +
    "printer's marks exactly as scanned: the as de oros reads " +
    '"Premiada en la Exposición — París de 1878", and the fours of oro and ' +
    'copa read "Heraclio Fournier, Clase 3ª, Vitoria" — authentic marks the ' +
    "deck was kept with, not retouched away.",
  sourceUrl: "https://commons.wikimedia.org/wiki/Category:Heraclio_Fournier%E2%80%99s_1878_card_deck",
  licenseNote:
    "This work is in the public domain in its country of origin and in " +
    "other countries and areas where the copyright term is the author's " +
    "life plus 70 years or fewer. Attribution is not legally required; it is " +
    "given here as a matter of provenance and respect for the source.",
};
