import { afterEach, describe, expect, it } from "vitest";

import { getLegalActions, getViewFor } from "@hexdev/mentiroso-engine";
import type { MatchState, PlayerId } from "@hexdev/mentiroso-engine";

import { createMentirosoTableRenderer } from "./table.js";

/**
 * `table.ts`'s own tests (SDD `mentiroso`, work unit E5/task 5.5): the first
 * file in this package that composes `cups.ts`, `bid-picker.ts` and
 * `showdown.ts` into one screen — see this file's own top docblock for why
 * this composition never gates which piece renders (each piece already
 * answers that for itself).
 *
 * SIX SEATS, mySeat = 3, TWO ELIMINATED (2 and 4, interleaved) — the same
 * fixture shape `cups.browser.test.ts` already established for this package,
 * reused here because a composed table is exactly where an attribution bug
 * between the three pieces would first become visible.
 */
const SEAT_IDS: readonly PlayerId[] = [0, 1, 2, 3, 4, 5].map((seat) => `seat-${String(seat)}` as PlayerId);
const [P0, P1, P2, P3, P4, P5] = SEAT_IDS as readonly [PlayerId, PlayerId, PlayerId, PlayerId, PlayerId, PlayerId];
const MY_SEAT = 3;
const MY_PLAYER_ID = P3;

function biddingState(turnSeat: number): MatchState {
  return {
    players: [
      { id: P0, seat: 0, dice: [1, 1, 1] },
      { id: P1, seat: 1, dice: [2, 2] },
      { id: P2, seat: 2, dice: [] }, // eliminated
      { id: P3, seat: 3, dice: [3, 3, 3, 3, 3] }, // self
      { id: P4, seat: 4, dice: [] }, // eliminated
      { id: P5, seat: 5, dice: [6, 6, 6, 6] },
    ],
    phase: { kind: "bidding", turnSeat, bid: { quantity: 2, face: 3 } },
  };
}

function showdownState(): MatchState {
  return { ...biddingState(MY_SEAT), phase: { kind: "showdown", bid: { quantity: 2, face: 3 }, doubterSeat: MY_SEAT, matched: 1, loserSeat: 5, winnerSeat: MY_SEAT } };
}

const mounted: HTMLElement[] = [];
afterEach(() => {
  while (mounted.length > 0) mounted.pop()!.remove();
});

function mountContainer(): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  mounted.push(container);
  return container;
}

describe("table: composes the felt, the bid picker and the showdown reveal — never a fourth rule of its own", () => {
  it("mounts one cup per seat under the same container the bid picker and showdown share", () => {
    const container = mountContainer();
    const render = createMentirosoTableRenderer();
    const state = biddingState(MY_SEAT);
    render(container, getViewFor(state, MY_PLAYER_ID), getLegalActions(state, MY_PLAYER_ID), () => {});

    expect(container.querySelectorAll("[data-seat]")).toHaveLength(6);
  });

  it("shows the bid picker on the viewer's own turn to bid, and shows no showdown facts at all", () => {
    const container = mountContainer();
    const render = createMentirosoTableRenderer();
    const state = biddingState(MY_SEAT);
    render(container, getViewFor(state, MY_PLAYER_ID), getLegalActions(state, MY_PLAYER_ID), () => {});

    expect(container.querySelector(".hexdev-mentiroso-bid-picker")?.children.length).toBeGreaterThan(0);
    expect(container.querySelector(".hexdev-mentiroso-showdown")?.children.length ?? 0).toBe(0);
  });

  it("shows nothing in either panel when it is not the viewer's turn and the phase is not showdown", () => {
    const container = mountContainer();
    const render = createMentirosoTableRenderer();
    const state = biddingState(5); // seat 5's turn, not the viewer's
    render(container, getViewFor(state, MY_PLAYER_ID), getLegalActions(state, MY_PLAYER_ID), () => {});

    expect(container.querySelector(".hexdev-mentiroso-bid-picker")?.children.length ?? 0).toBe(0);
    expect(container.querySelector(".hexdev-mentiroso-showdown")?.children.length ?? 0).toBe(0);
  });

  it("shows the showdown facts during showdown, and renders no bid picker at all", () => {
    const container = mountContainer();
    const render = createMentirosoTableRenderer();
    const state = showdownState();
    render(container, getViewFor(state, MY_PLAYER_ID), getLegalActions(state, MY_PLAYER_ID), () => {});

    expect(container.querySelector(".hexdev-mentiroso-showdown")?.children.length).toBeGreaterThan(0);
    expect(container.querySelector(".hexdev-mentiroso-bid-picker")?.children.length ?? 0).toBe(0);
  });

  it("dispatches the chosen action through onAction, exactly the one the bid picker was clicked with", () => {
    const container = mountContainer();
    const render = createMentirosoTableRenderer();
    const state = biddingState(MY_SEAT);
    const seen: unknown[] = [];
    render(container, getViewFor(state, MY_PLAYER_ID), getLegalActions(state, MY_PLAYER_ID), (action: unknown) => seen.push(action));

    const doubtButton = container.querySelector<HTMLButtonElement>(".hexdev-mentiroso-bid-doubt")!;
    doubtButton.click();
    expect(seen).toEqual([{ type: "doubt", playerId: MY_PLAYER_ID }]);
  });

  it("re-renders the same match by reusing the mounted cups, never remounting them", () => {
    const container = mountContainer();
    const render = createMentirosoTableRenderer();
    const state = biddingState(MY_SEAT);
    const view = getViewFor(state, MY_PLAYER_ID);
    const legalActions = getLegalActions(state, MY_PLAYER_ID);
    render(container, view, legalActions, () => {});
    const before = container.querySelector('[data-seat="3"] .hexdev-dice-cup');
    render(container, view, legalActions, () => {});
    const after = container.querySelector('[data-seat="3"] .hexdev-dice-cup');
    expect(after).toBe(before);
  });

  /**
   * FOUND BY LOOKING (work unit E5/task 5.5's own throwaway phone-width
   * scene): a shell narrower than the felt's own fixed 1280px
   * (`table-styles.ts`) defaults its scroll position to the LEFT edge, per
   * every browser's own convention for a fresh scrollable box. The viewer's
   * own seat and both panels sit at the felt's HORIZONTAL CENTER (`table-
   * layout.ts`'s own `positionFor`, `table-styles.ts`'s own panel rule) —
   * so a phone-width shell, uncorrected, opens on a wide slice of bare felt
   * with nothing on it at all, not merely a partial view. Centering the
   * shell's own scroll position on mount is what puts the viewer's own seat
   * (and whichever panel is showing) in view by default; scrolling further
   * to see a distant rival is still possible, but the DEFAULT view must not
   * be empty felt.
   */
  it("centers the shell's own scroll position on the felt when the shell is narrower than it", () => {
    const container = mountContainer();
    container.style.width = "300px";
    const render = createMentirosoTableRenderer();
    const state = biddingState(MY_SEAT);
    render(container, getViewFor(state, MY_PLAYER_ID), getLegalActions(state, MY_PLAYER_ID), () => {});

    const expectedCenter = (container.scrollWidth - container.clientWidth) / 2;
    expect(container.scrollLeft).toBeCloseTo(expectedCenter, 0);
  });
});
