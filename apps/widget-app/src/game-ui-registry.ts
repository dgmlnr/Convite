import type { GameId } from "@hexdev/platform-contract";
import type { Action, PlayerId, PlayerView } from "@hexdev/truco-engine";
import { createMatchTableRenderer } from "@hexdev/truco-ui";

/** The wire shape `MatchRoom.viewMessageFor` now sends alongside every
 * "view" message (transport-colyseus) — opaque here on purpose, the same
 * erasure boundary `platform-core/registry.ts` already documents server-side
 * ("the one spot for the pairing"). Only a specific game's own registry
 * entry, below, knows what these really are. `outcome` is optional/nullable
 * on this generic shape: a fallback game (no registry entry) never reaches
 * for it, and truco's own entry treats an absent field the same as `null`
 * (match still in progress) — never a crash on an older/partial payload. */
export interface GameUiPayload {
  readonly view: unknown;
  readonly legalActions: readonly unknown[];
  readonly outcome?: unknown;
}

export interface GameUiEntry {
  readonly id: GameId;
  /** A fresh renderer per match: `createMatchTableRenderer` closes over
   * small per-mount state (the trick-outcome banner) that must not leak
   * between two different matches sharing one widget session. `onPlayAgain`
   * is optional: the fallback "connection is live" path has nowhere to
   * return to and never renders a match-over overlay in the first place. */
  createRenderer(): (container: HTMLElement, payload: GameUiPayload, dispatch: (action: unknown) => void, onPlayAgain?: () => void) => void;
}

/**
 * `apps/widget-app`'s own `GameUiRegistry` (design §5: "rendering is
 * deliberately OUTSIDE the contract"), the UI-side mirror of
 * `platform-core/registry.ts`'s `GameModuleRegistry` — an L3 composition
 * root is exactly where knowing a specific game's id is allowed. Truco is
 * the only entry today; a second game adds one more entry here, never a
 * change to `main.ts`'s own composition logic.
 */
const trucoEntry: GameUiEntry = {
  id: "truco-argentino" as GameId,
  createRenderer() {
    const render = createMatchTableRenderer();
    return (container, payload, dispatch, onPlayAgain) => {
      render(container, payload.view as PlayerView, payload.legalActions as readonly Action[], (action) => dispatch(action), {
        outcome: (payload.outcome ?? null) as { readonly winnerIds: readonly PlayerId[] } | null,
        onPlayAgain,
      });
    };
  },
};

export interface GameUiRegistry {
  get(gameId: GameId): GameUiEntry | undefined;
}

export function createGameUiRegistry(): GameUiRegistry {
  const byId = new Map<GameId, GameUiEntry>([[trucoEntry.id, trucoEntry]]);
  return { get: (gameId) => byId.get(gameId) };
}
