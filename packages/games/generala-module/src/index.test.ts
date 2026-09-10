import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CATEGORY_IDS, applyHold, applyPlayerAction, applyRoll, createMatch, getLegalActions, getOutcome, getViewFor } from "@hexdev/generala-engine";
import type { DieFace, MatchState, PlayerId, ScoreAction } from "@hexdev/generala-engine";
import { describeGameModule } from "@hexdev/platform-contract";
import type { ApplyResult, SeatAssignment } from "@hexdev/platform-contract";
import { SYSTEM_ACTOR_ID, applyAction, generalaModule } from "./index.js";
import type { GeneralaModuleAction, RollDiceAction } from "./index.js";

const ALICE = "alice" as PlayerId;
const BOB = "bob" as PlayerId;
const SEATS: readonly PlayerId[] = [ALICE, BOB];

/** What the platform hands `createMatch`: a seat number and who is in it. */
const SEAT_ASSIGNMENTS: readonly SeatAssignment[] = [
  { seat: 0, playerId: ALICE },
  { seat: 1, playerId: BOB },
];

/**
 * Five DIFFERENT faces, so no throw a helper applies is ever a generala servida
 * — five equal faces on the opening throw end the match on the spot, which
 * would quietly terminate the very state a test was building towards.
 *
 * Written as data rather than drawn: this file is about who may author a throw
 * and what the module does with one, so where the faces came from is somebody
 * else's question (`roll.test.ts`) and coupling to that answer here would make
 * these tests fail for its reasons.
 */
const OPENING_FACES: readonly DieFace[] = [1, 2, 3, 4, 5];

/**
 * Typed against the PLATFORM's `ApplyResult`, not the engine's, and the
 * difference is a finding rather than a convenience.
 *
 * The engine's `RuleViolation.code` is a closed union of its seven refusals;
 * the platform's is a bare `string`. An engine result therefore flows into a
 * platform-shaped one with no adapter and no cast — which is what lets
 * `applyAction` return the engine's answer untouched — but not the other way
 * round, so a helper typed on the engine's shape cannot unwrap what this module
 * returns. Typed the wide way, this one unwraps both.
 */
function ok(result: ApplyResult<MatchState>): MatchState {
  if (!result.ok) throw new Error(`a move this test needed was refused: ${result.violation.code} — ${result.violation.message}`);
  return result.state;
}

/** A match one throw in: seat 0 is deciding over `[1, 2, 3, 4, 5]`. */
function openingThrow(): MatchState {
  return ok(applyRoll(createMatch(SEATS), OPENING_FACES));
}

/** Played to a full board by its own producers — throw, write the first open
 * box, `seats × 11` times. The only terminal state in this file. */
function playedOut(): MatchState {
  let state = createMatch(SEATS);
  for (let turn = 0; turn < SEATS.length * CATEGORY_IDS.length; turn += 1) {
    state = ok(applyRoll(state, OPENING_FACES));
    const seat = SEATS[state.turn.seat]!;
    const [box] = getLegalActions(state, seat).filter((action): action is ScoreAction => action.type === "score");
    if (box === undefined) throw new Error(`seat ${String(state.turn.seat)} was offered no box on turn ${String(turn)}`);
    state = ok(applyPlayerAction(state, box));
  }
  return state;
}

