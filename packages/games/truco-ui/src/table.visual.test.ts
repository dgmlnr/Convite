/// <reference types="@vitest/browser/matchers" />
import { afterEach, describe, expect, it } from "vitest";
import { applyAction, createHeadToHeadMatch, getLegalActions, getViewFor, startHand } from "@hexdev/truco-engine";
import type { Card, DealInput, MatchState, PlayerId } from "@hexdev/truco-engine";
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

/** T-12 (piles-only slice, PR-3): the exact split-then-decided-at-trick-3
 * deck already proven by `card-play.test.ts`'s own end-to-end fixture and
 * reused by `table-height-stability.browser.test.ts`'s T-7 fence — the same
 * reachable state, so this baseline and that fence describe the identical
 * hand. Both hands are dealt 3 cards, unlike `FIXED_DEAL` above, so every
 * seat ends the hand with a real 3-card pile to screenshot. */
const PILED_DEAL: DealInput = [
  [
    { suit: "espada", rank: 1 },
    { suit: "basto", rank: 4 },
    { suit: "espada", rank: 7 },
  ],
  [
    { suit: "espada", rank: 4 },
    { suit: "basto", rank: 1 },
    { suit: "oro", rank: 4 },
  ],
];

function play(state: MatchState, playerId: PlayerId, card: Card): MatchState {
  const result = applyAction(state, { type: "play-card", playerId, card });
  if (!result.ok) throw new Error(`visual fixture setup: illegal action — ${result.violation}`);
  return result.state;
}

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

/** Containers this file has mounted, removed after EVERY test. Without this
 * cleanup, each test's table stays in the page and pushes the next test's
 * felt below the 414x896 viewport fold — the element screenshot then needs
 * scrolling, and Browser Mode's screenshot-stability retry can fail to
 * converge (the intermittent 30s timeout this suite kept hitting on
 * whole-file runs). An empty page per test makes capture position
 * deterministic. Sub-pixel text rasterization DOES depend on that position,
 * so the baselines captured under polluted positions were deliberately
 * regenerated once under this clean layout (see this change's own commit);
 * a baseline captured at the top of an empty page stays valid forever. */
const mounted: HTMLElement[] = [];

/** Every custom property the "themed tenant" test below sets on `<html>`,
 * reset after EVERY test. Within one Vitest Browser Mode test FILE, tests
 * share one real `document` — `document.documentElement.style.setProperty(...)`
 * in one test is still there, unset, for every later test in the same file.
 * FU-1 (visual-redesign verify report, carried since PR7's own whole-set
 * audit): without this cleanup, `table-hand-full-piles` — the test that runs
 * immediately after "themed tenant" — silently inherited the themed accent
 * (`--gx-color-accent: #22d3ee`) and rendered a themed capture presented as
 * the default-palette baseline. Same pattern `table-wide.visual.test.ts`
 * already established for the identical leak. */
const THEME_PROPS = ["--gx-color-surface", "--gx-color-on-surface", "--gx-color-primary", "--gx-color-on-primary", "--gx-color-accent", "--gx-radius"] as const;

afterEach(() => {
  while (mounted.length > 0) mounted.pop()!.remove();
  for (const prop of THEME_PROPS) document.documentElement.style.removeProperty(prop);
});

function mountedContainer(): HTMLElement {
  const container = document.createElement("div");
  // 320px — a real narrow-phone width (iPhone SE class). Same NARROW branch
  // of the shell's container query as the old 375px (the breakpoint is
  // min-width: 640px, table-styles.ts), just without the dead side felt the
  // fixed 60px cards never used. Measured before choosing: the felt's
  // content height is width-independent at this card size (395.3px at 375,
  // 340, and 320 alike), so this narrows the frame without moving anything.
  container.style.width = "320px";
  // Height deliberately NOT set. With ANY explicit height, the felt's own
  // `min-height: max(100%, …)` (table-styles.ts) stretches the felt to the
  // full container and pushes the scoreboard panel — a flex sibling BELOW
  // the felt — entirely out of frame (measured: panel at y=628 in the old
  // 375x620 container). The old fixed-height baselines therefore contained
  // no scoreboard panel at all, silently, while README claimed the themed
  // shot proves panel theming. An auto-height container hugs its content:
  // the felt takes its essential floor, the panel is genuinely in frame,
  // and nothing can clip — the screenshot-stability hang this suite once
  // bisected needed CLIPPED content to trigger, which auto height rules
  // out by construction. Tradeoff, disclosed: baseline height now tracks
  // content height, so a future change to the table's natural height shows
  // up as a dimension mismatch (slow ~30s timeout, not a clean pixel diff)
  // until the baseline is regenerated per visual/README.md.
  document.body.appendChild(container);
  mounted.push(container);
  return container;
}

/** The zone under test for the card shots: the felt element itself. The
 * locked-card opacity bug this suite exists to catch (visual/README.md)
 * lives in the RELATIONSHIP between a card and the surface underneath it,
 * and every card — own hand, the played trick card, opponent backs — plus
 * the turn badge and the floating banner/call chrome all render inside the
 * felt, so cropping the screenshot to the felt keeps every piece of context
 * those shots assert on while dropping chrome they do not. */
