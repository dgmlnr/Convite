import { applyAction as engineApplyAction, getLegalActions as engineGetLegalActions, getMatchWinner, getViewFor, redeal, scoreHandBreakdown, settleLeftovers } from "@hexdev/escoba-engine";
import type { MatchState, PlayCardAction, PlayerView, TeamId } from "@hexdev/escoba-engine";
import { DEFAULT_THINKING_DELAY_MS, createBotStrategy, withThinkingDelay } from "@hexdev/escoba-bot";
import type { ApplyResult, BotStrategy, BotTier, GameModule, JsonValue, MatchOutcome, PlayerId, RandomSource, SeatAssignment } from "@hexdev/platform-contract";
import { SYSTEM_ACTOR_ID, requestEscobaSystemAction, startHand } from "./deal.js";
import type { StartHandAction } from "./deal.js";

export { SYSTEM_ACTOR_ID, requestEscobaSystemAction };
export type { StartHandAction };

/** design §D3: escoba's own dealing seam, the same shape `truco-module`'s
 * `TrucoModuleAction` uses for `start-hand`. */
export type EscobaModuleAction = PlayCardAction | StartHandAction;

/** decision 3: `configOptions` is exactly EMPTY — 30 points is a literal on
 * `MatchState.pointsToWin`, never a lobby knob — so this module's `TConfig`
 * carries nothing. */
export type EscobaMatchConfig = Record<string, never>;

/** decision 1: two GameIds, one family — the 2-seat entry is a team of one
 * per side (art. 5.1). */
function buildMatch(seats: readonly SeatAssignment[]): MatchState {
  const seatA = seats.find((seat) => seat.seat === 0);
  const seatB = seats.find((seat) => seat.seat === 1);
  if (seats.length !== 2 || seatA === undefined || seatB === undefined) {
    throw new Error(`escoba-de-15 requires exactly seats 0 and 1, got ${JSON.stringify(seats)}`);
  }
  const teamAId = `${seatA.playerId}:team` as TeamId;
  const teamBId = `${seatB.playerId}:team` as TeamId;
  return {
    teams: [
      { id: teamAId, playerIds: [seatA.playerId], score: 0 },
      { id: teamBId, playerIds: [seatB.playerId], score: 0 },
    ],
    players: [
      { id: seatA.playerId, teamId: teamAId, seat: 0, hand: [] },
      { id: seatB.playerId, teamId: teamBId, seat: 1, hand: [] },
    ],
    dealerSeat: 0,
    hand: null,
    pointsToWin: 30,
  };
}

/** 4-seat pairing mirrors `truco-module`'s own `createMatch2v2`: PARTNERS
 * SIT ACROSS THE TABLE (seats 0+2 vs 1+3), not adjacent. */
function buildMatch2v2(seats: readonly SeatAssignment[]): MatchState {
  const bySeat = new Map(seats.map((seat) => [seat.seat, seat.playerId]));
  const seat0 = bySeat.get(0);
  const seat1 = bySeat.get(1);
  const seat2 = bySeat.get(2);
  const seat3 = bySeat.get(3);
  if (seats.length !== 4 || seat0 === undefined || seat1 === undefined || seat2 === undefined || seat3 === undefined) {
    throw new Error(`escoba-de-15-2v2 requires exactly seats 0, 1, 2, and 3, got ${JSON.stringify(seats)}`);
  }
  const teamAId = `${seat0}:${seat2}:team` as TeamId;
  const teamBId = `${seat1}:${seat3}:team` as TeamId;
  return {
    teams: [
      { id: teamAId, playerIds: [seat0, seat2], score: 0 },
      { id: teamBId, playerIds: [seat1, seat3], score: 0 },
    ],
    players: [
      { id: seat0, teamId: teamAId, seat: 0, hand: [] },
      { id: seat1, teamId: teamBId, seat: 1, hand: [] },
      { id: seat2, teamId: teamAId, seat: 2, hand: [] },
      { id: seat3, teamId: teamBId, seat: 3, hand: [] },
    ],
    dealerSeat: 0,
    hand: null,
    pointsToWin: 30,
  };
}

/**
 * design §D3 data-flow: "hands all empty AND stock>0 -> refill (PURE);
 * hands all empty AND stock==0 -> leftovers -> scoreHandBreakdown ->
 * teams[].score". Runs in the SAME reduction that empties the last hand, so
 * a mid-hand re-deal never surfaces as a state where no seat can act
 * mid-hand — the invariant `requestEscobaSystemAction`'s gate depends on.
 *
 * `hand.outcome` now carries the FULL breakdown (slice R1), not just
 * `decided: true` — a UI needs to explain WHY the score moved, and
 * `scoreHandBreakdown` is the engine's single source of truth for that,
 * never re-derived here or in any renderer.
 */
function settleHandIfNeeded(state: MatchState): MatchState {
  const hand = state.hand;
  if (hand === null || !state.players.every((player) => player.hand.length === 0)) return state;
  if (hand.stock.length > 0) return redeal(state);

  const settled = settleLeftovers(state);
  const settledHand = settled.hand!;
  const teamIds: readonly [TeamId, TeamId] = [settled.teams[0].id, settled.teams[1].id];
  const breakdown = scoreHandBreakdown(settledHand, teamIds);
  return {
    ...settled,
    teams: [
      { ...settled.teams[0], score: settled.teams[0].score + breakdown.points[teamIds[0]]! },
      { ...settled.teams[1], score: settled.teams[1].score + breakdown.points[teamIds[1]]! },
    ],
    hand: { ...settledHand, outcome: { decided: true, breakdown } },
  };
}