describe("a seated player cannot roll their own dice", () => {
  /**
   * THE GUARD ALL THREE SHIPPED MODULES GAINED, HERE ON DAY ONE.
   *
   * `truco-module/src/index.ts:83`, `escoba-module/src/index.ts:114` and
   * `mahjong-solitaire-module/src/module.ts:111` each carry this refusal, and
   * they carry it because a live hole was found: `MatchRoom.handleAction`
   * checked only that a submitted action's `playerId` matched the authenticated
   * seat and then called `applyAction`, so a seated player could submit the
   * game's own dealing action under their OWN honest id and deal themselves the
   * cards. `SYSTEM_ACTOR_ID` did not stop it — that sentinel only refuses a
   * client CLAIMING to be the system.
   *
   * The room now also gates every submitted action against `getLegalActions`,
   * and `roll-dice` is in nobody's list, so the transport refuses this before it
   * ever arrives. That is the reason this test exists rather than a reason it
   * does not: a module is a pure reducer anyone may call, "only the system
   * throws the dice" is a rule of the GAME and not of the wire, and a game with
   * no guard is the pattern the next game copies.
   *
   * Asserted for EVERY seat rather than for one, because "seated" is the
   * property being refused and a check that happened to compare against seat 0
   * would pass a one-seat assertion.
   */
  it("refuses a roll-dice authored by any seat at the table", () => {
    const match = createMatch(SEATS);

    for (const seat of SEATS) {
      const forged: RollDiceAction = { type: "roll-dice", playerId: seat, faces: [6, 6, 6, 6, 6] };

      expect(applyAction(match, forged)).toEqual({
        ok: false,
        violation: { code: "not-a-system-actor", message: expect.any(String) },
      });
    }
  });

  /**
   * The refusal is "you are not the system", never "you are not one of the two
   * people I know about" — so an id belonging to nobody is refused by the same
   * line, and a future third seat needs no edit here.
   */
  it("refuses a roll-dice authored by an id that sits at no seat", () => {
    const stranger = "mallory" as PlayerId;

    expect(applyAction(createMatch(SEATS), { type: "roll-dice", playerId: stranger, faces: [6, 6, 6, 6, 6] })).toEqual({
      ok: false,
      violation: { code: "not-a-system-actor", message: expect.any(String) },
    });
  });

  /**
   * THE SIBLING THAT KEEPS THE REFUSALS FROM BEING VACUOUS, and the proof that
   * the module really does delegate rather than answer for itself.
   *
   * A module refusing every `roll-dice` satisfies both tests above. This one
   * applies the system's own throw and reads the dice back: the two held faces
   * are the SAME faces at the SAME positions, and only the three empty slots
   * moved. That splice is `generala-engine`'s `applyRoll`, so seeing it happen
   * is seeing the delegation happen.
   */
  it("applies the system's own throw, splicing it into the empty slots by position", () => {
    const held = ok(applyHold(openingThrow(), { type: "hold", playerId: ALICE, keep: [0, 1] }));
    const thrown: RollDiceAction = { type: "roll-dice", playerId: SYSTEM_ACTOR_ID, faces: [6, 6, 6] };

    const rolled = ok(applyAction(held, thrown));

    expect(rolled.turn).toEqual({ phase: "deciding", seat: 0, rollsUsed: 2, dice: [1, 2, 6, 6, 6] });
  });
});

describe("the module's applyAction", () => {
  /**
   * A player's move goes through untouched: legality is the ENGINE's, always,
   * and this adapter re-states none of it. The hold below is one the engine
   * itself offered, so accepting it here is the offer list and the reducer
   * agreeing through the module rather than around it.
   */
  it("hands a player's own move to the engine", () => {
    const decided = openingThrow();
    const [hold] = getLegalActions(decided, ALICE);
    if (hold === undefined) throw new Error("the engine offered the acting seat nothing to do");

    expect(applyAction(decided, hold)).toEqual(applyPlayerAction(decided, hold));
  });

  /**
   * A MATCH THAT IS OVER STAYS OVER, and the phase alone cannot tell.
   * `applyScore` hands the turn on after the last box exactly as after the
   * first, so a finished match sits in `awaiting-roll` looking live — the
   * engine's `applyRoll` reads only the phase and would accept a throw onto a
   * full board. This is the guard that closes it, the same one truco, escoba
   * and the solitaire all carry.
   */
  it("refuses the system's own throw once every box is filled", () => {
    const finished = playedOut();

    expect(applyAction(finished, { type: "roll-dice", playerId: SYSTEM_ACTOR_ID, faces: OPENING_FACES })).toEqual({
      ok: false,
      violation: { code: "match-over", message: expect.any(String) },
    });
  });

  /** The same door, closed on a player's move too — a finished match accepts
   * nothing from anybody. */
  it("refuses a player's move once every box is filled", () => {
    const finished = playedOut();

    expect(applyAction(finished, { type: "score", playerId: ALICE, category: "ones" })).toEqual({
      ok: false,
      violation: { code: "match-over", message: expect.any(String) },
    });
  });
});

