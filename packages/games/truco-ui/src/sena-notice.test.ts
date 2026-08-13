import { describe, expect, it } from "vitest";
import type { PlayerId, PlayerView, SenaView, TeamId } from "@hexdev/truco-engine";
import { MAX_SENAS_PER_HAND } from "@hexdev/truco-engine";
import { derivePartnerSenaEvent } from "./sena-notice.js";

const TEAM_A = "team-a" as TeamId;
const TEAM_B = "team-b" as TeamId;
const PARTNER = "partner" as PlayerId;
const OTHER_PARTNER = "other-partner" as PlayerId;

/** A 2v2-shaped view whose single teammate carries `lastSena` — the exact
 * shape `getViewFor` projects, never a hand-authored variant of it. */
function view(lastSena: SenaView | null, overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    self: { playerId: "self" as PlayerId, teamId: TEAM_A, seat: 0, hand: [], lastSena: null, senasRemaining: MAX_SENAS_PER_HAND },
    teammates: [{ playerId: PARTNER, seat: 2, cardsRemaining: 3, lastSena }],
    opponents: [
      { playerId: "opp-1" as PlayerId, teamId: TEAM_B, seat: 1, cardsRemaining: 3 },
      { playerId: "opp-2" as PlayerId, teamId: TEAM_B, seat: 3, cardsRemaining: 3 },
    ],
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

describe("derivePartnerSenaEvent — a seña is a MOMENT, not a state (si no la viste, la perdiste)", () => {
  it("announces nothing on the very first render — there is no previous snapshot to have missed a seña against", () => {
    expect(derivePartnerSenaEvent(null, view({ signal: "tres", seq: 1 }))).toBeNull();
  });

  it("announces nothing while the partner has not signaled at all", () => {
    expect(derivePartnerSenaEvent(view(null), view(null))).toBeNull();
  });

  it("announces the partner's seña the moment it appears between two snapshots", () => {
    const event = derivePartnerSenaEvent(view(null), view({ signal: "sieteDeOro", seq: 1 }));

    expect(event).toEqual({ playerId: PARTNER, signal: "sieteDeOro", seq: 1 });
  });

  it("announces a RE-SENT identical signal — the ordinal is the only thing that separates 'again' from 'still'", () => {
    const event = derivePartnerSenaEvent(view({ signal: "tres", seq: 1 }), view({ signal: "tres", seq: 2 }));

    expect(event).toEqual({ playerId: PARTNER, signal: "tres", seq: 2 });
  });

  it("announces nothing on an unrelated re-render — the same ordinal is the same seña, however many times it is drawn", () => {
    const sena: SenaView = { signal: "asDeBasto", seq: 4 };
    const unrelatedChange = view(sena, { teams: [{ id: TEAM_A, score: 3 }, { id: TEAM_B, score: 1 }] });

    expect(derivePartnerSenaEvent(view(sena), unrelatedChange)).toBeNull();
  });

  it("announces nothing when the partner's seña VANISHES (a fresh deal clears them) — nothing was signaled", () => {
    expect(derivePartnerSenaEvent(view({ signal: "dos", seq: 2 }), view(null, { dealerSeat: 1 }))).toBeNull();
  });

  it("announces a new hand's first seña even though its ordinal restarts below the previous hand's — a rotated dealer means a different hand, not a stale ordinal", () => {
    const event = derivePartnerSenaEvent(view({ signal: "dos", seq: 3 }), view({ signal: "dos", seq: 1 }, { dealerSeat: 1 }));

    expect(event).toEqual({ playerId: PARTNER, signal: "dos", seq: 1 });
  });

  it("announces the NEWEST seña when more than one teammate signaled between snapshots — one lane, the latest claim wins it", () => {
    const before = view(null, {
      teammates: [
        { playerId: PARTNER, seat: 2, cardsRemaining: 3, lastSena: null },
        { playerId: OTHER_PARTNER, seat: 4, cardsRemaining: 3, lastSena: null },
      ],
    });
    const after = view(null, {
      teammates: [
        { playerId: PARTNER, seat: 2, cardsRemaining: 3, lastSena: { signal: "tres", seq: 1 } },
        { playerId: OTHER_PARTNER, seat: 4, cardsRemaining: 3, lastSena: { signal: "asDeEspada", seq: 2 } },
      ],
    });

    expect(derivePartnerSenaEvent(before, after)).toEqual({ playerId: OTHER_PARTNER, signal: "asDeEspada", seq: 2 });
  });

  it("never announces the viewer's OWN seña — a player does not need telling what they just claimed", () => {
    const before = view(null);
    const after = view(null, { self: { ...view(null).self, lastSena: { signal: "tres", seq: 1 } } });

    expect(derivePartnerSenaEvent(before, after)).toBeNull();
  });
});
