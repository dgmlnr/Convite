/// <reference types="@vitest/browser/matchers" />
import { describe, expect, it } from "vitest";
import { applyAction, createTeamMatch, getLegalActions, getViewFor, startHand } from "@hexdev/truco-engine";
import type { DealInput, MatchState, PlayerId } from "@hexdev/truco-engine";
import { createMatchTableRenderer } from "./table.js";

/**
 * NEW baselines for the 4-seat (2v2) table — a SEPARATE file from
 * table.visual.test.ts, deliberately: the five existing baselines that
 * file owns must stay byte-identical, and keeping this a distinct file
 * means editing here can never accidentally touch that one's fixtures.
 */

const SELF = "visual-self" as PlayerId; // seat 0
const OPPONENT = "visual-opponent" as PlayerId; // seat 1
const PARTNER = "visual-partner" as PlayerId; // seat 2 — partners across the table
const OPPONENT_2 = "visual-opponent-2" as PlayerId; // seat 3

/** A fully materialized, FIXED deal for all 4 seats (design §4: "the engine
 * never randomizes") — mixed suits/ranks per seat, chosen only so the
 * screenshot is legible and varied, never for game balance. */
const FIXED_DEAL_4: DealInput = [
  [{ suit: "espada", rank: 1 }, { suit: "oro", rank: 7 }, { suit: "copa", rank: 3 }],
  [{ suit: "copa", rank: 12 }, { suit: "basto", rank: 5 }, { suit: "oro", rank: 3 }],
  [{ suit: "basto", rank: 1 }, { suit: "espada", rank: 7 }, { suit: "oro", rank: 12 }],
  [{ suit: "oro", rank: 11 }, { suit: "copa", rank: 10 }, { suit: "basto", rank: 6 }],
];

function withNonTrivialScore(state: MatchState): MatchState {
  return { ...state, teams: state.teams.map((team, index) => ({ ...team, score: index === 0 ? 9 : 5 })) };
}

function dealtTeamMatch(): MatchState {
  const base = createTeamMatch({ seatOrder: [SELF, OPPONENT, PARTNER, OPPONENT_2], pointsToWin: 30, dealerSeat: 3 });
  return withNonTrivialScore(startHand(base, FIXED_DEAL_4));
}

function mountedContainer(): HTMLElement {
  const container = document.createElement("div");
  container.style.width = "375px";
  container.style.height = "700px";
  container.style.overflow = "hidden";
  document.body.appendChild(container);
  return container;
}

async function waitForArt(container: HTMLElement): Promise<void> {
  const images = [...container.querySelectorAll("img")];
  await Promise.all(images.map((img) => img.decode()));
}

describe("visual: the 4-seat (2v2) game table — partner obvious at a glance, señas affordance", () => {
  it("mid-hand: four anchors, partner opposite with a claimed seña, two opponents on the sides", async () => {
    const container = mountedContainer();
    // The partner (seat 2) sends a real seña through the actual reducer —
    // not a hand-authored view — so its rendered badge reflects genuine
    // engine state.
    const signaled = applyAction(dealtTeamMatch(), { type: "send-sena", playerId: PARTNER, signal: "sieteDeOro" });
    if (!signaled.ok) throw new Error(`visual fixture setup: illegal action — ${signaled.violation}`);
    const view = getViewFor(signaled.state, SELF);
    const legalActions = getLegalActions(signaled.state, SELF);

    createMatchTableRenderer()(container, view, legalActions, () => {});
    await waitForArt(container);

    await expect.element(container).toMatchScreenshot("table-2v2-mid-hand");
  });

  it("the señas picker, opened: the local player's own six-signal row, discoverable without being noisy", async () => {
    const container = mountedContainer();
    const view = getViewFor(dealtTeamMatch(), SELF);
    const legalActions = getLegalActions(dealtTeamMatch(), SELF);

    createMatchTableRenderer()(container, view, legalActions, () => {});
    await waitForArt(container);
    container.querySelector<HTMLButtonElement>('button[data-action="senas-toggle"]')!.click();

    await expect.element(container).toMatchScreenshot("table-2v2-senas-open");
  });
});
