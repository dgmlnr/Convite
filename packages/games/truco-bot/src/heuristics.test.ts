import { describe, expect, it } from "vitest";
import type { Card } from "@hexdev/truco-engine";
import { envidoPoints, handPower, scoreFollowingCardPlay } from "./heuristics.js";

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
