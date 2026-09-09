import { CROSSING_ORDER, KEEP_SETS, mayWrite } from "./legal-actions.js";
import type { GeneralaAction } from "./legal-actions.js";
import { scoreFor } from "./scoring.js";
import { ROLLS_PER_TURN } from "./state.js";
import type { MatchState, Scorecard } from "./state.js";
import { reject } from "./violation.js";
import type { ApplyResult } from "./violation.js";

/**
 * What a seat chose, as opposed to what the server threw.
 *
 * `roll.ts` stays where it is and does not move in here — its whole argument is
 * that it takes no actor at all, and a file holding both would have one reducer
 * that checks a playerId sitting beside one that must not have one to check.
 * `applyPlayerAction` below is therefore the WHOLE of what a seat can do, and
 * the roll is not reachable through it.
 */
export type HoldAction = Extract<GeneralaAction, { type: "hold" }>;
export type ScoreAction = Extract<GeneralaAction, { type: "score" }>;

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

/**
 * Write this box, and hand the table to the next seat.
 *
 * ONE BOX PER TURN AND IT IS MANDATORY, which is the rule that makes a match
 * terminable at all: eleven boxes and one filled per turn means `seats × 11`
 * turns and no more, and no sequence of legal actions can extend it. There is
 * no "pass" and no "cross out" action to go with it — crossing out IS this,
 * aimed at a box `scoreFor` values at nothing, and forced crossing falls out of
 * the same rule rather than needing one of its own.
 *
 * WHICH box a zero may go in is the one thing that is not the player's, and it
 * is refused HERE and not only omitted from the offer list. The room gates
 * every submitted action against `getLegalActions`, so the omission is already
 * enough for a client — but the offer list is guidance and this reducer is the
 * authority, which is the shape every other guard in this engine has. Both read
 * `mayWrite`, so there is one rule rather than two that agree today.
 *
 * The value comes from `scoreFor` and is not recomputed here. It is handed the
 * turn's own `rollsUsed`, which is what makes "servida" a reading of the
 * counter at scoring time rather than a memory of what the dice once showed —
 * and it is handed the seat's card, because the doble's 100 depends on what is
 * already written in the generala box. This reducer decides WHETHER a box may
 * be written; `scoring.ts` decides what it is worth. Answering either question
 * twice is how the two answers come to disagree.
 *
 * A BOX ONCE WRITTEN IS NEVER WRITTEN AGAIN, zero included: `null` is open and
 * a number is filled, so a crossed-out box refuses exactly like a scored one.
 * It keeps its own code rather than folding into the crossing refusal below,
 * because "gone for good" and "not yet" are two facts a caller may want to tell
 * apart without reading English out of `message`.
 *
 * The next turn is built from NOTHING rather than from what is left of this
 * one — seat `(seat + 1) % players.length`, counter back to zero, five empty
 * slots — which is where "a player may stop early" is settled: unused throws
 * have nowhere to be carried to.
 *
 * THE END OF THE MATCH IS NOT SPECIAL-CASED HERE, deliberately. When the last
 * box is written this hands the turn on as usual and the state simply satisfies
 * "every card is full", which `getOutcome` derives. A terminal flag set here
 * would be a second source of truth for a fact the cards already carry, and the
 * system-action requester declines on the outcome before it looks at the phase.
 */
export function applyScore(state: MatchState, action: ScoreAction): ApplyResult {
  const turn = state.turn;
  if (turn.phase !== "deciding") {
    return reject("not-deciding", `a box can only be written while deciding, and this turn is ${turn.phase}`);
  }

  if (state.players[turn.seat] !== action.playerId) {
    return reject("not-on-turn", "only the seat on turn may write a box");
  }

  const card = state.cards[turn.seat]!;
  if (card[action.category] !== null) {
    return reject("box-not-open", `${action.category} is already filled and a filled box never reopens`);
  }

  if (!mayWrite(action.category, card, turn.dice, turn.rollsUsed)) {
    const highest = CROSSING_ORDER.find((box) => card[box] === null);
    return reject("cross-out-of-order", `${action.category} is worth nothing on these dice, and a zero only goes in the highest-paying open box, which is ${String(highest)}`);
  }

  const filled: Scorecard = { ...card, [action.category]: scoreFor(action.category, turn.dice, turn.rollsUsed, card) };
  return {
    ok: true,
    state: {
      ...state,
      cards: state.cards.map((existing, seat) => (seat === turn.seat ? filled : existing)),
      turn: { phase: "awaiting-roll", seat: (turn.seat + 1) % state.players.length, rollsUsed: 0, slots: [null, null, null, null, null] },
    },
  };
}

/**
 * Everything a seat may submit, through one door.
 *
 * This is what `generala-module`'s `applyAction` will call for a player's move,
 * and the roll is deliberately not reachable from it: `applyRoll` takes no
 * actor, so there is no argument here for a forged one to occupy. The switch is
 * exhaustive over `GeneralaAction` by the type rather than by a `default` arm,
 * so a third action type would fail to compile instead of falling through to a
 * silent refusal.
 */
export function applyPlayerAction(state: MatchState, action: GeneralaAction): ApplyResult {
  switch (action.type) {
    case "hold":
      return applyHold(state, action);
    case "score":
      return applyScore(state, action);
  }
}
