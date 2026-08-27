import type { GameId } from "@hexdev/platform-contract";
import type { ConsultAskMessage } from "@hexdev/transport-colyseus-client";
import type { Action, PlayerId, PlayerView } from "@hexdev/truco-engine";
import { DECK_ATTRIBUTION, HERO_CARDS, HERO_TITLE, createMatchTableRenderer } from "@hexdev/truco-ui";

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
   * report, which renders a table with no question outstanding. `from` is
   * `null` while `asking` (no answer yet) and mirrors `MatchConnection`'s own
   * widened `onConsultAdvice` payload otherwise — spec: "Provenance Is
   * Disclosed to the Asker". */
  readonly consult?: {
    readonly advice: "quiero" | "no-quiero" | null;
    readonly asking: boolean;
    readonly from: "partner" | "fallback" | null;
  };
  /** The public per-seat consult signal every seat's own view carries while a
   * consult is open (design D5/D8) — only `askerSeat` and `deadline`, enough
   * for the turn badge to replace its text. Sourced directly from the "view"
   * message's own sibling field, the same as `turnDeadline` above; no local
   * state involved. `null`/absent means no consult is open for any seat. */
  readonly pendingConsult?: { readonly askerSeat: number; readonly deadline: number } | null;
  /** This seat's OWN incoming question, when it is the one being asked
   * (design D5: "the PARTNER's client alone"). Never part of the view for
   * the same reason `consult` above is not — it travels on its own private
   * channel (`MatchConnection.onConsultAsk`) and is threaded onto the
   * payload the same way `consult` already is for the asker's side. */
  readonly consultAsk?: ConsultAskMessage | null;
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
  readonly changes: readonly string[];
}

export interface GameUiEntry {
  readonly id: GameId;
  /** What this game's rendering must credit. Optional: a game that draws
   * nothing licensed owes nothing, and an empty list must not become a
   * ceremony every future entry has to perform. */
  readonly credits?: readonly AssetCredit[];
  /** Image urls this game offers the front door, in the order to lay them
   * out. Same seam and same reason as `credits`: the shell is game-agnostic,
   * so a game says what represents it and the shell only knows how to show
   * it. Optional — a game with nothing to show gets a lobby with no hero,
   * which is a lobby and not a hole. */
  readonly hero?: readonly string[];
  /** What this game calls itself on the front door — see `hero`. */
  readonly heroTitle?: string;
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
        // Slice 4a wired the badge takeover into the renderer's own
        // signature but never threaded THIS payload field into the call —
        // found in Slice 4b, since nothing forwarding it meant the badge
        // could never reach a real match even though every browser test that
        // calls the renderer directly kept passing.
        payload.pendingConsult,
        payload.consultAsk == null ? null : { about: payload.consultAsk.about, options: payload.consultAsk.options as readonly ("quiero" | "no-quiero")[] },
        // The mirror of `(action) => dispatch(action)` above, on the
        // PARTNER's side: routed through the SAME widget-level `dispatch`
        // (which already special-cases "consult-answer", Slice 3), but
        // through a genuinely DIFFERENT function reference than the one the
        // real action bar's own buttons call — the package-level half of
        // `truco-ui`'s own structural isolation (design D10, belt and
        // braces).
        (answer, about) => dispatch({ type: "consult-answer", about, answer }),
      );
    };
  };
}

const trucoEntry: GameUiEntry = { id: "truco-argentino" as GameId, createRenderer: createTrucoRenderer(), credits: [DECK_ATTRIBUTION], hero: HERO_CARDS, heroTitle: HERO_TITLE };

/** The 2v2 game-ui entry — additive, registered under its own distinct
 * `gameId` (matching `truco-module`'s own `trucoModule2v2.id`), never a
 * branch inside `trucoEntry`. Without this entry, a 2v2 match would connect
 * successfully over the wire but fall back to the generic "connection is
 * live" placeholder (`main.ts`'s own `enterMatch` fallback) instead of the
 * real table — found running an actual 2v2 match end to end, not assumed. */
const trucoEntry2v2: GameUiEntry = { id: "truco-argentino-2v2" as GameId, createRenderer: createTrucoRenderer(), credits: [DECK_ATTRIBUTION], hero: HERO_CARDS, heroTitle: HERO_TITLE };

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
/**
 * The front door's images: the first registered game that offers any.
 *
 * FIRST, not merged. Two games' hero art side by side is a catalogue, and a
 * catalogue is what the grid below the header already is — the hero's job is
 * to say what KIND of place this is, once, before anybody reads a word.
 */
/** The name over the door, from the same game that supplied its images — so
 * the title and the cards under it can never come from two different games. */
export const GAME_UI_HERO_TITLE: string | undefined = [trucoEntry, trucoEntry2v2].find((entry) => (entry.hero ?? []).length > 0)?.heroTitle;

export const GAME_UI_HERO: readonly string[] = [trucoEntry, trucoEntry2v2].find((entry) => (entry.hero ?? []).length > 0)?.hero ?? [];

export const GAME_UI_CREDITS: readonly AssetCredit[] = (() => {
  const seen = new Map<string, AssetCredit>();
  for (const entry of [trucoEntry, trucoEntry2v2]) {
    for (const credit of entry.credits ?? []) seen.set(`${credit.author}|${credit.licenseUrl}`, credit);
  }
  return [...seen.values()];
})();
