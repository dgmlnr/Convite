/// <reference types="@vitest/browser/matchers" />
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { applyAction, createHeadToHeadMatch, createTeamMatch, getLegalActions, getViewFor, startHand } from "@hexdev/truco-engine";
import type { DealInput, MatchState, PlayerId } from "@hexdev/truco-engine";
import { createMatchTableRenderer } from "./table.js";

/**
 * NEW wide/ultra-tier baselines (PR7-T1, spec VB-3) — a SEPARATE file from
 * `table.visual.test.ts`/`table-2v2.visual.test.ts`, deliberately, following
 * `table-2v2.visual.test.ts`'s own precedent ("editing here can never
 * accidentally touch that one's fixtures"): every baseline this file owns is
 * NEW, so `--update` scoped to this one file can never touch the 7
 * pre-existing baselines those two files still own — the exact
 * "pre-existing baselines stay byte-identical" acceptance criterion this PR
 * is audited against. Fixtures below are deliberately the SAME hands
 * `table.visual.test.ts`/`table-2v2.visual.test.ts` already use — a reviewer
 * can compare a narrow/wide/ultra shot of the identical deal side by side,
 * not two unrelated hands. Also owns `match-over-wide` (VB-3's 7th
 * baseline): no visual test currently captures `renderMatchOverOverlay`
 * (`rg` confirmed before writing this file), and this file's own wide-tier
 * shell mounting is the most fitting home for it — the overlay is a sibling
 * of `.hexdev-truco-shell-layout` on the renderer's `container` argument
 * (`table.ts`), not a felt descendant, exactly like `table-wide-themed`
 * below already needs the full shell in frame.
 */

const SELF = "visual-self" as PlayerId; // 1v1 seat 0 / 2v2 seat 0
const OPPONENT = "visual-opponent" as PlayerId; // 1v1 seat 1 / 2v2 seat 1
const PARTNER = "visual-partner" as PlayerId; // 2v2 seat 2, partners across the table
const OPPONENT_2 = "visual-opponent-2" as PlayerId; // 2v2 seat 3

/** Identical to `table.visual.test.ts`'s own `FIXED_DEAL`. */
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

/** Identical to `table-2v2.visual.test.ts`'s own `FIXED_DEAL_4`. */
const FIXED_DEAL_4: DealInput = [
  [{ suit: "espada", rank: 1 }, { suit: "oro", rank: 7 }, { suit: "copa", rank: 3 }],
  [{ suit: "copa", rank: 12 }, { suit: "basto", rank: 5 }, { suit: "oro", rank: 3 }],
  [{ suit: "basto", rank: 1 }, { suit: "espada", rank: 7 }, { suit: "oro", rank: 12 }],
  [{ suit: "oro", rank: 11 }, { suit: "copa", rank: 10 }, { suit: "basto", rank: 6 }],
];

function withScore1v1(state: MatchState): MatchState {
  return { ...state, teams: state.teams.map((team, index) => ({ ...team, score: index === 0 ? 12 : 8 })) };
}

function withScore2v2(state: MatchState): MatchState {
  return { ...state, teams: state.teams.map((team, index) => ({ ...team, score: index === 0 ? 9 : 5 })) };
}

function dealtMatch(): MatchState {
  const base = createHeadToHeadMatch({ playerAId: SELF, playerBId: OPPONENT, pointsToWin: 30, dealerSeat: 1 });
  return withScore1v1(startHand(base, FIXED_DEAL));
}

function dealtTeamMatch(): MatchState {
  const base = createTeamMatch({ seatOrder: [SELF, OPPONENT, PARTNER, OPPONENT_2], pointsToWin: 30, dealerSeat: 3 });
  return withScore2v2(startHand(base, FIXED_DEAL_4));
}

/** Containers this file has mounted, removed after EVERY test — same
 * cleanup and reasoning as the two files this one is split from (an
 * accumulated table pushes the next one below the viewport fold). */
const mounted: HTMLElement[] = [];

/** Every custom property `table-wide-themed` below sets on `<html>`, reset
 * after EVERY test (real cross-test leak found and fixed while writing this
 * file, T3's own whole-set audit — see this PR's report for the full story,
 * including the SAME leak found in the pre-existing `table.visual.test.ts`'s
 * own "themed"/"hand-full-piles" pair, reported but deliberately NOT fixed
 * there): within one Vitest Browser Mode test FILE, tests share one real
 * `document` — `document.documentElement.style.setProperty(...)` in one test
 * is still there, unset, for every later test in the same file. Confirmed
 * empirically: `table-ultra-2v2`/`match-over-wide` (both AFTER the themed
 * test below in file order) rendered with the themed accent/primary colours
 * until this cleanup was added. */
const THEME_PROPS = ["--gx-color-surface", "--gx-color-on-surface", "--gx-color-primary", "--gx-color-on-primary", "--gx-color-accent", "--gx-radius"] as const;

afterEach(() => {
  while (mounted.length > 0) mounted.pop()!.remove();
  for (const prop of THEME_PROPS) document.documentElement.style.removeProperty(prop);
});

