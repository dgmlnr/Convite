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
  //
  // The count rides ON the label rather than in a chip beside it, for a
  // layout reason as much as a copy one: this button sits in a FIXED-height
  // action band that must never grow, and a parenthesised number costs the
  // band nothing while a second element would have to find room in it.
  senasToggle: (remaining: number): string => `Señas (${remaining})`,
  // The spent state, said in words rather than as "Señas (0)": a zero in
  // parentheses reads as a counter that happens to be empty, "Sin señas"
  // reads as a state the player is in. Same terse register as "Sin envido"
  // would have at a real table — short enough to keep the button one line.
  senasSpent: "Sin señas",
  // The RULE behind the spent state, as a tooltip/title rather than visible
  // copy: it explains the cap to anyone who did not count their own señas,
  // and being out of the layout it costs the fixed band nothing. Reads the
  // engine's own MAX_SENAS_PER_HAND — the number is never written here.
  senasSpentHint: (limit: number): string => `Ya hiciste las ${limit} señas de la mano`,
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
  // The turn clock's coarse screen-reader voice (turn-clock.ts). The visible
  // pill is aria-hidden — a number changing every second must never reach a
  // live region — so what a reader hears instead is at most two whole
  // sentences per timed turn of the LOCAL player: the total when their turn
  // starts, one warning when little is left. Voseo, like speakerSelf's "Vos"
  // and senasSpentHint's "hiciste": these are said TO the player. Both
  // pluralize the way handPoints already does, so "1 segundo" can never come
  // out as "1 segundos".
  turnClockStart: (seconds: number): string => `Tenés ${seconds} ${seconds === 1 ? "segundo" : "segundos"} para jugar`,
  turnClockWarning: (seconds: number): string => `${seconds === 1 ? "Queda" : "Quedan"} ${seconds} ${seconds === 1 ? "segundo" : "segundos"}`,
  // Text alternatives (WCAG 1.1.1) for the two purely-pictorial numbers on
  // this table: the matchstick tally and an opponent's fan of card backs.
  // Digits, not number words — a reader speaks "12" fine, and digits stay
  // honest at any score without a numbers-to-words table to maintain. Both
  // pluralize the way handPoints already does; "tantos" is the same word the
  // hand-outcome banner already uses for points, so the score reads in the
  // vocabulary the rest of the table already established.
  scoreTotal: (points: number): string => `${points} ${points === 1 ? "tanto" : "tantos"}`,
  // WCAG 4.1.2 (hand.ts): a card the engine will not accept right now, said
  // rather than implied. The NAME comes from spanish-deck-ui's own cardLabel
  // ("As de espada"), so this string owns only the condition — the deck names
  // its own cards and this package never re-spells them.
  lockedCard: (cardName: string): string => `${cardName}, no jugable`,
  cardsInHand: (count: number): string => `${count} ${count === 1 ? "carta" : "cartas"}`,
  // One score RUN, spoken whole (scoreboard.ts). The visible caption is only
  // half a sentence — the value it labels lives in an aria-hidden pile of
  // matchsticks — so the reader gets this instead of the caption. Bare digits,
  // no unit: `scoreTotal` right above has already said "tantos" once, and
  // repeating it on each half turns one number into three.
  scoreRun: (label: string, points: number): string => `${label}: ${points}`,
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
