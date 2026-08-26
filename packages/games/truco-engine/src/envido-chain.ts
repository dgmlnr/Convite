import type { Card, Rank, Suit } from "./card.js";
import type { PlayerId } from "./ids.js";
import type { CallEvent, EnvidoCallLevel, EnvidoDeclaration, EnvidoState, HandState, MatchState, Player } from "./match.js";

/** Envido point value of a rank: 1-7 count face value, 10/11/12 count zero. */
const ENVIDO_RANK_VALUE: Record<Rank, number> = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 10: 0, 11: 0, 12: 0 };

/** Envido points for a hand: 20 + the two highest ranks of a shared suit, or
 * the single highest rank when no suit is shared (spec: envido rules). */
export function calculateEnvidoPoints(cards: readonly Card[]): number {
  const bySuit = new Map<Suit, number[]>();
  for (const card of cards) {
    bySuit.set(card.suit, [...(bySuit.get(card.suit) ?? []), ENVIDO_RANK_VALUE[card.rank]]);
  }
  let best = 0;
  for (const values of bySuit.values()) {
    if (values.length < 2) continue;
    const [highest, second] = [...values].sort((a, b) => b - a);
    best = Math.max(best, 20 + highest! + second!);
  }
  return best > 0 ? best : Math.max(...cards.map((card) => ENVIDO_RANK_VALUE[card.rank]));
}

export interface CallEnvidoAction {
  readonly type: "call-envido";
  readonly playerId: PlayerId;
  readonly level: EnvidoCallLevel;
}
export interface RespondEnvidoAction {
  readonly type: "respond-envido";
  readonly playerId: PlayerId;
  readonly response: "quiero" | "no-quiero";
}
/**
 * ONE PLAYER SAYING THEIR TANTOS, or conceding with "son buenas".
 *
 * This replaces an all-at-once `reveal-envido` that computed every
 * declaration in a single step. That was correct arithmetic and the wrong
 * SHAPE: the declaration round is something players do out loud, one after
 * another, and collapsing it meant nobody could see who said what, in what
 * order — or choose. Reported from real play: "me gustaría que vayan por
 * ronda... uno a uno".
 *
 * THE PLAYER NEVER SUPPLIES A NUMBER. Your tantos are whatever your cards
 * say, and the engine reads them from the hand it already holds; a
 * caller-supplied figure would be a lie the rules do not allow. What a player
 * genuinely chooses is only whether to say it — or to concede.
 *
 * AND CONCEDING IS NOT FREE. In pairs, "son buenas" gives the envido up for
 * the WHOLE TEAM, not just for the player saying it: a published rulebook's
 * Truco article is explicit — "en caso de estar jugando en parejas, al decir
 * 'son buenas' se le da por perdido el envido a todo el equipo". This engine
 * used to model it as a per-player statement and let the round carry on to
 * the partner, which was wrong, and was caught by a player asking the
 * question the implementation could not answer.
 */
export interface DeclareEnvidoAction {
  readonly type: "declare-envido";
  readonly playerId: PlayerId;
  readonly declaration: "points" | "sonBuenas";
}
export type EnvidoAction = CallEnvidoAction | RespondEnvidoAction | DeclareEnvidoAction;

export type ApplyEnvidoResult =
  | { readonly ok: true; readonly state: MatchState }
  | { readonly ok: false; readonly violation: string };

/** Weight per level — envido calls may skip levels (envido -> real envido
 * directly), unlike the strictly-sequential truco chain. Falta envido is the
 * maximum weight, so it is always the final legal escalation. */
const ENVIDO_CALL_WEIGHT: Record<EnvidoCallLevel, number> = { envido: 1, envidoEnvido: 2, realEnvido: 3, faltaEnvido: 4 };
const ENVIDO_CALL_ORDER = Object.keys(ENVIDO_CALL_WEIGHT) as readonly EnvidoCallLevel[];
/** faltaEnvido has NO fixed value: its accepted value is `faltaEnvidoValue`
 * below, never summed. This sentinel must never be read — NaN makes an
 * accidental read fail loudly instead of silently producing a wrong score. */
const ENVIDO_CALL_VALUE: Record<EnvidoCallLevel, number> = { envido: 2, envidoEnvido: 2, realEnvido: 3, faltaEnvido: Number.NaN };

