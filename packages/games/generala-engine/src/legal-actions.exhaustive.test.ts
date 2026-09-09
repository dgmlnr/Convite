import { describe, expect, it } from "vitest";

import type { PlayerId } from "./ids.js";
import { CROSSING_ORDER, getLegalActions } from "./legal-actions.js";
import type { GeneralaAction } from "./legal-actions.js";
import { applyHold, applyPlayerAction, applyScore } from "./play.js";
import { applyRoll } from "./roll.js";
import { scoreFor } from "./scoring.js";
import { CATEGORY_IDS, createMatch, ROLLS_PER_TURN } from "./state.js";
import type { MatchState } from "./state.js";
import type { ApplyResult } from "./violation.js";

const ALICE = "player-0" as PlayerId;
const BOB = "player-1" as PlayerId;
const CAROL = "player-2" as PlayerId;
const STRANGER = "nobody-at-this-table" as PlayerId;

/** Never five of a kind, so no throw in this file ends a match by servida. */
const PLAIN_HAND = [6, 6, 6, 2, 1] as const;

function accepted(result: ApplyResult): MatchState {
  if (!result.ok) throw new Error(`expected the action to be accepted, and it was refused: ${result.violation.code} — ${result.violation.message}`);
  return result.state;
}

/**
 * The room's own comparator, re-stated here on purpose.
 *
 * `match-room.ts:256-268` decides whether a submitted action is one the game
 * offered by walking arrays BY INDEX — `sameAction`, not `JSON.stringify`.
 * Asserting against a copy of it is what makes this file a statement about what
 * the room will actually admit, rather than about a comparison this test
 * invented. `generala-engine` is L0 and may not import the transport, so the
 * alternative to re-stating it is asserting something weaker.
 */
function sameActionAsTheRoomWould(submitted: unknown, offered: unknown): boolean {
  if (submitted === offered) return true;
  if (typeof submitted !== "object" || typeof offered !== "object" || submitted === null || offered === null) return false;
  if (Array.isArray(submitted) || Array.isArray(offered)) {
    if (!Array.isArray(submitted) || !Array.isArray(offered) || submitted.length !== offered.length) return false;
    return submitted.every((item, index) => sameActionAsTheRoomWould(item, offered[index]));
  }
  const left = submitted as Record<string, unknown>;
  const right = offered as Record<string, unknown>;
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) return false;
  return leftKeys.every((key) => Object.hasOwn(right, key) && sameActionAsTheRoomWould(left[key], right[key]));
}

/**
 * Every array of DISTINCT die positions a client could put on the wire, in
 * every order — 326 of them — plus six shapes that are not that.
 *
 * The 31 the engine offers are the ascending ones of length four or less. The
 * other 301 are what makes this property say something: a reducer that accepted
 * any permutation would still satisfy "everything offered is accepted" while
 * admitting moves the room can never submit, which is the exact divergence
 * escoba was found with.
 */
function everyKeepAClientCouldSend(): readonly (readonly number[])[] {
  const all: number[][] = [];
  const chosen: number[] = [];
  const walk = (): void => {
    all.push([...chosen]);
    for (let index = 0; index < 5; index += 1) {
      if (chosen.includes(index)) continue;
      chosen.push(index);
      walk();
      chosen.pop();
    }
  };
  walk();
  return [...all, [0, 0], [5], [-1], [1.5], [0, 1, 1], [Number.NaN]];
}

const KEEP_CANDIDATES = everyKeepAClientCouldSend();

/** Every action any actor could submit against a table with these seats. */
function everyActionAClientCouldSend(seats: readonly PlayerId[]): readonly GeneralaAction[] {
  const actions: GeneralaAction[] = [];
  for (const playerId of [...seats, STRANGER]) {
    for (const keep of KEEP_CANDIDATES) actions.push({ type: "hold", playerId, keep });
    for (const category of CATEGORY_IDS) actions.push({ type: "score", playerId, category });
  }
  return actions;
}

/**
 * One whole turn played through the real reducers: throw, then write a box.
 *
 * The box is the engine's OWN first offer rather than the first open one on the
 * card. Since the crossing ladder landed those are different questions — an
 * open box worth nothing is not writable unless it is the highest-paying one
 * still open — and a driver that picked the second would be scripting a match
 * the engine cannot play.
 */
