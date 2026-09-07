import { DICE_COUNT } from "./dice.js";
import type { PlayerId } from "./ids.js";
import { CATEGORY_IDS, ROLLS_PER_TURN } from "./state.js";
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
 * Every `keep` a hold may carry: 31 of them, in the one order the room accepts.
 *
 * THE SIZE IS 31 AND NEVER 32. There are 2^5 subsets of the five positions and
 * one of them — keeping all five — asks to re-roll nothing. That burns a throw
 * and changes no die, which is not a move a player can make at a real table
 * either, so it is not offered and the reducer does not accept it. `[]` is at
 * the other end and IS a move: the rulebook's explicit "re-roll all five".
 *
 * THE ORDER IS STRICTLY ASCENDING, AND THAT IS LOAD-BEARING. The walk below
 * only ever appends a HIGHER index than the one before it, so every array it
 * emits is sorted and duplicate-free by construction rather than by a sort call
 * somebody could forget. That matters because `sameAction`
 * (`match-room.ts:256-268`) decides whether a submitted action is one the game
 * offered by walking arrays BY INDEX: `keep: [1,0]` is simply not the action
 * `keep: [0,1]` is, and exactly one of the two can ever be submitted. The
 * reducer in `play.ts` accepts a hold by looking it up in THIS list, so the
 * offered set and the accepted set are the same object rather than two
 * descriptions that agree today. Escoba had the other shape — its reducer took
 * a captured subset in any order while its offer list emitted one canonical
 * order — and the gate narrowed it after the fact.
 */
export const KEEP_SETS: readonly (readonly number[])[] = enumerateKeepSets();

function enumerateKeepSets(): readonly (readonly number[])[] {
  const sets: (readonly number[])[] = [];
  const chosen: number[] = [];
  const walk = (index: number): void => {
    if (index === DICE_COUNT) {
      if (chosen.length < DICE_COUNT) sets.push([...chosen]);
      return;
    }
    chosen.push(index);
    walk(index + 1);
    chosen.pop();
    walk(index + 1);
  };
  walk(0);
  return sets;
}

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
 * THE HOLDS ARE HERE NOW, and they stop at the third throw: `rollsUsed` counts
 * throws, so once it reaches `ROLLS_PER_TURN` the only way out of the turn is a
 * box. The list therefore shrinks from 42 actions to at most 11 rather than
 * emptying, which is what keeps the seat able to end its own turn.
 *
 * WHAT IS NOT HERE YET is the `score` reducer, so a `score` offered below is an
 * offer nothing accepts until the next slice. That asymmetry with the holds is
 * deliberate and it is about `keep` being an ARRAY: the room compares actions
 * by walking arrays by index, so an offered `keep` order the reducer had not
 * yet agreed to would be inventing that agreement. A `score` has one possible
 * shape and no order to get wrong.
 *
 * The `score` list is the invariant the transport depends on:
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
  const scores = CATEGORY_IDS.filter((category) => card[category] === null).map((category) => ({ type: "score", playerId, category }) as const);
  if (turn.rollsUsed >= ROLLS_PER_TURN) return scores;

  const holds = KEEP_SETS.map((keep) => ({ type: "hold", playerId, keep }) as const);
  return [...holds, ...scores];
}
