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

/** A maximal 1v1 hand (T-7 fence): the exact split-then-decided-at-trick-3
 * deck `card-play.test.ts`'s own end-to-end fixture already proves produces
 * exactly 3 resolved tricks, not fewer, paired here with a full envido chain
 * AND a fully-escalated truco chain (truco -> retruco -> vale cuatro, each
 * accepted) — the tallest possible combination of transient chrome (the
 * widest calls row, both banners in sequence, three growing piles) this
 * table can ever show at once. */
const DEAL_1V1_MAXIMAL: DealInput = [
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

/** A maximal 2v2 hand (T-7 fence): reuses `card-play.test.ts`'s own
 * split-then-decided-at-trick-3 four-seat fixture, paired with a full envido
 * chain and a fully-escalated truco chain traded across both teams — the
 * tallest and widest possible combination this table can ever show. */
const DEAL_2V2_MAXIMAL: DealInput = [
  [
    { suit: "espada", rank: 1 },
    { suit: "basto", rank: 4 },
    { suit: "espada", rank: 3 },
  ],
  [
    { suit: "basto", rank: 5 },
    { suit: "oro", rank: 1 },
    { suit: "basto", rank: 6 },
  ],
  [
    { suit: "oro", rank: 4 },
    { suit: "copa", rank: 4 },
    { suit: "basto", rank: 4 },
  ],
  [
    { suit: "copa", rank: 5 },
    { suit: "basto", rank: 3 },
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
  return playNextCardAmong(state, [a, b]);
}

/** Generalization of playNextCard over any number of seats (2v2's four
 * players): exactly one of them has a legal play-card action at a time
 * (whoever `turnSeat` names), so checking every candidate and dispatching
 * the first hit is equivalent to tracking `turnSeat` directly. */
function playNextCardAmong(state: MatchState, players: readonly PlayerId[]): MatchState {
  for (const player of players) {
    const play = findPlayCard(state, player);
    if (play !== undefined) return dispatch(state, play);
  }
  throw new Error("test setup: no legal play-card action for any given player — is the hand already decided?");
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

  it("2v2: envido called/accepted/revealed, cards played seat-by-seat, tricks resolved, truco called/accepted, cards played to a decided hand — the height never changes", async () => {
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

    // Partners sit ACROSS the table (design: 0/2 vs 1/3, matching
    // truco-engine's own createTeamMatch geometry) — SELF (seat 0) and
    // TEAMMATE (seat 2) are one team; OPPONENT (seat 1) and OPPONENT_2
    // (seat 3) are the other. dealerSeat 3 makes SELF mano.
    const seatOrder: readonly [PlayerId, PlayerId, PlayerId, PlayerId] = [SELF, OPPONENT, TEAMMATE, OPPONENT_2];
    let state = startHand(createTeamMatch({ seatOrder, pointsToWin: 30, dealerSeat: 3 }), DEAL_2V2);
    await recordRender(state); // baseline: dealt, nothing has happened yet

    state = dispatch(state, { type: "call-envido", playerId: SELF, level: "envido" });
    await recordRender(state); // pending-call banner: "Envido"

    state = dispatch(state, { type: "respond-envido", playerId: OPPONENT, response: "quiero" });
    await recordRender(state); // banner clears — accepted, awaiting reveal

    state = dispatch(state, { type: "reveal-envido", playerId: SELF });
    await recordRender(state); // envido revealed, still no banner

    const allFourSeats = [SELF, OPPONENT, TEAMMATE, OPPONENT_2] as const;

    // Trick 1: every one of the four seats plays a card in turn, one card at
    // a time — the exact "opponent hand shrinking seat by seat" case named
    // as a possible remaining fluctuation.
    for (let play = 0; play < 4; play++) {
      state = playNextCardAmong(state, allFourSeats);
      await recordRender(state);
    }

    state = dispatch(state, { type: "call-truco", playerId: SELF, level: "truco" });
    await recordRender(state); // pending-call banner: "Truco"

    state = dispatch(state, { type: "respond-truco", playerId: OPPONENT, response: "quiero" });
    await recordRender(state); // banner clears again

    let guard = 0;
    while (state.hand !== null && !state.hand.outcome.decided) {
      if (guard++ > 20) throw new Error("test setup: hand never decided — possible infinite loop");
      state = playNextCardAmong(state, allFourSeats);
      await recordRender(state);
    }

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

  // T-7 fence (design/tasks: must be GREEN before the pile change lands and
  // STAY green through every later PR-3/PR-4 task — a fence, not a one-time
  // check). Both cases below reach the tallest state this table can ever
  // render: a full envido chain, a truco chain escalated to its ceiling, and
  // all three tricks resolved — every transient banner and every seat's pile
  // at its largest, all at once.
  it("1v1 MAXIMAL: full envido chain + fully-escalated truco chain + three resolved tricks — the tallest possible state, height never changes (T-7 fence)", async () => {
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
      DEAL_1V1_MAXIMAL,
    );
    await recordRender(state); // baseline

    state = dispatch(state, { type: "call-envido", playerId: SELF, level: "envido" });
    await recordRender(state);
    state = dispatch(state, { type: "respond-envido", playerId: OPPONENT, response: "quiero" });
    await recordRender(state);
    state = dispatch(state, { type: "reveal-envido", playerId: SELF });
    await recordRender(state);

    state = dispatch(state, { type: "call-truco", playerId: SELF, level: "truco" });
    await recordRender(state);
    state = dispatch(state, { type: "respond-truco", playerId: OPPONENT, response: "quiero" });
    await recordRender(state);
    state = dispatch(state, { type: "call-truco", playerId: OPPONENT, level: "retruco" }); // only the non-calling team may escalate
    await recordRender(state);
    state = dispatch(state, { type: "respond-truco", playerId: SELF, response: "quiero" });
    await recordRender(state);
    state = dispatch(state, { type: "call-truco", playerId: SELF, level: "valeCuatro" }); // escalated to the ceiling — no level above this
    await recordRender(state);
    state = dispatch(state, { type: "respond-truco", playerId: OPPONENT, response: "quiero" });
    await recordRender(state); // fully escalated and accepted — the widest possible calls row, already retired

    // Trick 1: SELF (mano) leads and wins with 1-espada over 4-espada.
    state = dispatch(state, { type: "play-card", playerId: SELF, card: DEAL_1V1_MAXIMAL[0]![0]! });
    await recordRender(state);
    state = dispatch(state, { type: "play-card", playerId: OPPONENT, card: DEAL_1V1_MAXIMAL[1]![0]! });
    await recordRender(state); // trick 1 resolves — the first pile card appears on both seats

    // Trick 2: SELF leads again (won trick 1); OPPONENT wins with 1-basto over 4-basto — split so far.
    state = dispatch(state, { type: "play-card", playerId: SELF, card: DEAL_1V1_MAXIMAL[0]![1]! });
    await recordRender(state);
    state = dispatch(state, { type: "play-card", playerId: OPPONENT, card: DEAL_1V1_MAXIMAL[1]![1]! });
    await recordRender(state); // trick 2 resolves — split, trick 3 must decide

    // Trick 3: OPPONENT leads (won trick 2); SELF wins with 7-espada over 4-oro, deciding the hand.
    state = dispatch(state, { type: "play-card", playerId: OPPONENT, card: DEAL_1V1_MAXIMAL[1]![2]! });
    await recordRender(state);
    state = dispatch(state, { type: "play-card", playerId: SELF, card: DEAL_1V1_MAXIMAL[0]![2]! });
    await recordRender(state); // hand decided — two full three-card piles, a full call log, hand-outcome banner: all at once

    expect(state.hand?.trickOutcomes).toHaveLength(3); // sanity: this really is the maximal case, not an early decision
    expect(state.hand?.outcome.decided).toBe(true);
    expectStableHeights(heights);
  });

  it("2v2 MAXIMAL: full envido chain + fully-escalated truco chain + three resolved tricks — the tallest possible state, height never changes (T-7 fence)", async () => {
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

    const seatOrder: readonly [PlayerId, PlayerId, PlayerId, PlayerId] = [SELF, OPPONENT, TEAMMATE, OPPONENT_2];
    let state = startHand(createTeamMatch({ seatOrder, pointsToWin: 30, dealerSeat: 3 }), DEAL_2V2_MAXIMAL);
    await recordRender(state); // baseline

    state = dispatch(state, { type: "call-envido", playerId: SELF, level: "envido" });
    await recordRender(state);
    state = dispatch(state, { type: "respond-envido", playerId: OPPONENT, response: "quiero" });
    await recordRender(state);
    state = dispatch(state, { type: "reveal-envido", playerId: SELF });
    await recordRender(state);

    state = dispatch(state, { type: "call-truco", playerId: SELF, level: "truco" });
    await recordRender(state);
    state = dispatch(state, { type: "respond-truco", playerId: OPPONENT, response: "quiero" });
    await recordRender(state);
    state = dispatch(state, { type: "call-truco", playerId: OPPONENT, level: "retruco" }); // team B escalates
    await recordRender(state);
    state = dispatch(state, { type: "respond-truco", playerId: TEAMMATE, response: "quiero" }); // any team A player may answer
    await recordRender(state);
    state = dispatch(state, { type: "call-truco", playerId: SELF, level: "valeCuatro" }); // team A escalates to the ceiling
    await recordRender(state);
    state = dispatch(state, { type: "respond-truco", playerId: OPPONENT_2, response: "quiero" });
    await recordRender(state); // fully escalated and accepted, both teams having taken a turn calling

    // Trick 1: SELF leads (mano), turn order 0 -> 1 -> 2 -> 3; team A's 1-espada (SELF) wins.
    state = dispatch(state, { type: "play-card", playerId: SELF, card: DEAL_2V2_MAXIMAL[0]![0]! });
    await recordRender(state);
    state = dispatch(state, { type: "play-card", playerId: OPPONENT, card: DEAL_2V2_MAXIMAL[1]![0]! });
    await recordRender(state);
    state = dispatch(state, { type: "play-card", playerId: TEAMMATE, card: DEAL_2V2_MAXIMAL[2]![0]! });
    await recordRender(state);
    state = dispatch(state, { type: "play-card", playerId: OPPONENT_2, card: DEAL_2V2_MAXIMAL[3]![0]! });
    await recordRender(state); // trick 1 resolves — the first pile card appears on all four seats

    // Trick 2: SELF leads again (held trick 1's winning card); team B's 3-basto (OPPONENT_2) wins — split so far.
    state = dispatch(state, { type: "play-card", playerId: SELF, card: DEAL_2V2_MAXIMAL[0]![1]! });
    await recordRender(state);
    state = dispatch(state, { type: "play-card", playerId: OPPONENT, card: DEAL_2V2_MAXIMAL[1]![1]! });
    await recordRender(state);
    state = dispatch(state, { type: "play-card", playerId: TEAMMATE, card: DEAL_2V2_MAXIMAL[2]![1]! });
    await recordRender(state);
    state = dispatch(state, { type: "play-card", playerId: OPPONENT_2, card: DEAL_2V2_MAXIMAL[3]![1]! });
    await recordRender(state); // trick 2 resolves — split, trick 3 must decide

    // Trick 3: OPPONENT_2 leads (won trick 2); turn order wraps 3 -> 0 -> 1 -> 2. Team A's 3-espada (SELF) decides the hand.
    state = dispatch(state, { type: "play-card", playerId: OPPONENT_2, card: DEAL_2V2_MAXIMAL[3]![2]! });
    await recordRender(state);
    state = dispatch(state, { type: "play-card", playerId: SELF, card: DEAL_2V2_MAXIMAL[0]![2]! });
    await recordRender(state);
    state = dispatch(state, { type: "play-card", playerId: OPPONENT, card: DEAL_2V2_MAXIMAL[1]![2]! });
    await recordRender(state);
    state = dispatch(state, { type: "play-card", playerId: TEAMMATE, card: DEAL_2V2_MAXIMAL[2]![2]! });
    await recordRender(state); // hand decided — four full three-card piles, a full call log, hand-outcome banner: all at once

    expect(state.hand?.trickOutcomes).toHaveLength(3); // sanity: this really is the maximal case, not an early decision
    expect(state.hand?.outcome.decided).toBe(true);
    expectStableHeights(heights);
  });
});