/**
 * THE CONTRACT SUITE, AND EVERY FIXTURE IT RUNS ON WAS BUILT BY A PRODUCER.
 *
 * `describeGameModule` never invents game-specific data, so what it asserts is
 * only as strong as the states it is handed. Every one below comes out of
 * `generalaModule`'s own port — `createMatch`, then the system's throw through
 * `applyAction` — rather than out of an object literal written here.
 * `generala-engine`'s own `state.test.ts` carries the lesson
 * (`mahjong-solitaire-engine/src/board.test.ts:144-152` before it): a state a
 * test assembled can only read back what the test put in it, and is green
 * against any production code at all.
 *
 * IT COVERS THE ≤42-ACTION SURFACE FOR FREE. `getLegalActions` on the reachable
 * state below offers 31 holds plus 11 open boxes, and the suite's own "every
 * action getLegalActions offers is accepted by applyAction" walks all of them —
 * so the offer list and the reducer are asserted to agree through the MODULE,
 * not only inside the engine where `legal-actions.exhaustive.test.ts` already
 * says it.
 */
function reachable(): MatchState {
  const opened = generalaModule.createMatch({}, SEAT_ASSIGNMENTS);
  return ok(applyAction(opened, { type: "roll-dice", playerId: SYSTEM_ACTOR_ID, faces: OPENING_FACES }));
}

/** The escalera the opening throw shows, servida, worth 25 — one of the 42 the
 * reachable state offers, named as a literal so the suite's `toContainEqual`
 * has something to find rather than something to echo back. */
const LEGAL_ACTION: GeneralaModuleAction = { type: "score", playerId: ALICE, category: "escalera" };

/**
 * STATES WHERE THE TWO SEATS HAVE ACTUALLY DIVERGED, and the reason this
 * generator exists rather than the two fixtures being enough.
 *
 * `generalaModule` declares `hiddenState: { kind: "nothing-is-hidden" }`, and
 * what conformance does with that is compare every seat's whole view. MEASURED:
 * planting a per-seat leak in `generala-engine`'s projection —
 * `peek: state.cards[seat]`, one seat's own scorecard handed only to that seat
 * — did NOT red on either fixture state. Both are symmetric: `reachable()` is
 * one throw in with every box still empty, and `playedOut()` writes the same
 * faces into the same box order for both seats, so the two scorecards come out
 * IDENTICAL and the leak carried no information to spot. A comparison across
 * states where the seats are the same is a comparison that cannot see a
 * per-seat difference.
 *
 * These vary the faces and the box each seat takes, so the scorecards diverge,
 * and the same plant reds. Built through the module's own port, seeded — the
 * same discipline `truco-module/src/index.test.ts` documents.
 */
const walkedStates: readonly MatchState[] = fc.sample(
  fc
    .array(fc.tuple(fc.array(fc.integer({ min: 1, max: 6 }), { minLength: 5, maxLength: 5 }), fc.nat({ max: 20 })), { minLength: 3, maxLength: 22 })
    .map((turns) => {
      let state = generalaModule.createMatch({}, SEAT_ASSIGNMENTS);
      for (const [faces, pick] of turns) {
        if (state.turn.phase === "awaiting-roll") {
          // Exactly as many faces as there are open slots. A re-roll after a
          // hold throws only the dice that were let go, and a five-face throw
          // into a one-die re-roll is refused `wrong-face-count` — which is
          // how the first version of this generator died on its second step
          // and produced 40 states with not one box written in any of them.
          const needed = state.turn.slots.filter((slot) => slot === null).length;
          const rolled = applyAction(state, { type: "roll-dice", playerId: SYSTEM_ACTOR_ID, faces: faces.slice(0, needed) as readonly DieFace[] });
          if (!rolled.ok) break;
          state = rolled.state;
        }
        const seat = SEATS[state.turn.seat];
        if (seat === undefined) break;
        const legal = generalaModule.getLegalActions(state, seat);
        if (legal.length === 0) break;
        const applied = generalaModule.applyAction(state, legal[pick % legal.length]!);
        if (!applied.ok) break;
        state = applied.state;
      }
      return state;
    }),
  { numRuns: 40, seed: 20260907 },
);

