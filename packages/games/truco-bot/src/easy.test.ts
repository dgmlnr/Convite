import { describe, expect, it } from "vitest";
import type { Action, PlayerId, PlayerView } from "@hexdev/truco-engine";
import { createEasyBot } from "./easy.js";

const SELF = "player-a" as PlayerId;
const fixtureView = {} as PlayerView;

describe("createEasyBot — naive, deliberately weak strategy", () => {
  it("throws when given no legal actions, rather than returning undefined", () => {
    const bot = createEasyBot();
    expect(() => bot.chooseAction(fixtureView, [], 50)).toThrow();
  });

  it("never volunteers a truco call when a card play is also legal", () => {
    const bot = createEasyBot();
    const callTruco: Action = { type: "call-truco", playerId: SELF, level: "truco" };
    const playWeak: Action = { type: "play-card", playerId: SELF, card: { suit: "basto", rank: 4 } };
    const chosen = bot.chooseAction(fixtureView, [callTruco, playWeak], 50);
    expect(chosen).toBe(playWeak);
  });

  it("when only escalation is legal, still returns a legal action (never throws)", () => {
    const bot = createEasyBot();
    const callTruco: Action = { type: "call-truco", playerId: SELF, level: "truco" };
    expect(bot.chooseAction(fixtureView, [callTruco], 50)).toBe(callTruco);
  });

  it("always accepts a pending truco call, even blindly", () => {
    const bot = createEasyBot();
    const quiero: Action = { type: "respond-truco", playerId: SELF, response: "quiero" };
    const noQuiero: Action = { type: "respond-truco", playerId: SELF, response: "no-quiero" };
    expect(bot.chooseAction(fixtureView, [noQuiero, quiero], 50)).toBe(quiero);
  });

  it("when playing a card, spends the STRONGEST card first — a real, deliberately weak habit", () => {
    const bot = createEasyBot();
    const weak: Action = { type: "play-card", playerId: SELF, card: { suit: "basto", rank: 4 } };
    const strong: Action = { type: "play-card", playerId: SELF, card: { suit: "espada", rank: 1 } };
    expect(bot.chooseAction(fixtureView, [weak, strong], 50)).toBe(strong);
  });
});
