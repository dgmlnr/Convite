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
  matchPlaceholder: "La mesa de juego se abre en la próxima etapa.",
} as const;
