/// <reference types="@vitest/browser/matchers" />
import { afterEach, describe, expect, it } from "vitest";
import { MAX_SENAS_PER_HAND, applyAction, createTeamMatch, getLegalActions, getViewFor, startHand } from "@hexdev/truco-engine";
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
  // mountedContainer, which carries it in full: width-only is what the real
  // widget document gets (embed-shell.ts declares no height on html/body, so
  // the shell's own `height: 100%` computes to auto and there is no definite
  // height chain to inherit), and an auto-height container hugs the content
  // so nothing can clip (clipped content was the trigger of the
  // screenshot-stability hang this suite once bisected). The shots here
  // screenshot the FELT element, which at auto height takes its own natural
  // size. Panel POSITION under a definite height is fenced separately, in
  // table-panel-in-frame.browser.test.ts — not by this mounting choice.
  //
  // The measurements this note used to carry (375x590.16 mid-hand, 375x566.16
  // picker-open) belonged to a table that still hung a persistent seña chip on
  // the partner's anchor. That chip is gone — a seña is transient now and
  // shows in the banner lane, which is position: absolute and cannot affect
  // the felt's height at all — so the mid-hand shot no longer reserves a line
  // for it. Deliberately not restated as fresh numbers: they were only ever
  // narrative, the baselines themselves are the record, and a stale number in
  // a comment is worse than none.
  document.body.appendChild(container);
  mounted.push(container);
  return container;
}

/** The zone under test: the felt. All four seats, every card, the señas
 * toggle/picker (it sits inside table-styles.ts's own reserved action-bar
 * grid row, PR5), and the transient partner-seña notice (the banner lane,
 * PR5's own reserved zone) all render inside it; only the scoreboard panel
 * below is dropped, and that chrome has its own dedicated baseline
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
  it("mid-hand: four anchors, partner opposite, two opponents on the sides", async () => {
    const container = mountedContainer();
    const view = getViewFor(dealtTeamMatch(), SELF);
    const legalActions = getLegalActions(dealtTeamMatch(), SELF);

    createMatchTableRenderer()(container, view, legalActions, () => {});
    await waitForArt(container);

    await expect.element(feltOf(container)).toMatchScreenshot("table-2v2-mid-hand");
  });

  it("a partner' seña, the moment it lands: the transient notice in the banner lane, nothing left on their anchor", async () => {
    const container = mountedContainer();
    // Long enough to survive the capture — this shot is about how the notice
    // LOOKS, not how long it lasts (table.browser.test.ts owns the timing).
    const render = createMatchTableRenderer({ senaNoticeMs: 60_000 });
    const before = dealtTeamMatch();
    // The partner (seat 2) sends a real seña through the actual reducer — not
    // a hand-authored view — so the captured notice reflects genuine engine
    // state, including the ordinal the derivation actually reads.
    const signaled = applyAction(before, { type: "send-sena", playerId: PARTNER, signal: "sieteDeOro" });
    if (!signaled.ok) throw new Error(`visual fixture setup: illegal action — ${signaled.violation}`);

    // TWO renders, because the notice is derived from a TRANSITION — a single
    // snapshot can never produce it, exactly as a real client experiences it.
    render(container, getViewFor(before, SELF), getLegalActions(before, SELF), () => {});
    render(container, getViewFor(signaled.state, SELF), getLegalActions(signaled.state, SELF), () => {});
    await waitForArt(container);

    await expect.element(feltOf(container)).toMatchScreenshot("table-2v2-sena-notice");
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

  it("the per-hand cap spent: the Señas control still in the rail, dimmed and unavailable — never a hole where a button used to be", async () => {
    const container = mountedContainer();
    // The whole quota spent through the ACTUAL reducer, not a hand-authored
    // view, so this captures the state the engine really produces at the cap
    // (no legal send-sena, senasRemaining 0). SELF's own señas raise no
    // partner notice, so nothing else is on the felt to confuse the shot.
    let state = dealtTeamMatch();
    for (let sent = 0; sent < MAX_SENAS_PER_HAND; sent += 1) {
      const signaled = applyAction(state, { type: "send-sena", playerId: SELF, signal: "tres" });
      if (!signaled.ok) throw new Error(`visual fixture setup: illegal action — ${signaled.violation}`);
      state = signaled.state;
    }

    createMatchTableRenderer()(container, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
    await waitForArt(container);

    // Same felt-only framing every sibling capture uses, which is also what
    // makes this shot a fence on the fixed action band: a spent state that
    // grew the band would move every row above it.
    await expect.element(feltOf(container)).toMatchScreenshot("table-2v2-senas-spent");
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
