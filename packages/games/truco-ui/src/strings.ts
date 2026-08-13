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
  us: "Nosotros",
  them: "Ellos",
  calledBy: "Cantó:",
  yourTurnToAnswer: "Tu turno de responder",
  waitingOnOpponent: "Esperando al rival",
  wonHand: "Ganaste la mano",
  lostHand: "Perdiste la mano",
  handPoints: (n: number): string => `+${n} ${n === 1 ? "tanto" : "tantos"}`,
  matchWon: "¡Ganaste la partida!",
  matchLost: "Perdiste la partida",
  matchOverNeutral: "Partida finalizada",
  finalScore: "Resultado final",
  playAgain: "Jugar de nuevo",
  // 2v2 only (obs 33's engine work): "obvious at a glance who you are
  // helping" — a short, real text label on the anchor, same discipline the
  // turn badge already established ("text alone is not enough" cuts both
  // ways: color alone is not enough either).
  partner: "Compañero",
  opponent: "Rival",
  // Señas affordance: discoverable (a real, visible toggle) without being
  // noisy (collapsed by default, never auto-opened) — spec's own framing.
  senasToggle: "Señas",
  // The transient partner-seña notice. Names WHO without naming a player:
  // in 2v2 there is exactly one compañero, and the notice is deliberately
  // detached from their anchor (it lives in the banner lane), so the source
  // has to be said rather than implied by position.
  senaFromPartner: "Seña del compañero",
  // Call-log panel (spec: "Call-Log Panel With Bounded Footprint", "Mano-
  // Ordered Envido Row"; design §5.4). Speaker labels are derived from seat
  // geometry, never a player id/name — see call-log.ts's own `speakerLabel`.
  // `partner`/`opponent` above are reused for the top anchor (1v1 vs 2v2);
  // these two cover the 2v2-only side anchors.
  callLogTitle: "Cantos",
  tantosTitle: "Tantos",
  sonBuenas: "Son buenas",
  // Past tense — a log entry, not a button (CALL_LABELS.revealEnvido stays
  // the imperative "Mostrar envido" for the action itself).
  showedEnvido: "Mostró el envido",
  speakerSelf: "Vos",
  speakerOpponentLeft: "Rival izq.",
  speakerOpponentRight: "Rival der.",
  manoTag: "Mano",
} as const;

/** Spanish table vocabulary for the six closed señas signals
 * (`@hexdev/truco-engine`'s `SENA_SIGNALS`) — authentic Truco terms, never
 * a generic "signal 1/2/3" placeholder. */
export const SENA_LABELS = {
  asDeEspada: "As de espada",
  asDeBasto: "As de basto",
  sieteDeEspada: "7 de espada",
  sieteDeOro: "7 de oro",
  tres: "Tres",
  dos: "Dos",
} as const;
