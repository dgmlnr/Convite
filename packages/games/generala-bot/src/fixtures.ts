import { CATEGORY_IDS, ROLLS_PER_TURN, applyPlayerAction, applyRoll, createMatch, getLegalActions, getOutcome } from "@hexdev/generala-engine";
import type { ApplyResult, DieFace, MatchState, PlayerId } from "@hexdev/generala-engine";

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

/**
 * The faces the driver below throws, in order, cycling.
 *
 * NO WINDOW OF FIVE IS FIVE OF A KIND, deliberately: `applyRoll` ends the match
 * outright on a generala servida (ruleset §Generala servida), so a script that
 * could open a turn with five equal faces would cut the sweep short at whatever
 * turn it happened to land on — and it would do it silently, since the driver
 * stops on `getOutcome`. Five of a kind on a SECOND or third throw is fine and
 * genuinely occurs here; only the opening throw is terminal.
 */
const FACE_SCRIPT: readonly DieFace[] = [1, 2, 3, 4, 5, 6, 4, 4, 4, 2, 6, 1, 3, 3, 5, 2];

/**
 * A ceiling that must never be reached, asserted rather than trusted.
 *
 * Two seats × eleven boxes × three throws, each throw costing one roll state and
 * one decision state, is 132 steps. 400 leaves room for the arithmetic above to
 * be wrong and the driver to stop anyway; hitting it THROWS, so a match that
 * failed to terminate surfaces as a loud failure instead of as a quietly
 * truncated sweep that every property below would still pass.
 */
const STEP_CEILING = 400;

/**
 * Every state one full two-seat match passes through, in order.
 *
 * The policy is fixed and boring on purpose — hold while throws remain, then
 * write the first open box — because this sweep's job is to span POSITIONS, not
 * to play well. What it spans is what spec Domain F names: both of the phases a
 * match spends its time in, every value of `rollsUsed`, and scorecards from
 * empty all the way down to one box remaining. Those spans are asserted as
 * counts in `index.test.ts` rather than assumed here, because a driver that
 * quietly stopped after two turns would still satisfy every "the bot returned a
 * legal action" assertion made over it.
 *
 * The holds STEP BY SEVEN through the 31 the engine offers, and seven is coprime
 * with 31, so the 44 holds this match makes walk the whole offer list rather than
 * sitting on one shape. That is what puts every re-roll budget from one die to
 * five into the sweep.
 */
export function reachableStates(seats: readonly PlayerId[] = [ALICE, BOB]): readonly MatchState[] {
  const seen: MatchState[] = [];
  let state = createMatch(seats);
  let faceCursor = 0;
  let holdCursor = 0;

  for (let step = 0; step < STEP_CEILING; step += 1) {
    seen.push(state);
    if (getOutcome(state) !== null) return seen;

    const turn = state.turn;
    if (turn.phase === "awaiting-roll") {
      const budget = turn.slots.filter((slot) => slot === null).length;
      const faces: DieFace[] = [];
      for (let index = 0; index < budget; index += 1) {
        faces.push(FACE_SCRIPT[faceCursor % FACE_SCRIPT.length]!);
        faceCursor += 1;
      }
      state = accepted(applyRoll(state, faces));
      continue;
    }
    if (turn.phase === "servida-win") return seen;

    const legal = getLegalActions(state, seats[turn.seat]!);
    const holds = legal.filter((action) => action.type === "hold");
    if (turn.rollsUsed < ROLLS_PER_TURN && holds.length > 0) {
      state = accepted(applyPlayerAction(state, holds[holdCursor % holds.length]!));
      holdCursor += 7;
      continue;
    }
    state = accepted(applyPlayerAction(state, legal.filter((action) => action.type === "score")[0]!));
  }

  throw new Error(`the driver hit its ${String(STEP_CEILING)}-step ceiling without the match ending`);
}

/** How many of this seat's eleven boxes are still open. */
export function openBoxCount(state: MatchState, seat: number): number {
  const card = state.cards[seat]!;
  return CATEGORY_IDS.filter((category) => card[category] === null).length;
}
