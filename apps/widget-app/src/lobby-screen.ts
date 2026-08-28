import type { GameFamilyId, GameId } from "@hexdev/platform-contract";
import type { GameFamily } from "./game-families.js";

/** Which of the two screens is open: the list of games, or one game. */
export type LobbyView = { readonly kind: "families" } | { readonly kind: "game"; readonly family: GameFamily };

export interface LobbyScreen {
  current(): LobbyView;
  open(familyId: GameFamilyId): void;
  back(): void;
  /** Whether a back control should be RENDERED — not disabled. */
  canGoBack(): boolean;
  /** Whether a presence broadcast about this game should repaint anything. */
  affects(gameId: GameId): boolean;
}

/**
 * Which screen is open, and nothing else.
 *
 * A FACTORY AND A CLOSURE, following `createDepartureGate` — not the
 * container-keyed `WeakMap`s `game-screen.ts` uses. Those exist because that
 * module's exported function re-enters ITSELF and has no scope to hold state
 * in. This is constructed once, in `main.ts`'s `renderSelection` scope beside
 * the departure gate, and a presence rebuild only ever READS it. One variable
 * is the whole state.
 *
 * IT ANSWERS QUESTIONS RATHER THAN EXPOSING THE VARIABLE, which is why
 * `canGoBack` and `affects` live here. `main.ts` carries a rule in its own
 * docblock — composition stays, decisions leave — and "should there be a back
 * button" and "does this broadcast concern the open screen" are decisions. A
 * boolean read at the call site is composition; the same `if` written there
 * would not be.
 */
export function createLobbyScreen(families: readonly GameFamily[]): LobbyScreen {
  // The ONLY state. Everything else derives from `families`, which is fixed
  // for the session: a tenant's entitlements do not change under a player.
  let opened: GameFamilyId | undefined = families.length === 1 ? families[0]!.id : undefined;

  const found = (id: GameFamilyId | undefined): GameFamily | undefined => (id === undefined ? undefined : families.find((family) => family.id === id));

  return {
    current: () => {
      const family = found(opened);
      return family === undefined ? { kind: "families" } : { kind: "game", family };
    },
    // Ignores a family this tenant does not have, rather than opening an
    // empty screen: the id comes from a rendered card, so an unknown one
    // means the catalog moved under the render, and showing the list again
    // is the honest answer.
    open: (familyId) => {
      if (found(familyId) !== undefined) opened = familyId;
    },
    // A single-family tenant never returns to a list it never saw, so `back`
    // is inert there rather than special-cased at the call site.
    back: () => {
      if (families.length > 1) opened = undefined;
    },
    canGoBack: () => families.length > 1 && found(opened) !== undefined,
    // While the list is open, no game's waiting-count is on screen, so a
    // broadcast about one has nothing to repaint. The COUNT is still stored
    // by `main.ts` either way — only the repaint is gated, so opening a game
    // shows a current number rather than waiting for the next broadcast.
    affects: (gameId) => {
      const family = found(opened);
      return family !== undefined && family.entries.some((entry) => entry.id === gameId);
    },
  };
}
