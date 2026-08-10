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
 * The literal bug report: "a banner appears on the table, the window grows;
 * it resolves, the window shrinks" — the host page's embedded iframe resizes
 * to match the widget's own reported content height (design §6:
 * `ResizeObserver` on `document.documentElement` -> `resize { height }`), and
 * every transient piece of table chrome (a pending call, a hand-outcome
 * acknowledgement, the señas picker opening) was changing that content height.
 *
 * This suite proves the fix at its real source: the table renderer's own
 * rendered DOM, driven through a REAL hand via the REAL engine (never a
 * hand-authored view) — not the postMessage/iframe plumbing, which only
 * relays whatever height this DOM naturally has. `apps/widget-app/src/main.ts`
 * observes `document.documentElement`, whose own height is likewise
 * content-driven with no ancestor imposing a fixed height — the same
 * situation `mountedContainer` below deliberately reproduces (no fixed
 * height, unlike `table.visual.test.ts`'s own screenshot fixtures, which set
 * one on purpose for a stable capture).
 */

const SELF = "height-self" as PlayerId;
const OPPONENT = "height-opponent" as PlayerId;
const TEAMMATE = "height-teammate" as PlayerId;
const OPPONENT_2 = "height-opponent-2" as PlayerId;

const DEAL_1V1: DealInput = [
  [
    { suit: "espada", rank: 4 },
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

/** Phone width (the tightest real case, apply prompt) and deliberately NO
 * fixed height — see the file docstring for why that matters here. */
function mountedContainer(): HTMLElement {
  container = document.createElement("div");
  container.style.width = "375px";
  document.body.appendChild(container);
  return container;
}

/** Card art loads asynchronously; awaiting it removes a source of height
 * flakiness unrelated to this suite's own subject, same discipline
 * `table.visual.test.ts`'s own `waitForArt` already established. */
async function waitForArt(el: HTMLElement): Promise<void> {
  const images = [...el.querySelectorAll("img")];
  await Promise.all(images.map((img) => img.decode()));
}

function dispatch(state: MatchState, action: Action): MatchState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`test setup: illegal action ${JSON.stringify(action)} — ${result.violation}`);
  return result.state;
}

function findPlayCard(state: MatchState, playerId: PlayerId): Action | undefined {
  return getLegalActions(state, playerId).find((action) => action.type === "play-card");
}

/** Plays one legal card for whichever of the two given players currently owes
 * one — mirrors the real turn order without this test tracking `turnSeat`
 * itself. */
function playNextCard(state: MatchState, a: PlayerId, b: PlayerId): MatchState {
  const playA = findPlayCard(state, a);
  if (playA !== undefined) return dispatch(state, playA);
  const playB = findPlayCard(state, b);
  if (playB !== undefined) return dispatch(state, playB);
  throw new Error("test setup: no legal play-card action for either player — is the hand already decided?");
}

/** Asserts every recorded height matches the first, within a tolerance loose
 * enough to absorb genuine sub-pixel layout rounding but tight enough that
 * ANY transient banner/picker's own real content height (tens of pixels)
 * still fails it. */
function expectStableHeights(heights: readonly number[]): void {
  expect(heights.length).toBeGreaterThan(2);
  const baseline = heights[0]!;
  for (const [index, height] of heights.entries()) {
    expect(Math.abs(height - baseline), `render #${index}: ${height}px vs baseline ${baseline}px`).toBeLessThan(1);
  }
}

