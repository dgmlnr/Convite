import type { GameId, PlayerId } from "./ids.js";
import type { JsonValue } from "./json.js";

/** What a lobby/catalog UI needs to present a game. No team concept, no
 * point target: those are truco specifics that live inside `configOptions`
 * or a game's own `TConfig`, never on the platform-wide shape. */
export interface GameMetadata {
  readonly seatCount: number;
  readonly displayNameKey: string;
  readonly assetBase: string;
}

export type ConfigOptionValue = string | number | boolean;

/** A single tunable a lobby modality may vary (truco: `pointsToWin`). */
export interface ConfigOption {
  readonly key: string;
  readonly labelKey: string;
  readonly values: readonly ConfigOptionValue[];
  readonly defaultValue: ConfigOptionValue;
}

/** A seat in a match. Deliberately has no `teamId`: team grouping, if a game
 * has teams at all, is an implementation detail of that game's own state,
 * never a platform-level concept (see apply-progress anti-truco-shape audit). */
export interface SeatAssignment {
  readonly seat: number;
  readonly playerId: PlayerId;
}

export interface RuleViolation {
  readonly code: string;
  readonly message: string;
}

export type ApplyResult<TState> =
  | { readonly ok: true; readonly state: TState }
  | { readonly ok: false; readonly violation: RuleViolation };

/** `GameModule.getOutcome` returning `null` means "still in progress"; a
 * returned `MatchOutcome` always means the match has ended. `winnerIds` may
 * legitimately be empty — a draw, or a solo match abandoned unsolved. */
export interface MatchOutcome {
  readonly winnerIds: readonly PlayerId[];
}

export type BotTier = "easy" | "normal" | "hard";

/** A bot's only inputs are exactly what a human client would see: its own
 * view and the legal actions offered to it. It cannot reach hidden state —
 * a cheating bot is unrepresentable at the type level (design §9). */
export interface BotStrategy<TView, TAction> {
  chooseAction(view: TView, legalActions: readonly TAction[], budgetMs: number): TAction | Promise<TAction>;
}

/**
 * The game-agnostic seam a transport programs against. Two deliberate
 * departures from the design §5 sketch — see apply-progress for the full
 * anti-truco-shape audit of every member:
 *  - No `startHand`/`hand`/`deal` member: "hand" is a card-game concept a
 *    single-player puzzle or a public-state board game has no use for.
 *    Whenever a game needs externally materialized randomness to advance
 *    (truco's per-hand deal, a dice roll, a shuffled board...), it travels as
 *    DATA on an ordinary `TAction` — generalizing how `truco-engine`'s own
 *    `startHand(state, deal)` already externalizes randomness.
 *  - No separate `isTerminal`: a boolean that can drift out of sync with
 *    `getOutcome` is exactly the failure mode `getMatchWinner`'s
 *    derived-not-stored design already exists to avoid. `getOutcome(state)
 *    !== null` is the single source of truth for "has this match ended".
 *
 * `TAction extends { readonly playerId: PlayerId }` — PR10a's transport had
 * to know WHO an action claims to be from, but the port had no such
 * requirement: `truco-module` actions carried `playerId` only by UNENFORCED
 * CONVENTION (obs 2941). Now compile-time: any `GameModule<...>` must have
 * an action type structurally carrying its actor's identity, so a transport
 * can read `action.playerId` generically for ANY game, no duck-typing.
 * (Rejected: a required `actorOf(action)` port method — pure indirection,
 * since every action already needs this field for the engine's own
 * turn/ownership checks; see apply-progress for the full comparison.)
 */
export interface GameModule<TState, TAction extends { readonly playerId: PlayerId }, TView, TConfig> {
  readonly id: GameId;
  readonly metadata: GameMetadata;
  readonly configOptions: readonly ConfigOption[];
  createMatch(config: TConfig, seats: readonly SeatAssignment[]): TState;
  applyAction(state: TState, action: TAction): ApplyResult<TState>;
  getLegalActions(state: TState, playerId: PlayerId): readonly TAction[];
  getViewFor(state: TState, playerId: PlayerId): TView;
  getOutcome(state: TState): MatchOutcome | null;
  serialize(state: TState): JsonValue;
  deserialize(json: JsonValue): TState;
  createBot(tier: BotTier): BotStrategy<TView, TAction>;
}
