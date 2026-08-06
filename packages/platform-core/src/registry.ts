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

/** Either a bare `GameModule` (no system-action factory — the common case
 * for a game whose players can always act) or a module paired with its
 * optional `requestSystemAction`. Both forms resolve identically via `get`. */
export type GameModuleRegistration =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | GameModule<any, any, any, any>
  | {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      readonly module: GameModule<any, any, any, any>;
      readonly requestSystemAction?: SystemActionRequester;
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
}

// See the erasure note above: registering a `GameModule<TState,...>` for a
// concrete game into a heterogeneous registry needs a type-parameter-erasing
// boundary somewhere, and this is that one deliberate, documented spot.
export function createGameModuleRegistry(modules: readonly GameModuleRegistration[]): GameModuleRegistry {
  const entries = modules.map((registration) => ("module" in registration ? registration : { module: registration }));
  const byId = new Map(entries.map((entry) => [entry.module.id, entry]));
  return {
    get: (gameId) => byId.get(gameId)?.module,
    getSystemAction: (gameId, state, rng) => byId.get(gameId)?.requestSystemAction?.(state, rng) ?? null,
  };
}
