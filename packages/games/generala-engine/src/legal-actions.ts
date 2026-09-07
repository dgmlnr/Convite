import type { PlayerId } from "./ids.js";
import { CATEGORY_IDS } from "./state.js";
import type { CategoryId, MatchState } from "./state.js";

/**
 * What a PLAYER may do. Rolling is not on this list and never will be: the cup
 * is the server's, materialized as a system action the transport requests when
 * this list is empty for everybody.
 *
 * `hold` carries INDICES, not faces (spec Domain B). Two dice showing 4 are
 * different physical dice, and holding "a 4" cannot say which — while holding
 * index 0 of `[4,4,2,6,1]` says it exactly.
 */
export type GeneralaAction =
  | { readonly type: "hold"; readonly playerId: PlayerId; readonly keep: readonly number[] }
  | { readonly type: "score"; readonly playerId: PlayerId; readonly category: CategoryId };

/**
 * Everything this seat may do right now — PARTIAL, and declared partial for the
 * same reason `index.ts` declares itself a partial barrel.
 *
 * WHAT IS FINAL HERE is the phase gate: who may act at all, in which phase. In
 * `awaiting-roll` and in `servida-win` NOBODY may act, including the seat whose
 * turn it is, and that emptiness is not a convenience — it is exactly what
 * makes the transport's `anySeatCanAct` read false and ask for the roll. Since
 * the room began gating submitted actions against this list, it is also what
 * makes a seated player unable to roll their own dice: an action this list does
 * not offer cannot be submitted at all.
 *
 * WHAT IS NOT HERE YET are the `hold` actions, which arrive with the reducer
 * that accepts them, in the next slice. They are held back deliberately rather
 * than stubbed: the room admits a submitted action by comparing it against this
 * list STRUCTURALLY, walking arrays by index, so `keep` has exactly one
 * accepted order and the offer list and the reducer must agree on it by
 * construction. Emitting an order here that the reducer did not yet exist to
 * accept would be inventing that agreement instead of proving it.
 *
 * The `score` list IS here, and it is the invariant the transport depends on:
 * `deciding` always offers at least one action, because a seat only reaches
 * `deciding` with an open box, and every open box is a legal target evaluating
 * to whatever its own rule yields — zero included. That is what keeps the
 * advance loop from spinning, and it is pinned in the ENGINE rather than left
 * for the bot to discover the hard way.
 *
 * The offer names the box, never its value. What a box would pay is a valuation
 * `scoreFor` already owns, and answering it in two places is how the two come
 * to disagree.
 */
export function getLegalActions(state: MatchState, playerId: PlayerId): readonly GeneralaAction[] {
  const turn = state.turn;
  if (turn.phase !== "deciding") return [];

  // Seat index IS the position in `players` (D11), so this is also the check
  // that an id belonging to no seat at this table gets nothing.
  if (state.players[turn.seat] !== playerId) return [];

  const card = state.cards[turn.seat]!;
  return CATEGORY_IDS.filter((category) => card[category] === null).map((category) => ({ type: "score", playerId, category }) as const);
}
