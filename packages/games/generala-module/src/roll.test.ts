import { describe, expect, it } from "vitest";
import { CATEGORY_IDS, DICE_COUNT, applyHold, applyPlayerAction, applyRoll, createMatch, getLegalActions, getOutcome } from "@hexdev/generala-engine";
import type { ApplyResult, HoldAction, MatchState, PlayerId, ScoreAction } from "@hexdev/generala-engine";
import type { RandomSource } from "@hexdev/platform-contract";
import { SYSTEM_ACTOR_ID, requestGeneralaSystemAction } from "./roll.js";
import type { RollDiceAction } from "./roll.js";

const ALICE = "alice" as PlayerId;
const BOB = "bob" as PlayerId;

/**
 * The instrument the entropy budget is measured with: it forwards every draw
 * and counts it. Same shape as `mahjong-solitaire-module/src/deal.test.ts`'s,
 * because it is measuring the same claim about a different generator.
 */
function counting(source: RandomSource): { readonly rng: RandomSource; readonly calls: () => number } {
  let calls = 0;
  return {
    rng: () => {
      calls += 1;
      return source();
    },
    calls: () => calls,
  };
}

/**
 * A fixed script of values, in order, that THROWS when a caller asks for one
 * more than was written down.
 *
 * The overspend has to be loud rather than wrap around: a source that cycled
 * would hand a sixth draw a plausible-looking value, and an implementation
 * drawing more than its budget would still produce a well-formed action. The
 * counting instrument above catches that too, but only where a test remembered
 * to assert the count — this catches it everywhere a script is used at all.
 */
function scripted(values: readonly number[]): RandomSource {
  let next = 0;
  return () => {
    const value = values[next];
    if (value === undefined) throw new Error(`scripted rng ran out after ${String(values.length)} values`);
    next += 1;
    return value;
  };
}

/**
 * Five values that land on five DIFFERENT faces — `[1, 2, 3, 4, 5]`.
 *
 * Never a constant source for a roll that is going to be APPLIED: five equal
 * faces on the opening throw is a generala servida, which ends the match on the
 * spot, so a constant would quietly terminate the very state a test was
 * building towards.
 */
const FIVE_DISTINCT_FACES: readonly number[] = [0, 0.2, 0.4, 0.6, 0.8];

/** An rng no correct implementation may call at all. Used where the claim is
 * "and it drew nothing", which is a stronger statement than a count of zero and
 * fails at the exact call rather than at a later assertion. */
function forbidden(reason: string): RandomSource {
  return () => {
    throw new Error(reason);
  };
}

function ok(result: ApplyResult): MatchState {
  if (!result.ok) throw new Error(`the engine refused a move this test needed: ${result.violation.code} — ${result.violation.message}`);
  return result.state;
}

function requested(state: MatchState, rng: RandomSource): RollDiceAction {
  const action = requestGeneralaSystemAction(state, rng);
  if (action === null) throw new Error("the requester declined a state that is awaiting a roll");
  return action;
}

const holdsOffered = (state: MatchState, playerId: PlayerId): readonly HoldAction[] =>
  getLegalActions(state, playerId).filter((action): action is HoldAction => action.type === "hold");

const scoresOffered = (state: MatchState, playerId: PlayerId): readonly ScoreAction[] =>
  getLegalActions(state, playerId).filter((action): action is ScoreAction => action.type === "score");

/** A match one throw in: seat 0 is deciding over `[1, 2, 3, 4, 5]`. */
function openingThrow(): MatchState {
  const match = createMatch([ALICE, BOB]);
  return ok(applyRoll(match, requested(match, scripted(FIVE_DISTINCT_FACES)).faces));
}

/**
 * A match played to the end by its own producers: every seat rolls, then writes
 * the first box still open to it, for `seats × 11` turns.
 *
 * Built by the reducers rather than assembled as a literal, for
 * `board.test.ts:144-152`'s measured reason — a state a test assembled can only
 * read back what the test put there. The roll is always five distinct faces, so
 * no turn ever ends early on a generala servida and the loop really does run to
 * a full board.
 */
