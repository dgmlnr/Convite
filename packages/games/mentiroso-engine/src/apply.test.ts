import { describe, expect, it } from "vitest";
import type { DieFace, MatchState, Player, PlayerId } from "./state.js";
import type { MentirosoAction } from "./legal-actions.js";
import { getLegalActions } from "./legal-actions.js";
import { applyOpeningDrawRoll, applyRaise, applyRoundRoll } from "./apply.js";

/**
 * A seat holding `diceCount` dice, mirroring every sibling test file in this
 * package (`seating.test.ts`, `bids.test.ts`, `legal-actions.test.ts`) — the
 * face VALUE never matters for these fixtures, only the dice COUNT.
 */
function seatOf(seat: number, diceCount: number): Player {
  const dice: DieFace[] = Array.from({ length: diceCount }, () => 1 as DieFace);
  return { id: `p${String(seat)}` as PlayerId, seat, dice };
}

describe("applyOpeningDrawRoll — a single highest roller opens outright (design D3)", () => {
  it("THE FENCE: the winning SEAT is not the winning INDEX — a reducer that hardcoded contenders[0] would pick the wrong seat", () => {
    // contenders[0] is seat 2, contenders[1] is seat 0, contenders[2] is seat
    // 3 — the top face (6) is rolled by whoever sits at INDEX 1, so the
    // winning seat (0) and the winning index (1) deliberately disagree.
    const players = [seatOf(0, 3), seatOf(2, 3), seatOf(3, 3)];
    const state: MatchState = { players, phase: { kind: "opening-draw", contenders: [2, 0, 3], lastFaces: [] } };
    const result = applyOpeningDrawRoll(state, [4, 6, 2]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable — asserted above");
    expect(result.state.phase).toEqual({ kind: "awaiting-roll", openerSeat: 0 });
  });
});

describe("applyOpeningDrawRoll — tied seats re-roll among themselves, repeatedly if necessary (mentiroso-hidden-dice)", () => {
  it("k=2 tied rounds resolve on the k+1=3rd action, contenders narrowing and never growing back", () => {
    const players = [seatOf(0, 3), seatOf(1, 3), seatOf(2, 3), seatOf(3, 3), seatOf(4, 3)];
    let state: MatchState = { players, phase: { kind: "opening-draw", contenders: [0, 1, 2, 3, 4], lastFaces: [] } };

    // Action 1 of 3: seats 1 and 3 tie for the highest face (6); seats 0, 2,
    // and 4 fall away. Neither tied seat sits at contenders' index 0.
    const first = applyOpeningDrawRoll(state, [3, 6, 2, 6, 4]);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("unreachable — asserted above");
    expect(first.state.phase).toEqual({ kind: "opening-draw", contenders: [1, 3], lastFaces: [3, 6, 2, 6, 4] });
    state = first.state;

    // Action 2 of 3 (k=1 tie so far): the two survivors tie AGAIN — contenders
    // must not grow back to the original five.
    const second = applyOpeningDrawRoll(state, [5, 5]);
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("unreachable — asserted above");
    expect(second.state.phase).toEqual({ kind: "opening-draw", contenders: [1, 3], lastFaces: [5, 5] });
    state = second.state;

    // Action 3 of 3 (k=2 ties total): seat 3 — index 1 of contenders, not
    // index 0 — finally wins outright.
    const third = applyOpeningDrawRoll(state, [2, 6]);
    expect(third.ok).toBe(true);
    if (!third.ok) throw new Error("unreachable — asserted above");
    expect(third.state.phase).toEqual({ kind: "awaiting-roll", openerSeat: 3 });
  });
});

describe("applyOpeningDrawRoll — THE FENCE: exactly one die per current contender, never more, never fewer", () => {
  it("rejects a roll carrying more faces than there are contenders", () => {
    const players = [seatOf(0, 3), seatOf(1, 3), seatOf(2, 3)];
    const state: MatchState = { players, phase: { kind: "opening-draw", contenders: [1, 2], lastFaces: [] } };
    const result = applyOpeningDrawRoll(state, [3, 4, 5]);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable — asserted above");
    expect(result.violation.code).toBe("wrong-face-count");
  });

  it("rejects a roll carrying fewer faces than there are contenders", () => {
    const players = [seatOf(0, 3), seatOf(1, 3), seatOf(2, 3)];
    const state: MatchState = { players, phase: { kind: "opening-draw", contenders: [0, 1, 2], lastFaces: [] } };
    const result = applyOpeningDrawRoll(state, [3, 4]);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable — asserted above");
    expect(result.violation.code).toBe("wrong-face-count");
  });
});

describe("applyOpeningDrawRoll — THE FENCE: a face outside the six real ones is refused at run time", () => {
  it("rejects a malformed face even though DieFace is compile-time only", () => {
    const players = [seatOf(0, 3), seatOf(1, 3)];
    const state: MatchState = { players, phase: { kind: "opening-draw", contenders: [0, 1], lastFaces: [] } };
    const result = applyOpeningDrawRoll(state, [3, 7 as DieFace]);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable — asserted above");
    expect(result.violation.code).toBe("malformed-face");
  });
});

describe("applyOpeningDrawRoll — THE FENCE: an opening-draw roll only applies during the opening draw", () => {
  it("rejects a roll submitted against a bidding-phase state", () => {
    const players = [seatOf(0, 3), seatOf(1, 3)];
    const state: MatchState = { players, phase: { kind: "bidding", turnSeat: 0, bid: null } };
    const result = applyOpeningDrawRoll(state, [3, 4]);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable — asserted above");
    expect(result.violation.code).toBe("not-opening-draw");
  });
});

describe("applyRaise — accepts what getLegalActions offers, and nothing else (design D2)", () => {
  it("a legal raise, taken directly off getLegalActions, updates the bid and advances the turn to the next seat STILL HOLDING DICE, skipping an eliminated one", () => {
    // Array order deliberately shuffled, and seat 3 — the NAIVE "next" seat
    // after seat 2 — already holds zero dice: `nextActiveSeat`'s FIRST real
    // consumer (introduced unconsumed in work unit A2), adopted here.
    const players = [seatOf(2, 5), seatOf(0, 5), seatOf(3, 0), seatOf(1, 5)];
    const state: MatchState = { players, phase: { kind: "bidding", turnSeat: 2, bid: null } };
    const turnPlayer = players.find((candidate) => candidate.seat === 2)!;

    const legal = getLegalActions(state, turnPlayer.id).find((action) => action.type === "raise");
    expect(legal).toBeDefined();

    const result = applyRaise(state, legal as Extract<MentirosoAction, { readonly type: "raise" }>);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable — asserted above");
    expect(result.state.phase).toEqual({ kind: "bidding", turnSeat: 0, bid: (legal as { bid: unknown }).bid });
  });

  it("THE FENCE: a bid that is not strictly greater than the current one is refused", () => {
    const players = [seatOf(0, 5), seatOf(1, 5)];
    const state: MatchState = { players, phase: { kind: "bidding", turnSeat: 0, bid: { quantity: 5, face: 3 } } };
    const action: Extract<MentirosoAction, { readonly type: "raise" }> = {
      type: "raise",
      playerId: players[0]!.id,
      bid: { quantity: 5, face: 2 }, // same quantity, LOWER face — never legal
    };
    const result = applyRaise(state, action);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable — asserted above");
    expect(result.violation.code).toBe("illegal-raise");
  });

  it("THE FENCE: a seat out of turn cannot raise, even with an otherwise-legal bid", () => {
    const players = [seatOf(0, 5), seatOf(1, 5)];
    const state: MatchState = { players, phase: { kind: "bidding", turnSeat: 0, bid: null } };
    const outOfTurn = players.find((candidate) => candidate.seat === 1)!;
    const action: Extract<MentirosoAction, { readonly type: "raise" }> = {
      type: "raise",
      playerId: outOfTurn.id,
      bid: { quantity: 1, face: 1 },
    };
    const result = applyRaise(state, action);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable — asserted above");
    expect(result.violation.code).toBe("illegal-raise");
  });

  it("THE FENCE: a raise only applies during the bidding phase", () => {
    const players = [seatOf(0, 5), seatOf(1, 5)];
    const state: MatchState = { players, phase: { kind: "awaiting-roll", openerSeat: 0 } };
    const action: Extract<MentirosoAction, { readonly type: "raise" }> = {
      type: "raise",
      playerId: players[0]!.id,
      bid: { quantity: 1, face: 1 },
    };
    const result = applyRaise(state, action);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable — asserted above");
    expect(result.violation.code).toBe("not-bidding");
  });
});

/**
 * `applyRoundRoll` — the SECOND of `mentiroso-module`'s two D3 entropy shapes
 * (SDD `mentiroso`, work unit C3/task 3.3). `roll.ts` (work unit C1) already
 * materializes `RoundRollAction.diceBySeat` — one already-drawn array per
 * seat, index-aligned with `state.players` — and named THIS unit as its own
 * adopter ("applyAction (work unit C3, the first seat-count registration) is
 * what will interpret both actions"). No engine reducer existed to interpret
 * the SECOND shape until now; `applyOpeningDrawRoll` (work unit B3) only ever
 * interpreted the first.
 */
describe("applyRoundRoll — every seat's freshly drawn dice replace its own (design D3)", () => {
  it("assigns each seat's own dice and opens a fresh round of bidding at the opener's seat, with no prior bid", () => {
    // Asymmetric dice counts per seat (3, 1, 2) — the same "no two readings
    // coincide" discipline `mentiroso-module/src/roll.ts`'s own tests already
    // apply: a fixture where every seat holds the same count could not tell
    // "one array per seat" from "one array per die" apart.
    const players = [seatOf(0, 3), seatOf(1, 1), seatOf(2, 2)];
    const state: MatchState = { players, phase: { kind: "awaiting-roll", openerSeat: 2 } };

    const result = applyRoundRoll(state, [
      [4, 4, 4],
      [5],
      [6, 6],
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable — asserted above");
    expect(result.state.players.map((player) => player.dice)).toEqual([[4, 4, 4], [5], [6, 6]]);
    expect(result.state.phase).toEqual({ kind: "bidding", turnSeat: 2, bid: null });
  });

  it("an eliminated seat still owns its own entry, empty, never omitted", () => {
    const players = [seatOf(0, 0), seatOf(1, 4)];
    const state: MatchState = { players, phase: { kind: "awaiting-roll", openerSeat: 1 } };

    const result = applyRoundRoll(state, [[], [1, 2, 3, 4]]);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable — asserted above");
    expect(result.state.players[0]!.dice).toEqual([]);
  });

  it("THE FENCE: a round roll only applies while awaiting one", () => {
    const players = [seatOf(0, 3), seatOf(1, 3)];
    const state: MatchState = { players, phase: { kind: "bidding", turnSeat: 0, bid: null } };
    const result = applyRoundRoll(state, [[4, 4, 4], [4, 4, 4]]);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable — asserted above");
    expect(result.violation.code).toBe("not-awaiting-roll");
  });

  it("THE FENCE: rejects a roll carrying the wrong number of seat entries", () => {
    const players = [seatOf(0, 3), seatOf(1, 3), seatOf(2, 3)];
    const state: MatchState = { players, phase: { kind: "awaiting-roll", openerSeat: 0 } };
    const result = applyRoundRoll(state, [[4, 4, 4], [4, 4, 4]]);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable — asserted above");
    expect(result.violation.code).toBe("wrong-seat-count");
  });

  it("THE FENCE: rejects a seat whose fresh dice count does not match how many it already held", () => {
    // Seat 0 holds 3 dice and the roll carries only 2 for it — asymmetric
    // counts (3 vs 1 for seat 1) so this could not be mistaken for a
    // dice-vs-seat confusion.
    const players = [seatOf(0, 3), seatOf(1, 1)];
    const state: MatchState = { players, phase: { kind: "awaiting-roll", openerSeat: 1 } };
    const result = applyRoundRoll(state, [[4, 4], [5]]);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable — asserted above");
    expect(result.violation.code).toBe("wrong-dice-count");
  });

  it("THE FENCE: rejects a malformed face even though DieFace is compile-time only", () => {
    const players = [seatOf(0, 2), seatOf(1, 1)];
    const state: MatchState = { players, phase: { kind: "awaiting-roll", openerSeat: 0 } };
    const result = applyRoundRoll(state, [[4, 7 as DieFace], [5]]);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable — asserted above");
    expect(result.violation.code).toBe("malformed-face");
  });
});
