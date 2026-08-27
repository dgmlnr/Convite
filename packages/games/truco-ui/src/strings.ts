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
  /* A partner is not a rival, and a badge that calls them one on a table
     whose whole point is that you two are a team reads as a bug to the
     player. Reported from a screenshot: the badge over the partner's own
     seat said "Turno del rival". */
  partnerTurn: "Turno del compañero",
  waitingOnPartner: "Esperando al compañero",
  /* The tab that opens the rail on a phone. It names both halves because it
     opens both: a tab that said only "Tantos" would hide the call history
     behind a word that does not mention it. */
  railTab: "Tantos y cantos",
  railTabClose: "Cerrar tantos y cantos",
  /* Spoken on the seat the deck sits beside. Says both halves on purpose:
     dealing is what MAKES that seat its team's pie, and the pie is who may
     open the envido -- a mark that only said "reparte" would leave a reader
     to work the rule out. */
  dealtHere: "Reparte y es pie",
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
  // Leaving a match in progress. The question names the real consequence
  // rather than asking an abstract "are you sure?": the seat is handed to a
  // bot and the others keep playing (MatchRoom.handleQuit), which is the one
  // thing a player needs to know before deciding.
  leaveMatch: "Salir",
  leaveMatchTitle: "¿Salir de la partida?",
  leaveMatchBody: "Sigue un bot en tu lugar y la partida continúa sin vos. No vas a poder volver a esta mesa.",
  leaveMatchConfirm: "Salir",
  leaveMatchCancel: "Seguir jugando",
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
  /* ONE CONTROL, ONE NUMBER. Signalling to your partner and asking them spend
   * a single allowance, and the two earlier shapes both failed to say so: a
   * "(3)" on each of two buttons read as two separate threes, and moving the
   * count to a chip between them read as a stray digit. So there is one
   * button now, carrying the count that is unambiguously its own, and the two
   * ways to spend it live inside it — "un solo boton que ponga
   * 'Seña/Consulta' y al darle click muestre ambos botones". */
  /* SPLIT IN TWO because the compact tier paints only one of the halves.
   *
   * Measured at 320px: this toggle was taking 162 of the band's 304 available
   * pixels -- 53%, more than every call button put together -- and it never
   * yielded any of them at any width from 320 to 1440. The group a player OWED
   * an answer to was getting 40px of the 184 it needed while this one held its
   * full width. So below 640px the words go visually-hidden and the glyph
   * carries the meaning; the count stays painted, because a number is the one
   * thing an icon genuinely cannot say.
   *
   * The words never leave the DOM -- the accessible name is still
   * "Seña/Consulta (3)" at every width -- which is exactly why the compact
   * rule uses the clip and not `display: none`. */
  senasToggleWords: "Seña/Consulta",
  /* The leading space belongs to the count, not to a separator between two
   * appended nodes: it is what keeps the flattened accessible name reading
   * "Seña/Consulta (3)" instead of "Seña/Consulta(3)" once the words are
   * clipped out of sight but not out of the name. */
  senasToggleCount: (remaining: number): string => ` (${remaining})`,
  /* WHAT is being asked, not merely THAT something is. The same button is
     legal in two different situations -- you owe an answer to a call, or you
     are the pie who could open an envido -- and it used to read the same in
     both. Reported: "soy pie de ronda pongo consultar al compañero pero no se
     si le estoy consultando para cantar el envido o el truco".

     Sin el prefijo "Consultar:": estos botones viven DENTRO del panel de
     seña/consulta, que ya dice que son consultas, y el prefijo costaba unos
     90px por boton en la pantalla que menos los tiene. */
  /* THE FOLD. "Subir" is what a player says at a table -- the three ways to
   * raise an envido are one branch of "quiero, no quiero, o subo?", not three
   * peers of the first two. Deliberately not "Más" or "Otras": a neutral word
   * would fit any group, and this one is only ever put on a group that really
   * does escalate the call being answered. */
  escalateToggle: "Subir",
  consultAboutTruco: "¿Quiero el truco?",
  consultAboutEnvido: "¿Quiero el envido?",
  consultAboutOpeningEnvido: "¿Canto envido?",
  consultToggle: "Consultar al compañero",
  consultAsking: "Preguntando…",
  /* Slice 4a: the seat's TURN BADGE while a consult is open — it REPLACES
   * that seat's turn text for the duration, never a second chip beside it
   * (design's own "ONE CLOCK PER SEAT, ALWAYS"). The trailing space is
   * deliberate, not decorative: `appendTurnBadge` concatenates this with the
   * clock's own "0:30" as a second child node, with no separator of its
   * own — this space is the only thing standing between the two. */
  consulting: "Consultando… ",
  /* The declaration round. "Mis tantos" is the button; the LOG and the seat
   * chip show the number itself, because by then it has been said out loud.
   * The concession reuses the `sonBuenas` string this file already had for
   * the tantos list — one phrase, one place. */
  declareMine: "Mis tantos",
  consultAdvicePrefix: "Tu compañero:",
  consultQuiero: "Quiere",
  consultNoQuiero: "No quiere",
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
  /* The line that closes a finished hand in the log. The panel keeps every
     hand now, so without a divider the calls of three different hands read
     as one very confusing chain. */
  callLogRoundEnd: "Fin de la mano",
  /* Shown before anyone has said a word. The panel used to disappear when it
     had nothing in it, which made the whole rail jump the moment the first
     canto landed -- and got reported as the history never showing up at all. */
  callLogEmpty: "Todavía no hubo cantos",
  /** The transient reveal notice's own heading. Deliberately NOT reusing
   * `tantosTitle` ("Tantos"): that one names the standing record in the side
   * panel, this one names a moment that just happened, and a player reading
   * the same word in two places would reasonably expect the same thing. */
  envidoRevealTitle: "Envido cantado",
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
