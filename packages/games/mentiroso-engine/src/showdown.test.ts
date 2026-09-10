import { describe, expect, it } from "vitest";
import type { DieFace, MatchState, Player, PlayerId } from "./state.js";
import type { MentirosoAction } from "./legal-actions.js";
import { applyDoubt, resolveShowdown, tallyFace } from "./showdown.js";

type DoubtAction = Extract<MentirosoAction, { readonly type: "doubt" }>;

/**
 * A seat holding these exact `faces`, mirroring every sibling test file in
 * this package (`seating.test.ts`, `bids.test.ts`, `apply.test.ts`) — except
 * here the face VALUES matter (the tally reads them), so this helper takes
 * the actual faces rather than a bare count.
 */
function seatWith(seat: number, faces: readonly DieFace[]): Player {
  return { id: `p${String(seat)}` as PlayerId, seat, dice: faces };
}

function doubtBy(playerId: PlayerId): DoubtAction {
  return { type: "doubt", playerId };
}

describe("tallyFace (mentiroso-rules — exact face match, no wildcard for 1)", () => {
  it("counts only exact matches for the named face", () => {
    const players = [seatWith(0, [5, 5, 3]), seatWith(1, [5, 2, 1]), seatWith(2, [1, 1])];
    expect(tallyFace({ players, phase: { kind: "bidding", turnSeat: 0, bid: null } }, 5)).toBe(3);
  });

  it("THE FENCE: a die showing 1 is never wild — it counts toward face 1 only, never toward any other face", () => {
    // Bid face is 5: three dice read 5, and a DIFFERENT count (four) read 1 —
    // the two counts deliberately disagree, so a mutation that folded 1s into
    // every tally would move the face-5 count from 3 to 7, not merely
    // coincide with an already-correct answer.
    const players = [
      seatWith(0, [5, 5, 1, 1]),
      seatWith(1, [5, 1, 1]),
      seatWith(2, [3, 4]),
    ];
    const state: MatchState = { players, phase: { kind: "bidding", turnSeat: 0, bid: null } };
    expect(tallyFace(state, 5)).toBe(3);
    expect(tallyFace(state, 1)).toBe(4);
  });

  it("sums across every seat, including an eliminated seat's empty array", () => {
    const players = [seatWith(0, [2, 2]), seatWith(1, []), seatWith(2, [2])];
    const state: MatchState = { players, phase: { kind: "bidding", turnSeat: 0, bid: null } };
    expect(tallyFace(state, 2)).toBe(3);
  });
});

describe("applyDoubt — THE FENCE: the ties-go-to-the-bidder equality trap (convite/mentiroso/reglas-decididas: \"con cuatro o más -> pierde el que dudó\")", () => {
  it("matched EXACTLY equal to the bid quantity still wins for the bidder — a strict '>' would wrongly favor the doubter here", () => {
    // Bid: (4, 5). Exactly four dice read 5 among six total.
    const players = [seatWith(0, [5, 5, 5]), seatWith(1, [5, 2, 3])];
    const state: MatchState = { players, phase: { kind: "bidding", turnSeat: 1, bid: { quantity: 4, face: 5 } } };
    const result = applyDoubt(state, doubtBy(players[1]!.id));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable — asserted above");
    if (result.state.phase.kind !== "showdown") throw new Error("unreachable — asserted above");
    expect(result.state.phase.matched).toBe(4);
    expect(result.state.phase.loserSeat).toBe(1); // the doubter (seat 1) loses
    expect(result.state.phase.winnerSeat).toBe(0); // the bidder (seat 0) wins
  });

  it("matched one BELOW the bid quantity flips the outcome to the doubter — the companion negative control to the equality case above", () => {
    // Same bid (4, 5), but only three dice read 5 this time.
    const players = [seatWith(0, [5, 5, 2]), seatWith(1, [5, 2, 3])];
    const state: MatchState = { players, phase: { kind: "bidding", turnSeat: 1, bid: { quantity: 4, face: 5 } } };
    const result = applyDoubt(state, doubtBy(players[1]!.id));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable — asserted above");
    if (result.state.phase.kind !== "showdown") throw new Error("unreachable — asserted above");
    expect(result.state.phase.matched).toBe(3);
    expect(result.state.phase.loserSeat).toBe(0); // the bidder (seat 0) loses
    expect(result.state.phase.winnerSeat).toBe(1); // the doubter (seat 1) wins
  });
});