const sumValue = (calls: readonly EnvidoCallLevel[]): number => calls.reduce((sum, l) => sum + ENVIDO_CALL_VALUE[l], 0);
/** Decline concedes the value of calls strictly before the declined one, floored at 1 for a bare first call (spec).
 * This always excludes the declined call itself, so it never reads faltaEnvido's sentinel value even when falta is declined. */
const declineValue = (calls: readonly EnvidoCallLevel[]): number => Math.max(1, sumValue(calls.slice(0, -1)));

/** Falta envido's accepted value OVERRIDES the cumulative chain entirely: the
 * points the LEADING team needs to reach the match target (spec: "Falta
 * envido cost is dynamic"). NOT cumulative with prior calls — unlike real
 * envido / envido-envido, whose spec bullet explicitly says "accumulating",
 * falta envido's bullet deliberately omits that word. An earlier cumulative
 * implementation produced 37 instead of 6 for a 30-point target with a
 * 24-point leader; this is that regression's fix (see apply-progress). */
const faltaEnvidoValue = (state: MatchState): number =>
  state.config.pointsToWin - Math.max(...state.teams.map((team) => team.score));

const findPlayer = (state: MatchState, playerId: PlayerId): Player | undefined =>
  state.players.find((player) => player.id === playerId);

/** Envido may only be OPENED during the FIRST trick, before that trick's
 * second card is played (spec is silent on the exact boundary; verified
 * against real Truco Argentino convention across five published rulebooks,
 * all consistent on this point).
 * This REPLACES the earlier `truco.status === "none"` simplification
 * (PR5/PR6/PR7): envido now correctly interrupts a PENDING or ACCEPTED truco
 * call, as long as it is still the first trick and the opener has not yet
 * played their own card. A truco DECLINE still blocks opening — it already
 * ended the hand, independent of trick position.
 * OPENING FOLLOWS THE TURN TO SPEAK; REPLYING DOES NOT. Those are two
 * different acts wearing one action type, and the rule only makes sense once
 * they are told apart:
 *
 *   - OPENING is taking the floor, so it belongs to whoever holds it. The
 *     mano speaks first, and the right passes down the play order as each
 *     seat plays. You cannot jump ahead of seats that have not spoken yet.
 *     Reported from real play in exactly those terms: "la mano puede cantar
 *     el envido, el compañero tiene que esperar su turno... no se puede
 *     saltar el turno del compañero y el primer rival cantando envido".
 *   - REPLYING with an envido to a pending truco ("el envido está primero")
 *     is answering, not taking the floor, so the turn does not gate it — the
 *     answering team may say envido instead of quiero whenever the question
 *     is theirs.
 *
 * THIS FILE USED TO REFUSE THE TURN GATE, and its reason is worth recording
 * because it was a good one that stopped being true. It argued that gating on
 * `hand.turnSeat` "would incorrectly block a pie response-by-envido to a
 * still-pending mano truco call", since `turnSeat` never advances on calls.
 * That is exactly right, and it is why the pending-truco branch below is
 * carved out ahead of the gate rather than subject to it. Once the two acts
 * are separated the objection dissolves.
 *
 * Its second reason — that no other call in this engine is turn-gated — was
 * a consistency argument rather than a rules one, and consistency with a gap
 * is not a reason to keep the gap.
 *
 * TWO WIDELY-PUBLISHED VARIANTS RESTRICT THIS FURTHER, and they contradict
 * each other, which is the whole reason this note exists rather than a code
 * change. In a 2v2 dealt from seat 0, play order is 1, 2, 3, 0:
 *
 *   - one gives it to the two seats immediately left of the dealer, which
 *     is seats 1 and 2.
 *   - another gives it to each team's PIE -- its last player to speak in the
 *     round -- which is seats 3 and 0, and exempts 1v1 entirely because with
 *     two seats "the last two" is everybody.
 *
 * Those are the exact complements of each other: each source hands the right
 * to precisely the two seats the other withholds it from. Convite implements
 * NEITHER, and that is a decision, not an oversight. It implements the
 * turn-of-speech rule quoted above, which was stated from real play and is
 * the superset both variants are restrictions of — every seat may open, but
 * only when the floor reaches it. Anyone can still open in the order the
 * table would actually let them speak, and no seat is silently robbed of a
 * call by a variant the players at this table may not use.
 *
 * If Convite ever offers house rules, this is one of them, and the two seat
 * sets above are the two options — do not "fix" this by picking one. */
