import type { Dice } from "./dice.js";
import { DICE_COUNT } from "./dice.js";
import type { PlayerId } from "./ids.js";
import { scoreFor } from "./scoring.js";
import { CATEGORY_IDS, ROLLS_PER_TURN } from "./state.js";
import type { CategoryId, MatchState, Scorecard } from "./state.js";

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
 * The eleven boxes ordered BY WHAT THEY PAY, richest first — ruleset §Orden
 * obligatorio de tachado, the house rule added on 2026-09-09.
 *
 * A zero may only be written in the first box on this ladder that is still
 * open. Writing a value greater than zero is untouched by it: any open box,
 * whenever the seat wants. So WHEN to cross is still the player's choice and
 * WHICH box is not, which is what makes sacrificing hurt — the first crossing
 * is nearly free (`generala-doble` may never have paid anyway) and the second
 * costs the whole generala, while the cheap boxes can only be dumped once
 * everything above them is already burned.
 *
 * NOT `generala-bot`'s `SACRIFICE_ORDER`, AND THE DIVERGENCE IS DELIBERATE.
 * That ladder orders by what a box COSTS TO GIVE UP and this one by what a box
 * PAYS; for two boxes the two readings are opposite. `generala-doble` is the
 * dearest box on the card (100) and simultaneously the cheapest to lose — its
 * 100 needs five of a kind AND a generala already written above zero, so it is
 * the one box that can be worth nothing all match whatever the dice do.
 * `sixes` is the reverse: the smallest of the juegos it sits below, and the box
 * a seat minds losing most, because it is the likeliest to pay something on any
 * throw. The two ladders agree on the first rung and on nothing after it, and
 * the bot still owns WHETHER to cross rather than score small.
 *
 * EVERY BOX IS ON IT, and that is a termination requirement rather than
 * tidiness: a box missing here could never be the crossable one, so a card
 * whose every other box was spent would offer no zero at all and the turn could
 * not be ended. `legal-actions.test.ts` asserts the ladder against
 * `CATEGORY_IDS`, so a twelfth box left off reds a test instead of stranding a
 * match.
 */
export const CROSSING_ORDER: readonly CategoryId[] = [
  "generala-doble",
  "generala",
  "poker",
  "full",
  "escalera",
  "sixes",
  "fives",
  "fours",
  "threes",
  "twos",
  "ones",
];

/**
 * Whether this box may be written right now — THE ONE ANSWER, read by the offer
 * list below and by `applyScore`.
 *
 * Shared exactly as `KEEP_SETS` is shared with the hold reducer, and for the
 * identical reason: "everything the engine accepts is something the engine
 * offered" is then true by construction rather than by a test that happens to
 * find two descriptions equal today. The offer list is guidance the room gates
 * on; the reducer is the authority, and a rule living in only one of them is a
 * rule the other would break.
 *
 * The three clauses are three different facts. A filled box never reopens, zero
 * included (`state.ts`). A box worth something may always be taken, wherever it
 * sits on the ladder. Everything else is a crossing, and a crossing goes at the
 * top of the ladder or nowhere.
 *
 * WHAT IT COSTS IS ONE `scoreFor` PER BOX, and the valuation is asked of
 * `scoring.ts` rather than re-derived here: "worth nothing" is the same
 * question the preview and the bot ask, and answering it twice is how the two
 * answers come to disagree.
 */
export function mayWrite(category: CategoryId, card: Scorecard, dice: Dice, rollsUsed: number): boolean {
  if (card[category] !== null) return false;
  if (scoreFor(category, dice, rollsUsed, card) > 0) return true;
  return category === CROSSING_ORDER.find((box) => card[box] === null);
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
 * NEITHER LIST IS RESTATED FOR THE REDUCER: the holds come from `KEEP_SETS` and
 * the boxes from `mayWrite`, and `play.ts` accepts by consulting those same
 * two. "Everything the engine accepts is something it offered" is therefore
 * true by construction rather than by a test that finds two descriptions equal
 * today, which matters because the room admits a submitted action only if it
 * matches an offered one index by index.
 *
 * The `score` list is the invariant the transport depends on:
 * `deciding` always offers at least one action, because a seat only reaches
 * `deciding` with an open box and the HIGHEST-PAYING open box is always a legal
 * target — for whatever its own rule yields if that is something, and for a
 * zero if it is not (ruleset §Orden obligatorio de tachado). That is what keeps
 * the advance loop from spinning, and it is pinned in the ENGINE rather than
 * left for the bot to discover the hard way.
 *
 * The offer names the box, never its value. What a box would pay is a valuation
 * `scoreFor` already owns, and `mayWrite` asks it rather than answering it a
 * second time — answering it in two places is how the two come to disagree.
 */
export function getLegalActions(state: MatchState, playerId: PlayerId): readonly GeneralaAction[] {
  const turn = state.turn;
  if (turn.phase !== "deciding") return [];

  // Seat index IS the position in `players` (D11), so this is also the check
  // that an id belonging to no seat at this table gets nothing.
  if (state.players[turn.seat] !== playerId) return [];

  const card = state.cards[turn.seat]!;
  const scores = CATEGORY_IDS.filter((category) => mayWrite(category, card, turn.dice, turn.rollsUsed)).map((category) => ({ type: "score", playerId, category }) as const);
  if (turn.rollsUsed >= ROLLS_PER_TURN) return scores;

  const holds = KEEP_SETS.map((keep) => ({ type: "hold", playerId, keep }) as const);
  return [...holds, ...scores];
}