function applyAction(state: MatchState, action: EscobaModuleAction): ApplyResult<MatchState> {
  if (action.type === "start-hand") {
    // Same guard, same reason, as `truco-module`'s own `applyAction`:
    // "only the system deals" is a rule of the GAME, so it is enforced here
    // and not only at the transport that happens to call this today. In
    // escoba the forged action is the worse of the two — `deck` is the
    // whole permutation, so it picks every hand, the opening table and the
    // draw order — see `deal.ts`'s `SYSTEM_ACTOR_ID`.
    if (action.playerId !== SYSTEM_ACTOR_ID) {
      return { ok: false, violation: { code: "not-a-system-actor", message: "only the system deals a hand" } };
    }
    if (getMatchWinner(state) !== null) {
      return { ok: false, violation: { code: "match-over", message: "the match already has a winner" } };
    }
    if (state.hand !== null && (state.hand.outcome === null || !state.hand.outcome.decided)) {
      return { ok: false, violation: { code: "hand-in-progress", message: "the current hand has not ended yet" } };
    }
    return { ok: true, state: startHand(state, action) };
  }

  const result = engineApplyAction(state, action);
  if (!result.ok) {
    return { ok: false, violation: { code: result.violation.code, message: result.violation.message } };
  }
  return { ok: true, state: settleHandIfNeeded(result.state) };
}

function getLegalActions(state: MatchState, playerId: PlayerId): readonly EscobaModuleAction[] {
  return engineGetLegalActions(state, playerId);
}

function getOutcome(state: MatchState): MatchOutcome | null {
  const winnerTeamId = getMatchWinner(state);
  if (winnerTeamId === null) return null;
  const winner = state.teams.find((team) => team.id === winnerTeamId);
  return { winnerIds: winner === undefined ? [] : winner.playerIds };
}

/** `EscobaModuleAction` is `PlayCardAction | StartHandAction`, but a bot is
 * never offered `start-hand` — `getLegalActions` only ever returns the
 * engine's own `PlayCardAction`s (`SYSTEM_ACTOR_ID` is the only actor that
 * ever sees `start-hand`) — so this narrowing is total in practice, the
 * same shape truco-module's own `toEngineActions` uses. */
function toPlayCardActions(actions: readonly EscobaModuleAction[]): readonly PlayCardAction[] {
  return actions.filter((action): action is PlayCardAction => action.type === "play-card");
}

/** Real crypto entropy for the hard tier's tie-breaks only (design §D8:
 * `rng` "used ONLY to break ties among equally-valued actions") — mirrors
 * `truco-module/src/index.ts`'s own `defaultRng`. */
const defaultRng: RandomSource = () => crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32;

/**
 * design §D8: the three genuinely distinct tiers from `@hexdev/escoba-bot`,
 * wrapped in that package's own thinking delay — escoba has no "spoken"
 * moves (no calls, no señas), so unlike `truco-module`'s own `createBot`
 * this needs no `delayForAction` classifier, just the base pause.
 */
function createBot(tier: BotTier): BotStrategy<PlayerView, EscobaModuleAction> {
  const strategy = withThinkingDelay(createBotStrategy(tier, defaultRng), DEFAULT_THINKING_DELAY_MS);
  return {
    chooseAction: (view, legalActions, budgetMs, answer) => strategy.chooseAction(view, toPlayCardActions(legalActions), budgetMs, answer),
  };
}

const serialize = (state: MatchState): JsonValue => JSON.parse(JSON.stringify(state)) as JsonValue;
const deserialize = (json: JsonValue): MatchState => json as unknown as MatchState;

export const escobaModule: GameModule<MatchState, EscobaModuleAction, PlayerView, EscobaMatchConfig> = {
  id: "escoba-de-15",
  metadata: { seatCount: 2, gameFamily: "escoba", section: "cartas", displayNameKey: "games.escoba.name", assetBase: "/games/escoba-de-15" },
  configOptions: [],
  createMatch: (_config, seats) => buildMatch(seats),
  applyAction,
  getLegalActions,
  getViewFor,
  getOutcome,
  serialize,
  deserialize,
  createBot,
};

/** The 4-seat entry — a SEPARATE registered id (`escoba-de-15-2v2`),
 * additive to `escobaModule` above, exactly the way `trucoModule2v2` is
 * additive to `trucoModule`. */
export const escobaModule2v2: GameModule<MatchState, EscobaModuleAction, PlayerView, EscobaMatchConfig> = {
  id: "escoba-de-15-2v2",
  metadata: { seatCount: 4, gameFamily: "escoba", section: "cartas", displayNameKey: "games.escoba2v2.name", assetBase: "/games/escoba-de-15" },
  configOptions: [],
  createMatch: (_config, seats) => buildMatch2v2(seats),
  applyAction,
  getLegalActions,
  getViewFor,
  getOutcome,
  serialize,
  deserialize,
  createBot,
};
