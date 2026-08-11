/// <reference types="@vitest/browser/matchers" />
import { afterEach, describe, expect, it } from "vitest";
import { applyAction, createTeamMatch, getLegalActions, getViewFor, startHand } from "@hexdev/truco-engine";
import type { Card, DealInput, MatchState, PlayerId } from "@hexdev/truco-engine";
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

/** T-12 (piles-only slice, PR-3): the exact split-then-decided-at-trick-3
 * four-seat deck already proven by `card-play.test.ts`'s own end-to-end
 * fixture and reused by `table-height-stability.browser.test.ts`'s T-7
 * fence — the same reachable state, so this baseline and that fence
 * describe the identical hand. Each seat ends with a different pile depth
 * (SELF: 3, OPPONENT: 3, PARTNER: 3, OPPONENT_2: 3 — every seat plays all
 * three tricks), which is what actually exercises per-seat independence. */
const PILED_DEAL_4: DealInput = [
  [{ suit: "espada", rank: 1 }, { suit: "basto", rank: 4 }, { suit: "espada", rank: 3 }],
  [{ suit: "basto", rank: 5 }, { suit: "oro", rank: 1 }, { suit: "basto", rank: 6 }],
  [{ suit: "oro", rank: 4 }, { suit: "copa", rank: 4 }, { suit: "basto", rank: 4 }],
  [{ suit: "copa", rank: 5 }, { suit: "basto", rank: 3 }, { suit: "copa", rank: 6 }],
];

function play(state: MatchState, playerId: PlayerId, card: Card): MatchState {
  const result = applyAction(state, { type: "play-card", playerId, card });
  if (!result.ok) throw new Error(`visual fixture setup: illegal action — ${result.violation}`);
  return result.state;
}

function withNonTrivialScore(state: MatchState): MatchState {
  return { ...state, teams: state.teams.map((team, index) => ({ ...team, score: index === 0 ? 9 : 5 })) };
}

function dealtTeamMatch(): MatchState {
  const base = createTeamMatch({ seatOrder: [SELF, OPPONENT, PARTNER, OPPONENT_2], pointsToWin: 30, dealerSeat: 3 });
  return withNonTrivialScore(startHand(base, FIXED_DEAL_4));
}

/** Containers this file has mounted, removed after EVERY test — same
 * cleanup and reasoning as table.visual.test.ts's own `mounted` list:
 * accumulated tables push later felts below the viewport fold and the
 * screenshot-stability retry can then fail to converge. */
const mounted: HTMLElement[] = [];

afterEach(() => {
  while (mounted.length > 0) mounted.pop()!.remove();
});

function mountedContainer(): HTMLElement {
  const container = document.createElement("div");
  // 375px is the FLOOR here, not a habit: the open señas row measures
  // exactly 359px and the felt pads 8px each side (359 + 16 = 375), so any
  // narrower container scrolls the sixth signal out of frame — and the
  // señas panel is precisely what these baselines must keep visible.
  // Still the narrow branch of the shell's container query (< 640px).
  container.style.width = "375px";
  // Height deliberately NOT set — same reasoning as table.visual.test.ts's
  // mountedContainer: any explicit height makes the felt's
  // `min-height: max(100%, …)` stretch over the full container, and an
  // auto-height container hugs the content instead, so nothing can clip
  // (clipped content was the trigger of the screenshot-stability hang this
  // suite once bisected). The two shots here screenshot the FELT element,
  // which at auto height takes its own natural size: 375x613 for the
  // mid-hand fixture (the partner's seña badge wraps the top hand to two
  // rows) and 375x517 with the señas picker open.
  document.body.appendChild(container);
  mounted.push(container);
  return container;
}

/** The zone under test: the felt. All four seats, every card, the señas
 * toggle/picker (it floats OVER the felt — table-styles.ts's action-tray),
 * and the partner's seña badge all render inside it; only the scoreboard
 * panel below is dropped, and that chrome has its own dedicated baseline
 * (scoreboard-panel.visual.test.ts) plus the themed 1v1 shot. */
function feltOf(container: HTMLElement): HTMLElement {
  const felt = container.querySelector<HTMLElement>(".hexdev-truco-table");
  if (felt === null) throw new Error("visual fixture setup: felt element not rendered");
  return felt;
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

    await expect.element(feltOf(container)).toMatchScreenshot("table-2v2-mid-hand");
  });

  it("the señas picker, opened: the local player's own six-signal row, discoverable without being noisy", async () => {
    const container = mountedContainer();
    const view = getViewFor(dealtTeamMatch(), SELF);
    const legalActions = getLegalActions(dealtTeamMatch(), SELF);

    createMatchTableRenderer()(container, view, legalActions, () => {});
    await waitForArt(container);
    container.querySelector<HTMLButtonElement>('button[data-action="senas-toggle"]')!.click();

    await expect.element(feltOf(container)).toMatchScreenshot("table-2v2-senas-open");
  });

  it("three tricks resolved: all four seats show their own persistent, offset pile, most recent on top (spec: Persistent Per-Seat Card Piles)", async () => {
    const container = mountedContainer();
    const seatOrder: readonly [PlayerId, PlayerId, PlayerId, PlayerId] = [SELF, OPPONENT, PARTNER, OPPONENT_2];
    let state = startHand(createTeamMatch({ seatOrder, pointsToWin: 30, dealerSeat: 3 }), PILED_DEAL_4);

    // Trick 1: SELF leads (mano), turn order 0 -> 1 -> 2 -> 3; team A's 1-espada (SELF) wins.
    state = play(state, SELF, PILED_DEAL_4[0]![0]!);
    state = play(state, OPPONENT, PILED_DEAL_4[1]![0]!);
    state = play(state, PARTNER, PILED_DEAL_4[2]![0]!);
    state = play(state, OPPONENT_2, PILED_DEAL_4[3]![0]!);
    // Trick 2: SELF leads again (held trick 1's winning card); team B's 3-basto (OPPONENT_2) wins — split so far.
    state = play(state, SELF, PILED_DEAL_4[0]![1]!);
    state = play(state, OPPONENT, PILED_DEAL_4[1]![1]!);
    state = play(state, PARTNER, PILED_DEAL_4[2]![1]!);
    state = play(state, OPPONENT_2, PILED_DEAL_4[3]![1]!);
    // Trick 3: OPPONENT_2 leads (won trick 2); turn order wraps 3 -> 0 -> 1 -> 2. Team A's 3-espada (SELF) decides.
    state = play(state, OPPONENT_2, PILED_DEAL_4[3]![2]!);
    state = play(state, SELF, PILED_DEAL_4[0]![2]!);
    state = play(state, OPPONENT, PILED_DEAL_4[1]![2]!);
    state = play(state, PARTNER, PILED_DEAL_4[2]![2]!);

    const view = getViewFor(state, SELF);
    const legalActions = getLegalActions(state, SELF);

    createMatchTableRenderer()(container, view, legalActions, () => {});
    await waitForArt(container);

    await expect.element(feltOf(container)).toMatchScreenshot("table-2v2-hand-full-piles");
  });
});
