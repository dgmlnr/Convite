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
  loadingCatalog: "Cargando…",
  emptyCatalog: "Este sitio todavía no tiene juegos habilitados.",
  loadError: "No se pudo cargar el juego.",
  waitingCount: (count: number): string => `${count} ${count === 1 ? "jugador esperando" : "jugadores esperando"}`,
  playVsPerson: "Jugar contra otra persona",
  playVsBot: "Jugar contra la máquina",
  botEasy: "Fácil",
  botNormal: "Normal",
  botHard: "Difícil",
  searchingOpponent: "Buscando rival…",
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
} as const;
