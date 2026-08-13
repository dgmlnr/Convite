import { describe, expect, it } from "vitest";
import type { PlayerView, TeamId } from "@hexdev/truco-engine";
import { MAX_SENAS_PER_HAND } from "@hexdev/truco-engine";
import { deriveHandOutcomeEvent } from "./hand-outcome.js";

const TEAM_A = "team-a" as TeamId;
const TEAM_B = "team-b" as TeamId;

function view(overrides: Partial<PlayerView> & { readonly dealerSeat?: number } = {}): PlayerView {
  return {
    self: { playerId: "p1" as never, teamId: TEAM_A, seat: 0, hand: [], lastSena: null, senasRemaining: MAX_SENAS_PER_HAND },
    teammates: [],
    opponents: [{ playerId: "p2" as never, teamId: TEAM_B, seat: 1, cardsRemaining: 0 }],
    teams: [
      { id: TEAM_A, score: 0 },
      { id: TEAM_B, score: 0 },
    ],
    hand: {
      manoSeat: 0,
      truco: { status: "none" },
      envido: { status: "none" },
      turnSeat: 0,
      currentTrickPlays: [],
      resolvedTrickPlays: [],
      callEvents: [],
      trickOutcomes: [],
      outcome: { decided: false },
    },
    config: { pointsToWin: 15 },
    dealerSeat: 0,
    ...overrides,
  };
}

describe("deriveHandOutcomeEvent (spec: 'end of a hand — who won it and how many points, read from the view')", () => {
  it("returns null on the very first render — there is no 'previous' to compare against", () => {
    expect(deriveHandOutcomeEvent(null, view())).toBeNull();
  });

  it("returns null while the hand is still undecided across renders", () => {
    const previous = view();
    const current = view({ hand: { ...view().hand!, currentTrickPlays: [] } });

    expect(deriveHandOutcomeEvent(previous, current)).toBeNull();
  });

  it("detects a hand decided by card play, reading the winner straight from hand.outcome and the point delta from teams[].score", () => {
    const previous = view();
    const current = view({
      hand: { ...view().hand!, outcome: { decided: true, winnerTeamId: TEAM_A } },
      teams: [
        { id: TEAM_A, score: 2 },
        { id: TEAM_B, score: 0 },
      ],
    });

    expect(deriveHandOutcomeEvent(previous, current)).toEqual({ winnerTeamId: TEAM_A, pointsDelta: 2 });
  });

  it("detects a hand ended by a truco decline, reading the winner from truco.callingTeamId — outcome.decided never flips on a decline", () => {
    const previous = view({ hand: { ...view().hand!, truco: { status: "pending", level: "truco", callingTeamId: TEAM_A } } });
    const current = view({
      hand: {
        ...view().hand!,
        truco: { status: "declined", level: "truco", callingTeamId: TEAM_A, decliningTeamId: TEAM_B },
      },
      teams: [
        { id: TEAM_A, score: 1 },
        { id: TEAM_B, score: 0 },
      ],
    });

    expect(deriveHandOutcomeEvent(previous, current)).toEqual({ winnerTeamId: TEAM_A, pointsDelta: 1 });
  });

  it("does not re-announce the same decided hand on a later render with no new dealerSeat yet", () => {
    const decided = view({ hand: { ...view().hand!, outcome: { decided: true, winnerTeamId: TEAM_A } } });

    expect(deriveHandOutcomeEvent(decided, decided)).toBeNull();
  });

  it("returns null once a new hand has already started (dealerSeat changed) — the ending moment already passed", () => {
    const decided = view({ hand: { ...view().hand!, outcome: { decided: true, winnerTeamId: TEAM_A } } });
    const nextHand = view({ dealerSeat: 1, hand: { ...view().hand!, outcome: { decided: false } } });

    expect(deriveHandOutcomeEvent(decided, nextHand)).toBeNull();
  });
});