/**
 * The pie of each team: the last seat of that team to speak in the round.
 *
 * Reading around from the mano, the LAST TWO seats are one pie each — the
 * seats alternate teams, so whoever speaks last for one side speaks
 * second-to-last for the other. That is why this needs no team bookkeeping,
 * and why 1v1 needs no special case: with two seats "the last two" is
 * everybody, which is exactly the exemption that variant spells out ("in 1v1
 * cualquiera puede cantarlo"). 3v3 falls out the same way.
 */
function isPie(hand: HandState, player: Player, seatCount: number): boolean {
  return (player.seat - hand.manoSeat + seatCount) % seatCount >= seatCount - 2;
}

function canOpenEnvido(hand: HandState, player: Player, seatCount: number): boolean {
  if (hand.truco.status === "declined") return false; // hand already ended by a truco decline
  if (hand.trickOutcomes.length > 0) return false; // first trick already resolved — never legal in trick 2/3
  // Playing your card is how you give up the right to call this hand — true
  // of both branches below, so it is asked once, before them.
  if (hand.currentTrickPlays.some((play) => play.playerId === player.id)) return false;

  // THE PIE GATE, ahead of BOTH branches on purpose. Opening as a reply to a
  // pending truco is not turn-gated (a pending call freezes `turnSeat`), so
  // leaving the gate out of that branch would hand a non-pie back the very
  // call this rule takes away: they would only have to wait to be trucked.
  // Escalating an envido that is already standing is a different act and
  // stays the whole team's — see getLegalEnvidoActions below.
  if (!isPie(hand, player, seatCount)) return false;

  // REPLYING. "El envido está primero" is the answering side's right and
  // nobody else's: interposing an envido over an unanswered truco is a way of
  // saying something back, so it belongs to the team that owes the answer.
  // Scoped to the TEAM rather than the caller, because a partner piling an
  // envido onto their own side's unanswered truco is the same thing said by a
  // different mouth. NOT turn-gated, for the reason the docblock records: a
  // pending call freezes `turnSeat`, so a gate here would refuse the very
  // reply the rule exists to allow.
  if (hand.truco.status === "pending") return player.teamId !== hand.truco.callingTeamId;

  // OPENING. Taking the floor belongs to whoever holds it — the mano first,
  // then each seat as the play order reaches it. `turnSeat` IS that floor:
  // it starts at the mano and moves only when somebody plays, which is
  // exactly how the right to speak moves.
  return player.seat === hand.turnSeat;
}