function playOneTurn(state: MatchState): MatchState {
  const rolled = accepted(applyRoll(state, PLAIN_HAND));
  const turn = rolled.turn;
  if (turn.phase !== "deciding") throw new Error(`expected to be deciding after the throw, and the turn is ${turn.phase}`);
  const offer = getLegalActions(rolled, rolled.players[turn.seat]!).find((action) => action.type === "score");
  if (offer === undefined) throw new Error("the seat on turn was offered no box at all, so a turn cannot be ended");
  return accepted(applyScore(rolled, offer));
}

/** Advance a `deciding` turn by one throw: hold nothing, roll all five again. */
function throwAgain(state: MatchState, playerId: PlayerId): MatchState {
  return accepted(applyRoll(accepted(applyHold(state, { type: "hold", playerId, keep: [] })), PLAIN_HAND));
}

/**
 * Reachable `deciding` states, spanning every `rollsUsed` and scorecards from
 * empty to one box remaining — played out through the real reducers, never
 * assembled. A sampled state a producer could not have built proves nothing
 * about a game a producer builds.
 */
function sampledDecidingStates(): readonly MatchState[] {
  const fresh = accepted(applyRoll(createMatch([ALICE, BOB]), PLAIN_HAND));
  const threeSeats = accepted(applyRoll(playOneTurn(createMatch([ALICE, BOB, CAROL])), PLAIN_HAND));

  let nearlyDone = createMatch([ALICE, BOB]);
  for (let turn = 0; turn < 20; turn += 1) nearlyDone = playOneTurn(nearlyDone);
  const lastBox = accepted(applyRoll(nearlyDone, PLAIN_HAND));

  return [
    fresh, // rollsUsed 1, every box open
    throwAgain(fresh, ALICE), // rollsUsed 2
    throwAgain(throwAgain(fresh, ALICE), ALICE), // rollsUsed 3, no throw left
    threeSeats, // a three-seat table, seat 1 on turn
    lastBox, // rollsUsed 1, exactly one box open — where a "pick the best box" heuristic falls through
    throwAgain(throwAgain(lastBox, ALICE), ALICE), // rollsUsed 3 AND one box open, both ends at once
  ];
}

describe("the offered set and the accepted set are the same set", () => {
  it("accepts exactly what it offers, over every action a client could send", () => {
    // THE EXHAUSTIVENESS PROPERTY, and since PR #257 it is a correctness
    // requirement rather than tidiness: `handleAction` admits a submitted
    // action only if `getLegalActions` offered it, so a legal action the offer
    // list fails to emit is UNSUBMITTABLE — the player simply cannot make that
    // move. The other direction matters too: an acceptance the offer list never
    // emits is unreachable through the room, and only a direct caller could use
    // it. Escoba was found with exactly that second divergence and the gate
    // narrowed it after the fact.
    const states = sampledDecidingStates();
    const candidates = everyActionAClientCouldSend([ALICE, BOB]);
    const seen = { rollsUsed: new Set<number>(), openBoxes: new Set<number>(), accepted: 0, checked: 0 };

    for (const state of states) {
      const turn = state.turn;
      if (turn.phase !== "deciding") throw new Error("every sampled state is a deciding one");
      seen.rollsUsed.add(turn.rollsUsed);
      seen.openBoxes.add(CATEGORY_IDS.filter((category) => state.cards[turn.seat]![category] === null).length);

      const offeredTo = new Map(state.players.map((seat) => [seat, getLegalActions(state, seat)] as const));
      offeredTo.set(STRANGER, getLegalActions(state, STRANGER));

      for (const action of [...candidates, ...everyActionAClientCouldSend(state.players)]) {
        const offered = offeredTo.get(action.playerId) ?? [];
        const wasOffered = offered.some((legal) => sameActionAsTheRoomWould(action, legal));
        const result = applyPlayerAction(state, action);

        expect(result.ok, `${JSON.stringify(action)} was ${wasOffered ? "offered" : "not offered"} and the reducer said ${String(result.ok)}`).toBe(wasOffered);
        seen.checked += 1;
        if (result.ok) seen.accepted += 1;
      }
    }

    // The loops are only worth something if they ran, and if they ran over the
    // spread the property claims: every roll counter a turn can hold, and
    // scorecards from untouched to one box left.
    expect(states).toHaveLength(6);
    expect([...seen.rollsUsed].sort()).toEqual([1, 2, 3]);
    expect([...seen.openBoxes].sort((left, right) => left - right)).toEqual([1, 11]);
    expect(candidates).toHaveLength(1029); // 3 actors x (332 keeps + 11 boxes)
    expect(seen.checked).toBe(12691);
    // And a reducer that refused everything would satisfy every assertion above
    // only if the offer list were empty too. It is not, so this is the shape of
    // the false green that is being ruled out rather than assumed away.
    //
    // WORKED OUT RATHER THAN PASTED, because the crossing ladder moved it and a
    // number nobody can re-derive is a number nobody can argue with. On
    // `[6,6,6,2,1]` an untouched card is offered four boxes — `ones`, `twos`
    // and `sixes` are worth something, and of the eight worth nothing only
    // `generala-doble` may be crossed — so 35 actions while a throw remains and
    // 4 once they are gone. `lastBox` has one open box, which is the crossable
    // one: 32 and 1. Each seat is named by exactly two of the candidate lists,
    // so (35 + 35 + 4 + 35 + 32 + 1) x 2 = 284.
    expect(seen.accepted).toBe(284);
  });
});

