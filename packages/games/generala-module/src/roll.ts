import { DIE_FACES, getOutcome } from "@hexdev/generala-engine";
import type { DieFace, MatchState } from "@hexdev/generala-engine";
import type { PlayerId, RandomSource } from "@hexdev/platform-contract";

/**
 * The author of every throw, and an id no seat can ever hold. Mirrors
 * `mahjong-solitaire-module/src/deal.ts`'s own sentinel, which mirrors
 * `escoba-module`'s, which mirrors `truco-module`'s.
 *
 * It is a SENTINEL, not a guarantee on its own: it stops a client CLAIMING to
 * be the system, and that is all it does. Nothing here prevents a seated player
 * from submitting a `roll-dice` under their own honest id — that refusal is
 * `applyAction`'s, in `index.ts`, and the two halves are deliberately in
 * different files so neither is mistaken for the other.
 */
export const SYSTEM_ACTOR_ID = "__system__" as PlayerId;

/**
 * The cup, as DATA — the faces the server drew, on their way to the engine's
 * positional splice.
 *
 * IT CARRIES THE RE-THROWN FACES ONLY, never all five, and that is the action's
 * own shape doing a job no runtime check could do as well. An action carrying
 * five final faces could silently change a die the player was holding, and the
 * only way to catch it would be to compare against the kept dice afterwards —
 * a check somebody has to remember to write. With this shape there is nowhere
 * for a held die's face to be overwritten from, because the action never names
 * one. `generala-engine`'s `applyRoll` states the same split from the other
 * side: `slots` carries `null` exactly where a die is being thrown again.
 *
 * Declared here rather than in the engine because it carries a `playerId` and
 * the engine's reducer takes no actor at all (D4) — the actor is a platform
 * concept, and this is the layer that knows the platform exists.
 */
export interface RollDiceAction {
  readonly type: "roll-dice";
  readonly playerId: PlayerId;
  readonly faces: readonly DieFace[];
}

/**
 * One die, one draw.
 *
 * `RandomSource` is contractually `[0, 1)` (`platform-contract/src/random.ts`),
 * so indexing the engine's own face list by `rng() * 6` is TOTAL: every value
 * the interval contains lands on a face, no value lands off the end, and there
 * is nothing to clamp and nothing to reject. That is why no rejection sampling
 * appears anywhere below — not because it was left out, but because there is no
 * value for it to reject.
 *
 * The list is the ENGINE's `DIE_FACES` rather than a `6` written here. A die
 * having six sides is a rule of the game, and the game already says so once.
 */
function rollDie(rng: RandomSource): DieFace {
  return DIE_FACES[Math.floor(rng() * DIE_FACES.length)]!;
}

/**
 * THE ONLY DOOR ENTROPY COMES THROUGH, for the whole game.
 *
 * `applyAction` is pinned pure by an executed conformance test
 * (`platform-contract/src/conformance.ts:75`) and receives no `rng` at all, so
 * a roll cannot be materialized inside it. The transport asks for a system
 * action exactly when no seated controller has a legal action
 * (`match-room.ts`'s `anySeatCanAct`), which in this game is precisely the
 * `awaiting-roll` phase — so the shape of the turn is what summons the cup, and
 * nobody has to ask for it.
 *
 * THE TWO GUARDS, IN THIS ORDER, AND BOTH LOAD-BEARING:
 *
 *   1. A finished match. `applyScore` hands the turn on after the LAST box
 *      exactly as after the first, so a match every seat has filled sits in
 *      `awaiting-roll` looking exactly like a live one — the phase alone cannot
 *      tell them apart, and only the cards can. `generala-engine/src/play.ts`
 *      leaves this to the requester in writing, and this is the requester.
 *      Without it the transport's loop would throw for a finished match
 *      forever.
 *   2. The phase. The loop RE-ASKS after every system action it applies, so a
 *      requester that answered a `deciding` state would throw the dice again
 *      under the player who is still looking at them.
 *
 * Both are asked BEFORE a single value is drawn. That ordering is asserted as a
 * count rather than read off this file, because an implementation that builds
 * the faces first and then declines returns exactly the same `null`.
 *
 * A STRAIGHT-LINE `for`, DELIBERATELY: the number of draws is the loop bound
 * and the loop bound is read off the state, so the budget is visible by reading
 * the six lines below. A `while` with a condition, a filter, or a retry would
 * make the count an argument instead of a fact — and for a dice game that count
 * IS the integrity claim, so it is measured in `roll.test.ts` over the opening
 * throw and all 31 holds rather than asserted here.
 */
export function requestGeneralaSystemAction(state: MatchState, rng: RandomSource): RollDiceAction | null {
  if (getOutcome(state) !== null) return null;

  const turn = state.turn;
  if (turn.phase !== "awaiting-roll") return null;

  // `null` marks a die being thrown again (D1), so the count of them IS the
  // budget — a property of the state's shape rather than arithmetic about it.
  const rethrown = turn.slots.filter((slot) => slot === null).length;
  // Unreachable through the reducers: a hold keeping all five is not one of the
  // 31 the engine offers, so no `awaiting-roll` turn has zero empty slots. It
  // fails closed anyway rather than shipping an empty roll for `applyRoll` to
  // refuse a step later.
  if (rethrown === 0) return null;

  const faces: DieFace[] = [];
  for (let die = 0; die < rethrown; die += 1) faces.push(rollDie(rng));
  return { type: "roll-dice", playerId: SYSTEM_ACTOR_ID, faces };
}