/** Envido-chain legality, mirroring the truco chain's `getLegalActions`. */
export function getLegalEnvidoActions(state: MatchState, playerId: PlayerId): readonly EnvidoAction[] {
  const hand = state.hand;
  if (hand === null || hand.outcome.decided || findPlayer(state, playerId) === undefined) return [];
  const player = findPlayer(state, playerId)!;
  const envido = hand.envido;
  if (envido.status === "none") {
    return canOpenEnvido(hand, player, state.players.length) ? [{ type: "call-envido", playerId, level: "envido" }] : [];
  }
  if (envido.status === "pending") {
    if (player.teamId === envido.callingTeamId) return [];
    const highest = Math.max(...envido.calls.map((level) => ENVIDO_CALL_WEIGHT[level]));
    const escalations: EnvidoAction[] = ENVIDO_CALL_ORDER.filter((level) => ENVIDO_CALL_WEIGHT[level] > highest).map((level) => ({ type: "call-envido", playerId, level }));
    return [{ type: "respond-envido", playerId, response: "quiero" }, { type: "respond-envido", playerId, response: "no-quiero" }, ...escalations];
  }
  if (envido.status === "accepted") {
    // THE ROUND HAS A TURN ORDER OF ITS OWN, and it is not `hand.turnSeat`:
    // cards are frozen while an envido resolves, so the card turn cannot
    // serve. It runs from the MANO around the table — "el primero en cantar
    // será el jugador que es mano", per published rule -- and
    // deliberately NOT from whoever called the envido.
    if (declarerSeatFor(state, hand, envido) !== player.seat) return [];
    // SON BUENAS IS GIVING UP, so it is only offered to somebody who has
    // something to give up. Conceding awards the envido to the OTHER team --
    // see the note beside that award below -- so a player whose own side
    // already holds the best number on the table was being offered a button
    // that threw away a round their partner had won. Reported from real play:
    // "mi compañero canto el tanto 29, el rival canto 25 y por mas que mi
    // compañero va ganando, me sale el boton de son buenas".
    //
    // Withheld, not redefined: conceding stays exactly as final as it was,
    // and stays available in the one situation where it says something --
    // when the number to beat is a rival's, or when nobody has spoken yet and
    // giving up first is a real choice.
    const runningBest = envido.declarations.reduce<Extract<EnvidoDeclaration, { declaration: "points" }> | null>(
      (winner, candidate) => (candidate.declaration === "points" && (winner === null || candidate.points > winner.points) ? candidate : winner),
      null,
    );
    const ownSideIsAhead = runningBest !== null && runningBest.teamId === player.teamId;
    return ownSideIsAhead
      ? [{ type: "declare-envido", playerId, declaration: "points" }]
      : [
          { type: "declare-envido", playerId, declaration: "points" },
          { type: "declare-envido", playerId, declaration: "sonBuenas" },
        ];
  }
  return []; // "declined" or "revealed" — envido is done for this hand.
}

function envidoActionsEqual(a: EnvidoAction, b: EnvidoAction): boolean {
  if (a.type !== b.type || a.playerId !== b.playerId) return false;
  if (a.type === "call-envido" && b.type === "call-envido") return a.level === b.level;
  if (a.type === "respond-envido" && b.type === "respond-envido") return a.response === b.response;
  return a.type === "declare-envido" && b.type === "declare-envido" && a.declaration === b.declaration;
}

const isLegalEnvido = (state: MatchState, action: EnvidoAction): boolean =>
  getLegalEnvidoActions(state, action.playerId).some((legal) => envidoActionsEqual(legal, action));

/** Per-player declaration order at envido reveal, in mano rotation
 * (`manoSeat`, `manoSeat+1`, …, mod `players.length` — spec: "Per-Player
 * Envido Declaration Order"). Mano always declares their own points — there
 * is no running best yet to compare against. Each LATER player declares
 * their own points ONLY IF strictly greater than the best already declared;
 * otherwise the entry is `sonBuenas` and the withheld number is NEVER
 * COMPUTED INTO the entry at all (D-1) — there is nothing to redact at
 * projection, because nothing withheld was ever written down.
 *
 * AMENDMENT (post-design, supersedes design D-3's lexicographic
 * `(points, isManoTeam)` comparator): the comparator below is plain
 * strictly-greater on points alone — `points > runningBest`, no
 * mano-priority term. Weakening this to `>=` changes WHO declares at a tie
 * (a game-rule concern, fenced by T-3/T-4) but — verified by manual mutation
 * during T-5m — does NOT leak a withheld number: every push below still
 * either builds a fully-typed `"points"` object or a fully-typed
 * `"sonBuenas"` object, so a would-be leak needs an actual out-of-band
 * assignment (e.g. an unsafe cast), not a comparator change. THAT is the
 * mutation view.test.ts's T-5 property is fenced against; see this test
 * file's own T-5m comment for the exact mutation performed and its result.
 * `resolveEnvidoWinner`'s replacement is DERIVED from this list
 * (D-2, unchanged): the team of the LAST entry whose
 * `declaration === "points"`. In the 2v2 corner where two players from
 * different teams tie for the max and neither is the mano seat, the earlier
 * declarer (closer to mano) now wins the derived tie — not mano's team, as
 * the pre-amendment `(points, isManoTeam)` comparator would have produced.
 * 1v1 is unaffected: mano is definitionally the earliest declarer, so an
 * equal later opponent still withholds and mano's team still wins the tie —
 * identical to today (see envido-chain.test.ts's "a tied reveal is won by
 * the mano's team", unmodified by this amendment).
 *
 * Module-exported (not package-exported — `index.ts` re-exports only the
 * `EnvidoDeclaration` TYPE, never this function, design checklist item 1) so
 * this file's own tests can exercise it directly, without needing a full
 * call/quiero/reveal chain first. */

