import type { GameId } from "@hexdev/platform-contract";
import type { Action, PlayerId, PlayerView } from "@hexdev/truco-engine";
import { DECK_ATTRIBUTION, createMatchTableRenderer } from "@hexdev/truco-ui";

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
  /** The absolute instant the seat on the clock runs out of turn time, or
   * `null` when nothing is being timed (`MatchRoom.viewMessageFor`). Optional
   * and nullable on the same terms as `outcome` above: a fallback game never
   * reaches for it, and an older or partial payload that simply lacks the
   * field renders an untimed table rather than crashing. */
  readonly turnDeadline?: number | null;
  /** The partner's private answer to a consult, and whether one is in flight.
   * Rides on the payload rather than on the view because it never travels IN
   * a view: `MatchRoom` sends it to the asking client alone, and a redacted
   * view able to carry it would carry it to everyone. Optional for the same
   * reason `turnDeadline` is — an older payload simply has no answer to
   * report, which renders a table with no question outstanding. */
  readonly consult?: { readonly advice: "quiero" | "no-quiero" | null; readonly asking: boolean };
}

/**
 * Something this widget must credit in order to ship it.
 *
 * GAME-AGNOSTIC ON PURPOSE, even though today every entry is the same deck.
 * The shell has no business knowing that truco draws Spanish cards — that is
 * exactly the knowledge `GameUiEntry` exists to keep on the game's side — so
 * a game DECLARES what its rendering owes and the shell only knows how to
 * display a credit. Structurally identical to spanish-deck-ui's
 * `DeckAttribution` because CC BY-SA is what shapes both: author, a link to
 * the license, and a statement that changes were made.
 */
export interface AssetCredit {
  readonly author: string;
  readonly sourceUrl: string;
  readonly licenseName: string;
  readonly licenseUrl: string;
  readonly changes: string;
}

export interface GameUiEntry {
  readonly id: GameId;
  /** What this game's rendering must credit. Optional: a game that draws
   * nothing licensed owes nothing, and an empty list must not become a
   * ceremony every future entry has to perform. */
  readonly credits?: readonly AssetCredit[];
  /** A fresh renderer per match: `createMatchTableRenderer` closes over
   * small per-mount state (the trick-outcome banner) that must not leak
   * between two different matches sharing one widget session. `onPlayAgain`
   * is optional: the fallback "connection is live" path has nowhere to
   * return to and never renders a match-over overlay in the first place. */
  createRenderer(): (
    container: HTMLElement,
    payload: GameUiPayload,
    dispatch: (action: unknown) => void,
    onPlayAgain?: () => void,
    onLeaveMatch?: () => void,
  ) => void;
}

/**
 * `apps/widget-app`'s own `GameUiRegistry` (design §5: "rendering is
 * deliberately OUTSIDE the contract"), the UI-side mirror of
 * `platform-core/registry.ts`'s `GameModuleRegistry` — an L3 composition
 * root is exactly where knowing a specific game's id is allowed. Truco is
 * the only entry today; a second game adds one more entry here, never a
 * change to `main.ts`'s own composition logic.
 */
/** Shared factory: `createMatchTableRenderer` is already seat-count generic
 * (it derives `seatCount` from `view.teammates.length + view.opponents.length
 * + 1`, per `truco-ui/table.ts`) — the 1v1 and 2v2 entries below reuse the
 * EXACT same rendering function, never a second, 2v2-specific renderer. */
function createTrucoRenderer(): GameUiEntry["createRenderer"] {
  return () => {
    const render = createMatchTableRenderer();
    return (container, payload, dispatch, onPlayAgain, onLeaveMatch) => {
      render(
        container,
        payload.view as PlayerView,
        payload.legalActions as readonly Action[],
        (action) => dispatch(action),
        {
          outcome: (payload.outcome ?? null) as { readonly winnerIds: readonly PlayerId[] } | null,
          onPlayAgain,
        },
        payload.turnDeadline ?? null,
        // Two different departures, deliberately NOT the same callback:
        // `onPlayAgain` fires on a match that is already over, while this one
        // abandons a match still in progress and has to tell the server so
        // (MatchConnection.quit) — otherwise the table sits out the full
        // reconnection window waiting for someone who chose to leave.
        onLeaveMatch,
        payload.consult,
      );
    };
  };
}

const trucoEntry: GameUiEntry = { id: "truco-argentino" as GameId, createRenderer: createTrucoRenderer(), credits: [DECK_ATTRIBUTION] };

/** The 2v2 game-ui entry — additive, registered under its own distinct
 * `gameId` (matching `truco-module`'s own `trucoModule2v2.id`), never a
 * branch inside `trucoEntry`. Without this entry, a 2v2 match would connect
 * successfully over the wire but fall back to the generic "connection is
 * live" placeholder (`main.ts`'s own `enterMatch` fallback) instead of the
 * real table — found running an actual 2v2 match end to end, not assumed. */
const trucoEntry2v2: GameUiEntry = { id: "truco-argentino-2v2" as GameId, createRenderer: createTrucoRenderer(), credits: [DECK_ATTRIBUTION] };

export interface GameUiRegistry {
  get(gameId: GameId): GameUiEntry | undefined;
}

export function createGameUiRegistry(): GameUiRegistry {
  const byId = new Map<GameId, GameUiEntry>([
    [trucoEntry.id, trucoEntry],
    [trucoEntry2v2.id, trucoEntry2v2],
  ]);
  return { get: (gameId) => byId.get(gameId) };
}

/**
 * Every credit this widget owes, once each.
 *
 * DEDUPED BY LICENSE URL AND AUTHOR, which is what actually identifies an
 * obligation: both truco entries draw the same deck, and two identical
 * credits stacked on one screen reads as a bug rather than as diligence. The
 * moment a second game ships its own art the list grows on its own.
 *
 * A CONSTANT AND NOT A REGISTRY METHOD, deliberately: the credit surface
 * lives on the game-selection screen, which is rendered before any game is
 * chosen and receives no registry. Threading one through that signature to
 * reach a static fact would be a worse trade than exporting the fact.
 */
export const GAME_UI_CREDITS: readonly AssetCredit[] = (() => {
  const seen = new Map<string, AssetCredit>();
  for (const entry of [trucoEntry, trucoEntry2v2]) {
    for (const credit of entry.credits ?? []) seen.set(`${credit.author}|${credit.licenseUrl}`, credit);
  }
  return [...seen.values()];
})();