describe("applyDoubt — THE FENCE: winner-opens-next is independent of seat order, not 'whoever comes next'", () => {
  it("bidder wins from a seat that is NOT the seat that would naturally follow the doubter in turn order", () => {
    // 4 seats: 0 (bidder), 1 (eliminated), 2 (doubter — turn skipped 1 -> 2),
    // 3 (a bystander with no stake in this challenge). `nextActiveSeat(players, 2)`
    // would read 3 — a mutation that opened the next round with "whoever
    // comes next after the doubter" instead of the true winner would pick
    // seat 3, which has nothing to do with this showdown at all.
    const players = [seatWith(0, [6, 6, 6, 6]), seatWith(1, []), seatWith(2, [1, 1]), seatWith(3, [4])];
    const state: MatchState = { players, phase: { kind: "bidding", turnSeat: 2, bid: { quantity: 4, face: 6 } } };
    const result = applyDoubt(state, doubtBy(players[2]!.id));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable — asserted above");
    if (result.state.phase.kind !== "showdown") throw new Error("unreachable — asserted above");
    expect(result.state.phase.winnerSeat).toBe(0); // the bidder, not seat 3
  });

  it("doubter wins at a table of more than two active seats — not just 'the other seat' at a two-seat table", () => {
    // Same table as above, but one dice fewer at the ceiling face flips the
    // outcome. `doubterSeat` (2) is stored directly, never re-derived — this
    // is the branch a "hardcode winnerSeat = bidderSeat" bug would get wrong,
    // and seat 2 is neither seat 0 nor the array's first entry, so a
    // mutation defaulting to either could not pass by coincidence.
    const players = [seatWith(0, [6, 6, 6, 6]), seatWith(1, []), seatWith(2, [1, 1]), seatWith(3, [4])];
    const state: MatchState = { players, phase: { kind: "bidding", turnSeat: 2, bid: { quantity: 5, face: 6 } } };
    const result = applyDoubt(state, doubtBy(players[2]!.id));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable — asserted above");
    if (result.state.phase.kind !== "showdown") throw new Error("unreachable — asserted above");
    expect(result.state.phase.winnerSeat).toBe(2); // the doubter, not seat 0's naive neighbor
  });
});

describe("applyDoubt — THE FENCE: surrendering a die is distinct from being eliminated", () => {
  it("a loser with more than one die surrenders exactly one and stays active — every other seat's dice are untouched", () => {
    const players = [seatWith(0, [5, 5, 5]), seatWith(1, [5, 2, 3])];
    const state: MatchState = { players, phase: { kind: "bidding", turnSeat: 1, bid: { quantity: 4, face: 5 } } };
    const result = applyDoubt(state, doubtBy(players[1]!.id));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable — asserted above");
    const loser = result.state.players.find((player) => player.seat === 1)!;
    const bidder = result.state.players.find((player) => player.seat === 0)!;
    expect(loser.dice).toHaveLength(2); // had 3, surrendered exactly 1
    expect(bidder.dice).toHaveLength(3); // untouched
  });

  it("a loser surrendering their LAST die reaches zero but stays LISTED among the players (design D1)", () => {
    const players = [seatWith(0, [5, 5, 5]), seatWith(1, [5])];
    const state: MatchState = { players, phase: { kind: "bidding", turnSeat: 1, bid: { quantity: 4, face: 5 } } };
    const result = applyDoubt(state, doubtBy(players[1]!.id));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable — asserted above");
    expect(result.state.players).toHaveLength(2); // still listed, never removed
    const loser = result.state.players.find((player) => player.seat === 1)!;
    expect(loser.dice).toEqual([]);
  });
});

describe("applyDoubt — legality gates", () => {
  it("THE FENCE: doubt only applies during the bidding phase", () => {
    const players = [seatWith(0, [5]), seatWith(1, [5])];
    const state: MatchState = { players, phase: { kind: "awaiting-roll", openerSeat: 0 } };
    const result = applyDoubt(state, doubtBy(players[0]!.id));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable — asserted above");
    expect(result.violation.code).toBe("not-bidding");
  });

  it("THE FENCE: doubt is illegal at the opening of a round, when there is no bid yet to doubt", () => {
    const players = [seatWith(0, [5]), seatWith(1, [5])];
    const state: MatchState = { players, phase: { kind: "bidding", turnSeat: 0, bid: null } };
    const result = applyDoubt(state, doubtBy(players[0]!.id));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable — asserted above");
    expect(result.violation.code).toBe("illegal-doubt");
  });

  it("THE FENCE: a seat out of turn cannot doubt, even when a bid exists", () => {
    const players = [seatWith(0, [5]), seatWith(1, [5])];
    const state: MatchState = { players, phase: { kind: "bidding", turnSeat: 0, bid: { quantity: 1, face: 5 } } };
    const outOfTurn = players.find((candidate) => candidate.seat === 1)!;
    const result = applyDoubt(state, doubtBy(outOfTurn.id));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable — asserted above");
    expect(result.violation.code).toBe("illegal-doubt");
  });
});

describe("resolveShowdown — the showdown winner opens the next round", () => {
  it("transitions showdown into awaiting-roll with openerSeat set to the stored winnerSeat", () => {
    const players = [seatWith(0, [5, 5, 5]), seatWith(1, [])];
    const state: MatchState = {
      players,
      phase: { kind: "showdown", bid: { quantity: 4, face: 5 }, doubterSeat: 1, matched: 3, loserSeat: 1, winnerSeat: 0 },
    };
    const result = resolveShowdown(state);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable — asserted above");
    expect(result.state.phase).toEqual({ kind: "awaiting-roll", openerSeat: 0 });
    expect(result.state.players).toBe(state.players); // resolveShowdown itself never touches dice
  });

  it("THE FENCE: resolveShowdown only applies out of the showdown phase", () => {
    const players = [seatWith(0, [5]), seatWith(1, [5])];
    const state: MatchState = { players, phase: { kind: "bidding", turnSeat: 0, bid: null } };
    const result = resolveShowdown(state);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable — asserted above");
    expect(result.violation.code).toBe("not-showdown");
  });
});