describe("deciding is never empty, whatever the scorecard says", () => {
  it("offers the seat on turn at least one score action at every point in a whole match", () => {
    // THE INVARIANT `runAdvanceOnce` RESTS ON. A `deciding` turn with no legal
    // action leaves the transport with no seat able to act and no system action
    // to request, which is a table that sits forever — and it is the invariant
    // `generala-bot` will rely on rather than assume, so it is pinned HERE, in
    // the engine, where breaking it reds this file and not the bot's.
    let state = createMatch([ALICE, BOB]);
    const openCountsSeen: number[] = [];

    for (let turn = 0; turn < 22; turn += 1) {
      const rolled = accepted(applyRoll(state, PLAIN_HAND));
      const current = rolled.turn;
      if (current.phase !== "deciding") throw new Error(`expected to be deciding, and the turn is ${current.phase}`);
      const card = rolled.cards[current.seat]!;
      const open = CATEGORY_IDS.filter((category) => card[category] === null);
      openCountsSeen.push(open.length);

      // The one box a seat may always write, whatever the dice did: the
      // highest-paying open one (ruleset §Orden obligatorio de tachado). It
      // takes its own value if it has one and a zero if it has not, so it is
      // never the reason a turn cannot be ended.
      const crossable = CROSSING_ORDER.find((category) => card[category] === null)!;

      for (const rollsUsed of [1, 2, ROLLS_PER_TURN]) {
        const atCounter: MatchState = { ...rolled, turn: { ...current, rollsUsed } };
        const scores = getLegalActions(atCounter, ALICE === atCounter.players[current.seat] ? ALICE : BOB).filter((action) => action.type === "score");
        expect(scores.length).toBeGreaterThanOrEqual(1);
        expect(scores.map((action) => action.category)).toContain(crossable);
        // Every box offered is either worth something or the crossable one,
        // which is the rule read back off the list rather than off the ladder.
        for (const action of scores) {
          expect(action.category === crossable || scoreFor(action.category, current.dice, rollsUsed, card) > 0, `${action.category} is offered but is neither worth anything nor the crossable box`).toBe(true);
        }
      }

      state = accepted(applyScore(rolled, { type: "score", playerId: rolled.players[current.seat]!, category: crossable }));
    }

    // A whole match, both seats, every scorecard from eleven boxes open down to
    // one. The counts are asserted so the loop cannot pass by running short.
    expect(openCountsSeen).toHaveLength(22);
    expect(new Set(openCountsSeen)).toEqual(new Set([11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]));
    expect(state.cards.every((card) => CATEGORY_IDS.every((category) => card[category] !== null))).toBe(true);
  });
});
