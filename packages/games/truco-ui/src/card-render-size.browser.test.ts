import { afterEach, describe, expect, it } from "vitest";
import {
  applyAction,
  createHeadToHeadMatch,
  createTeamMatch,
  getLegalActions,
  getViewFor,
  startHand,
} from "@hexdev/truco-engine";
import type { Action, DealInput, MatchState, PlayerId } from "@hexdev/truco-engine";
import { createMatchTableRenderer } from "./table.js";

/**
 * A height-stability test proves the TABLE's own height never moves. It says
 * nothing about whether the content INSIDE that stable box is intact — a
 * card could be silently cropped to 60% of its own height and every
 * height-stability assertion would still pass, because the table's overall
 * height never changed. That is exactly what a real, hands-on session
 * reported (apply prompt, round 4): the player's own three hand cards
 * rendered with a hard bottom edge partway through their own height, seen
 * live through `pnpm dev:server`/`pnpm dev:host` at two different real
 * viewport heights.
 *
 * This suite asserts the one thing a height-stability test cannot: that
 * every `.hexdev-truco-card` element — the player's own hand, an opponent's
 * hand (row layout in 1v1/2v2-top-bottom, AND column layout in a 2v2
 * left/right side anchor), and a card actually in play in the trick area —
 * renders at its own real, whole height, derived from nothing but its own
 * rendered width and the real baraja española proportions (220:336) every
 * other reservation in this package already uses.
 *
 * Honest investigation note (not asserted by this test, recorded for the
 * record): extensive attempts this round to reproduce the reported crop
 * through this exact rendering path — repeated screenshot generation
 * (15 consecutive runs, byte-identical output), a real Playwright browser
 * session against the actual built server bundle with an accumulated
 * real match score, and direct `getBoundingClientRect()` measurement in
 * every scenario below — never reproduced a short box; every measurement
 * matched the card's own expected height exactly. The one CSS mechanism
 * identified as a plausible cause regardless (`aspect-ratio` resolving
 * against a freshly-mounted `<img>` on every single `replaceChildren()`
 * render) was replaced with an explicit `height: calc()` derived from the
 * card's own width alone (table-styles.ts), which removes that entire
 * class of dependency whether or not it was the exact original trigger.
 * This test locks the resulting invariant in either way.
 */

const SELF = "size-self" as PlayerId;
const OPPONENT = "size-opponent" as PlayerId;
const TEAMMATE = "size-teammate" as PlayerId;
const OPPONENT_2 = "size-opponent-2" as PlayerId;

const DEAL_1V1: DealInput = [
  [
    { suit: "espada", rank: 1 },
    { suit: "oro", rank: 7 },
    { suit: "basto", rank: 2 },
  ],
  [
    { suit: "copa", rank: 12 },
    { suit: "espada", rank: 5 },
    { suit: "oro", rank: 3 },
  ],
];

const DEAL_2V2: DealInput = [
  [
    { suit: "espada", rank: 1 },
    { suit: "basto", rank: 1 },
    { suit: "oro", rank: 1 },
  ],
  [
    { suit: "copa", rank: 4 },
    { suit: "espada", rank: 4 },
    { suit: "basto", rank: 4 },
  ],
  [
    { suit: "oro", rank: 5 },
    { suit: "copa", rank: 5 },
    { suit: "espada", rank: 5 },
  ],
  [
    { suit: "basto", rank: 6 },
    { suit: "oro", rank: 6 },
    { suit: "copa", rank: 6 },
  ],
];

let container: HTMLElement;

afterEach(() => {
  container.remove();
  document.getElementById("hexdev-truco-matchstick-defs")?.remove();
  document.getElementById("hexdev-truco-table-styles")?.remove();
});

function dispatch(state: MatchState, action: Action): MatchState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`test setup: illegal action ${JSON.stringify(action)} — ${result.violation}`);
  return result.state;
}

async function waitForArt(el: HTMLElement): Promise<void> {
  const images = [...el.querySelectorAll("img")];
  await Promise.all(images.map((img) => img.decode()));
}

/** Every `.hexdev-truco-card` under `root` must render at its own real
 * height — derived purely from its own rendered width and the real 220:336
 * baraja proportion, never from a fixed pixel guess (so this holds at every
 * `--truco-card-width` breakpoint without needing its own update). */
