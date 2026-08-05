import {
  applyAction as engineApplyAction,
  createHeadToHeadMatch,
  getLegalActions as engineGetLegalActions,
  getMatchWinner,
  getViewFor,
  rotateDealer,
  startHand,
} from "@hexdev/truco-engine";
import type { Action as EngineAction, DealInput, MatchConfig, MatchState, PlayerView } from "@hexdev/truco-engine";
import { chooseFirstLegalAction } from "@hexdev/truco-bot";
import type { ApplyResult, BotStrategy, BotTier, GameModule, JsonValue, MatchOutcome, PlayerId, SeatAssignment } from "@hexdev/platform-contract";

/**
 * The one thing the generic port has no room for: starting a hand needs
 * externally materialized randomness. It travels as DATA on an ordinary
 * action — the same way `truco-engine`'s own `startHand(state, deal)`
 * already externalizes randomness — never as a distinct lifecycle method on
 * `GameModule` (see apply-progress's anti-truco-shape audit for why
 * `startHand` was rejected from the port sketch). Whoever calls
 * `applyAction` with this action (the transport, a test, a bot search
 * sampling a hypothetical) supplies the materialized deal; this module never
 * generates randomness itself.
 */
export interface StartHandAction {
  readonly type: "start-hand";
  readonly deal: DealInput;
}

export type TrucoModuleAction = EngineAction | StartHandAction;

function toEngineActions(actions: readonly TrucoModuleAction[]): readonly EngineAction[] {
  return actions.filter((action): action is EngineAction => action.type !== "start-hand");
}

function createMatch(config: MatchConfig, seats: readonly SeatAssignment[]): MatchState {
  const seatA = seats.find((seat) => seat.seat === 0);
  const seatB = seats.find((seat) => seat.seat === 1);
  if (seats.length !== 2 || seatA === undefined || seatB === undefined) {
    throw new Error(`truco-argentino requires exactly seats 0 and 1, got ${JSON.stringify(seats)}`);
  }
  return createHeadToHeadMatch({
    playerAId: seatA.playerId,
    playerBId: seatB.playerId,
    pointsToWin: config.pointsToWin,
  });
}

function applyAction(state: MatchState, action: TrucoModuleAction): ApplyResult<MatchState> {
  if (action.type === "start-hand") {
    if (getMatchWinner(state) !== null) {
      return { ok: false, violation: { code: "match-over", message: "the match already has a winner" } };
    }
    if (state.hand !== null && !state.hand.outcome.decided) {
      return { ok: false, violation: { code: "hand-in-progress", message: "the current hand has not ended yet" } };
    }
    const base = state.hand === null ? state : rotateDealer(state);
    return { ok: true, state: startHand(base, action.deal) };
  }

  const result = engineApplyAction(state, action);
  return result.ok
    ? { ok: true, state: result.state }
    : { ok: false, violation: { code: "illegal-action", message: result.violation } };
}

function getLegalActions(state: MatchState, playerId: PlayerId): readonly TrucoModuleAction[] {
  return engineGetLegalActions(state, playerId);
}

function getOutcome(state: MatchState): MatchOutcome | null {
  const winnerTeamId = getMatchWinner(state);
  if (winnerTeamId === null) return null;
  const winner = state.teams.find((team) => team.id === winnerTeamId);
  return { winnerIds: winner === undefined ? [] : winner.playerIds };
}

function createBot(tier: BotTier): BotStrategy<PlayerView, TrucoModuleAction> {
  // `tier` is not yet used: every tier maps to the same placeholder strategy
  // until Phase 6 (PR11) adds real easy/normal/hard heuristics.
  void tier;
  return {
    chooseAction: (view, legalActions) => chooseFirstLegalAction(view, toEngineActions(legalActions)),
  };
}

export const trucoModule: GameModule<MatchState, TrucoModuleAction, PlayerView, MatchConfig> = {
  id: "truco-argentino",
  metadata: { seatCount: 2, displayNameKey: "games.truco.name", assetBase: "/games/truco-argentino" },
  configOptions: [{ key: "pointsToWin", labelKey: "games.truco.pointsToWin", values: [15, 30], defaultValue: 15 }],
  createMatch,
  applyAction,
  getLegalActions,
  getViewFor,
  getOutcome,
  serialize: (state) => JSON.parse(JSON.stringify(state)) as JsonValue,
  deserialize: (json) => json as unknown as MatchState,
  createBot,
};