/**
 * The three cards this player was DEALT, which is what an envido is worth —
 * not the ones still in their hand.
 *
 * `card-play.ts` removes a played card from `player.hand`, correctly: that
 * array is the trick game's hand. Reading envido points off it made a player
 * dealt espada 7 + espada 6 worth 6 instead of 33 the moment the 7 went down,
 * silently, with a number plausible enough that nothing caught it.
 *
 * `currentTrickPlays` is enough to put them back, and needs no new state: the
 * envido is legal only while the FIRST trick is unresolved, and the
 * declaration round freezes the cards while it runs, so nothing this player
 * has played has been swept into a TrickOutcome yet (which keeps a winner,
 * not the cards). Adding a `dealtHand` field instead would have created a
 * second copy of every hand for `getViewFor` to redact — a leak waiting to
 * happen, for information that is face up on the table anyway.
 */
function dealtCardsFor(hand: HandState, player: Player): readonly Card[] {
  const played = hand.currentTrickPlays.filter((play) => play.playerId === player.id).map((play) => play.card);
  return played.length === 0 ? player.hand : [...player.hand, ...played];
}

export function resolveEnvidoDeclarations(state: MatchState, manoSeat: number): readonly EnvidoDeclaration[] {
  const playerCount = state.players.length;
  const rotation = Array.from({ length: playerCount }, (_, i) => (manoSeat + i) % playerCount).map(
    (seat) => state.players.find((player) => player.seat === seat)!,
  );

  const declarations: EnvidoDeclaration[] = [];
  let runningBest = -Infinity;
  for (const player of rotation) {
    const points = calculateEnvidoPoints(dealtCardsFor(state.hand!, player));
    if (points > runningBest) {
      declarations.push({ declaration: "points", playerId: player.id, teamId: player.teamId, seat: player.seat, points });
      runningBest = points;
    } else {
      declarations.push({ declaration: "sonBuenas", playerId: player.id, teamId: player.teamId, seat: player.seat });
    }
  }
  return declarations;
}

