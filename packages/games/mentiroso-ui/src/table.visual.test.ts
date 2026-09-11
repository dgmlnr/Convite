/// <reference types="@vitest/browser/matchers" />
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";

import { getLegalActions, getViewFor } from "@hexdev/mentiroso-engine";
import type { MatchState, PlayerId } from "@hexdev/mentiroso-engine";

import { createMentirosoTableRenderer } from "./table.js";

/**
 * The real, COMMITTED visual baselines for the composed table (SDD
 * `mentiroso`, work unit E5/task 5.5, closing Stage E) — one per registered
 * seat count (2, 4, 6), per this unit's own task text.
 *
 * NONE OF THE THREE IS A FRESH TABLE (`AGENTS.md`'s own named risk for this
 * unit: "escenas que sólo muestren mesas frescas... ahí no se ve nada de lo
 * que costó construir"). Every fixture below is an ADVANCED match: at least
 * one seat already eliminated where the seat count allows it (4 and 6 —
 * `cups.browser.test.ts`'s own interleaved-elimination shape, reused here so
 * this baseline and that fence describe compatible states), or a table down
 * to its last die per seat where it does not (2 — a fresh 2-seat table looks
 * identical to a fresh 6-seat table's own corner and would prove nothing
 * about R-TABLE-STABLE that a fresh state could not).
 *
 * DESKTOP WIDTH, THE FULL FELT IN FRAME — `table-styles.ts`'s own proven
 * 1280x800 size, captured whole rather than through the phone-width scroll
 * this unit's own throwaway scene review already looked at separately (see
 * this unit's own apply report for that description). A baseline exists to
 * be diffed pixel-for-pixel on a later change; a scrolled slice of a fixed
 * felt would not add a second fact this whole-felt capture does not already
 * cover — the felt's own size does not change between the two.
 */
const SEAT_IDS: readonly PlayerId[] = [0, 1, 2, 3, 4, 5].map((seat) => `seat-${String(seat)}` as PlayerId);
const [P0, P1, P2, P3, P4, P5] = SEAT_IDS as readonly [PlayerId, PlayerId, PlayerId, PlayerId, PlayerId, PlayerId];

/** Two seats, one die each — the last round before the match ends either
 * way. Distinct from a fresh 2-seat table (5 dice each): this is what an
 * ADVANCED 2-seat match actually looks like, given elimination itself is not
 * reachable at 2 seats without ending the match this baseline still needs to
 * render mid-bid. */
function twoSeatsLastRound(): MatchState {
  return {
    players: [
      { id: P0, seat: 0, dice: [2] },
      { id: P1, seat: 1, dice: [5] }, // self
    ],
    phase: { kind: "bidding", turnSeat: 1, bid: { quantity: 1, face: 2 } },
  };
}

/** Four seats, one already eliminated, viewer near-elimination itself (one
 * die) — the seat count where R-TABLE-STABLE first becomes visible: an
 * eliminated seat still occupies its own position, marked "Sin dados",
 * never re-flowing the other three around the gap it left. */
function fourSeatsOneEliminated(): MatchState {
  return {
    players: [
      { id: P0, seat: 0, dice: [4, 4] },
      { id: P1, seat: 1, dice: [] }, // eliminated
      { id: P2, seat: 2, dice: [5] }, // self
      { id: P3, seat: 3, dice: [6, 6, 6] },
    ],
    phase: { kind: "bidding", turnSeat: 2, bid: { quantity: 3, face: 5 } },
  };
}

/** Six seats, TWO eliminated, INTERLEAVED among the living (seats 2 and 4,
 * not seats 4 and 5) — the exact shape `cups.browser.test.ts` already
 * established for this package, at SHOWDOWN so every seat's real dice are
 * on screen at once: the single most demanding frame this composed table
 * ever renders, and the one the launch prompt names directly ("con asientos
 * eliminados intercalados... que ya destapó una fuga que dos asientos no
 * podían mostrar"). Viewer at seat 3, not seat 0, so `view.rivals`' own
 * order and `tableLayout`'s own rotation genuinely disagree — the same
 * attribution trap `cups.browser.test.ts` closes for its own tests. */
function sixSeatsTwoEliminatedShowdown(): MatchState {
  return {
    players: [
      { id: P0, seat: 0, dice: [1, 1, 1] },
      { id: P1, seat: 1, dice: [2, 2] },
      { id: P2, seat: 2, dice: [] }, // eliminated
      { id: P3, seat: 3, dice: [3, 3, 3, 3, 3] }, // self
      { id: P4, seat: 4, dice: [] }, // eliminated
      { id: P5, seat: 5, dice: [6, 6, 6, 6] },
    ],
    phase: { kind: "showdown", bid: { quantity: 2, face: 3 }, doubterSeat: 3, matched: 1, loserSeat: 5, winnerSeat: 3 },
  };
}

const mounted: HTMLElement[] = [];
afterEach(() => {
  while (mounted.length > 0) mounted.pop()!.remove();
});

/** `page.viewport(...)`, before mounting — `table-wide.visual.test.ts`'s own
 * documented fix (`truco-ui`): Browser Mode's default viewport (414x896)
 * clips anything past it, and the felt this file captures is fixed at
 * 1280x800 (`table-styles.ts`), wider than that default. */
async function mountedContainer(width: number): Promise<HTMLElement> {
  await page.viewport(width + 120, 900);
  const container = document.createElement("div");
  container.style.width = `${String(width)}px`;
  document.body.appendChild(container);
  mounted.push(container);
  return container;
}

const DESKTOP_WIDTH = 1320;

async function waitForArt(container: HTMLElement): Promise<void> {
  const images = [...container.querySelectorAll("img")];
  await Promise.all(images.map((img) => img.decode()));
}

describe("visual: the real composed mentiroso table, at every registered seat count", () => {
  it("two seats, the last round before the match ends", async () => {
    const container = await mountedContainer(DESKTOP_WIDTH);
    const state = twoSeatsLastRound();
    createMentirosoTableRenderer()(container, getViewFor(state, P1), getLegalActions(state, P1), () => {});
    await waitForArt(container);
    await expect.element(container).toMatchScreenshot("table-two-seats");
  });

  it("four seats, one already eliminated", async () => {
    const container = await mountedContainer(DESKTOP_WIDTH);
    const state = fourSeatsOneEliminated();
    createMentirosoTableRenderer()(container, getViewFor(state, P2), getLegalActions(state, P2), () => {});
    await waitForArt(container);
    await expect.element(container).toMatchScreenshot("table-four-seats");
  });

  it("six seats, two eliminated and interleaved, at showdown", async () => {
    const container = await mountedContainer(DESKTOP_WIDTH);
    const state = sixSeatsTwoEliminatedShowdown();
    createMentirosoTableRenderer()(container, getViewFor(state, P3), getLegalActions(state, P3), () => {});
    await waitForArt(container);
    await expect.element(container).toMatchScreenshot("table-six-seats");
  });
});
