import type { Player } from "./state.js";

/**
 * Turn advance with a skip (design D1).
 *
 * A straight-line `for` bounded by `players.length` — deliberately, the same
 * "the loop bound IS the count" argument `generala-module/roll.ts`'s own
 * bounded `for (let die = 0; die < rethrown; die += 1)` makes for its re-roll
 * budget: the walk structurally cannot run away, so there is no separate
 * liveness condition that could be gotten wrong. `step` runs from 1 through
 * `seatCount` INCLUSIVE, so the last step lands back on `fromSeat` itself —
 * that is what closes the "only one seat left" case by the loop bound, not
 * by a separate check.
 *
 * Exported and consumed by nothing yet (SDD `mentiroso` work unit A2): the
 * round reducer that will call this from `apply.ts` does not exist until
 * Phase 2 of `sdd/mentiroso/tasks`.
 *
 * @param players every seat at the table, in ANY order — looked up by
 *   `.seat`, never by array index, the identical lookup
 *   `escoba-engine/src/capture.ts`'s own `nextSeat` performs against its own
 *   unordered array. `players` always covers every seat from 0 to
 *   `players.length - 1` exactly once (seats never shrink, design D1), so the
 *   lookup is asserted non-null rather than defended against — the same
 *   invariant-backed `!` that capture.ts's own lookup uses.
 * @param fromSeat the seat whose next ACTIVE seat is wanted. A seat holding
 *   zero dice is a perfectly valid `fromSeat` — the seat that JUST lost its
 *   last die is exactly who calls this in the showdown reducer.
 * @returns the seat number of the next seat still holding at least one die.
 *   Returns `fromSeat` itself when it is the only seat left holding dice.
 * @throws if no seat at the table holds any dice — an invariant violation
 *   that must never occur during normal play (the match ends the instant one
 *   seat remains; see `mentiroso-rules`'s "last seat standing" scenario),
 *   named explicitly here rather than looping forever or returning an
 *   arbitrary seat.
 */
export function nextActiveSeat(players: readonly Player[], fromSeat: number): number {
  const seatCount = players.length;
  for (let step = 1; step <= seatCount; step += 1) {
    const candidateSeat = (fromSeat + step) % seatCount;
    const candidate = players.find((player) => player.seat === candidateSeat)!;
    if (candidate.dice.length > 0) return candidateSeat;
  }
  throw new Error(
    `nextActiveSeat: no seat holds any dice among ${String(seatCount)} seats — every seat is eliminated, which must never happen during normal play`,
  );
}

/**
 * The mirror walk of `nextActiveSeat` above (SDD `mentiroso`, work unit
 * B4/task 2.4): the active seat whose NEXT active seat is `fromSeat`.
 *
 * `showdown.ts`'s own `applyDoubt` needs this to attribute the current bid to
 * a SEAT: `Phase.bidding` deliberately carries only `turnSeat` (whoever acts
 * next) and `bid`, never the seat that PLACED that bid — the same
 * no-stored-derivable-field convention this package already follows for
 * `Player.dice.length === 0` (elimination) and `bids.ts`'s own `ceilingFor`
 * (the moving ceiling). Since `nextActiveSeat` is a bijection over the set of
 * currently active seats (a cyclic rotation of that set, never a partial
 * map), the bidder's seat is the UNIQUE active seat this walk lands on.
 *
 * Same bounded straight-line `for` as `nextActiveSeat`, walking backward
 * instead of forward — `step` runs from 1 through `seatCount` INCLUSIVE for
 * the identical reason: the walk structurally cannot run away, and the last
 * step closes the "only one seat left" case by the loop bound itself.
 *
 * @param players every seat at the table, in ANY order — looked up by
 *   `.seat`, never by array index, identically to `nextActiveSeat`.
 * @param fromSeat the seat whose previous ACTIVE seat is wanted.
 * @returns the seat number of the previous seat still holding at least one
 *   die. Returns `fromSeat` itself when it is the only seat left holding
 *   dice.
 * @throws if no seat at the table holds any dice — the identical invariant
 *   `nextActiveSeat` guards, named explicitly here rather than looping
 *   forever or returning an arbitrary seat.
 */
export function previousActiveSeat(players: readonly Player[], fromSeat: number): number {
  const seatCount = players.length;
  for (let step = 1; step <= seatCount; step += 1) {
    const candidateSeat = ((fromSeat - step) % seatCount + seatCount) % seatCount;
    const candidate = players.find((player) => player.seat === candidateSeat)!;
    if (candidate.dice.length > 0) return candidateSeat;
  }
  throw new Error(
    `previousActiveSeat: no seat holds any dice among ${String(seatCount)} seats — every seat is eliminated, which must never happen during normal play`,
  );
}
