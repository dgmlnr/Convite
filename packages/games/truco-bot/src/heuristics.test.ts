import { describe, expect, it } from "vitest";
import type { Card, HandPlay, PlayerId, PlayerView, TeamId } from "@hexdev/truco-engine";
import { MAX_SENAS_PER_HAND } from "@hexdev/truco-engine";
import { envidoPoints, handPower, isTrickSecuredByTeam, scoreFollowingCardPlay, strongestOpposingPlay, strongestPartnerPlay } from "./heuristics.js";

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

describe("strongestPartnerPlay — the PARTNER's best card on the table this trick (the bot's own side of strongestOpposingPlay's line)", () => {
  const SELF = "self" as PlayerId;
  const SELF_TEAM = "self:team" as TeamId;
  const OPPONENT_TEAM = "opponent:team" as TeamId;
  const TEAMMATE = "teammate" as PlayerId;
  const OPPONENT = "opponent" as PlayerId;

  it("returns undefined when no one has played yet this trick", () => {
    expect(strongestPartnerPlay(SELF, SELF_TEAM, [])).toBeUndefined();
  });

  it("1v1: only an opponent has played — there is no partner play to lean on", () => {
    const plays: readonly HandPlay[] = [{ playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, card: BASTO_4 }];
    expect(strongestPartnerPlay(SELF, SELF_TEAM, plays)).toBeUndefined();
  });

  it("2v2: returns the teammate's card, ignoring an opponent's stronger one", () => {
    const plays: readonly HandPlay[] = [
      { playerId: TEAMMATE, teamId: SELF_TEAM, seat: 2, card: BASTO_4 },
      { playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, card: ESPADA_1 },
    ];
    expect(strongestPartnerPlay(SELF, SELF_TEAM, plays)).toEqual(BASTO_4);
  });

  it("excludes the bot's OWN play — a same-team play by SELF is not a partner's", () => {
    const plays: readonly HandPlay[] = [{ playerId: SELF, teamId: SELF_TEAM, seat: 0, card: ESPADA_1 }];
    expect(strongestPartnerPlay(SELF, SELF_TEAM, plays)).toBeUndefined();
  });
});

describe("isTrickSecuredByTeam — 'my partner already won this trick and I close it'", () => {
  const SELF = "self" as PlayerId;
  const SELF_TEAM = "self:team" as TeamId;
  const OPPONENT_TEAM = "opponent:team" as TeamId;
  const TEAMMATE = "teammate" as PlayerId;
  const OPPONENT = "opponent" as PlayerId;
  const OPPONENT_2 = "opponent-2" as PlayerId;
  const ESPADA_3: Card = { suit: "espada", rank: 3 }; // power 10 — strong, but loses to espada-1

  /** A 2v2 view (one teammate, two opponents) with only the fields the
   * predicate reads set meaningfully — same minimal-fixture style as the
   * bot tests' own `viewWith`. */
  function view2v2(currentTrickPlays: readonly HandPlay[]): PlayerView {
    return {
      self: { playerId: SELF, teamId: SELF_TEAM, seat: 0, hand: [], lastSena: null, senasRemaining: MAX_SENAS_PER_HAND },
      teammates: [{ playerId: TEAMMATE, seat: 2, cardsRemaining: 2, lastSena: null }],
      opponents: [
        { playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, cardsRemaining: 2 },
        { playerId: OPPONENT_2, teamId: OPPONENT_TEAM, seat: 3, cardsRemaining: 2 },
      ],
      teams: [{ id: SELF_TEAM, score: 0 }, { id: OPPONENT_TEAM, score: 0 }],
      hand: {
        manoSeat: 0,
        truco: { status: "none" },
        envido: { status: "none" },
        turnSeat: 0,
        currentTrickPlays,
        resolvedTrickPlays: [],
        callEvents: [],
        trickOutcomes: [],
        outcome: { decided: false },
      },
      config: { pointsToWin: 15 },
      dealerSeat: 1,
    };
  }

  it("true when the bot closes the trick and the partner's play beats both opposing plays", () => {
    const secured = isTrickSecuredByTeam(
      view2v2([
        { playerId: TEAMMATE, teamId: SELF_TEAM, seat: 2, card: ESPADA_1 },
        { playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, card: ESPADA_3 },
        { playerId: OPPONENT_2, teamId: OPPONENT_TEAM, seat: 3, card: BASTO_4 },
      ]),
    );
    expect(secured).toBe(true);
  });

  it("false when an opponent is still to play — the partner leads NOW but the trick is not closed", () => {
    const secured = isTrickSecuredByTeam(
      view2v2([
        { playerId: TEAMMATE, teamId: SELF_TEAM, seat: 2, card: ESPADA_1 },
        { playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, card: BASTO_4 },
      ]),
    );
    expect(secured).toBe(false);
  });

  it("false when the partner's best play only TIES the opposition — a parda is not a win (resolveTrick's own strictness)", () => {
    const secured = isTrickSecuredByTeam(
      view2v2([
        { playerId: TEAMMATE, teamId: SELF_TEAM, seat: 2, card: ORO_4 },
        { playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, card: BASTO_4 },
        { playerId: OPPONENT_2, teamId: OPPONENT_TEAM, seat: 3, card: { suit: "copa", rank: 4 } },
      ]),
    );
    expect(secured).toBe(false);
  });

  it("false when the partner's play loses to the opposition", () => {
    const secured = isTrickSecuredByTeam(
      view2v2([
        { playerId: TEAMMATE, teamId: SELF_TEAM, seat: 2, card: BASTO_4 },
        { playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, card: ESPADA_3 },
        { playerId: OPPONENT_2, teamId: OPPONENT_TEAM, seat: 3, card: ORO_4 },
      ]),
    );
    expect(secured).toBe(false);
  });

  it("1v1: always false by construction — no teammate exists to have played", () => {
    const oneVsOne: PlayerView = {
      ...view2v2([{ playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, card: BASTO_4 }]),
      teammates: [],
      opponents: [{ playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, cardsRemaining: 2 }],
    };
    expect(isTrickSecuredByTeam(oneVsOne)).toBe(false);
  });
});