describe("createMatchTableRenderer — the table's own reported height stays constant across a whole played hand (stable window height)", () => {
  it("1v1: envido called/accepted/revealed, a trick resolves, truco called/accepted, cards played to a decided hand — the height never changes", async () => {
    const el = mountedContainer();
    const render = createMatchTableRenderer();
    const heights: number[] = [];

    const recordRender = async (state: MatchState): Promise<void> => {
      const view = getViewFor(state, SELF);
      const legal = getLegalActions(state, SELF);
      render(el, view, legal, () => {});
      await waitForArt(el);
      heights.push(el.getBoundingClientRect().height);
    };

    let state = startHand(
      createHeadToHeadMatch({ playerAId: SELF, playerBId: OPPONENT, pointsToWin: 30, dealerSeat: 1 }),
      DEAL_1V1,
    );
    await recordRender(state); // baseline: dealt, nothing has happened yet

    state = dispatch(state, { type: "call-envido", playerId: SELF, level: "envido" });
    await recordRender(state); // pending-call banner: "Envido"

    state = dispatch(state, { type: "respond-envido", playerId: OPPONENT, response: "quiero" });
    await recordRender(state); // banner clears — accepted, awaiting reveal

    state = dispatch(state, { type: "reveal-envido", playerId: SELF });
    await recordRender(state); // envido revealed, points awarded, still no banner

    state = playNextCard(state, SELF, OPPONENT); // mano leads trick 1
    await recordRender(state);

    state = playNextCard(state, SELF, OPPONENT); // trick 1 resolves
    await recordRender(state); // trick-feedback line now announces the winner

    state = dispatch(state, { type: "call-truco", playerId: SELF, level: "truco" });
    await recordRender(state); // pending-call banner: "Truco"

    state = dispatch(state, { type: "respond-truco", playerId: OPPONENT, response: "quiero" });
    await recordRender(state); // banner clears again

    let guard = 0;
    while (state.hand !== null && !state.hand.outcome.decided) {
      if (guard++ > 10) throw new Error("test setup: hand never decided — possible infinite loop");
      state = playNextCard(state, SELF, OPPONENT);
      await recordRender(state);
    }

    expectStableHeights(heights);
  });

  it("1v1: a truco call declined ends the hand immediately — pending banner, then hand-outcome banner, height still never changes", async () => {
    const el = mountedContainer();
    const render = createMatchTableRenderer();
    const heights: number[] = [];

    const recordRender = async (state: MatchState): Promise<void> => {
      const view = getViewFor(state, SELF);
      const legal = getLegalActions(state, SELF);
      render(el, view, legal, () => {});
      await waitForArt(el);
      heights.push(el.getBoundingClientRect().height);
    };

    let state = startHand(
      createHeadToHeadMatch({ playerAId: SELF, playerBId: OPPONENT, pointsToWin: 30, dealerSeat: 1 }),
      DEAL_1V1,
    );
    await recordRender(state); // baseline

    state = dispatch(state, { type: "call-truco", playerId: SELF, level: "truco" });
    await recordRender(state); // pending-call banner: "Truco"

    state = dispatch(state, { type: "respond-truco", playerId: OPPONENT, response: "no-quiero" });
    await recordRender(state); // pending clears, hand-outcome banner: "Ganaste la mano"

    expectStableHeights(heights);
  });

  it("2v2: opening and closing the señas picker never changes the table's height", async () => {
    const el = mountedContainer();
    const render = createMatchTableRenderer();

    const seatOrder: readonly [PlayerId, PlayerId, PlayerId, PlayerId] = [SELF, OPPONENT, TEAMMATE, OPPONENT_2];
    const state = startHand(createTeamMatch({ seatOrder, pointsToWin: 30, dealerSeat: 1 }), DEAL_2V2);
    const view = getViewFor(state, SELF);
    const legal = getLegalActions(state, SELF);
    expect(legal.some((action) => action.type === "send-sena")).toBe(true); // sanity: señas are really on the table for this fixture

    render(el, view, legal, () => {});
    await waitForArt(el);
    const before = el.getBoundingClientRect().height;

    const toggle = el.querySelector<HTMLButtonElement>('button[data-action="senas-toggle"]');
    if (toggle === null) throw new Error("test setup: señas toggle not rendered — is send-sena really legal?");

    toggle.click(); // open — the six-signal row appears
    const opened = el.getBoundingClientRect().height;

    toggle.click(); // close — the row clears again
    const closed = el.getBoundingClientRect().height;

    expect(Math.abs(opened - before), `opened: ${opened}px vs before: ${before}px`).toBeLessThan(1);
    expect(Math.abs(closed - before), `closed: ${closed}px vs before: ${before}px`).toBeLessThan(1);
  });
});