function feltOf(container: HTMLElement): HTMLElement {
  const felt = container.querySelector<HTMLElement>(".hexdev-truco-table");
  if (felt === null) throw new Error("visual fixture setup: felt element not rendered");
  return felt;
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

    await expect.element(feltOf(container)).toMatchScreenshot("table-mid-hand");
  });

  /**
   * The per-turn countdown, and the one baseline in this suite whose subject
   * is a CLOCK — which is exactly why it is captured through frozen time.
   *
   * A countdown reading real wall-clock time is the most nondeterministic
   * thing that could possibly land in a screenshot: every capture would show
   * a different number and every run would diff. Both inputs are injected
   * instead — `now` is a constant, and the deadline is that same constant
   * plus a fixed offset — so this pill renders "0:47" on every machine, on
   * every run, forever. `turnClockTickMs` is parked far beyond the capture so
   * the interval cannot repaint the number mid-screenshot either; the suite's
   * own setup already freezes animations and fonts, but neither of those
   * would have touched a `setInterval` writing text.
   *
   * Every OTHER baseline in this suite passes no deadline at all, which is
   * why none of them changed: an untimed table renders no clock node.
   */
  it("the turn countdown: the active seat's badge carries the time left on its turn", async () => {
    const container = mountedContainer();
    const played = applyAction(dealtMatch(), { type: "play-card", playerId: SELF, card: FIXED_DEAL[0]![0]! });
    if (!played.ok) throw new Error(`visual fixture setup: illegal action — ${played.violation}`);
    const view = getViewFor(played.state, SELF);
    const legalActions = getLegalActions(played.state, SELF);

    const FROZEN_NOW = 1_700_000_000_000;
    const render = createMatchTableRenderer({ now: () => FROZEN_NOW, turnClockTickMs: 10 * 60 * 1000 });
    render(container, view, legalActions, () => {}, undefined, FROZEN_NOW + 47_000);
    await waitForArt(container);

    await expect.element(feltOf(container)).toMatchScreenshot("table-turn-clock");
  });

  // Also the first log-affected baseline (T-12 part 2): the call-truco
  // action below is this fixture's only CallEvent, so once the call-log
  // panel is mounted (P4-T3) it renders exactly one entry, bottom-left,
  // never affecting `table-mid-hand`/`table-themed`/`table-hand-full-piles`
  // above (none of those three fixtures ever calls anything).
  it("a pending truco call: the banner is shown and the whole hand is locked until it is answered", async () => {
    const container = mountedContainer();
    const called = applyAction(dealtMatch(), { type: "call-truco", playerId: OPPONENT, level: "truco" });
    if (!called.ok) throw new Error(`visual fixture setup: illegal action — ${called.violation}`);
    const view = getViewFor(called.state, SELF);
    const legalActions = getLegalActions(called.state, SELF);

    createMatchTableRenderer()(container, view, legalActions, () => {});
    await waitForArt(container);

    await expect.element(feltOf(container)).toMatchScreenshot("table-truco-pending");
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

    // The whole shell — felt AND scoreboard panel — never just the felt:
    // this is the one shot that proves theme tokens reach the chrome
    // (visual/README.md names the panel's background as its verified
    // regression), so the panel surface must be in frame. The auto-height
    // container is what makes that true — the panel, with the fixture's
    // 12:8 matchsticks, sits fully visible below the felt here, where the
    // old fixed-height container silently clipped it out.
    await expect.element(container).toMatchScreenshot("table-themed");
  });

  it("three tricks resolved: each seat shows a persistent, offset pile of its own played cards, most recent on top (spec: Persistent Per-Seat Card Piles)", async () => {
    const container = mountedContainer();
    let state = startHand(createHeadToHeadMatch({ playerAId: SELF, playerBId: OPPONENT, pointsToWin: 30, dealerSeat: 1 }), PILED_DEAL);

    // Trick 1: SELF (mano) wins 1-espada over 4-espada.
    state = play(state, SELF, PILED_DEAL[0]![0]!);
    state = play(state, OPPONENT, PILED_DEAL[1]![0]!);
    // Trick 2: SELF leads again, OPPONENT wins 1-basto over 4-basto — split so far.
    state = play(state, SELF, PILED_DEAL[0]![1]!);
    state = play(state, OPPONENT, PILED_DEAL[1]![1]!);
    // Trick 3: OPPONENT leads, SELF wins 7-espada over 4-oro, deciding the hand.
    state = play(state, OPPONENT, PILED_DEAL[1]![2]!);
    state = play(state, SELF, PILED_DEAL[0]![2]!);

    const view = getViewFor(state, SELF);
    const legalActions = getLegalActions(state, SELF);

    createMatchTableRenderer()(container, view, legalActions, () => {});
    await waitForArt(container);

    await expect.element(feltOf(container)).toMatchScreenshot("table-hand-full-piles");
  });
});
