import {
  applyAction as engineApplyAction,
  createHeadToHeadMatch,
  createTeamMatch,
  getLegalActions as engineGetLegalActions,
  getMatchWinner,
  getViewFor,
  rotateDealer,
  startHand,
} from "@hexdev/truco-engine";
import type { Action as EngineAction, MatchConfig, MatchState, PlayerView } from "@hexdev/truco-engine";
import { DEFAULT_THINKING_DELAY_MS, SPOKEN_MOVE_DELAY_MS, createBotStrategy, withThinkingDelay } from "@hexdev/truco-bot";
import type { ApplyResult, BotStrategy, BotTier, GameModule, JsonValue, MatchOutcome, PlayerId, RandomSource, SeatAssignment } from "@hexdev/platform-contract";
import type { Action as EngineActionType } from "@hexdev/truco-engine";
import { SYSTEM_ACTOR_ID, requestSystemAction, requestSystemAction2v2 } from "./deal.js";
import type { StartHandAction } from "./deal.js";

export { SYSTEM_ACTOR_ID, requestSystemAction, requestSystemAction2v2 };
export type { StartHandAction };

/**
 * The one thing the generic port has no room for: starting a hand needs
 * externally materialized randomness. It travels as DATA on an ordinary
 * action — the same way `truco-engine`'s own `startHand(state, deal)`
 * already externalizes randomness — never as a distinct lifecycle method on
 * `GameModule` (see apply-progress's anti-truco-shape audit for why
 * `startHand` was rejected from the port sketch). `requestSystemAction`
 * (`./deal.ts`) is what MATERIALIZES that data — paired with `trucoModule`
 * in the registry, never as a `platform-contract` port member.
 */
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

/**
 * The 2v2 adapter's own `createMatch` — a SECOND registered `GameModule`
 * (`trucoModule2v2` below), never a branch inside the 1v1 `createMatch`
 * above, which stays byte-identical (obs 2927/2925's own named plan: "either
 * a second registered module id ... or a config-driven seat count" — this
 * unit picks the second registered id, so the 1v1 module's own createMatch,
 * metadata, and registration are untouched). Delegates straight to the
 * engine's own `createTeamMatch` (seats 0/2 vs 1/3, partners across the
 * table, matching the four-anchor UI's own geometry — PR27's own decision,
 * unchanged here).
 */
