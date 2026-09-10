import { DIE_FACES } from "./dice.js";
import type { Bid, DieFace, MatchState } from "./state.js";

/**
 * Bid-related FUNCTIONS only (SDD `mentiroso`, work unit A3, design D2):
 * `totalDice`, `ceilingFor`, `raisesFrom`. The `Bid` TYPE itself moved to
 * `state.ts` in work unit 2.1 — see that file's own top docblock for why
 * (its `Phase` union needs `Bid`, and importing it back from here would be a
 * two-file cycle) — and is re-imported here, unchanged.
 */

/** The highest face a die can show — read off `DIE_FACES`, never restated as
 * a literal `6`, so "a die has six faces" stays declared in exactly one
 * place (the same discipline `generala-engine/src/dice.ts` documents for its
 * own `DIE_FACES`). `DIE_FACES` is non-empty by construction, so the last
 * element is always defined. */
const HIGHEST_FACE: DieFace = DIE_FACES[DIE_FACES.length - 1]!;

/**
 * How many dice remain on the table, across every seat, live or eliminated.
 *
 * Takes `state: MatchState`, not `players` directly, as of work unit 2.1:
 * `sdd/mentiroso/design`'s own Interfaces section always specified
 * `ceilingFor(state: MatchState): Bid` — work unit A3 took `players` only
 * because `MatchState` did not exist yet (`state.ts`'s own prior docblock
 * said so explicitly), and this is that adoption, reconciled the same commit
 * `MatchState` was defined rather than left for a later unit to notice.
 * `raisesFrom` below is UNAFFECTED by this change: it never took `players`
 * or `state` in the first place, only two already-computed `Bid`s.
 *
 * An eliminated seat's `dice` array is empty (design D1: "eliminated" is
 * `dice.length === 0`, never a separate stored flag), and an empty array
 * contributes zero to this sum with no separate "still playing" filter
 * needed — the same derive-from-the-one-field discipline `nextActiveSeat`
 * already applies to the identical field.
 */
export function totalDice(state: MatchState): number {
  return state.players.reduce((sum, player) => sum + player.dice.length, 0);
}

/**
 * The moving ceiling (design D2): `(total dice on the table, 6)`.
 *
 * DERIVED every time from `state`, never stored anywhere — the
 * no-stored-derivable-field convention this package's own `state.ts`
 * docblock already argues for `Player.dice.length === 0`, applied here to
 * the table-wide total instead of a single seat. It starts at 30 for a fresh
 * six-seat table (six seats of five dice) and shrinks by exactly one every
 * time any seat surrenders a die — never a fixed constant, per the
 * ruleset's own worked example ("con dos jugadores de un dado cada uno el
 * tope es «dos seises»").
 */
export function ceilingFor(state: MatchState): Bid {
  return { quantity: totalDice(state), face: HIGHEST_FACE };
}

/**
 * Every legal raise from `bid`, bounded above by `ceiling` (design D2).
 *
 * `bid === null` models the OPENING bid of a bidding phase: there is nothing
 * yet to be strictly greater than, so every `(quantity, face)` pair with
 * `quantity` from 1 through `ceiling.quantity` is offered — quantity can
 * never be zero, since "zero dice show this face" bids nothing.
 *
 * Otherwise, a legal raise must be STRICTLY GREATER than `bid` in
 * lexicographic order over `(quantity, face)` (mentiroso-rules): a HIGHER
 * quantity with ANY face (even a lower one — the two dimensions are
 * independent), OR the SAME quantity with a strictly HIGHER face. A lower
 * quantity is never legal regardless of face, which is why the loop below
 * never visits any quantity below `bid.quantity` at all rather than
 * generating and then filtering it out.
 *
 * At the ceiling itself (`bid` already equals `ceiling`), this returns an
 * EMPTY array: the loop's only quantity is `ceiling.quantity` itself, and
 * every face at that quantity is already at or below `bid.face` (`6`, the
 * highest face there is) — so nothing passes. That empty result is this
 * unit's own fenced mechanism: the ceiling forces exactly the "doubt" action
 * downstream (`legal-actions.ts`, work unit B2) by leaving zero raises on
 * the table, never by a separate check bolted on afterward.
 */
export function raisesFrom(bid: Bid | null, ceiling: Bid): readonly Bid[] {
  const raises: Bid[] = [];
  const minQuantity = bid === null ? 1 : bid.quantity;
  for (let quantity = minQuantity; quantity <= ceiling.quantity; quantity += 1) {
    for (const face of DIE_FACES) {
      if (bid !== null && quantity === bid.quantity && face <= bid.face) continue;
      raises.push({ quantity, face });
    }
  }
  return raises;
}
