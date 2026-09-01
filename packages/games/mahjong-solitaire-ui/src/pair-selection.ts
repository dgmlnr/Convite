/**
 * WHAT TWO PRESSES MEAN — the whole of this game's interaction, as
 * arithmetic over a list.
 *
 * A mahjong solitaire has exactly one verb: take these two tiles off. A
 * press on its own is therefore not a move, it is half of one, and the rule
 * that decides which half — and what happens when the second half does not
 * arrive — is a real decision with real wrong answers. It lives here, DOM-free
 * and beside its own tests, for the same reason `chronometer.ts` and
 * `match-over.ts` do: a rule that is only reachable through a rendered board
 * can only be checked through a rendered board.
 *
 * IT CONSULTS ITS TWO INPUTS AND STATES NO RULE OF ITS OWN. Which faces match
 * is the engine's answer, on the payload as `legalActions`; which tiles are
 * reachable is the engine's answer too, handed in as `liftable` by whoever
 * holds the board (`liftable.ts` derives it, and explains why it is derived
 * rather than sent). This file never computes either, and never decides that
 * a tile "should" be liftable. What it adds is the part that is not a rule at
 * all: remembering one press until the next one lands, and saying what a
 * press that completes nothing does to it.
 *
 * THIS IS `escoba-ui`'s `createMarkThenPlay` SHAPE, one game over. That
 * package owns "mark the cards, then play the one that captures them" for the
 * same reason: the composition root wires, it does not decide.
 *
 * IT IS A PURE FUNCTION AND HOLDS NO STATE. The selection belongs to whoever
 * is drawing the board — it dies with the board, is cleared by a move, and
 * must not survive a new deal — so the caller keeps it and this answers what
 * to do with it. A closure holding the selection here would be a second
 * record of what is on screen, which is the arrangement `board.ts`'s own
 * docblock already refuses.
 */

/**
 * Two layout positions the engine has offered as a legal removal.
 *
 * Structurally the engine's own `RemovePairAction` minus its `type` and its
 * `playerId`, and deliberately not that type imported: this file has no use
 * for who is playing, and a parameter shaped like the action would invite a
 * caller to hand back a whole action it never checked.
 *
 * `a < b` in every offer the engine emits, which is a promise this file
 * CONSUMES rather than restates — see `resolvePress`.
 */
export interface MahjongPair {
  readonly a: number;
  readonly b: number;
}

/**
 * What a press does. Three outcomes and no fourth: a press either starts a
 * move, finishes one, or comes to nothing.
 *
 * `"clear"` covers three different situations on purpose — pressing the felt,
 * pressing a tile nothing can be done with, and pressing the selected tile
 * again — because they are the same thing to a player: whatever was lit up
 * stops being lit up. Splitting them would put a distinction in the type that
 * nothing downstream could act on differently.
 */
export type PairSelectionMove =
  | { readonly kind: "select"; readonly position: number }
  | { readonly kind: "clear" }
  | { readonly kind: "play"; readonly pair: MahjongPair };

const CLEAR: PairSelectionMove = { kind: "clear" };

/**
 * The move a press makes, given what was already selected, which tiles the
 * player may lift, and what the engine is currently offering.
 *
 * SELECTION IS ABOUT REACH, REMOVAL IS ABOUT MATCHING, AND THE TWO INPUTS ARE
 * NOT INTERCHANGEABLE. This function used to gate the first press on
 * `legalActions` — "does some offer name this tile" — which is the wrong
 * question asked of the wrong list. `legalActions` names PAIRS, so a tile
 * that is perfectly free with no free twin appears in none of them, and the
 * board answered a press on it with the same nothing it answers a buried tile
 * with. Two independent facts, one silence, and the player left to guess
 * which: reported from real play on the 1-of-bamboo, twice, before the cause
 * was the code rather than the board. `liftable` is now the first press's own
 * authority and the offer list is only ever consulted to complete a pair.
 *
 * THE ANSWER CARRIES THE OFFER'S OWN PAIR, NOT THE TWO POSITIONS PRESSED, and
 * that is not tidiness. The engine promises `a < b` on every action it emits
 * and `applyAction` accepts a removal only if it matches an offered pair
 * EXACTLY — slice 5 found that the expensive way, when a generator recording
 * its own steps in the order it chose them had half its moves refused by a
 * module whose every unit test passed. Returning the offer means the caller
 * cannot reintroduce that defect by dispatching the presses in the order they
 * happened.
 *
 * A SECOND PRESS THAT DOES NOT COMPLETE A PAIR CLEARS BOTH, with no
 * exception for a tile that could have started a selection of its own. The
 * earlier rule re-selected in that case, on the reasoning that "I meant that
 * other one" is the ordinary intent; it reads differently now that every
 * reachable tile is selectable, because the set of tiles a second press can
 * land on has grown to include every free tile on the board. A miss that
 * silently becomes a new selection would leave the player holding a mark they
 * did not ask for, and — worse — looking at a board that changed in response
 * to a press they meant as a question about the pair. Going dark says "those
 * two do not go together" in the one vocabulary this board has.
 */
export function resolvePress(
  selected: number | null,
  pressed: number,
  legal: readonly MahjongPair[],
  liftable: ReadonlySet<number>,
): PairSelectionMove {
  if (selected === pressed) return CLEAR;

  if (selected !== null) {
    const offered = legal.find((pair) => (pair.a === selected && pair.b === pressed) || (pair.a === pressed && pair.b === selected));
    return offered === undefined ? CLEAR : { kind: "play", pair: offered };
  }

  return liftable.has(pressed) ? { kind: "select", position: pressed } : CLEAR;
}
