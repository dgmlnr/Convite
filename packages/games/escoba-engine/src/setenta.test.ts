import { describe, expect, it } from "vitest";
import type { Card, Rank, Suit } from "./card.js";
import type { TeamId } from "./ids.js";
import { scoreSetenta, setentaValue } from "./setenta.js";

// La setenta (arts. 11, 12 of the Reglamento Oficial, Juegos Bonaerenses
// 2026) — a WEIGHTED SUM of one card per suit, NOT lexicographic and NOT
// "whoever has the most sevens". See `escoba/reglas-verificadas` and design
// §D5. Values (art. 11.3): siete 21 · seis 18 · as 16 · cinco 15 · cuatro 14
// · tres 13 · dos 12 · FIGURAS 10 (sota, caballo, rey all tie).
//
// Every assertion below except the 73-vs-75 example is deliberately built to
// stay TRUE under H.3's "most sevens first" mutation and H.4's "wrong figure
// value" mutation (equal seven counts / equal or absent figures on both
// sides being compared) — so those two mutations later prove they invert
// ONLY the assertion they target, per the design's own mutation table (rows
// 10 and 11).

function card(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

const TEAM_A = "team-a" as TeamId;
const TEAM_B = "team-b" as TeamId;

function piles(
  teamACards: readonly Card[],
  teamBCards: readonly Card[],
): Readonly<Record<TeamId, readonly Card[]>> {
  return { [TEAM_A]: teamACards, [TEAM_B]: teamBCards };
}

describe("setentaValue — suit coverage (art. 11's own \"una carta por palo\")", () => {
  it("returns null for a team that does not hold at least one card of every suit — it does not compete", () => {
    const missingCopa = [card(7, "espada"), card(7, "basto"), card(7, "oro")];
    expect(setentaValue(missingCopa)).toBeNull();
  });
});

describe("scoreSetenta — team vs. team (arts. 11, 12, 17.1)", () => {
  it('the regulation\'s OWN worked example (art. 12.1): three sevens + a figure (63+10=73) LOSES to three sixes + a seven (54+21=75) — proves it is a SUM, not "most sevens first"', () => {
    const threeSevensAndAFigure = [
      card(7, "espada"),
      card(7, "basto"),
      card(7, "oro"),
      card(10, "copa"), // sota — 63 + 10 = 73
    ];
    const threeSixesAndASeven = [
      card(6, "espada"),
      card(6, "basto"),
      card(6, "oro"),
      card(7, "copa"), // 54 + 21 = 75
    ];
    const result = scoreSetenta(piles(threeSevensAndAFigure, threeSixesAndASeven), [TEAM_A, TEAM_B]);

    // under a "most sevens first" reading TEAM_A (3 sevens) would win — it
    // must not: 73 < 75.
    expect(result[TEAM_A]).toBe(0);
    expect(result[TEAM_B]).toBe(1);
  });

  it("four sevens is the maximum possible setenta (84) — beats art. 12.2's own second example, three sevens + a six (81)", () => {
    const fourSevens = [card(7, "espada"), card(7, "basto"), card(7, "oro"), card(7, "copa")];
    const threeSevensAndASix = [card(7, "espada"), card(7, "basto"), card(7, "oro"), card(6, "copa")];

    const result = scoreSetenta(piles(fourSevens, threeSevensAndASix), [TEAM_A, TEAM_B]);

    expect(result[TEAM_A]).toBe(1);
    expect(result[TEAM_B]).toBe(0);
  });

  it("sota, caballo, and rey are ALL worth 10 and therefore tie with each other, pairwise (art. 11.3)", () => {
    const withSota = [card(7, "espada"), card(7, "basto"), card(7, "oro"), card(10, "copa")];
    const withCaballo = [card(7, "espada"), card(7, "basto"), card(7, "oro"), card(11, "copa")];
    const withRey = [card(7, "espada"), card(7, "basto"), card(7, "oro"), card(12, "copa")];

    expect(scoreSetenta(piles(withSota, withCaballo), [TEAM_A, TEAM_B])).toEqual({
      [TEAM_A]: 0,
      [TEAM_B]: 0,
    });
    expect(scoreSetenta(piles(withCaballo, withRey), [TEAM_A, TEAM_B])).toEqual({
      [TEAM_A]: 0,
      [TEAM_B]: 0,
    });
    expect(scoreSetenta(piles(withSota, withRey), [TEAM_A, TEAM_B])).toEqual({
      [TEAM_A]: 0,
      [TEAM_B]: 0,
    });
  });

  it("uses the BEST card per suit among any number a team holds, not just the last one captured", () => {
    // TEAM_A holds two espada cards (7 and 2) in its pile — the 7 must be
    // the one that counts. Both sides share the exact same sota-of-copa and
    // seven-count-per-suit-slot shape so this stays true under either
    // mutation below (only the espada slot differs: 7 vs 4).
    const teamAPile = [
      card(7, "espada"),
      card(2, "espada"), // a weaker duplicate suit card — must be ignored
      card(6, "basto"),
      card(1, "oro"),
      card(10, "copa"), // sota
    ];
    const teamBPile = [card(4, "espada"), card(6, "basto"), card(1, "oro"), card(10, "copa")];

    const result = scoreSetenta(piles(teamAPile, teamBPile), [TEAM_A, TEAM_B]);

    expect(result[TEAM_A]).toBe(1);
    expect(result[TEAM_B]).toBe(0);
  });

  it("equal sums from genuinely DIFFERENT card combinations score NOBODY (arts. 11.2, 17.1)", () => {
    // {6,4,3,2} = 18+14+13+12 = 57; {1,5,4,2} = 16+15+14+12 = 57 — same
    // total, different cards, no sevens and no figures on either side.
    const comboOne = [card(6, "espada"), card(4, "basto"), card(3, "oro"), card(2, "copa")];
    const comboTwo = [card(1, "espada"), card(5, "basto"), card(4, "oro"), card(2, "copa")];

    const result = scoreSetenta(piles(comboOne, comboTwo), [TEAM_A, TEAM_B]);

    expect(result).toEqual({ [TEAM_A]: 0, [TEAM_B]: 0 });
  });

  it("a side that does not cover all four suits does not compete — the other side wins even with a lower raw total", () => {
    const missingCopa = [card(7, "espada"), card(7, "basto"), card(7, "oro")]; // would be 63 if it counted
    const allFourSuitsLow = [card(2, "espada"), card(2, "basto"), card(2, "oro"), card(2, "copa")]; // 48

    const result = scoreSetenta(piles(missingCopa, allFourSuitsLow), [TEAM_A, TEAM_B]);

    expect(result[TEAM_A]).toBe(0);
    expect(result[TEAM_B]).toBe(1);
  });

  it("scores NOBODY when neither team covers all four suits", () => {
    const missingCopa = [card(7, "espada"), card(7, "basto"), card(7, "oro")];
    const missingOro = [card(6, "espada"), card(6, "basto"), card(6, "copa")];

    const result = scoreSetenta(piles(missingCopa, missingOro), [TEAM_A, TEAM_B]);

    expect(result).toEqual({ [TEAM_A]: 0, [TEAM_B]: 0 });
  });
});
