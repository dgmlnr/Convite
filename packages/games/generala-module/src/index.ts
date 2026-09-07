import { applyPlayerAction, applyRoll, getOutcome } from "@hexdev/generala-engine";
import type { GeneralaAction, MatchState } from "@hexdev/generala-engine";
import type { ApplyResult } from "@hexdev/platform-contract";
import { SYSTEM_ACTOR_ID } from "./roll.js";
import type { RollDiceAction } from "./roll.js";

export type { RollDiceAction } from "./roll.js";
export { SYSTEM_ACTOR_ID, requestGeneralaSystemAction } from "./roll.js";

/**
 * A PARTIAL BARREL, and declared partial the way `generala-engine`'s own was
 * while it was being written.
 *
 * WHAT IS HERE: the action union, the reducer that decides who may author which
 * half of it, and the one door entropy comes through. That is everything a
 * registration pairs with a module — `requestGeneralaSystemAction` is what
 * `apps/server`'s registry hands the room's `rng`, exactly as
 * `requestMahjongSolitaireSystemAction` is.
 *
 * WHAT IS NOT is the `generalaModule` object that carries all of it to that
 * registry — its metadata, its empty `configOptions`, its `createBot` and the
 * conformance suite that exercises the lot — which cannot land before the bot
 * `conformance.ts:114-134` makes mandatory at `seatCount >= 2`.
 */

/**
 * Everything that can be applied to a Generala match, from either side of the
 * table.
 *
 * The union mirrors `TrucoModuleAction`: the engine's own player actions, plus
 * the one action the engine cannot own because it carries an actor and needs
 * externally materialized randomness. `roll-dice` is never in any seat's legal
 * list, so it reaches `applyAction` from exactly one caller — the transport,
 * with what `requestGeneralaSystemAction` drew.
 */
export type GeneralaModuleAction = GeneralaAction | RollDiceAction;

/**
 * A finished match takes nothing from anybody.
 *
 * Hoisted to a constant because both arms below need it and the two must not
 * drift into two different messages for one fact. `code` matches the wording
 * `truco-module`, `escoba-module` and `mahjong-solitaire-module` already use,
 * so a caller switching on refusals reads one vocabulary across every game.
 */
const MATCH_OVER: ApplyResult<MatchState> = { ok: false, violation: { code: "match-over", message: "this match has already ended" } };

/**
 * The module's reducer: the actor check, and then the engine.
 *
 * WHOSE ACTION THIS IS, ASKED BEFORE ANYTHING ELSE IT COULD DO (D4). This is
 * the refusal `truco-module/src/index.ts:83`, `escoba-module/src/index.ts:114`
 * and `mahjong-solitaire-module/src/module.ts:111` all carry, and Generala
 * ships it on day one rather than gaining it after an incident. The incident is
 * worth stating because it is what the line is for: `MatchRoom.handleAction`
 * used to check only that a submitted action's `playerId` matched the
 * authenticated seat before calling `applyAction`, so a seated player could
 * submit the game's own dealing action under their OWN honest id and choose the
 * deal. `SYSTEM_ACTOR_ID` never stopped that — a sentinel refuses a client
 * CLAIMING to be the system, not one acting as themselves.
 *
 * The room now also admits a submitted action only if `getLegalActions` offered
 * that exact action, and `roll-dice` is in nobody's list, ever. That is the
 * reason this guard is defence in depth rather than the reason it is
 * unnecessary: a module is a pure reducer anyone may call, and "only the system
 * throws the dice" is a rule of the GAME, not of the wire.
 *
 * THE MATCH-OVER GUARD IS NOT DECORATION EITHER, and Generala needs it more
 * than the card games do. `applyScore` hands the turn to the next seat after
 * the LAST box exactly as after the first — deliberately, so that "over" stays
 * derived from the cards — which leaves a finished match sitting in
 * `awaiting-roll`, structurally identical to a live one. `applyRoll` reads the
 * phase and nothing else, by design, so without this line a full board would
 * accept another throw and the seat would be offered 31 holds on a card with no
 * open box. The engine says so in its own words and leaves the terminal check
 * to this layer; `requestGeneralaSystemAction` makes the same check for the
 * same reason, on the other side of the same loop.
 *
 * EVERY RULE BELOW THAT IS NOT ABOUT AN ACTOR BELONGS TO THE ENGINE. Which
 * holds are well formed, which boxes are open, what a box is worth, when a turn
 * ends — none of it is re-stated here, so there is no second opinion to drift
 * from the first. `applyRoll` takes no `playerId` at all (D4), which is why a
 * forged throw cannot reach it even if this guard were deleted: there is no
 * argument in that signature for a forged actor to occupy.
 */
export function applyAction(state: MatchState, action: GeneralaModuleAction): ApplyResult<MatchState> {
  if (action.type === "roll-dice") {
    if (action.playerId !== SYSTEM_ACTOR_ID) {
      return { ok: false, violation: { code: "not-a-system-actor", message: "only the system throws the dice" } };
    }
    if (getOutcome(state) !== null) return MATCH_OVER;
    return applyRoll(state, action.faces);
  }

  if (getOutcome(state) !== null) return MATCH_OVER;
  return applyPlayerAction(state, action);
}
