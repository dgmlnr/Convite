import { describe, expect, it } from "vitest";
import type { Action, Card, PlayerId, PlayerView, TeamId } from "@hexdev/truco-engine";
import type { RandomSource } from "@hexdev/platform-contract";
import { createBotStrategy } from "./index.js";

const SELF = "player-a" as PlayerId;
const SELF_TEAM = "player-a:team" as TeamId;

const fixtureView: PlayerView = {
  self: { playerId: SELF, teamId: SELF_TEAM, seat: 0, hand: [], lastSena: null },
  teammates: [],
  opponents: [],
  teams: [],
  hand: null,
  config: { pointsToWin: 15 },
  dealerSeat: 0,
};
const legalAction: Action = { type: "call-truco", playerId: SELF, level: "truco" };
const noRng: RandomSource = () => {
  throw new Error("easy/normal tiers must never consult the rng");
};

describe("createBotStrategy — tier dispatcher", () => {
  it("every tier always chooses one of the legal actions offered (spec: never returns an illegal action)", () => {
    const hand: readonly Card[] = [{ suit: "espada", rank: 1 }];
    const view: PlayerView = { ...fixtureView, self: { ...fixtureView.self, hand } };
    for (const tier of ["easy", "normal", "hard"] as const) {
      const chosen = createBotStrategy(tier, () => 0.5).chooseAction(view, [legalAction], 50);
      expect(chosen).toBe(legalAction);
    }
  });

  it("dispatches easy/normal WITHOUT touching the rng (deterministic tiers never need entropy)", () => {
    expect(() => createBotStrategy("easy", noRng).chooseAction(fixtureView, [legalAction], 50)).not.toThrow();
    expect(() => createBotStrategy("normal", noRng).chooseAction(fixtureView, [legalAction], 50)).not.toThrow();
  });
});
