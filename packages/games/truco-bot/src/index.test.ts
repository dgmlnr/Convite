import { describe, expect, it } from "vitest";
import type { Action, PlayerId, PlayerView } from "@hexdev/truco-engine";
import { chooseFirstLegalAction } from "./index.js";

const fixtureView = {} as PlayerView;
const legalActions: readonly Action[] = [
  { type: "call-truco", playerId: "player-a" as PlayerId, level: "truco" },
];

describe("chooseFirstLegalAction", () => {
  it("returns the first legal action offered", () => {
    expect(chooseFirstLegalAction(fixtureView, legalActions)).toBe(legalActions[0]);
  });

  it("throws when given no legal actions, rather than returning undefined", () => {
    expect(() => chooseFirstLegalAction(fixtureView, [])).toThrow();
  });
});
