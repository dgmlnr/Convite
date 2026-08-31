import { page } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import { buildDeck, getLegalActions, getViewFor, scoreHandBreakdown, settleLeftovers } from "@hexdev/escoba-engine";
import type { Card, MatchState, Player, PlayerId, Team, TeamId } from "@hexdev/escoba-engine";
import type { GameId } from "@hexdev/platform-contract";
import { createGameUiRegistry, matchRenderContextFor } from "./game-ui-registry.js";

/**
 * ESCOBA FITS THE WINDOW IT WAS GIVEN — measured, never photographed.
 *
 * WHAT WAS BROKEN. `escoba-ui` chose its card size from container WIDTH
 * alone: `rg 'dvh|svh|vh'` over the package came back with one hit and it was
 * a drawer's WIDTH. On a rotated phone — 844x390, 828 container-px — the felt
 * measured 391.48px inside 390px of screen. It did not fit; it missed by a
 * pixel and a half, and nothing in the repo could have told you which side of
 * the line it was on. `truco-ui/src/table-viewport-fit.browser.test.ts` is
 * the same fence one game over.
 *
 * WHY A MEASUREMENT AND NOT A SCENE, spelled out because the obvious test is
 * the broken one: Chromium never paints past the viewport, so a screenshot
 * taken at exactly the fold is the SAME 390px image whether the layout fits
 * or overflows by 200px. A picture cannot answer this question at all.
 * `getBoundingClientRect()` can, and it is unbothered by the fold.
 *
 * THE SECOND FENCE IS THE ONE THAT MATTERS. The first only says today's
 * screen fits today's window. The capture piles start a hand EMPTY and end it
 * holding all forty cards — 79.22px growing to 158.44px at 828 container-px —
 * so a cap budgeted against the empty piles is not a cap, it is a coincidence
 * with a deadline. The late-hand rows below spend that growth up front.
 *
 * ONLY IN FULLSCREEN, the same scope and the same reason as truco's cap.
 * `main.ts`'s `enterMatch` calls `sendLayout("fullscreen")` before it draws a
 * single card, so every live escoba match is covered; INLINE the host sizes
 * the iframe to the height the widget reported, which would make `100dvh` a
 * function of the widget's own content — a feedback loop, not a ceiling.
 */

const SELF = "escoba-fit-self" as PlayerId;
const RIVAL = "escoba-fit-rival" as PlayerId;
const PARTNER = "escoba-fit-partner" as PlayerId;
const RIVAL_TWO = "escoba-fit-rival-two" as PlayerId;
const OURS = "escoba-fit-ours" as TeamId;
const THEIRS = "escoba-fit-theirs" as TeamId;

/** The attribute `apps/widget-app/src/handshake.ts` stamps on its own document
 * root whenever it tells the host to switch modes. A literal on purpose: if
 * that contract is renamed, this fence must fail rather than quietly stop
 * covering anything. */
const LAYOUT_ATTRIBUTE = "data-hexdev-layout";

type Seats = "1v1" | "2v2";

const GAME_ID: Readonly<Record<Seats, GameId>> = {
  "1v1": "escoba-de-15" as GameId,
  "2v2": "escoba-de-15-2v2" as GameId,
};

/**
 * A match at an arbitrary point of a hand, dealt straight from the deck's own
 * declared order rather than played out: this file measures GEOMETRY, and the
 * only thing a fixture has to get right is how many cards sit in each region.
 * `escoba-full-hand.browser.test.ts` already declares its states this way for
 * the same reason (escoba has no `createHeadToHeadMatch` factory).
 */
function matchState(seats: Seats, region: { readonly pile: number; readonly table: number; readonly hand: number }): MatchState {
  const seatOrder: readonly PlayerId[] = seats === "1v1" ? [SELF, RIVAL] : [SELF, RIVAL, PARTNER, RIVAL_TWO];
  const teams: readonly [Team, Team] = [
    { id: OURS, playerIds: seatOrder.filter((_, seat) => seat % 2 === 0), score: 17 },
    { id: THEIRS, playerIds: seatOrder.filter((_, seat) => seat % 2 === 1), score: 12 },
  ];
  const deck = buildDeck();
  let taken = 0;
  const next = (count: number): readonly Card[] => deck.slice(taken, (taken += count));
  const piles: Record<TeamId, readonly Card[]> = { [OURS]: next(region.pile), [THEIRS]: next(region.pile) };
  const table = next(region.table);
  const players: readonly Player[] = seatOrder.map((id, seat) => ({
    id,
    teamId: seat % 2 === 0 ? OURS : THEIRS,
    seat,
    hand: [...next(region.hand)],
  }));
  return {
    teams,
    players,
    dealerSeat: 0,
    hand: { table: [...table], stock: [...deck.slice(taken)], piles, escobas: { [OURS]: 2, [THEIRS]: 1 }, turn: SELF, lastCapturer: OURS, outcome: { decided: false } },
    pointsToWin: 30,
  };
}

