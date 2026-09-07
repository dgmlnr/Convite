import { describe, expect, it } from "vitest";
import { CATEGORY_IDS, applyHold, applyPlayerAction, applyRoll, createMatch, getLegalActions } from "@hexdev/generala-engine";
import type { DieFace, MatchState, PlayerId, ScoreAction } from "@hexdev/generala-engine";
import type { ApplyResult } from "@hexdev/platform-contract";
import { SYSTEM_ACTOR_ID, applyAction } from "./index.js";
import type { RollDiceAction } from "./index.js";

const ALICE = "alice" as PlayerId;
const BOB = "bob" as PlayerId;
const SEATS: readonly PlayerId[] = [ALICE, BOB];

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
