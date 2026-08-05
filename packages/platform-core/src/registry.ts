import type { GameId, GameModule, PlayerId } from "@hexdev/platform-contract";

/** What every conformant `TAction` structurally carries (`GameModule`'s
 * bound) — kept as the registry's erased action shape instead of `unknown`
 * so a transport can read `action.playerId` for ANY game, no duck-typing. */
type ActorTaggedAction = { readonly playerId: PlayerId };

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
}

// See the erasure note above: registering a `GameModule<TState,...>` for a
// concrete game into a heterogeneous registry needs a type-parameter-erasing
// boundary somewhere, and this is that one deliberate, documented spot.
export function createGameModuleRegistry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modules: readonly GameModule<any, any, any, any>[],
): GameModuleRegistry {
  const byId = new Map<GameId, GameModule<unknown, ActorTaggedAction, unknown, unknown>>(
    modules.map((module) => [module.id, module]),
  );
  return { get: (gameId) => byId.get(gameId) };
}
