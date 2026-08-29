import { describe, expect, it } from "vitest";
import { getMatchWinner, scoreHand } from "./scoring.js";
import type { Card, Rank, Suit } from "./card.js";
import type { HandState, MatchState, Player, Team } from "./state.js";
import type { PlayerId, TeamId } from "./ids.js";

// scoreHand — the aggregate per-hand score (design §D5, art. 8.1's category
// order): cartas, oros, setenta (Unit H's own module), siete de oro, and
// escobas. Every fixture below is HAND-BUILT to isolate the category under
// test: cartas is kept TIED (equal pile length) whenever a different
// category is the actual target, oros never crosses the threshold unless
// that IS the target, and no fixture ever holds the 7 de oro unless siete
// de oro (or puntaje menor, which needs exactly one resolving category) is
// the point being made.

function card(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

const PLAYER_0 = "player-0" as PlayerId;
const PLAYER_1 = "player-1" as PlayerId;
const TEAM_A = "team-a" as TeamId;
const TEAM_B = "team-b" as TeamId;
const TEAM_IDS: readonly [TeamId, TeamId] = [TEAM_A, TEAM_B];

// Filler cards for count-only fixtures: never "oro" suit and never rank 7,
// so they can never contribute to oros, siete de oro, or (missing the oro
// suit entirely) setenta's four-suit coverage requirement — every fixture
// built purely from `filler()` therefore scores 0-0 on oros/setenta/siete
// de oro regardless of length, isolating cartas cleanly. The SAME card
// values may appear in both teams' piles below (e.g. two teams both
// holding a "1-espada" filler) — this is a synthetic aggregator fixture,
// not a full-deck deal, and `scoreHand` never checks card provenance.
const FILLER_SUITS: readonly Suit[] = ["espada", "basto", "copa"];
function filler(n: number): Card[] {
  return Array.from({ length: n }, (_, i) => card(((i % 6) + 1) as Rank, FILLER_SUITS[i % FILLER_SUITS.length]!));
}

function handWith(pileA: readonly Card[], pileB: readonly Card[], escobasA = 0, escobasB = 0): HandState {
  return {
    table: [],
    stock: [],
    piles: { [TEAM_A]: pileA, [TEAM_B]: pileB },
    escobas: { [TEAM_A]: escobasA, [TEAM_B]: escobasB },
    turn: PLAYER_0,
    lastCapturer: null,
    outcome: null,
  };
}

/** Builds a match with given cumulative TEAM scores (art. 8.1's `tantos`,
 * NOT this hand's raw piles) and an optional in-progress hand — the match
 * is "between hands" (`hand: null`) unless one is supplied. */
function matchWith(scoreA: number, scoreB: number, hand: HandState | null = null): MatchState {
  const players: readonly Player[] = [
    { id: PLAYER_0, teamId: TEAM_A, seat: 0, hand: [] },
    { id: PLAYER_1, teamId: TEAM_B, seat: 1, hand: [] },
  ];
  const teams: readonly [Team, Team] = [
    { id: TEAM_A, playerIds: [PLAYER_0], score: scoreA },
    { id: TEAM_B, playerIds: [PLAYER_1], score: scoreB },
  ];
  return { teams, players, dealerSeat: 0, hand, pointsToWin: 30 };
}

describe("scoreHand — the five per-hand categories (art. 8.1)", () => {
  it("cartas (9.1): one point to the team with strictly MORE cards", () => {
    const result = scoreHand(handWith(filler(12), filler(8)), TEAM_IDS);
    expect(result[TEAM_A]).toBe(1);
    expect(result[TEAM_B]).toBe(0);
  });

  it("cartas (9.1/17.1): an EQUAL 20-20 split scores NOBODY", () => {
    const result = scoreHand(handWith(filler(20), filler(20)), TEAM_IDS);
    expect(result[TEAM_A]).toBe(0);
    expect(result[TEAM_B]).toBe(0);
  });

  it("oros (10.1): a THRESHOLD of six or more wins the point — 6 vs 4 scores", () => {
    // TEAM_A: 6 oro cards only (ranks 1-6, no 7 — keeps siete de oro out of
    // this fixture). TEAM_B: 4 oro cards (ranks 1-4) + 2 non-oro filler to
    // keep cartas TIED at 6-6, isolating the oros category.
    const pileA = [card(1, "oro"), card(2, "oro"), card(3, "oro"), card(4, "oro"), card(5, "oro"), card(6, "oro")];
    const pileB = [card(1, "oro"), card(2, "oro"), card(3, "oro"), card(4, "oro"), ...filler(2)];
    const result = scoreHand(handWith(pileA, pileB), TEAM_IDS);
    expect(result[TEAM_A]).toBe(1);
    expect(result[TEAM_B]).toBe(0);
  });

  it("oros (10.1): a 5-5 split scores NOBODY — it is a threshold, not a majority [mutation row 13 target]", () => {
    const pileA = [card(1, "oro"), card(2, "oro"), card(3, "oro"), card(4, "oro"), card(5, "oro")];
    const pileB = [card(1, "oro"), card(2, "oro"), card(3, "oro"), card(4, "oro"), card(5, "oro")];
    const result = scoreHand(handWith(pileA, pileB), TEAM_IDS);
    expect(result[TEAM_A]).toBe(0);
    expect(result[TEAM_B]).toBe(0);
  });

  it("siete de oro (13.1): always resolves to whoever holds it — never ties", () => {
    const pileA = [card(7, "oro"), ...filler(2)];
    const pileB = filler(3); // same length as pileA (3) — cartas tied
    const result = scoreHand(handWith(pileA, pileB), TEAM_IDS);
    expect(result[TEAM_A]).toBe(1);
    expect(result[TEAM_B]).toBe(0);
  });

  it("escobas (14.1): one point EACH, read straight off hand.escobas", () => {
    const result = scoreHand(handWith(filler(4), filler(4), 2, 1), TEAM_IDS);
    expect(result[TEAM_A]).toBe(2);
    expect(result[TEAM_B]).toBe(1);
  });

  it("puntaje menor (19.1): no escobas + cartas/oros/setenta ALL tied scores EXACTLY ONE point, the 7 de oro [mutation row 15 target]", () => {
    // TEAM_A: 7 de oro + a 2-espada (2 cards, 1 oro, missing basto/copa).
    // TEAM_B: a 3-copa + a 4-basto (2 cards, 0 oros, missing oro/espada).
    // cartas: 2 vs 2 -> tied. oros: 1 vs 0 -> both under the 6-threshold,
    // tied at "nobody". setenta: neither side covers all four suits ->
    // both null -> tied at "nobody". escobas: 0-0, explicitly. The ONLY
    // category left standing is siete de oro.
    const pileA = [card(7, "oro"), card(2, "espada")];
    const pileB = [card(3, "copa"), card(4, "basto")];
    const result = scoreHand(handWith(pileA, pileB, 0, 0), TEAM_IDS);
    expect(result[TEAM_A]).toBe(1);
    expect(result[TEAM_B]).toBe(0);
    expect(result[TEAM_A] + result[TEAM_B]).toBe(1); // exactly ONE point in the whole hand
  });
});

describe("getMatchWinner — the match is to THIRTY (art. 8.1), checked only at hand end (art. 18.1)", () => {
  it("does NOT end the match on a hand's in-progress piles — reads ONLY teams[].score, never state.hand", () => {
    // TEAM_A's cumulative match score is still 3 (low, nowhere near
    // pointsToWin), even though the CURRENT hand's piles already show a
    // lopsided 25-card lead for TEAM_A — a naive implementation that
    // peeked at `state.hand` (e.g. ran scoreHand() live) could be fooled
    // into ending the match mid-hand. The correct check never looks.
    const inProgress = handWith(filler(25), []);
    const match = matchWith(3, 0, inProgress);
    expect(getMatchWinner(match)).toBeNull();
  });

  it("an EQUAL total, even AT or ABOVE pointsToWin, does NOT end the match — art. 18.1's tie continues", () => {
    expect(getMatchWinner(matchWith(30, 30))).toBeNull();
    expect(getMatchWinner(matchWith(32, 32))).toBeNull(); // above 30 too, still a tie
  });

  it("an UNEQUAL total with at least one side at or above pointsToWin ends the match, higher score wins", () => {
    expect(getMatchWinner(matchWith(31, 28))).toBe(TEAM_A);
    expect(getMatchWinner(matchWith(20, 33))).toBe(TEAM_B); // direction-agnostic
  });

  it("an UNEQUAL total where NEITHER side has reached pointsToWin does not end the match [mutation row 14 target]", () => {
    // 25 vs 24: unequal, and both comfortably below 30. A mutation that
    // hardcodes the target to 21 would wrongly end the match here (both
    // sides clear 21), while every other test in this block is built to
    // stay green under that exact mutation (see the apply evidence).
    expect(getMatchWinner(matchWith(25, 24))).toBeNull();
  });
});
