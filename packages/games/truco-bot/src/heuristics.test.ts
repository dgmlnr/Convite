import { describe, expect, it } from "vitest";
import type { Card, HandPlay, PlayerId, TeamId } from "@hexdev/truco-engine";
import { envidoPoints, handPower, scoreFollowingCardPlay, strongestOpposingPlay } from "./heuristics.js";

const ESPADA_1: Card = { suit: "espada", rank: 1 }; // strongest card in the deck
const BASTO_4: Card = { suit: "basto", rank: 4 }; // weakest group
const ORO_4: Card = { suit: "oro", rank: 4 }; // same weak group as basto-4 -> parda

describe("handPower", () => {
  it("sums the real engine card power of every card in the hand", () => {
    expect(handPower([ESPADA_1, BASTO_4])).toBe(14 + 1);
  });

  it("returns 0 for an empty hand, not a thrown error", () => {
    expect(handPower([])).toBe(0);
  });
});

describe("envidoPoints", () => {
  it("delegates to the real engine calculation, not a reimplementation", () => {
    const hand: readonly Card[] = [{ suit: "oro", rank: 7 }, { suit: "oro", rank: 6 }, { suit: "espada", rank: 1 }];
    expect(envidoPoints(hand)).toBe(20 + 7 + 6);
  });
});

describe("scoreFollowingCardPlay — following an already-visible opponent card", () => {
  it("scores a winning candidate higher than a losing candidate", () => {
    const winScore = scoreFollowingCardPlay(ESPADA_1, BASTO_4);
    const loseScore = scoreFollowingCardPlay(BASTO_4, ESPADA_1);
    expect(winScore > loseScore).toBe(true);
  });

  it("among two winning candidates, prefers the CHEAPER one (efficient win, saves strength)", () => {
    const strongerWin = scoreFollowingCardPlay(ESPADA_1, BASTO_4);
    const cheaperWin = scoreFollowingCardPlay({ suit: "basto", rank: 1 }, BASTO_4); // power 13, still beats power 1
    expect(cheaperWin > strongerWin).toBe(true);
  });

  it("a parda (equal power) scores lower than any real win", () => {
    const pardaScore = scoreFollowingCardPlay(ORO_4, BASTO_4);
    const winScore = scoreFollowingCardPlay(ESPADA_1, BASTO_4);
    expect(winScore > pardaScore).toBe(true);
  });
});

describe("strongestOpposingPlay — the 2v2-safe replacement for currentTrickPlays[0] (obs 33's own named bot gap: 'assumes exactly one opponent')", () => {
  const SELF_TEAM = "self:team" as TeamId;
  const OPPONENT_TEAM = "opponent:team" as TeamId;
  const TEAMMATE = "teammate" as PlayerId;
  const OPPONENT = "opponent" as PlayerId;
  const OPPONENT_2 = "opponent-2" as PlayerId;

  it("returns undefined when no one has played yet this trick (1v1 and 2v2 alike)", () => {
    expect(strongestOpposingPlay(SELF_TEAM, [])).toBeUndefined();
  });

  it("1v1: returns the single opponent's card — unchanged behavior", () => {
    const plays: readonly HandPlay[] = [{ playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, card: BASTO_4 }];
    expect(strongestOpposingPlay(SELF_TEAM, plays)).toEqual(BASTO_4);
  });

  it("2v2: a TEAMMATE played first — there is nothing to beat yet, NOT the teammate's own card (the exact bug: index [0] would wrongly return it)", () => {
    const plays: readonly HandPlay[] = [{ playerId: TEAMMATE, teamId: SELF_TEAM, seat: 2, card: ESPADA_1 }];
    expect(strongestOpposingPlay(SELF_TEAM, plays)).toBeUndefined();
  });

  it("2v2: teammate played, THEN an opponent played — returns the opponent's card, ignoring the teammate's", () => {
    const plays: readonly HandPlay[] = [
      { playerId: TEAMMATE, teamId: SELF_TEAM, seat: 2, card: ESPADA_1 },
      { playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, card: BASTO_4 },
    ];
    expect(strongestOpposingPlay(SELF_TEAM, plays)).toEqual(BASTO_4);
  });

  it("2v2: both opponents already played — returns the STRONGER of the two (the one that must actually be beaten)", () => {
    const plays: readonly HandPlay[] = [
      { playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, card: BASTO_4 },
      { playerId: OPPONENT_2, teamId: OPPONENT_TEAM, seat: 3, card: ESPADA_1 },
    ];
    expect(strongestOpposingPlay(SELF_TEAM, plays)).toEqual(ESPADA_1);
  });
});
