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
 * IT CONSULTS THE OFFER LIST AND STATES NO RULE OF ITS OWN. Which tiles are
 * free and which faces match is the engine's answer, already computed and
 * already on the payload as `legalActions` — this file never recomputes it,
 * never re-derives freedom, and never decides that a tile "should" be
 * liftable. What it adds is the part that is not a rule at all: remembering
 * one press until the next one lands.
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

/** Whether any offer names this position at all — "can this tile be lifted,
 * with anything". A tile with no partner is not a candidate for a selection,
 * which is what stops the board lighting up under a press that could never
 * become a move. */
function hasPartner(position: number, legal: readonly MahjongPair[]): boolean {
  return legal.some((pair) => pair.a === position || pair.b === position);
}

/**
 * The move a press makes, given what was already selected and what the engine
 * is currently offering.
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
 * A SECOND PRESS THAT DOES NOT COMPLETE A PAIR RE-SELECTS RATHER THAN
 * CLEARING, when the tile it lands on has a partner of its own. On a real
 * board a free tile usually has more than one match, so "I meant that other
 * one" is the ordinary case; making the player press twice to change their
 * mind would spend a press on undoing rather than on playing.
 */
export function resolvePress(selected: number | null, pressed: number, legal: readonly MahjongPair[]): PairSelectionMove {
  if (selected === pressed) return CLEAR;

  if (selected !== null) {
    const offered = legal.find((pair) => (pair.a === selected && pair.b === pressed) || (pair.a === pressed && pair.b === selected));
    if (offered !== undefined) return { kind: "play", pair: offered };
  }

  return hasPartner(pressed, legal) ? { kind: "select", position: pressed } : CLEAR;
}
