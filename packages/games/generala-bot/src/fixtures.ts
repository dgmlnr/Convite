import { CATEGORY_IDS, ROLLS_PER_TURN, applyPlayerAction, applyRoll, createMatch, getLegalActions, getOutcome } from "@hexdev/generala-engine";
import type { ApplyResult, CategoryId, DieFace, MatchState, PlayerId } from "@hexdev/generala-engine";

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

/**
 * One move in a scripted match, in the vocabulary of the three things that can
 * actually happen: the cup is thrown, a seat sets dice aside, a seat writes a
 * box.
 *
 * `throw` is the SYSTEM's move and carries only the faces landing in the empty
 * slots, which is the same `5 - kept.length` budget `requestGeneralaSystemAction`
 * draws. It takes no seat because nothing about a throw belongs to one: the
 * cup is the room's.
 */
export type DriveStep = { readonly throw: readonly DieFace[] } | { readonly hold: readonly number[] } | { readonly score: CategoryId };

/**
 * Drive a match to one exact position through the real reducers, and nowhere
 * else.
 *
 * `reachableStates` above spans positions by playing a fixed policy; this walks
 * to ONE NAMED position instead, which is what a test about a specific decision
 * needs — five equal faces on the second throw, a card whose generala box was
 * crossed at zero, a seat with nothing left worth anything. Every one of those
 * is a claim about the engine's own output rather than about a literal a test
 * assembled, which is the whole reason this file refuses hand-built states
 * (see the header).
 *
 * The seat is never named by a step because it is never a choice: `state.turn`
 * carries whose turn it is, and a script that could disagree with the engine
 * about that would be scripting a match the engine cannot play. A step the
 * engine refuses throws through `accepted`, so a script that drifts out of the
 * rules fails loudly at the line that drifted rather than quietly returning a
 * position nobody meant.
 */
export function driveTo(steps: readonly DriveStep[], seats: readonly PlayerId[] = [ALICE, BOB]): MatchState {
  let state = createMatch(seats);
  for (const step of steps) {
    const playerId = seats[state.turn.seat]!;
    if ("throw" in step) {
      state = accepted(applyRoll(state, step.throw));
    } else if ("hold" in step) {
      state = accepted(applyPlayerAction(state, { type: "hold", playerId, keep: step.hold }));
    } else {
      state = accepted(applyPlayerAction(state, { type: "score", playerId, category: step.score }));
    }
  }
  return state;
}

/**
 * The one turn shape every decision test below is built out of: throw
 * something harmless, set nothing aside, then throw the five faces the test is
 * really about.
 *
 * TWO THROWS, NEVER ONE, and that is forced by the rules rather than chosen. A
 * turn's opening throw showing five of a kind is a generala servida and ends
 * the match on the spot (ruleset §Generala servida), so a builder that reached
 * `[5,5,5,5,5]` in one throw would hand back a finished match offering nobody
 * anything. Coming through `hold: []` — the rulebook's explicit "re-roll all
 * five" — lands the same faces at `rollsUsed: 2`, where they are an ordinary,
 * scorable hand.
 */
export function turnShowing(faces: readonly DieFace[]): readonly DriveStep[] {
  return [{ throw: [1, 2, 3, 4, 6] }, { hold: [] }, { throw: faces }];
}