/**
 * THE HAND-END SCREEN, produced the way `escoba-module`'s `settleHandIfNeeded`
 * produces it: every seat empty, stock empty, leftovers swept, then the
 * engine's own `scoreHandBreakdown`. Never a breakdown grafted onto a live
 * table — that state does not exist, and the row below says so out loud.
 */
function handEndState(seats: Seats): MatchState {
  const emptied = matchState(seats, { pile: 20, table: 0, hand: 0 });
  const settled = settleLeftovers({ ...emptied, hand: { ...emptied.hand!, stock: [] } });
  const breakdown = scoreHandBreakdown(settled.hand!, [OURS, THEIRS]);
  return { ...settled, hand: { ...settled.hand!, outcome: { decided: true, breakdown } } };
}

let container: HTMLElement;

afterEach(async () => {
  container.remove();
  document.documentElement.removeAttribute(LAYOUT_ATTRIBUTE);
  await page.viewport(414, 896); // visual/README.md's own default
});

/**
 * The fullscreen box, reproduced: `applyLayoutMode` pins the widget to the
 * viewport with `position: fixed; inset: 0`, and the attribute goes on BEFORE
 * the first render so the cap is in effect for the initial layout rather than
 * applied to an already-measured one.
 */
async function mountedFullscreen(w: number, h: number): Promise<HTMLElement> {
  await page.viewport(w, h);
  document.documentElement.setAttribute(LAYOUT_ATTRIBUTE, "fullscreen");
  container = document.createElement("div");
  container.style.position = "fixed";
  container.style.inset = "0";
  document.body.appendChild(container);
  return container;
}

async function renderScreen(el: HTMLElement, seats: Seats, state: MatchState): Promise<void> {
  const entry = createGameUiRegistry().get(GAME_ID[seats]);
  if (entry === undefined) throw new Error(`fence setup: no renderer registered for ${GAME_ID[seats]}`);
  entry.createRenderer(matchRenderContextFor("joined", Date.now))(el, { view: getViewFor(state, SELF), legalActions: getLegalActions(state, SELF) }, () => {});
  await Promise.all([...el.querySelectorAll("img")].map((img) => img.decode()));
}

/**
 * NOT the container's own box. It is `position: fixed; inset: 0`, so it
 * measures the viewport no matter how far its contents spill — the exact trap
 * truco's own fence names. What actually grows is the match surface inside it.
 */
function widgetHeight(el: HTMLElement): number {
  return el.scrollHeight;
}

/**
 * Real rotated phones, all of them SHORT and WIDE — the shape where escoba's
 * width-only card tier picks its LARGEST card and its TALLEST layout.
 */
const WINDOWS = [
  { w: 844, h: 390, label: "iPhone 14, landscape" },
  { w: 926, h: 428, label: "iPhone 14 Plus, landscape" },
  { w: 740, h: 360, label: "small Android, landscape" },
] as const;

describe.each(WINDOWS)("escoba fits its own window — $w x $h ($label)", ({ w, h }) => {
  it.each(["1v1", "2v2"] as const)("%s: mid-hand, nothing renders below the fold", async (seats) => {
    const el = await mountedFullscreen(w, h);
    await renderScreen(el, seats, matchState(seats, { pile: 4, table: 3, hand: 2 }));

    expect(widgetHeight(el), `${seats} mid-hand against a ${String(h)}px window`).toBeLessThanOrEqual(h);
  });

  /**
   * THE FENCE. Same screen, same window, with the capture piles holding the
   * 36 cards a hand has nearly finished dealing out — the region that is
   * empty when the first card is played and full when the last one is. The
   * mid-hand row above passes on a cap budgeted against empty piles; this one
   * does not.
   */
  it.each(["1v1", "2v2"] as const)("%s: late in the hand, with both capture piles nearly full", async (seats) => {
    const el = await mountedFullscreen(w, h);
    // The deck is forty cards and every one of them is somewhere: 1v1 puts
    // 18+18 in the piles, 2v2 17+17, and the rest is what is still in play.
    await renderScreen(el, seats, matchState(seats, { pile: seats === "1v1" ? 18 : 17, table: 2, hand: 1 }));

    expect(widgetHeight(el), `${seats} with full piles against a ${String(h)}px window`).toBeLessThanOrEqual(h);
  });
});