function createMatch2v2(config: MatchConfig, seats: readonly SeatAssignment[]): MatchState {
  const bySeat = new Map(seats.map((seat) => [seat.seat, seat.playerId]));
  const seat0 = bySeat.get(0);
  const seat1 = bySeat.get(1);
  const seat2 = bySeat.get(2);
  const seat3 = bySeat.get(3);
  if (seats.length !== 4 || seat0 === undefined || seat1 === undefined || seat2 === undefined || seat3 === undefined) {
    throw new Error(`truco-argentino-2v2 requires exactly seats 0, 1, 2, and 3, got ${JSON.stringify(seats)}`);
  }
  return createTeamMatch({ seatOrder: [seat0, seat1, seat2, seat3], pointsToWin: config.pointsToWin });
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

/**
 * Real CSPRNG (design §4: "the server is where entropy lives"), same shape
 * used by `apps/server`'s own `rng` — NOT the same runtime instance (see
 * apply-progress for why threading the room's single rng into `createBot`
 * would require widening `GameModule.createBot`'s port signature, out of
 * scope for this unit since it has no live transport consumer yet). Only
 * the `hard` tier ever calls this; `easy`/`normal` are fully deterministic.
 */
const defaultRng: RandomSource = () => crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32;

/** Replaces PR9's `chooseFirstLegalAction` placeholder with the real tiers
 * (spec: "Three Difficulty Tiers"), wrapped in the ~1s thinking delay
 * (spec: "Tunable Bot Move Latency") — the delay wraps the STRATEGY here,
 * never lives inside it, so `truco-bot`'s own strategy tests stay instant. */
/**
 * Which of truco's moves are SPOKEN. Playing a card is self-evident and
 * permanent once it lands; a call is a claim that appears, is marked on a
 * seat and then goes, so it is the one that needs room to be read. Señas are
 * absent on purpose: a bot never sends one on its own initiative (see the
 * transport's own non-blocking classifier), so classifying them here would
 * be describing a case that cannot occur.
 */
const SPOKEN_MOVES: ReadonlySet<string> = new Set(["call-truco", "respond-truco", "call-envido", "respond-envido"]);

function createBot(tier: BotTier): BotStrategy<PlayerView, TrucoModuleAction> {
  const strategy = withThinkingDelay(createBotStrategy(tier, defaultRng), DEFAULT_THINKING_DELAY_MS, undefined, (action) =>
    SPOKEN_MOVES.has(action.type) ? SPOKEN_MOVE_DELAY_MS : DEFAULT_THINKING_DELAY_MS,
  );
  return {
    chooseAction: (view, legalActions, budgetMs) => strategy.chooseAction(view, toEngineActions(legalActions), budgetMs),
  };
}

/**
 * WHAT YOUR PARTNER WOULD DO, asked on your behalf.
 *
 * The engine owns whether you MAY ask and what asking costs (a seña — see
 * `consult.ts`); it deliberately owns nothing else, because a recommendation
 * is judgement rather than a rule and a pure reducer has no business
 * inventing one. This is where the judgement comes from, and it is the same
 * judgement the partner would actually apply: their OWN bot strategy, at the
 * match's own tier, given their OWN view and their OWN legal responses.
 *
 * That last part is what makes the answer honest rather than decorative. It
 * is not a heuristic invented for the advice surface — ask them and then
 * ignore them, and you have ignored exactly the move they were about to make
 * on their own.
 *
 * NO THINKING DELAY, unlike `createBot` below. That pause exists so a bot's
 * MOVE does not land faster than a human can read the one before it; this is
 * a reply to a question the player just asked, and a reply that arrives late
 * reads as a broken button rather than as a thoughtful partner.
 *
 * Returns null rather than guessing when there is nobody to ask (a heads-up
 * match) or nothing to ask about — the engine will already have refused the
 * action in both cases, so this is the belt to that suspenders.
 */
const CONSULT_RESPONSES: ReadonlySet<string> = new Set(["respond-truco", "respond-envido"]);

export async function getConsultAdvice(state: MatchState, playerId: PlayerId, tier: BotTier): Promise<JsonValue | null> {
  const teammate = getViewFor(state, playerId).teammates[0];
  if (teammate === undefined) return null;

  const asked = questionFor(state, playerId, teammate.playerId);
  if (asked.length === 0) return null;

  const chosen: EngineActionType = await createBotStrategy(tier, defaultRng).chooseAction(getViewFor(state, teammate.playerId), asked, CONSULT_BUDGET_MS);
  return chosen.type === "respond-truco" || chosen.type === "respond-envido" ? chosen.response : null;
}

/**
 * The two questions a partner can be asked, and which one this moment is.
 *
 * A CALL ON THE TABLE is the original: they answer from their REAL legal
 * responses, which is what makes the advice honest rather than decorative —
 * ask them and then ignore them, and you have ignored exactly the move they
 * were about to make on their own.
 *
 * AN ENVIDO NOT CALLED YET is the window `consult.ts` opened for the pie, and
 * it needs a different question because the partner has no move to describe:
 * a non-pie calling an envido is precisely what the rule forbids, so there is
 * nothing real to offer them. They are asked the equivalent they DO have
 * judgement for — if this envido were on the table, would you want it? — as
 * a synthetic quiero/no-quiero pair.
 *
 * NOT A SYNTHETIC `call-envido`, which reads closer to the literal question:
 * the strategies fall back to "take whatever non-seña action is left" when
 * nothing else fits, and a lone synthetic call IS that action, so the answer
 * would have been yes every time from a code path that never weighed the
 * hand. Both arms of a quiero/no-quiero pair are real answers, so it cannot
 * degenerate that way.
 *
 * The accept threshold each tier applies is the lower bar, deliberately: the
 * partner is not being asked to CALL it, only whether they would play it, and
 * the pie combines that with its own hand.
 */
function questionFor(state: MatchState, askerId: PlayerId, teammateId: PlayerId): readonly EngineActionType[] {
  const theirResponses = engineGetLegalActions(state, teammateId).filter((action) => CONSULT_RESPONSES.has(action.type));
  if (theirResponses.length > 0) return theirResponses;

  const askerHoldsAnEnvido = engineGetLegalActions(state, askerId).some((action) => action.type === "call-envido");
  if (!askerHoldsAnEnvido) return [];
  return [
    { type: "respond-envido", playerId: teammateId, response: "quiero" },
    { type: "respond-envido", playerId: teammateId, response: "no-quiero" },
  ];
}

/** The same order of magnitude `MatchRoom` gives a bot for a real move. The
 * hard tier is the only strategy that reads it at all. */
const CONSULT_BUDGET_MS = 1000;

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

/**
 * The 2v2 GameModule — a SEPARATE registered id (`truco-argentino-2v2`),
 * additive to `trucoModule` above (obs 2927/2925's own named gap, closed
 * here). Every member except `id`/`metadata`/`createMatch` is REUSED, not
 * reimplemented: `applyAction`/`getLegalActions`/`getViewFor`/`getOutcome`/
 * `createBot` were already generalized to N seats by PR27's engine work
 * (`resolveTrick`, `card-play.ts`'s turn order, `Math.max`-per-team envido,
 * team-scoped truco legality) — this module never re-derives any of that,
 * it only supplies the 4-seat `createMatch` and `metadata.seatCount: 4` the
 * generic `MatchRoom` needs to size the room and assign seats.
 */
export const trucoModule2v2: GameModule<MatchState, TrucoModuleAction, PlayerView, MatchConfig> = {
  id: "truco-argentino-2v2",
  metadata: { seatCount: 4, displayNameKey: "games.truco2v2.name", assetBase: "/games/truco-argentino" },
  configOptions: [{ key: "pointsToWin", labelKey: "games.truco.pointsToWin", values: [15, 30], defaultValue: 15 }],
  createMatch: createMatch2v2,
  applyAction,
  getLegalActions,
  getViewFor,
  getOutcome,
  serialize: (state) => JSON.parse(JSON.stringify(state)) as JsonValue,
  deserialize: (json) => json as unknown as MatchState,
  createBot,
};