describeGameModule(
  generalaModule,
  {
    config: {},
    seats: SEAT_ASSIGNMENTS,
    playerId: ALICE,
    reachableState: reachable(),
    legalAction: LEGAL_ACTION,
    terminalState: playedOut(),
    botTier: "easy",
    hiddenStateSamples: walkedStates,
  },
  { describe, it, expect },
);

describe("the table generalaModule builds", () => {
  /**
   * THE CARRIED ITEM, AND `createMatch` IS WHERE IT HAS TO BE REFUSED.
   *
   * Two seats holding the same `playerId` are not distinguishable anywhere
   * downstream. `getViewFor` resolves a seat with `indexOf` and takes the first
   * of them, so seat 1 would be shown seat 0's view forever; worse,
   * `applyHold`/`applyScore` decide whose turn it is by reading
   * `state.players[turn.seat]` and comparing, so with two identical ids the
   * check passes for BOTH seats and the wrong one acts. The engine's own
   * `view.ts` names the hole and says the place to close it is where a table is
   * BUILT — by then a state exists and every consumer of it is already wrong.
   *
   * This function is that place: `SeatAssignment[]` arrives from the platform
   * here and nowhere else, and `truco-module/src/index.ts:37-42` and
   * `escoba-module/src/index.ts:29-33` already refuse a malformed seat list on
   * exactly this line. Named by slices 4, 5, 6 and 7 without a task; assigned
   * to slice 9 because task 9.2 touches this same function for
   * `configOptions: []`.
   */
  it("refuses to seat one player twice", () => {
    expect(() => generalaModule.createMatch({}, [{ seat: 0, playerId: ALICE }, { seat: 1, playerId: ALICE }])).toThrow(/distinct player/);
  });

  it("refuses it whichever order the seats arrive in", () => {
    // The guard is over the players AT the seats, never over the array's own
    // order — a check comparing `seats[0]` with `seats[1]` would pass a list
    // the platform happened to hand over sorted and fail one it did not.
    expect(() => generalaModule.createMatch({}, [{ seat: 1, playerId: BOB }, { seat: 0, playerId: BOB }])).toThrow(/distinct player/);
  });

  it("refuses a seat list that is not one player at each of its two seats", () => {
    // Every shape the platform could hand over that is not a two-seat table:
    // too few, too many, and the same seat number twice — which collapses to
    // one seat and leaves the other empty.
    expect(() => generalaModule.createMatch({}, [{ seat: 0, playerId: ALICE }])).toThrow(/seats 0/);
    expect(() => generalaModule.createMatch({}, [...SEAT_ASSIGNMENTS, { seat: 2, playerId: "carol" as PlayerId }])).toThrow(/seats 0/);
    expect(() => generalaModule.createMatch({}, [{ seat: 0, playerId: ALICE }, { seat: 0, playerId: BOB }])).toThrow(/seats 0/);
    expect(() => generalaModule.createMatch({}, [{ seat: 3, playerId: ALICE }, { seat: 4, playerId: BOB }])).toThrow(/seats 0/);
  });

  /**
   * THE SIBLING THAT KEEPS ALL THREE REFUSALS FROM BEING VACUOUS, and the one
   * that says seat ORDER is read off the seat NUMBER.
   *
   * A `createMatch` that threw for everything satisfies every assertion above.
   * This one hands the seats over BACKWARDS and reads the seating back through
   * the module's own view: Alice is still seat 0, because the platform's
   * `SeatAssignment.seat` is the number and the array is just a carrier. An
   * implementation mapping `seats.map((s) => s.playerId)` passes a sorted list
   * and seats the table backwards here.
   */
  it("seats the table by the seat number, not by the order the assignments arrived in", () => {
    const backwards = generalaModule.createMatch({}, [{ seat: 1, playerId: BOB }, { seat: 0, playerId: ALICE }]);

    expect(generalaModule.getViewFor(backwards, ALICE).self).toEqual({ playerId: ALICE, seat: 0 });
    expect(generalaModule.getViewFor(backwards, BOB).self).toEqual({ playerId: BOB, seat: 1 });
    expect(backwards.turn).toEqual({ phase: "awaiting-roll", seat: 0, rollsUsed: 0, slots: [null, null, null, null, null] });
  });
});