/**
 * WHY THE BUDGET MAY LEAVE THE CARD ROWS AND THE BREAKDOWN SHARING ONE SLOT.
 *
 * The hand-end breakdown is seven rows and 184px tall, and the cap does not
 * subtract it from the room the card rows get. That is only sound because the
 * two never coexist: `escoba-module`'s `settleHandIfNeeded` refuses to decide
 * a hand until every seat's hand is empty, and `settleLeftovers` sweeps the
 * table on its way through. So the breakdown appears in the space the cards
 * have just vacated, and reserving both would have cost the cards 58px of
 * width for a screen that cannot happen.
 *
 * An assumption a budget rests on is a fence or it is a comment. This is the
 * fence: the day the engine, or `createEscobaRenderer`, lets a decided
 * breakdown share the felt with a card, this goes red and the cap's budget is
 * wrong on the same day.
 */
describe("the hand-end breakdown never shares the felt with a card", () => {
  it.each(["1v1", "2v2"] as const)("%s: a decided hand leaves the table and the hand empty", async (seats) => {
    const el = await mountedFullscreen(844, 390);
    await renderScreen(el, seats, handEndState(seats));

    const breakdown = el.querySelector<HTMLElement>(".hexdev-escoba-hand-breakdown");
    expect(breakdown?.dataset.decided, "fence setup: this state must actually render the breakdown").toBe("true");
    expect(el.querySelectorAll(".hexdev-escoba-table [data-card]"), "a decided hand with cards still face up").toHaveLength(0);
    expect(el.querySelectorAll(".hexdev-escoba-hand [data-card]"), "a decided hand with cards still in hand").toHaveLength(0);
  });
});

/**
 * AND THE HAND-END SCREEN FITS, which the block above never once claimed.
 *
 * That block proves the BUDGET's assumption — that a decided breakdown and a
 * card never share the felt — and it is the reason the 184px panel is not
 * subtracted from the card rows. It says nothing at all about whether the
 * screen it describes fits, and it did not: the widget measured 402.22px
 * against 390px of rotated phone while its felt measured 350.22px. The 52px
 * between the two was the `aria-live` paragraph that repeats the breakdown in
 * one sentence, rendered as an ordinary <p> because no stylesheet had ever
 * claimed it. `scoreboard-styles.ts` now clips it the way this package already
 * clips its two other say-it-do-not-draw-it nodes.
 *
 * A CAP CANNOT REACH THIS SCREEN, which is why it needs a fence of its own
 * rather than a wider budget. When a hand is decided the table and the hand
 * are empty, so the card rows the cap governs are two 16px strips of padding
 * and every other band is a fixed height. There is no card left to shrink:
 * whatever the fixed bands add up to IS the screen, and the only lever is
 * which bands exist.
 */
describe.each(WINDOWS)("the hand-end screen fits too — $w x $h ($label)", ({ w, h }) => {
  it.each(["1v1", "2v2"] as const)("%s: a decided hand renders nothing below the fold", async (seats) => {
    const el = await mountedFullscreen(w, h);
    await renderScreen(el, seats, handEndState(seats));

    expect(el.querySelector<HTMLElement>(".hexdev-escoba-hand-breakdown")?.dataset.decided, "fence setup: this state must actually render the breakdown").toBe("true");
    expect(widgetHeight(el), `${seats} hand-end against a ${String(h)}px window`).toBeLessThanOrEqual(h);
  });

  /**
   * THE HALF THAT MAKES THE FIX A FIX RATHER THAN A DELETION. Clipping a live
   * region and removing it are the same number of pixels and opposite
   * outcomes: one keeps the hand's result reaching assistive tech, the other
   * silently ends it. So the fence is not "the announcer is small" — it is
   * "the announcer still says the whole thing, and still costs nothing".
   */
  it.each(["1v1", "2v2"] as const)("%s: the outcome is still announced, and still costs no height", async (seats) => {
    const el = await mountedFullscreen(w, h);
    await renderScreen(el, seats, handEndState(seats));

    const announcer = el.querySelector<HTMLElement>(".hexdev-escoba-breakdown-announcer");
    expect(announcer, "the region a decided hand is announced through").not.toBeNull();
    expect(announcer!.getAttribute("aria-live"), "a region that does not announce is not a region").toBe("polite");
    expect(announcer!.textContent, "the hand's own result, in words").toContain("La mano valió");
    expect(announcer!.getBoundingClientRect().height, "an announcement drawn as a paragraph is the overflow").toBeLessThanOrEqual(1);
  });
});
