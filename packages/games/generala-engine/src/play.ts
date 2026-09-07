import { KEEP_SETS } from "./legal-actions.js";
import type { GeneralaAction } from "./legal-actions.js";
import { ROLLS_PER_TURN } from "./state.js";
import type { MatchState } from "./state.js";
import { reject } from "./violation.js";
import type { ApplyResult } from "./violation.js";

/**
 * What a seat chose, as opposed to what the server threw.
 *
 * PARTIAL, and declared partial for the same reason `index.ts` and
 * `legal-actions.ts` are: the `score` reducer that ends a turn arrives in the
 * next slice. `roll.ts` stays where it is and does not move in here — its whole
 * argument is that it takes no actor at all, and a file holding both would have
 * one reducer that checks a playerId sitting beside one that must not have one
 * to check.
 */
export type HoldAction = Extract<GeneralaAction, { type: "hold" }>;

/** Array equality the way the room's `sameAction` does it: by index. */
function sameKeep(submitted: readonly number[], offered: readonly number[]): boolean {
  return submitted.length === offered.length && submitted.every((index, position) => index === offered[position]);
}

/**
 * Set the dice aside that the player is keeping, and hand the rest back to the
 * cup.
 *
 * A hold does not roll anything. It moves the turn from `deciding` to
 * `awaiting-roll` with the kept faces in their own slots and `null` everywhere
 * else, which is exactly the state `requestSystemAction` reads to decide how
 * many values to draw and `applyRoll` reads to splice them back. `rollsUsed` is
 * carried across UNCHANGED: it counts throws, and the throw has not happened
 * yet. Incrementing it here would give the player two rolls instead of three.
 *
 * THE HOLD IS ACCEPTED BY LOOKING IT UP IN THE OFFER LIST, not by re-deriving
 * the rules that built it. `KEEP_SETS` is the same value `getLegalActions`
 * emits, so "every hold the engine accepts is a hold the engine offered" is
 * true by construction rather than by a test that happens to find them equal
 * today. That closes both directions at once: an offer the reducer refused
 * would be unplayable, and an acceptance the offer list never emitted would be
 * unreachable through the room, since the room admits a submitted action only
 * if it matches an offered one INDEX BY INDEX (`match-room.ts:256-268`). It is
 * also what makes every malformed shape the spec names — a repeated index, an
 * index off the end, a negative one, a fractional one, the right indices in the
 * wrong order — one refusal rather than five hand-written checks that could
 * each be forgotten.
 *
 * `no-rolls-left` is deliberately NOT that refusal. `keep: [0]` at the end of a
 * turn is a perfectly well-formed hold; what is gone is the throw it was asking
 * for, and a caller switching on the code should be able to tell "you cannot
 * say that" from "you cannot do that now".
 */
export function applyHold(state: MatchState, action: HoldAction): ApplyResult {
  const turn = state.turn;
  if (turn.phase !== "deciding") {
    return reject("not-deciding", `a hold can only be chosen while deciding, and this turn is ${turn.phase}`);
  }

  // Seat index IS the position in `players` (D11), so this also refuses an id
  // belonging to no seat at this table.
  if (state.players[turn.seat] !== action.playerId) {
    return reject("not-on-turn", "only the seat on turn may set dice aside");
  }

  if (turn.rollsUsed >= ROLLS_PER_TURN) {
    return reject("no-rolls-left", `a turn has ${String(ROLLS_PER_TURN)} throws and this one has used them all`);
  }

  if (!KEEP_SETS.some((offered) => sameKeep(action.keep, offered))) {
    return reject("malformed-hold", `[${action.keep.join(", ")}] is not one of the ${String(KEEP_SETS.length)} holds this game offers`);
  }

  const slots = turn.dice.map((face, index) => (action.keep.includes(index) ? face : null));
  return { ok: true, state: { ...state, turn: { phase: "awaiting-roll", seat: turn.seat, rollsUsed: turn.rollsUsed, slots } } };
}
