import { DIE_FACES } from "./dice.js";
import type { DieFace, Player } from "./state.js";

/**
 * A bid over the table's dice (SDD `mentiroso`, work unit A3, design D2):
 * "at least `quantity` dice on the table show `face`". Ordering, never a
 * scored quantity — comparisons between two bids are LEXICOGRAPHIC over
 * `(quantity, face)`, never a sum of the two fields (see `raisesFrom` below).
 *
 * `state: MatchState` is design D2's eventual signature for the functions
 * below, but `MatchState` does not exist yet — `state.ts` (work unit A2)
 * deliberately deferred `Phase`/`MatchState` to work unit 2.1, once this
 * file's own `Bid` exists for `Phase.bidding` to reference. Until then,
 * `totalDice`/`ceilingFor` take `players` directly, mirroring `seating.ts`'s
 * own already-reviewed `nextActiveSeat(players, fromSeat)` shape exactly —
 * not a new convention, the SAME one this package already established.
 * Adopting these into a `MatchState`-shaped call is work unit 2.1/2.2's job.
 */
export interface Bid {
  readonly quantity: number;
  readonly face: DieFace;
}

/** The highest face a die can show — read off `DIE_FACES`, never restated as
 * a literal `6`, so "a die has six faces" stays declared in exactly one
 * place (the same discipline `generala-engine/src/dice.ts` documents for its
 * own `DIE_FACES`). `DIE_FACES` is non-empty by construction, so the last
 * element is always defined. */
const HIGHEST_FACE: DieFace = DIE_FACES[DIE_FACES.length - 1]!;

/**
 * How many dice remain on the table, across every seat, live or eliminated.
 *
 * An eliminated seat's `dice` array is empty (design D1: "eliminated" is
 * `dice.length === 0`, never a separate stored flag), and an empty array
 * contributes zero to this sum with no separate "still playing" filter
 * needed — the same derive-from-the-one-field discipline `nextActiveSeat`
 * already applies to the identical field.
 */
export function totalDice(players: readonly Player[]): number {
  return players.reduce((sum, player) => sum + player.dice.length, 0);
}

/**
 * The moving ceiling (design D2): `(total dice on the table, 6)`.
 *
 * DERIVED every time from `players`, never stored anywhere — the
 * no-stored-derivable-field convention this package's own `state.ts`
 * docblock already argues for `Player.dice.length === 0`, applied here to
 * the table-wide total instead of a single seat. It starts at 30 for a fresh
 * six-seat table (six seats of five dice) and shrinks by exactly one every
 * time any seat surrenders a die — never a fixed constant, per the
 * ruleset's own worked example ("con dos jugadores de un dado cada uno el
 * tope es «dos seises»").
 */
export function ceilingFor(players: readonly Player[]): Bid {
  return { quantity: totalDice(players), face: HIGHEST_FACE };
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
