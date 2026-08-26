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

const GAME_NAME_LABELS: Readonly<Record<string, string>> = {
  "games.truco.name": "Truco Argentino",
  "games.truco2v2.name": "Truco Argentino 2v2",
};

const CONFIG_LABELS: Readonly<Record<string, string>> = {
  "games.truco.pointsToWin": "Puntos para ganar",
};

/** Falls back to the raw key rather than an empty string: an untranslated
 * key is a visible bug report, a blank label is a silently broken UI. */
export function translateGameName(displayNameKey: string): string {
  return GAME_NAME_LABELS[displayNameKey] ?? displayNameKey;
}

export function translateConfigLabel(labelKey: string): string {
  return CONFIG_LABELS[labelKey] ?? labelKey;
}

export const STRINGS = {
  selectionTitle: "Elegí un juego",
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
  modalityGroup: (gameName: string, description: string): string => `${gameName}, ${description}`,
  playVsPerson: "Jugar contra otra persona",
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