function expectEveryCardWhole(root: HTMLElement, context: string): void {
  const cards = [...root.querySelectorAll<HTMLElement>(".hexdev-truco-card")];
  expect(cards.length, `${context}: expected at least one card to check`).toBeGreaterThan(0);
  for (const [index, card] of cards.entries()) {
    const box = card.getBoundingClientRect();
    const expectedHeight = (box.width * 336) / 220;
    expect(
      Math.abs(box.height - expectedHeight),
      `${context}: card #${index} (${card.className}) rendered ${box.height.toFixed(2)}px tall, expected ${expectedHeight.toFixed(2)}px for its own ${box.width.toFixed(2)}px width — looks cropped`,
    ).toBeLessThan(1);
  }
}

describe("createMatchTableRenderer — every card renders at its own whole height, never cropped (apply prompt round 4)", () => {
  it("the player's own hand, in the exact reported scenario: 1v1, pending truco, responding", async () => {
    container = document.createElement("div");
    container.style.width = "375px";
    document.body.appendChild(container);

    const base = createHeadToHeadMatch({ playerAId: SELF, playerBId: OPPONENT, pointsToWin: 30, dealerSeat: 1 });
    const dealt = startHand(base, DEAL_1V1);
    const called = dispatch(dealt, { type: "call-truco", playerId: OPPONENT, level: "truco" });
    const view = getViewFor(called, SELF);
    const legal = getLegalActions(called, SELF);

    createMatchTableRenderer()(container, view, legal, () => {});
    await waitForArt(container);

    expectEveryCardWhole(container.querySelector(".hexdev-truco-hand")!, "own hand, truco pending");
    container.remove();
  });

  it("the player's own hand stays whole resting, mid-hand, and with the señas picker open", async () => {
    container = document.createElement("div");
    container.style.width = "375px";
    document.body.appendChild(container);

    const seatOrder: readonly [PlayerId, PlayerId, PlayerId, PlayerId] = [SELF, OPPONENT, TEAMMATE, OPPONENT_2];
    const state = startHand(createTeamMatch({ seatOrder, pointsToWin: 30, dealerSeat: 3 }), DEAL_2V2);
    const view = getViewFor(state, SELF);
    const legal = getLegalActions(state, SELF);

    createMatchTableRenderer()(container, view, legal, () => {});
    await waitForArt(container);
    expectEveryCardWhole(container.querySelector(".hexdev-truco-hand")!, "own hand, resting");

    const toggle = container.querySelector<HTMLButtonElement>('button[data-action="senas-toggle"]');
    if (toggle === null) throw new Error("test setup: señas toggle not rendered");
    toggle.click();
    expectEveryCardWhole(container.querySelector(".hexdev-truco-hand")!, "own hand, señas open");

    container.remove();
  });

  it("a card actually in play (the trick area) renders whole", async () => {
    container = document.createElement("div");
    container.style.width = "375px";
    document.body.appendChild(container);

    const base = createHeadToHeadMatch({ playerAId: SELF, playerBId: OPPONENT, pointsToWin: 30, dealerSeat: 1 });
    const dealt = startHand(base, DEAL_1V1);
    const played = dispatch(dealt, { type: "play-card", playerId: SELF, card: DEAL_1V1[0]![0]! });
    const view = getViewFor(played, SELF);
    const legal = getLegalActions(played, SELF);

    createMatchTableRenderer()(container, view, legal, () => {});
    await waitForArt(container);

    expectEveryCardWhole(container.querySelector(".hexdev-truco-trick")!, "trick area, a card in play");
    container.remove();
  });

  it("2v2: a left/right opponent's own hand (column layout) renders every card-back whole", async () => {
    container = document.createElement("div");
    container.style.width = "375px";
    document.body.appendChild(container);

    const seatOrder: readonly [PlayerId, PlayerId, PlayerId, PlayerId] = [SELF, OPPONENT, TEAMMATE, OPPONENT_2];
    const state = startHand(createTeamMatch({ seatOrder, pointsToWin: 30, dealerSeat: 3 }), DEAL_2V2);
    const view = getViewFor(state, SELF);
    const legal = getLegalActions(state, SELF);

    createMatchTableRenderer()(container, view, legal, () => {});
    await waitForArt(container);

    expectEveryCardWhole(container.querySelector('[data-position="left"]')!, "2v2 left opponent hand");
    expectEveryCardWhole(container.querySelector('[data-position="right"]')!, "2v2 right opponent hand");
    expectEveryCardWhole(container.querySelector('[data-position="top"]')!, "2v2 top (partner) hand");
    container.remove();
  });
});
