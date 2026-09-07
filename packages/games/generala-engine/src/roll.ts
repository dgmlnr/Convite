import type { Dice, DieFace } from "./dice.js";
import { isGenerala, SERVIDA_ROLL } from "./scoring.js";
import type { MatchState } from "./state.js";

/**
 * Re-declared locally, same shape as `platform-contract`'s `RuleViolation` —
 * NOT imported, because `generala-engine` is L0 and may not reach for a
 * workspace package at all. `escoba-engine/src/capture.ts:21-31` makes the same
 * call for the same reason.
 *
 * `code` is a closed union rather than a bare string so a caller can switch on
 * it without reading English out of `message`.
 */
export interface RuleViolation {
  readonly code: "not-awaiting-roll" | "wrong-face-count";
  readonly message: string;
}

export type ApplyResult =
  | { readonly ok: true; readonly state: MatchState }
  | { readonly ok: false; readonly violation: RuleViolation };

function reject(code: RuleViolation["code"], message: string): ApplyResult {
  return { ok: false, violation: { code, message } };
}

/**
 * Apply a throw of the cup: the faces the server just rolled, dropped into the
 * slots this turn left empty.
 *
 * THERE IS NO `playerId` PARAMETER, and its absence is the security decision
 * (D4), not an economy. A seated truco player can deal themselves a hand
 * because that game's dealing action carries an actor the module gates on, and
 * for a window between hands the gate is open. Nothing submitted can reach this
 * function, because there is no argument here for a submitted actor to occupy —
 * the module above it owns the `roll-dice` action shape and refuses a seated
 * one, and this reducer cannot be tricked even if that guard were removed.
 *
 * The faces are the RE-ROLLED ones only, never all five. `slots` carries `null`
 * exactly where a die is being thrown again, so `faces.length` must equal the
 * null count and the splice is positional: index for index, a held die keeps
 * its own face, at its own position, identically. An action carrying all five
 * final faces could silently change a die the player was holding, and no
 * runtime check would catch it — refusing that shape is the action's job, and
 * validating this one is this function's.
 *
 * The two refusals are both load-bearing. `not-awaiting-roll` is what stops the
 * transport's loop from re-rolling a player's dice under them, because the loop
 * re-asks after every applied system action. `wrong-face-count` is the entropy
 * budget stated as a rule: too few faces leaves a `null` in a scored hand, and
 * too many silently discards a value the rng was already charged for.
 */
export function applyRoll(state: MatchState, faces: readonly DieFace[]): ApplyResult {
  const turn = state.turn;
  if (turn.phase !== "awaiting-roll") {
    return reject("not-awaiting-roll", `a roll can only be applied while awaiting one, and this turn is ${turn.phase}`);
  }

  const empty = turn.slots.filter((slot) => slot === null).length;
  if (faces.length !== empty) {
    return reject("wrong-face-count", `this turn is re-rolling ${String(empty)} dice and the roll carried ${String(faces.length)} faces`);
  }

  let next = 0;
  const dice = turn.slots.map((slot) => (slot === null ? faces[next++]! : slot)) as unknown as Dice;
  const rollsUsed = turn.rollsUsed + 1;

  // ruleset §Generala servida: five of a kind on the first throw of the turn
  // "gana en el acto" — it wins as it lands, before the player is offered
  // anything, and whether or not that number's box or the generala box is
  // already filled. It is therefore NOT a scoring event: no card is written,
  // which is why the generala box's servida cell holds no number.
  //
  // This is the one derived-looking fact that legitimately IS state (D2): the
  // win leaves no other trace to read it back from. It goes in the `Turn` union
  // rather than beside it so that "deciding, and also already won" is a state
  // nobody can construct — the offer list below never has to remember to fall
  // silent, because a won turn carries no dice to score and no counter to read.
  if (rollsUsed === SERVIDA_ROLL && isGenerala(dice)) {
    return { ok: true, state: { ...state, turn: { phase: "servida-win", seat: turn.seat } } };
  }

  return { ok: true, state: { ...state, turn: { phase: "deciding", seat: turn.seat, rollsUsed, dice } } };
}
