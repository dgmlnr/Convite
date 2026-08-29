/**
 * All user-facing copy is Spanish (the players are Argentine, the game is
 * Truco) — plain, neutral, warm, no voseo-heavy slang, no regional excess.
 * Code identifiers, comments, and test names stay English; only what a
 * player actually reads lives here.
 *
 * `displayNameKey`/`labelKey` arrive from the server as i18n KEYS
 * (`platform-contract`'s `GameMetadata`/`ConfigOption`, deliberately
 * platform-agnostic — see apply-progress's anti-truco-shape audit), never as
 * literal strings: the widget owns translation, not the game module.
 */

import type { GameId } from "@hexdev/platform-contract";

const GAME_NAME_LABELS: Readonly<Record<string, string>> = {
  "games.truco.name": "Truco Argentino",
  "games.truco2v2.name": "Truco Argentino 2v2",
  // Escoba's two entries share ONE name, unlike truco's pair above: the
  // FAMILY is "Escoba de 15" regardless of seat count, and the two formats
  // are told apart by `STRINGS.formatName(seatCount)` ("Mano a mano" /
  // "En parejas") instead — no per-entry title string exists for escoba on
  // purpose (design §D6/§D7, slice M finalizes the card titles from this).
  "games.escoba.name": "Escoba de 15",
  "games.escoba2v2.name": "Escoba de 15",
};

const CONFIG_LABELS: Readonly<Record<string, string>> = {
  /* "Puntos", not "Puntos para ganar". Measured on the rendered lobby: the
   * full phrase broke every modality button across two line boxes inside a
   * 42px box, at 320, 375 AND 414 -- read on a phone as "PUNTOS PARA /
   * GANAR: 15".
   *
   * Shortened HERE rather than in the button, because describeModality builds
   * every option as "<label>: <value>" from the platform's own labelKey and
   * that genericity is deliberate (its own note: "never a hardcoded per-game
   * phrase"). The label is the one piece this game owns. Under a group already
   * announced as "Modo", "Puntos: 15" cannot mean anything else. */
  "games.truco.pointsToWin": "Puntos",
};

/** Falls back to the raw key rather than an empty string: an untranslated
 * key is a visible bug report, a blank label is a silently broken UI. */
export function translateGameName(displayNameKey: string): string {
  return GAME_NAME_LABELS[displayNameKey] ?? displayNameKey;
}

export function translateConfigLabel(labelKey: string): string {
  return CONFIG_LABELS[labelKey] ?? labelKey;
}

/**
 * A fixed summary line for a game whose `configOptions` is empty and
 * therefore has nothing for `describeModality` to compute (spec:
 * `platform-empty-config-rendering`). A PLATFORM MECHANISM, not an escoba
 * special case: any current or future empty-`configOptions` game MAY declare
 * one true, useful line here. Slice B already shipped the general half —
 * nothing to say renders no heading at all; this is the way to HAVE
 * something to say. A `GameId` with no entry here still renders no heading,
 * never a placeholder string (`STRINGS.modalitySummary`, below).
 */
const MODALITY_SUMMARY: Readonly<Record<GameId, string>> = {
  // Art. 8.1 (Reglamento Oficial, Juegos Bonaerenses 2026): the match is to
  // 30 points, for BOTH escoba entries — corrected from an earlier, wrong
  // "21" (see `escoba/decisiones-de-ui-del-lobby`).
  "escoba-de-15": "Partida a 30",
  "escoba-de-15-2v2": "Partida a 30",
};