describe("what generalaModule tells the registry", () => {
  /**
   * `configOptions` IS EMPTY, AND THE ASSERTION THAT COLLECTS ON IT IS SOMEBODY
   * ELSE'S.
   *
   * `deriveModalities` cartesian-products every declared option into its own
   * independent matchmaking pool, so one knob here is two lobbies to fill.
   * `platform-core/src/presence.test.ts:14` has asserted "yields exactly one
   * modality — the empty config — for a game with zero configOptions (Generala
   * has none)" since before this game existed, and `:70` counts
   * `pool.count("generala", {})`. Neither is touched by this change: the point
   * of a standing assertion is that the thing it was waiting for arrives and it
   * keeps passing. This test is the declaration on THIS side of that pair.
   *
   * The escalera al as is what makes it load-bearing rather than tidy: the
   * popular ruleset lists it "opcional, a convenir de antemano", and with no
   * knob to turn, "to be agreed" is not on by default — spec Domain C.
   */
  it("declares no config option at all, so the empty config is its only modality", () => {
    expect(generalaModule.configOptions).toEqual([]);
  });

  /**
   * EVERY FIELD, AS ONE OBJECT, BECAUSE `section` IS A BOOT-TIME FENCE.
   *
   * `catalogGroupingOf` falls back `section ?? gameFamily`, and
   * `createGameModuleRegistry` THROWS at composition when one family's entries
   * resolve to two sections. With a single entry that can never fire, and it
   * fires the day a `generala-3` lands without `section` — so the value is
   * pinned now rather than discovered then. Asserted as a whole object rather
   * than field by field: a sixth key appearing is a change to what the catalog
   * is told, and it should have to be written down here.
   */
  it("declares two seats, the dados shelf and its own family", () => {
    expect(generalaModule.metadata).toEqual({
      seatCount: 2,
      gameFamily: "generala",
      section: "dados",
      displayNameKey: "games.generala.name",
      assetBase: "/games/generala",
    });
    expect(generalaModule.id).toBe("generala");
  });
});

describe("the engine's three read members are handed through unwrapped", () => {
  /**
   * THIS TEST EXISTS BECAUSE THREE MUTATIONS FOUND NOTHING, and that is the
   * whole of its justification.
   *
   * Run against the module WITHOUT this assertion, all three of these came back
   * green on 30 of 30:
   *
   *   - `getLegalActions` filtered down to the score actions only — every hold
   *     silently dropped, so the acting seat can never re-roll and every turn
   *     becomes "score whatever the cup happened to show".
   *   - `getLegalActions` reversed on its way past.
   *   - `getViewFor` returning the view with `totals: []`.
   *
   * The conformance suite cannot see any of them: it asks whether the fixture's
   * one legal action is offered (a `score`), whether every action offered is
   * accepted (still true of a shortened list), and whether `getViewFor` throws
   * (it does not). The engine's own `legal-actions.exhaustive.test.ts` cannot
   * see them either, because it tests the ENGINE and the mutation is one layer
   * above it. It is exactly the false-green shape slice 8 hit: deep equality
   * cannot tell a returned thing from a rebuilt one, and neither can a test
   * that never compares the two ends of a pass-through.
   *
   * ASSERTED AS IDENTITY, WHICH IS THE CLAIM THE DOCSTRING MAKES. The module
   * says these three are the engine's own functions rather than lambdas that
   * narrow or reorder, and `toBe` is that sentence executed. The day a wrapper
   * is genuinely needed — the union growing an action a client must not be
   * offered would be one — this test reds and whoever adds it has to say so
   * here, which is the outcome that was missing.
   *
   * `createMatch` is deliberately NOT in this list: it is a lambda on purpose,
   * because `SeatAssignment[]` has to become a seat order and that adaptation
   * is this layer's whole job.
   */
  it("exposes the engine's own getLegalActions, getViewFor and getOutcome, not a wrapper around them", () => {
    expect(generalaModule.getLegalActions).toBe(getLegalActions);
    expect(generalaModule.getViewFor).toBe(getViewFor);
    expect(generalaModule.getOutcome).toBe(getOutcome);
  });
});
