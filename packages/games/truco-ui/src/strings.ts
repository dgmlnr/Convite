/**
 * Truco-specific Spanish copy. Unlike `apps/widget-app`'s own `i18n.ts`
 * (which translates platform-level, game-agnostic i18n KEYS coming from the
 * server), this package already commits to being truco's own presentation —
 * "Truco", "Envido", "Quiero" are truco vocabulary, not generic platform
 * labels, so they live here as plain literals, the same way this package's
 * own domain rank names (sota/caballo/rey, in `spanish-deck-ui`) do.
 */
export const CALL_LABELS = {
  truco: "Truco",
  retruco: "Retruco",
  valeCuatro: "Vale cuatro",
  quiero: "Quiero",
  noQuiero: "No quiero",
  envido: "Envido",
  envidoEnvido: "Envido envido",
  realEnvido: "Real envido",
  faltaEnvido: "Falta envido",
  revealEnvido: "Mostrar envido",
} as const;

export const TABLE_STRINGS = {
  yourTurn: "Tu turno",
  opponentTurn: "Turno del rival",
  malas: "Malas",
  buenas: "Buenas",
} as const;
