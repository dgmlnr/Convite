import type { MatchState, PlayerId } from "./state.js";

/**
 * Who won, once somebody has (SDD `mentiroso`, work unit B4/task 2.4).
 *
 * Shaped like `platform-contract`'s own `MatchOutcome`, which this L0 package
 * may not import — the same re-declaration `generala-engine/src/outcome.ts`
 * and `mahjong-solitaire-engine/src/board.ts` already make, for the same
 * reason and with the same shape, so a future `mentiroso-module` can hand
 * this straight back through its own `getOutcome` with no adapter.
 *
 * `winnerIds` is a list of exactly one for this ruleset (mentiroso-rules:
 * "the sole seat left holding dice MUST win the match" — a singular winner,
 * never a tie), kept as a list rather than a bare id to match the sibling
 * contract's own shape.
 */
export interface MatchOutcome {
  readonly winnerIds: readonly PlayerId[];
}

/**
 * Is this match over, and if so who won — read off `players` every time,
 * never stored (the same no-stored-derivable-field convention this
 * package's own `Player.dice.length === 0` elimination rule already follows).
 *
 * Introduced here UNCONSUMED (work unit B4): the module layer (Phase 3 of
 * `sdd/mentiroso/tasks`) is what will call this after `showdown.ts`'s own
 * `resolveShowdown` runs, mirroring `generala-module`'s own external
 * `getOutcome` checks — never baked into a reducer itself.
 *
 * THE SOLE SURVIVOR WINS (mentiroso-rules: "el que se queda sin dados sale.
 * Gana el último que queda con dados") — exactly one seat holding one or more
 * dice, and no other condition. Fewer or more than one live seat is "not
 * over yet" (or, for zero, the invariant violation `seating.ts`'s own
 * `nextActiveSeat`/`previousActiveSeat` already refuse to loop past —
 * reported here as "no winner yet" rather than thrown, since this function
 * only reports outcomes, it does not enforce invariants).
 */
export function getOutcome(state: MatchState): MatchOutcome | null {
  const liveSeats = state.players.filter((player) => player.dice.length > 0);
  if (liveSeats.length !== 1) return null;
  return { winnerIds: [liveSeats[0]!.id] };
}
