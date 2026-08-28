import { describe, expect, it } from "vitest";
import { deal, redeal } from "./deal.js";
import { buildDeck } from "./deck.js";
import { cardId } from "./card.js";
import type { MatchState, Player, Team } from "./state.js";
import type { PlayerId, TeamId } from "./ids.js";

/** Deterministic stand-in for a CSPRNG: cycles through fixed values so the
 * shuffle is reproducible in a test — mirrors `truco-module/src/deal.test.ts`'s
 * own `fixedRng` helper exactly. */
function fixedRng(values: readonly number[]) {
  let i = 0;
  return () => values[i++ % values.length]!;
}

/** `rng()` always returns a value just under 1, so `Math.floor(rng() * (i +
 * 1))` equals `i` at every Fisher-Yates step — every "swap" trades a card
 * with itself, leaving the deck byte-identical to `buildDeck()`'s own
 * order. Not a claim the shuffle is broken: a deliberately hand-computable
 * fixture for the round-robin-vs-consecutive-block assertions below. */
const noSwapRng = () => 1 - 1e-9;

function fixtureMatch(seatCount: 2 | 4): MatchState {
  const teamAId = "team-a" as TeamId;
  const teamBId = "team-b" as TeamId;
  const playerIds = Array.from({ length: seatCount }, (_, seat) => `player-${seat}` as PlayerId);
  const teams: readonly [Team, Team] =
    seatCount === 2
      ? [
          { id: teamAId, playerIds: [playerIds[0]!], score: 0 },
          { id: teamBId, playerIds: [playerIds[1]!], score: 0 },
        ]
      : [
          { id: teamAId, playerIds: [playerIds[0]!, playerIds[2]!], score: 0 },
          { id: teamBId, playerIds: [playerIds[1]!, playerIds[3]!], score: 0 },
        ];
  const players: readonly Player[] = playerIds.map((id, seat) => ({
    id,
    teamId: seat % 2 === 0 ? teamAId : teamBId,
    seat,
    hand: [],
  }));
  return { teams, players, dealerSeat: 0, hand: null, pointsToWin: 30 };
}

describe("deal (art. 6.1 — the opening deal)", () => {
  it("gives 3 cards to each of 2 players, 4 to the table, and the rest to stock — all 40 cards accounted for exactly once", () => {
    const dealt = deal(fixtureMatch(2), fixedRng([0.31, 0.62, 0.05, 0.77, 0.44, 0.9, 0.13, 0.22, 0.55, 0.66, 0.08, 0.99]));
    expect(dealt.players[0]!.hand).toHaveLength(3);
    expect(dealt.players[1]!.hand).toHaveLength(3);
    expect(dealt.hand?.table).toHaveLength(4);
    expect(dealt.hand?.stock).toHaveLength(40 - 6 - 4);
    const allCards = [...dealt.players.flatMap((player) => player.hand), ...dealt.hand!.table, ...dealt.hand!.stock];
    expect(allCards).toHaveLength(40);
    expect(new Set(allCards.map(cardId)).size).toBe(40);
  });

  it("gives 3 cards to each of 4 players, 4 to the table, and the rest to stock", () => {
    const dealt = deal(fixtureMatch(4), fixedRng([0.31, 0.62, 0.05, 0.77, 0.44, 0.9, 0.13, 0.22, 0.55, 0.66, 0.08, 0.99, 0.17, 0.38]));
    for (const player of dealt.players) expect(player.hand).toHaveLength(3);
    expect(dealt.hand?.stock).toHaveLength(40 - 12 - 4);
  });

  it('deals ONE CARD AT A TIME, round-robin by seat (art. 6.1: "tres a cada uno, DE A UNA") — not three consecutive cards to the same player', () => {
    const dealt = deal(fixtureMatch(2), noSwapRng);
    const deck = buildDeck(); // unshuffled: espada 1..7,10,11,12, then basto, then oro, then copa
    // round-robin: seat0 <- deck[0], deck[2], deck[4]; seat1 <- deck[1], deck[3], deck[5]
    expect(dealt.players[0]!.hand).toEqual([deck[0], deck[2], deck[4]]);
    expect(dealt.players[1]!.hand).toEqual([deck[1], deck[3], deck[5]]);
    // the consecutive-block alternative (deck[0..2] / deck[3..5]) is a
    // DIFFERENT hand for the identical permutation — proving this engine
    // made the round-robin choice deliberately, not merely picked A choice.
    expect(dealt.players[0]!.hand).not.toEqual([deck[0], deck[1], deck[2]]);
    expect(dealt.players[1]!.hand).not.toEqual([deck[3], deck[4], deck[5]]);
    // table/stock come from what is left AFTER all hands are dealt (deck[6..])
    expect(dealt.hand?.table).toEqual([deck[6], deck[7], deck[8], deck[9]]);
    expect(dealt.hand?.stock).toEqual(deck.slice(10));
  });
});

describe("redeal (art. 6.1 — successive deals: 3 per player, never more to the table)", () => {
  it("gives 3 more cards to each player and adds NOTHING to the table when hands are empty and stock remains", () => {
    const opened = deal(fixtureMatch(2), fixedRng([0.31, 0.62, 0.05, 0.77, 0.44, 0.9, 0.13, 0.22, 0.55, 0.66, 0.08, 0.99]));
    const emptied: MatchState = { ...opened, players: opened.players.map((player) => ({ ...player, hand: [] })) };
    const tableBefore = emptied.hand!.table;
    const stockBefore = emptied.hand!.stock;

    const redealt = redeal(emptied);

    expect(redealt.players[0]!.hand).toHaveLength(3);
    expect(redealt.players[1]!.hand).toHaveLength(3);
    expect(redealt.hand!.table).toEqual(tableBefore); // unchanged — never more to the table
    expect(redealt.hand!.stock).toHaveLength(stockBefore.length - 6);
  });

  it("draws from the stock round-robin by seat too, in the SAME order the opening deal used", () => {
    const opened = deal(fixtureMatch(2), noSwapRng);
    const emptied: MatchState = { ...opened, players: opened.players.map((player) => ({ ...player, hand: [] })) };
    const stock = emptied.hand!.stock; // deck.slice(10), unshuffled

    const redealt = redeal(emptied);

    expect(redealt.players[0]!.hand).toEqual([stock[0], stock[2], stock[4]]);
    expect(redealt.players[1]!.hand).toEqual([stock[1], stock[3], stock[5]]);
    expect(redealt.hand!.stock).toEqual(stock.slice(6));
  });

  it("throws when there is no hand in progress to re-deal into", () => {
    expect(() => redeal(fixtureMatch(2))).toThrow();
  });
});