export const STRINGS = {
  /** The instruction, now that the game's own name carries the screen. It
   * stopped being the title and became the line that says what to do — which
   * is what it always was, printed at the size of a heading. */
  selectionTitle: "Elegí cómo jugar",
  backToGames: "Todos los juegos",
  brand: "Convite",
  /**
   * The one line on this screen that is not an instruction: everything else
   * tells the player what to DO, this says what the place is. It also states
   * two real facts rather than a slogan — the widget mounts without an
   * install and plays without an account, which is what a player arriving
   * from somebody else's site is actually wondering.
   */
  selectionTagline: "Sentate a jugar: sin instalar nada, sin crear cuenta.",
  /**
   * The deck credit, and it is a LICENSE TERM rather than a nicety: the card
   * artwork is CC BY-SA 3.0, which requires naming the author, linking the
   * license, and saying that changes were made. Composed here from
   * `DECK_ATTRIBUTION`'s facts (spanish-deck-ui's `about.ts`) rather than
   * copied as a sentence, so this Spanish text cannot come to disagree with
   * the English one about a legal term — there is only one set of facts and
   * every surface builds its own wording from it.
   */
  aboutToggle: "Créditos y licencia",
  aboutTitle: "Créditos",
  aboutClose: "Cerrar",
  /** CC BY-SA requires INDICATING that changes were made, not describing
   * them — so the Spanish surface says so plainly and the exact description
   * (`DECK_ATTRIBUTION.changes`, an English technical string) stays in
   * `assets/LICENSE` for whoever redistributes. Embedding it here would have
   * put an English sentence fragment inside a Spanish one for no gain the
   * license asks for. */
  aboutCredit: (author: string): string => `Arte de las cartas: ${author}. Se le hicieron cambios.`,
  aboutLicense: (licenseName: string): string => `Licencia ${licenseName}`,
  aboutSource: "Ver la fuente",
  loadingCatalog: "Cargando…",
  emptyCatalog: "Este sitio todavía no tiene juegos habilitados.",
  loadError: "No se pudo cargar el juego.",
  waitingCount: (count: number): string => `${count} ${count === 1 ? "jugador esperando" : "jugadores esperando"}`,
  // WCAG 2.4.6 (game-selection.ts): the accessible name of one modality's
  // whole block of controls. Comma-joined rather than dash-joined so a screen
  // reader pauses instead of reading punctuation, and game-first because that
  // is the order a player already reads the card in.
  //
  // TOTAL over `description` (spec: `platform-empty-config-rendering`): a
  // game with `configOptions: []` has nothing to describe, and joining an
  // empty description left a dangling ", " with nothing after it — the
  // group's own name, not just its heading, is a platform defect. `undefined`
  // falls back to the game name alone, never a trailing separator.
  modalityGroup: (gameName: string, description: string | undefined): string => (description === undefined ? gameName : `${gameName}, ${description}`),
  /** The empty-`configOptions` fallback (spec: `platform-empty-config-
   * rendering`): a game with nothing for `describeModality` to compute MAY
   * still have something true to say — see `MODALITY_SUMMARY` above.
   * `undefined` when the game declared none, which leaves `renderModality`
   * rendering no heading at all (slice B's own fix). */
  modalitySummary: (gameId: GameId): string | undefined => MODALITY_SUMMARY[gameId],
  playVsPerson: "Jugar contra otra persona",
  /**
   * What a format IS, in one line, keyed off the only fact the platform
   * actually gives us about it: how many seats it has. Not a description the
   * game wrote — `seatCount` is `GameMetadata`, so this stays true for any
   * future game with two or four players.
   *
   * The lobby used to make the player infer this from a name ("Truco
   * Argentino 2v2") and a points number. A line that says "en parejas, con un
   * compañero" is the difference between choosing and guessing.
   */
  formatDescription: (seatCount: number): string | undefined =>
    seatCount === 2 ? "Vos contra un rival." : seatCount === 4 ? "En parejas: vos y un compañero contra dos." : undefined,
  /* WHAT A CARD IS, once the hero has already said WHICH GAME.
   *
   * The hero reads "Truco Argentino" and the first card's heading read "Truco
   * Argentino" too, word for word, at every width. The cards are FORMATS of
   * one game, not different games, so where there is a hero the heading names
   * the format instead and the pair stops repeating itself.
   *
   * Truco's own words for the two formats, not "1v1"/"2v2": a player at a
   * table says mano a mano and en parejas. Same seat-count switch and same
   * undefined-for-anything-else shape as formatDescription above, so a seat
   * count nobody has written a line for falls back to the game's name. */
  formatName: (seatCount: number): string | undefined =>
    seatCount === 2 ? "Mano a mano" : seatCount === 4 ? "En parejas" : undefined,
  /** The label over the modality selector — what the buttons under it choose. */
  modalityLegend: "Modo",
  playVsBot: "Jugar contra la máquina",
  botEasy: "Fácil",
  botNormal: "Normal",
  botHard: "Difícil",
  // "jugadores", not "rival" (PR-2b): this status shows while queued for ANY
  // modality, and a 4-seat queue waits for a partner AND two rivals — a
  // singular "Buscando rival…" was accurate only for 1v1.
  searchingPlayers: "Buscando jugadores…",
  /** The bot path had been reusing `searchingPlayers`, which is not true —
   * nobody is being looked for — and made its own wait read as matchmaking.
   * A bot match is created outright, so the only honest thing this covers is
   * the moment between the click and the deal arriving. */
  preparingTable: "Preparando la mesa…",
  pairingFailed: (message: string): string => `No se pudo emparejar: ${message}`,
  // Plain, warm, jargon-free (bug fix, obs 2968: a rejected join used to
  // leave the UI doing nothing at all — the player pressed a button and
  // nothing happened, looking broken). Never an error code, never the raw
  // server reason: a player reads none of that meaningfully.
  joinFailed: "No pudimos conectarte a la partida. Probá de nuevo.",
  retry: "Reintentar",
  matchConnected: "Conectado a la partida.",
  // Deliberately generic, not real gameplay copy: the in-match game table
  // (design's own explicit scope boundary, unchanged by this unit) is what
  // would render actual hand/table state. This proves the connection itself
  // is live — every real message the server sends bumps the counter — without
  // this package pretending to know what any specific game's view looks like.
  liveUpdatesReceived: (count: number): string => `Actualizaciones recibidas: ${count}`,
  // The unregistered-game fallback's own body copy (PR6-T11, WCR-3): honest
  // about WHY the player landed here (a real match, a game this widget
  // build's gameUiRegistry has no renderer for yet) rather than looking
  // broken -- and a real way out, not a dead end.
  gameNotAvailable: "Este juego todavía no está disponible en esta versión.",
  backToLobby: "Volver al lobby",
} as const;