/** Parameterized width (unlike the two files this one is split from, which
 * each hardcode a single tier) — this file's whole purpose is the SAME shell
 * at the wide (900px axis, 960px chosen) and ultra (1280px) tiers, so one
 * helper serves every test here. Height stays unset for the same reason both
 * source files document (table.visual.test.ts's own mountedContainer carries
 * it in full): width-only reproduces the real widget document, which has no
 * definite height chain at all — embed-shell.ts declares no height on
 * html/body, so the shell's own `height: 100%` computes to auto — and an
 * auto-height ancestor lets the felt hug its real content so nothing can
 * clip. Panel POSITION under a definite height is fenced in
 * table-panel-in-frame.browser.test.ts, not here.
 *
 * `page.viewport(...)` (real bug found writing this file, not present in
 * either source file — both stay under 414px): Browser Mode's default
 * viewport is 414×896 (visual/README.md's own "mobile-first" note); at
 * 900px+ container widths that default viewport is narrower than the
 * container itself, and Chromium simply never PAINTS the part of the page
 * outside the viewport — the captured screenshot showed a real 728px-wide
 * felt (`getBoundingClientRect()` confirmed the CSS layout was correct) but
 * everything past x≈414 rendered solid white. Widening the viewport past
 * the requested container width (before mounting) is what this file's own
 * tests need that neither existing file ever needed. */
async function mountedContainer(width: number): Promise<HTMLElement> {
  await page.viewport(width + 120, 1200);
  const container = document.createElement("div");
  container.style.width = `${width}px`;
  document.body.appendChild(container);
  mounted.push(container);
  return container;
}

function feltOf(container: HTMLElement): HTMLElement {
  const felt = container.querySelector<HTMLElement>(".hexdev-truco-table");
  if (felt === null) throw new Error("visual fixture setup: felt element not rendered");
  return felt;
}

async function waitForArt(container: HTMLElement): Promise<void> {
  const images = [...container.querySelectorAll("img")];
  await Promise.all(images.map((img) => img.decode()));
}

describe("visual: the game table at the wide/ultra container tiers (VB-3 — new wide baseline coverage)", () => {
  it("wide (960px), mid-hand: the same deal table-mid-hand captures, at the tier where the call-log rail sits in flow (PR4)", async () => {
    const container = await mountedContainer(960);
    const played = applyAction(dealtMatch(), { type: "play-card", playerId: SELF, card: FIXED_DEAL[0]![0]! });
    if (!played.ok) throw new Error(`visual fixture setup: illegal action — ${played.violation}`);
    const view = getViewFor(played.state, SELF);
    const legalActions = getLegalActions(played.state, SELF);

    createMatchTableRenderer()(container, view, legalActions, () => {});
    await waitForArt(container);

    await expect.element(feltOf(container)).toMatchScreenshot("table-wide-mid-hand");
  });

  it("wide (960px), a pending truco call: the same deal table-truco-pending captures, banner lane + reserved action-bar row both in flow (PR5)", async () => {
    const container = await mountedContainer(960);
    const called = applyAction(dealtMatch(), { type: "call-truco", playerId: OPPONENT, level: "truco" });
    if (!called.ok) throw new Error(`visual fixture setup: illegal action — ${called.violation}`);
    const view = getViewFor(called.state, SELF);
    const legalActions = getLegalActions(called.state, SELF);

    createMatchTableRenderer()(container, view, legalActions, () => {});
    await waitForArt(container);

    await expect.element(feltOf(container)).toMatchScreenshot("table-wide-truco-pending");
  });

  it("wide (960px), a themed tenant: proves VB-5 at wide — table-themed (320px) was the only baseline that ever captured panel theming at all", async () => {
    const container = await mountedContainer(960);
    const root = document.documentElement;
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

    // The whole shell, not just the felt — same reasoning as table-themed:
    // the panel (now beside the felt, at its own wider 200px rail per
    // tasks §3.8) is exactly what this shot must keep in frame.
    await expect.element(container).toMatchScreenshot("table-wide-themed");
  });

  it("ultra (1280px), 2v2 mid-hand: the same deal table-2v2-mid-hand captures, at the ultra card-width/gap tier", async () => {
    const container = await mountedContainer(1280);
    // No seña in this fixture any more: the partner's claim used to leave a
    // persistent chip on their anchor, which this shot existed partly to
    // capture at the ultra tier. A seña is transient now — it shows once in
    // the banner lane and is gone — so sending one here would leave nothing
    // on screen for a single-snapshot capture to record. The narrow-tier
    // table-2v2-sena-notice baseline owns the notice itself.
    const state = dealtTeamMatch();
    const view = getViewFor(state, SELF);
    const legalActions = getLegalActions(state, SELF);

    createMatchTableRenderer()(container, view, legalActions, () => {});
    await waitForArt(container);

    await expect.element(feltOf(container)).toMatchScreenshot("table-ultra-2v2");
  });

  it("wide (960px), match over: the solid-fill overlay (no --hx-scrim, refinement 3) — the one shape no visual test captured before this PR", async () => {
    const container = await mountedContainer(960);
    const played = applyAction(dealtMatch(), { type: "play-card", playerId: SELF, card: FIXED_DEAL[0]![0]! });
    if (!played.ok) throw new Error(`visual fixture setup: illegal action — ${played.violation}`);
    const view = getViewFor(played.state, SELF);
    const legalActions = getLegalActions(played.state, SELF);

    // MatchEndInfo.outcome is the one authoritative end-of-match signal
    // (table.ts's own doc comment) — fabricated directly here, the same
    // convention match-outcome.browser.test.ts already uses, independent of
    // view.teams/pointsToWin (never re-derived from them client-side).
    createMatchTableRenderer()(container, view, legalActions, () => {}, { outcome: { winnerIds: [SELF] }, onPlayAgain: () => {} });
    await waitForArt(container);

    // The overlay (`renderMatchOverOverlay`, match-outcome.ts) is appended
    // as a SIBLING of `.hexdev-truco-shell-layout` directly on the
    // renderer's own `container` argument, never a felt descendant — the
    // shell is the only element that shows it at all.
    await expect.element(container).toMatchScreenshot("match-over-wide");
  });
});
