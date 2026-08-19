import type { GameId, GameModule, PlayerId, RandomSource } from "@hexdev/platform-contract";

/** What every conformant `TAction` structurally carries (`GameModule`'s
 * bound) — kept as the registry's erased action shape instead of `unknown`
 * so a transport can read `action.playerId` for ANY game, no duck-typing. */
type ActorTaggedAction = { readonly playerId: PlayerId };

/**
 * Materializes a system action ("nobody can act, but the match must
 * advance" — truco's `start-hand` and its dealt cards) from opaque state
 * and a server-owned entropy source, or `null` when no system action is
 * currently needed. Deliberately NOT a `GameModule` port member (the port
 * stays free of anything only a transport-driven advance loop needs) —
 * paired with its module HERE instead, supplied by the same package that
 * supplies the module (design decision, apply-progress system-action note). */
export type SystemActionRequester = (state: unknown, rng: RandomSource) => ActorTaggedAction | null;

/**
 * Classifies a SPECIFIC action as "non-blocking": legal any time (not
 * turn-gated) and safe for the driving loop to skip auto-taking on a bot's
 * behalf when it is the ONLY thing that bot has legal (`truco-module`'s own
 * `send-sena`, paired here — never a `platform-contract` port member, same
 * convention as `SystemActionRequester`). Closes a REAL, reproduced
 * deadlock: `transport-colyseus`'s `MatchRoom.findActingBot` used to treat
 * "this bot has ANY legal action" as "this bot must act now" — but a seña
 * is legal continuously, for any player with a teammate, independent of
 * whose real turn it is. A bot whose ONLY legal action was `send-sena`
 * (because it genuinely was not that bot's turn for anything else) kept
 * getting auto-driven forever, starving the actual pending decision
 * (`respond-truco`/`respond-envido`) from ever being reached — reproduced
 * with a real 2v2 bot-vs-bot simulation that never converged in 2000 steps.
 * `MatchRoom` itself must never hardcode "send-sena" (design's own
 * game-agnostic-transport rule) — this classifier is the generic seam that
 * lets it ask "is this specific action safe to skip" without knowing what
 * the action even is.
 */
export type NonBlockingActionClassifier = (action: unknown) => boolean;

/** Either a bare `GameModule` (no system-action factory — the common case
 * for a game whose players can always act) or a module paired with its
 * optional `requestSystemAction`/`isNonBlockingAction`. Both forms resolve
 * identically via `get`. */
export type GameModuleRegistration =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | GameModule<any, any, any, any>
  | {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      readonly module: GameModule<any, any, any, any>;
      readonly requestSystemAction?: SystemActionRequester;
      readonly isNonBlockingAction?: NonBlockingActionClassifier;
    };

/**
 * Maps a stable `GameId` to the `GameModule` implementing it — the one
 * seam a generic transport is allowed to know about a specific game: its
 * id. `TState`/`TView`/`TConfig` stay erased to `unknown` on purpose: the
 * whole point of a registry is to hold heterogeneous games behind one
 * uniform shape, the same way `GameModule.applyAction` already treats a
 * client message as opaque data until the module itself interprets it.
 */
export interface GameModuleRegistry {
  get(gameId: GameId): GameModule<unknown, ActorTaggedAction, unknown, unknown> | undefined;
  /** `null` when nothing is registered for `gameId`, OR the registered
   * module has no `requestSystemAction`, OR the module itself decides no
   * system action is currently needed — all three fail closed identically. */
  getSystemAction(gameId: GameId, state: unknown, rng: RandomSource): ActorTaggedAction | null;
  /** `false` (every action blocks — the safe, conservative default) when
   * nothing is registered for `gameId` OR the registered module supplied no
   * classifier at all. */
  isNonBlockingAction(gameId: GameId, action: unknown): boolean;
}

// See the erasure note above: registering a `GameModule<TState,...>` for a
// concrete game into a heterogeneous registry needs a type-parameter-erasing
// boundary somewhere, and this is that one deliberate, documented spot.
export function createGameModuleRegistry(modules: readonly GameModuleRegistration[]): GameModuleRegistry {
  const entries = modules.map((registration) => ("module" in registration ? registration : { module: registration }));
  for (const { module } of entries) {
    // Fail loud at composition time, naming the module: `metadata.seatCount`
    // is consumed downstream by BOTH transports (`MatchRoom.onCreate` sizes
    // its seats from it; `PresenceRoom` forms matchmaking groups of it, and
    // `MatchmakingPool.tryPairSeats` rejects any seatCount that is not an
    // integer >= 2), so an invalid value here would otherwise only surface
    // at runtime — as an unhandled rejection out of a lobby join, on every
    // single join attempt for that game.
    if (!Number.isInteger(module.metadata.seatCount) || module.metadata.seatCount < 2) {
      throw new Error(
        `createGameModuleRegistry: module "${module.id}" declares metadata.seatCount ${String(module.metadata.seatCount)} — must be an integer >= 2, a group that size can never form a match`,
      );
    }
  }
  const byId = new Map(entries.map((entry) => [entry.module.id, entry]));
  return {
    get: (gameId) => byId.get(gameId)?.module,
    getSystemAction: (gameId, state, rng) => byId.get(gameId)?.requestSystemAction?.(state, rng) ?? null,
    isNonBlockingAction: (gameId, action) => byId.get(gameId)?.isNonBlockingAction?.(action) ?? false,
  };
}
