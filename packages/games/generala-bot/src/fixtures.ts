import { applyRoll, createMatch } from "@hexdev/generala-engine";
import type { ApplyResult, MatchState, PlayerId } from "@hexdev/generala-engine";

export const ALICE = "player-0" as PlayerId;
export const BOB = "player-1" as PlayerId;

/**
 * Escoba's `fixtures.ts` hand-builds a mid-hand state and says so — that
 * package validates bot DECISIONS, not the reducer, so a state never routed
 * through `deal()` is exactly right there.
 *
 * THIS FILE MAKES THE OPPOSITE CALL, and the difference is what spec Domain F
 * asks for by name: "a sampled set of REACHABLE states". A hand-built Generala
 * position would be a claim about what the engine can produce, and the point of
 * every assertion in this package is that the bot answers whatever the engine
 * actually offers. So every state here is driven out of `createMatch` through
 * the real reducers, and a position these builders cannot reach is a position
 * the bot is never asserted about.
 *
 * Never exported from `index.ts`, exactly as `escoba-bot`'s is not: a fixture
 * builder is this package's test scaffolding, not its API.
 */
function accepted(result: ApplyResult): MatchState {
  if (!result.ok) throw new Error(`the fixture built an illegal move: ${result.violation.code} — ${result.violation.message}`);
  return result.state;
}

/**
 * The widest position in the game: one throw made, every box still open, so the
 * seat on turn is offered all 31 holds plus all 11 boxes.
 *
 * The faces are five DIFFERENT ones on purpose — five of a kind on the opening
 * throw is a generala servida and ends the match outright (ruleset §Generala
 * servida), which would leave this builder returning a position that offers
 * nothing at all.
 */
export function openingThrow(seats: readonly PlayerId[] = [ALICE, BOB]): MatchState {
  return accepted(applyRoll(createMatch(seats), [1, 2, 3, 4, 6]));
}

/**
 * A fresh table, before anybody has thrown: `awaiting-roll`, which offers
 * NOBODY an action — not even the seat whose turn it is. That emptiness is what
 * makes the transport ask for the roll, and it is the first of the two shapes
 * the empty-list guard has to be right about.
 */
export function awaitingRollState(seats: readonly PlayerId[] = [ALICE, BOB]): MatchState {
  return createMatch(seats);
}

/**
 * The second shape: five of a kind on the opening throw, which wins "en el
 * acto" with every box still open. Nobody may act here either, and the match is
 * already decided.
 */
export function servidaWinState(seats: readonly PlayerId[] = [ALICE, BOB]): MatchState {
  return accepted(applyRoll(createMatch(seats), [6, 6, 6, 6, 6]));
}
