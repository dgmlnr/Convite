/// <reference types="@vitest/browser/matchers" />
import { describe, expect, it } from "vitest";
import { applyAction, createHeadToHeadMatch, getLegalActions, getViewFor, startHand } from "@hexdev/truco-engine";
import type { DealInput, MatchState, PlayerId } from "@hexdev/truco-engine";
import { createMatchTableRenderer } from "./table.js";

const SELF = "visual-self" as PlayerId;
const OPPONENT = "visual-opponent" as PlayerId;

/**
 * A fully materialized, FIXED deal — design §4: "the engine never
 * randomizes"; `startHand(state, deal)` exists exactly so a caller (the
 * server, a test, or ISMCTS) can supply one. Chosen only so both hands are
 * legible and visually varied (mixed suits/ranks), never for game balance.
 */
const FIXED_DEAL: DealInput = [
  [
    { suit: "espada", rank: 1 },
    { suit: "oro", rank: 7 },
  ],
  [
    { suit: "copa", rank: 12 },
    { suit: "basto", rank: 5 },
    { suit: "oro", rank: 3 },
  ],
];

/** A non-trivial, asymmetric score (spec: "the matchstick scoreboard at a
 * non-trivial score") set directly on the constructed state — the same
 * convention `table.browser.test.ts`'s own `baseView()` fixture already
 * uses. Score only otherwise changes through a full resolved hand or an
 * envido reveal, neither of which this fixture needs to play out for real. */
function withNonTrivialScore(state: MatchState): MatchState {
  return { ...state, teams: state.teams.map((team, index) => ({ ...team, score: index === 0 ? 12 : 8 })) };
}

/** The base engine state every snapshot below starts from: a real match, a
 * real materialized deal, dealt through the actual engine — not a
 * hand-authored view object. */
function dealtMatch(): MatchState {
  const base = createHeadToHeadMatch({ playerAId: SELF, playerBId: OPPONENT, pointsToWin: 30, dealerSeat: 1 });
  return withNonTrivialScore(startHand(base, FIXED_DEAL));
}

function mountedContainer(): HTMLElement {
  const container = document.createElement("div");
  container.style.width = "375px";
  // 620px (stable window height, apply prompt, round 3): the transient
  // chrome (pending-call/hand-outcome banner, call buttons, the señas
  // picker) floats over the felt instead of reserving layout space for it
  // — see table-styles.ts's own .hexdev-truco-banner-slot/.hexdev-truco-
  // action-tray doc comments — so the table's real content height at this
  // width is ~559px regardless of what chrome is showing, comfortably
  // under this container. A container SHORTER than the real content clips
  // it under this suite's own overflow:hidden, which was observed to make
  // Vitest Browser Mode's screenshot-stability retry never converge (a
  // real hang, not a flaky mismatch — confirmed earlier this branch by
  // bisecting the exact CSS change that triggered it).
  container.style.height = "620px";
  container.style.overflow = "hidden";
  document.body.appendChild(container);
  return container;
}

/** Card art (`<img>`, `hand.ts`/`played-cards.ts`) loads asynchronously —
 * the built-in `toMatchScreenshot` stable-screenshot retry would eventually
 * paper over an in-flight load, but waiting for it explicitly removes that
 * source of flakiness outright instead of leaving it to a retry budget. */
async function waitForArt(container: HTMLElement): Promise<void> {
  const images = [...container.querySelectorAll("img")];
  await Promise.all(images.map((img) => img.decode()));
}

describe("visual: the game table (design: 'linda y cómoda')", () => {
  it("mid-hand: cards in hand (playable + locked), a card already played, and whose turn it is", async () => {
    const container = mountedContainer();
    // One real play-card action via the actual reducer, not a hand-authored
    // view — the trick-in-progress card and the resulting turn handoff are
    // exactly what the engine itself produced.
    const played = applyAction(dealtMatch(), { type: "play-card", playerId: SELF, card: FIXED_DEAL[0]![0]! });
    if (!played.ok) throw new Error(`visual fixture setup: illegal action — ${played.violation}`);
    const view = getViewFor(played.state, SELF);
    const legalActions = getLegalActions(played.state, SELF);

    createMatchTableRenderer()(container, view, legalActions, () => {});
    await waitForArt(container);

    await expect.element(container).toMatchScreenshot("table-mid-hand");
  });

  it("a pending truco call: the banner is shown and the whole hand is locked until it is answered", async () => {
    const container = mountedContainer();
    const called = applyAction(dealtMatch(), { type: "call-truco", playerId: OPPONENT, level: "truco" });
    if (!called.ok) throw new Error(`visual fixture setup: illegal action — ${called.violation}`);
    const view = getViewFor(called.state, SELF);
    const legalActions = getLegalActions(called.state, SELF);

    createMatchTableRenderer()(container, view, legalActions, () => {});
    await waitForArt(container);

    await expect.element(container).toMatchScreenshot("table-truco-pending");
  });

  it("a themed tenant: the chrome (scoreboard panel, calls, pending banner) takes the brand; the felt and cards do not", async () => {
    const container = mountedContainer();
    const root = document.documentElement;
    // Set directly — mechanically this IS what `applyThemeToRoot` does
    // (`apps/widget-app/src/theme.ts`): `style.setProperty` for a token, on
    // the document root, so `var(--gx-*, fallback)` resolves to it wherever
    // it is read. A distinct, unmistakably non-default palette, so a
    // reviewer can tell at a glance whether theming actually reached the
    // table (design §10) without reading any CSS.
    root.style.setProperty("--gx-color-surface", "#141233");
    root.style.setProperty("--gx-color-on-surface", "#f4f1ff");
    root.style.setProperty("--gx-color-primary", "#7c3aed");
    root.style.setProperty("--gx-color-on-primary", "#ffffff");
    root.style.setProperty("--gx-color-accent", "#22d3ee");
    root.style.setProperty("--gx-radius", "2px");

    const played = applyAction(dealtMatch(), { type: "play-card", playerId: SELF, card: FIXED_DEAL[0]![0]! });
    if (!played.ok) throw new Error(`visual fixture setup: illegal action — ${played.violation}`);
    const view = getViewFor(played.state, SELF);
    const legalActions = getLegalActions(played.state, SELF);

    createMatchTableRenderer()(container, view, legalActions, () => {});
    await waitForArt(container);

    await expect.element(container).toMatchScreenshot("table-themed");
  });
});