/** Pure reducer for the envido call chain: never mutates `state`; illegal actions rejected via `{ok:false}`. */
export function applyEnvidoAction(state: MatchState, action: EnvidoAction): ApplyEnvidoResult {
  if (!isLegalEnvido(state, action)) {
    return { ok: false, violation: `illegal envido action: ${JSON.stringify(action)}` };
  }
  const hand = state.hand!;
  const player = findPlayer(state, action.playerId)!;
  if (action.type === "call-envido") {
    const priorCalls = hand.envido.status === "pending" ? hand.envido.calls : [];
    const envido: EnvidoState = { status: "pending", calls: [...priorCalls, action.level], callingTeamId: player.teamId };
    const event: CallEvent = { kind: "envido-call", playerId: player.id, teamId: player.teamId, seat: player.seat, level: action.level };
    return { ok: true, state: { ...state, hand: { ...hand, envido, callEvents: [...hand.callEvents, event] } } };
  }

  if (action.type === "respond-envido") {
    const pending = hand.envido as Extract<EnvidoState, { status: "pending" }>;
    if (action.response === "quiero") {
      const isFalta = pending.calls[pending.calls.length - 1] === "faltaEnvido";
      const acceptedValue = isFalta ? faltaEnvidoValue(state) : sumValue(pending.calls);
      const envido: EnvidoState = { status: "accepted", calls: pending.calls, callingTeamId: pending.callingTeamId, acceptedValue, declarations: [] };
      const event: CallEvent = { kind: "envido-response", playerId: player.id, teamId: player.teamId, seat: player.seat, response: "quiero" };
      return { ok: true, state: { ...state, hand: { ...hand, envido, callEvents: [...hand.callEvents, event] } } };
    }
    const awarded = declineValue(pending.calls);
    const envido: EnvidoState = { status: "declined", calls: pending.calls, callingTeamId: pending.callingTeamId, decliningTeamId: player.teamId };
    const event: CallEvent = { kind: "envido-response", playerId: player.id, teamId: player.teamId, seat: player.seat, response: "no-quiero" };
    const teams = state.teams.map((team) => (team.id === pending.callingTeamId ? { ...team, score: team.score + awarded } : team));
    return { ok: true, state: { ...state, teams, hand: { ...hand, envido, callEvents: [...hand.callEvents, event] } } };
  }

  const accepted = hand.envido as Extract<EnvidoState, { status: "accepted" }>;
  const declaring = action as DeclareEnvidoAction;

  // ONE ENTRY, THIS PLAYER'S. The number is read from the hand the engine
  // already holds — never supplied by the caller. Conceding carries no number
  // at all: a withheld declaration never materialises a `points` key (D-1),
  // which is what keeps "son buenas" genuinely unknowable rather than merely
  // unrendered.
  const entry: EnvidoDeclaration =
    declaring.declaration === "points"
      ? { declaration: "points", playerId: player.id, teamId: player.teamId, seat: player.seat, points: calculateEnvidoPoints(dealtCardsFor(hand, player)) }
      : { declaration: "sonBuenas", playerId: player.id, teamId: player.teamId, seat: player.seat };
  const declarations = [...accepted.declarations, entry];
  const event: CallEvent = { kind: "envido-declaration", playerId: player.id, teamId: player.teamId, seat: player.seat, declaration: declaring.declaration };

  // CONCEDING ENDS THE ROUND, FOR THE WHOLE TEAM. "Son buenas" means "yours
  // are better", said to the opponents — in pairs it gives the envido up for
  // both members, so the partner who has not spoken never gets to. That is
  // the rule (a published rulebook states it in exactly those
  // terms) and it is what makes the button worth thinking about before
  // pressing: it is a decision for two people, taken by one.
  //
  // The winner is the OTHER TEAM by concession, not "whoever declared
  // highest". Those coincide in ordinary play; they part company only if
  // somebody concedes while their own side is ahead, and there the concession
  // is what the player actually said.
  const conceding = declaring.declaration === "sonBuenas";

  // Otherwise the round runs to every seat. The order alternates teams, so a
  // player who cannot beat the running best but whose partner has not spoken
  // keeps the round alive by saying their number — conceding there would end
  // it over their partner's head.
  if (!conceding && declarations.length < state.players.length) {
    const envido: EnvidoState = { ...accepted, declarations };
    return { ok: true, state: { ...state, hand: { ...hand, envido, callEvents: [...hand.callEvents, event] } } };
  }

  // D-2: derived, never stored twice. On a concession the winner is the
  // conceding player's opponents; otherwise it is the HIGHEST number said,
  // ties going to whoever said it first (closest to mano). "Highest" rather
  // than "the last to declare points", which only held while the engine
  // declared for everybody and never announced a losing number — a player
  // choosing to say their tantos when they cannot win is legal, so "last"
  // stopped meaning "best" the moment the choice became real.
  const best = declarations.reduce<Extract<EnvidoDeclaration, { declaration: "points" }> | null>(
    (winner, candidate) => (candidate.declaration === "points" && (winner === null || candidate.points > winner.points) ? candidate : winner),
    null,
  );
  const opposingTeam = state.teams.find((team) => team.id !== player.teamId);
  const winningTeamId = conceding ? (opposingTeam?.id ?? accepted.callingTeamId) : (best?.teamId ?? accepted.callingTeamId);
  const envido: EnvidoState = { status: "revealed", calls: accepted.calls, winningTeamId, awardedValue: accepted.acceptedValue, declarations };
  const teams = state.teams.map((team) => (team.id === winningTeamId ? { ...team, score: team.score + accepted.acceptedValue } : team));
  return { ok: true, state: { ...state, teams, hand: { ...hand, envido, callEvents: [...hand.callEvents, event] } } };
}

/**
 * Whose turn it is to declare — the seat at position `declarations.length` of
 * the mano rotation.
 *
 * Its own turn order, separate from `hand.turnSeat`: an accepted envido
 * freezes card play, so the card turn is stale and cannot serve here.
 */
function declarerSeatFor(state: MatchState, hand: HandState, envido: Extract<EnvidoState, { status: "accepted" }>): number {
  return (hand.manoSeat + envido.declarations.length) % state.players.length;
}