function playedOut(seats: readonly PlayerId[]): MatchState {
  let state = createMatch(seats);
  for (let turn = 0; turn < seats.length * CATEGORY_IDS.length; turn += 1) {
    state = ok(applyRoll(state, requested(state, scripted(FIVE_DISTINCT_FACES)).faces));
    const seat = seats[state.turn.seat]!;
    const [box] = scoresOffered(state, seat);
    if (box === undefined) throw new Error(`seat ${String(state.turn.seat)} was offered no box to write on turn ${String(turn)}`);
    state = ok(applyPlayerAction(state, box));
  }
  return state;
}

describe("the entropy budget", () => {
  /**
   * THE WHOLE INTEGRITY CLAIM FOR A DICE GAME, and the reason this package
   * exists at all: a roll of k dice draws exactly k values, for every k the
   * game can produce.
   *
   * It is measured over the opening throw plus all 31 holds the engine offers,
   * rather than over a hand-picked few, because the count has to be a property
   * of the STATE and not of a case somebody remembered. Following
   * `mahjong-solitaire-module/src/deal.test.ts`, the fence is on entropy SPEND
   * and never on the existence of a loop: a retry loop whose filter accepts the
   * first attempt spends exactly the budget and is not caught here — it is
   * caught by the constant-source test below, which no such loop can hold.
   */
  it("draws exactly one value per die being re-thrown, for the opening throw and each of the 31 holds", () => {
    const match = createMatch([ALICE, BOB]);
    const opening = counting(scripted(FIVE_DISTINCT_FACES));
    const openingAction = requested(match, opening.rng);
    expect(opening.calls()).toBe(DICE_COUNT);
    expect(openingAction.faces).toHaveLength(DICE_COUNT);

    const decided = ok(applyRoll(match, openingAction.faces));
    const holds = holdsOffered(decided, ALICE);
    expect(holds).toHaveLength(31);

    const budgets = new Set<number>();
    for (const hold of holds) {
      const held = ok(applyHold(decided, hold));
      const counter = counting(scripted(FIVE_DISTINCT_FACES));
      const action = requested(held, counter.rng);
      const rethrown = DICE_COUNT - hold.keep.length;
      expect({ keep: hold.keep, drawn: counter.calls(), faces: action.faces.length }).toEqual({ keep: hold.keep, drawn: rethrown, faces: rethrown });
      budgets.add(rethrown);
    }

    // The counted proof that the 31 holds really spanned every size a turn can
    // produce. Without it this loop would still pass if the offer list had
    // collapsed to 31 copies of one hold, and "every k" would be one k.
    expect([...budgets].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  /**
   * THE COUNT IS READ OFF THE STATE, NOT WRITTEN DOWN. An implementation that
   * always draws five and discards the surplus passes the opening throw above
   * and fails here, so neither scenario is vacuous alone. Named separately from
   * the sweep because this is the one the spec calls out by hand.
   */
  it("draws exactly one value after four dice are held", () => {
    const decided = openingThrow();
    const held = ok(applyHold(decided, { type: "hold", playerId: ALICE, keep: [0, 1, 2, 3] }));
    const counter = counting(scripted(FIVE_DISTINCT_FACES));

    const action = requested(held, counter.rng);

    expect(counter.calls()).toBe(1);
    expect(action.faces).toHaveLength(1);
  });

  /**
   * The two ends of `RandomSource`'s contractual `[0, 1)` interval, mapped onto
   * the two ends of a die. `platform-contract/src/random.ts:2` is what makes
   * `Math.floor(rng() * 6) + 1` total — there is no value in the interval that
   * lands off the face list, so there is no clamp to test and none to write.
   */
  it("maps the bottom of the rng's range onto face 1 and the top onto face 6", () => {
    const match = createMatch([ALICE, BOB]);

    expect(requested(match, () => 0).faces).toEqual([1, 1, 1, 1, 1]);
    expect(requested(match, () => 0.9999999).faces).toEqual([6, 6, 6, 6, 6]);
  });

  /**
   * NO REJECTION SAMPLING AND NO RE-ROLL-UNTIL-INTERESTING, proven by a source
   * that cannot be sampled around: a constant returns the same value forever, so
   * any loop that re-draws until it likes the answer either spends more than the
   * budget or never returns at all.
   *
   * `[1,1,1,1,1]` is a generala servida — the single most tempting roll for an
   * implementation to want to "fix" — and it comes back untouched.
   */
  it("returns on a constant source without spending an extra draw", () => {
    const counter = counting(() => 0);

    const action = requested(createMatch([ALICE, BOB]), counter.rng);

    expect(action.faces).toEqual([1, 1, 1, 1, 1]);
    expect(counter.calls()).toBe(DICE_COUNT);
  });

  /**
   * The action carries the RE-THROWN faces and nothing else. Asserted as a key
   * set rather than field by field: an extra field is the failure this is
   * guarding against, and only a key set can see one arrive.
   */
  it("authors the throw as the system and ships only the faces it drew", () => {
    const action = requested(createMatch([ALICE, BOB]), scripted(FIVE_DISTINCT_FACES));

    expect(Object.keys(action).sort()).toEqual(["faces", "playerId", "type"]);
    expect(action.type).toBe("roll-dice");
    expect(action.playerId).toBe(SYSTEM_ACTOR_ID);
  });
});

describe("the requester fails closed", () => {
  /**
   * **[PROPERTY]** THE GUARD IS LOAD-BEARING, NOT DEFENSIVE. `runAdvanceOnce`
   * re-asks after every system action it applies, so a requester that answered
   * a `deciding` state would re-roll the dice out from under the player, and one
   * that answered a finished match would never let the loop exit.
   *
   * The three states are the three the loop can actually present: mid-turn, a
   * generala servida that ended the match as it landed, and a board every seat
   * has filled — the second and third being the two terminal paths the ruleset
   * has.
   */
  it("declines in deciding, on a servida win and on a finished match, drawing nothing at all", () => {
    const servida = ok(applyRoll(createMatch([ALICE, BOB]), [4, 4, 4, 4, 4]));
    expect(servida.turn.phase).toBe("servida-win");
    const finished = playedOut([ALICE, BOB]);
    expect(getOutcome(finished)).not.toBeNull();

    const states: readonly (readonly [string, MatchState])[] = [
      ["deciding", openingThrow()],
      ["a servida win", servida],
      ["a finished match", finished],
    ];

    for (const [name, state] of states) {
      expect(requestGeneralaSystemAction(state, forbidden(`the requester drew a random value before declining ${name}`))).toBeNull();
    }
  });

  /**
   * THE SIBLING THAT KEEPS THE PROPERTY ABOVE FROM BEING VACUOUS. A requester
   * that returned `null` for everything satisfies every assertion in that test
   * and would strand every match in `awaiting-roll` forever. This is the case
   * that says it must sometimes say yes, and it is deliberately in the same
   * describe so the two are read together.
   */
  it("does answer the state the transport actually asks about", () => {
    const match = createMatch([ALICE, BOB]);
    expect(match.turn.phase).toBe("awaiting-roll");

    expect(requestGeneralaSystemAction(match, scripted(FIVE_DISTINCT_FACES))).not.toBeNull();
  });

  /**
   * The phase is asked BEFORE any face is materialized, stated as a count so it
   * is a number and not a claim. An implementation that builds the faces first
   * and then checks passes the `null` assertions above and fails this one.
   */
  it("has drawn zero values by the time it declines", () => {
    const counter = counting(() => 0);

    expect(requestGeneralaSystemAction(openingThrow(), counter.rng)).toBeNull();

    expect(counter.calls()).toBe(0);
  });
});
