import { applyAction as engineApplyAction, getLegalActions as engineGetLegalActions, getMatchWinner, getViewFor } from "@hexdev/escoba-engine";
import type { MatchState, PlayCardAction, PlayerView, TeamId } from "@hexdev/escoba-engine";
import type { ApplyResult, BotStrategy, BotTier, GameModule, JsonValue, MatchOutcome, PlayerId, SeatAssignment } from "@hexdev/platform-contract";

/**
 * design §D3 widens this to `PlayCardAction | StartHandAction` once
 * system-action dealing lands (this unit's own follow-up, `./deal.ts`) —
 * kept as its own alias from the start so that widening is a type-only
 * change, never a call-site rewrite.
 */
export type EscobaModuleAction = PlayCardAction;

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

function applyAction(state: MatchState, action: EscobaModuleAction): ApplyResult<MatchState> {
  const result = engineApplyAction(state, action);
  if (!result.ok) {
    return { ok: false, violation: { code: result.violation.code, message: result.violation.message } };
  }
  return { ok: true, state: result.state };
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

/**
 * PLACEHOLDER ONLY. `createBot` is REQUIRED on `GameModule`
 * (`contract.ts:132`, no `?`), but escoba's three REAL, genuinely distinct
 * tiers (design §D8) are Slice K's job (`escoba-bot`), never this module's.
 * Picks the first legal action in canonical table-index order — Slice K
 * replaces this with `createBotStrategy(tier, rng)` from `@hexdev/escoba-bot`,
 * exactly the way `truco-module/src/index.ts:126` wires its own real tiers.
 */
function createBot(tier: BotTier): BotStrategy<PlayerView, EscobaModuleAction> {
  return {
    chooseAction: (_view, legalActions) => {
      const first = legalActions[0];
      if (first === undefined) throw new Error(`escoba-module createBot placeholder (${tier}): no legal actions were offered`);
      return first;
    },
  };
}

const serialize = (state: MatchState): JsonValue => JSON.parse(JSON.stringify(state)) as JsonValue;
const deserialize = (json: JsonValue): MatchState => json as unknown as MatchState;

export const escobaModule: GameModule<MatchState, EscobaModuleAction, PlayerView, EscobaMatchConfig> = {
  id: "escoba-de-15",
  metadata: { seatCount: 2, gameFamily: "escoba", displayNameKey: "games.escoba.name", assetBase: "/games/escoba-de-15" },
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
  metadata: { seatCount: 4, gameFamily: "escoba", displayNameKey: "games.escoba2v2.name", assetBase: "/games/escoba-de-15" },
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
