import { afterEach, describe, expect, it, vi } from "vitest";

import { getLegalActions } from "@hexdev/mentiroso-engine";
import type { MatchState, MentirosoAction, PlayerId } from "@hexdev/mentiroso-engine";

import { renderMentirosoBidPicker } from "./bid-picker.js";

/**
 * `bid-picker.ts`'s own tests (SDD `mentiroso`, work unit E3/task 5.3, design
 * D2). Every `legalActions` array below is the REAL `getLegalActions`'s
 * output over a hand-built `MatchState` — the same discipline
 * `cups.browser.test.ts` already established for this package: a fixture may
 * hand-build the STATE, but never the thing under test's own INPUT list, or a
 * mismatch between what this file assumes and what the engine actually
 * offers would go unnoticed.
 *
 * THE TWO REQUIRED FIXTURES, both named directly in the launch prompt: a
 * table with MANY available raises (below, "opening a fresh six-seat table" —
 * 180 of them, the exact worst case the launch prompt names), and one
 * EXACTLY AT THE CEILING (below, "two seats, one die each"). A THIRD fixture
 * closes this unit's own named risk: a position with EXACTLY ONE legal
 * raise, where "offer the legal ones" and "offer all of them" would look
 * identical unless the picker still renders the five illegal faces at that
 * quantity, disabled rather than absent.
 */
const SEAT_IDS: readonly PlayerId[] = [0, 1, 2, 3, 4, 5].map((seat) => `seat-${String(seat)}` as PlayerId);
const [P0, P1, P2, P3, P4, P5] = SEAT_IDS as readonly [PlayerId, PlayerId, PlayerId, PlayerId, PlayerId, PlayerId];

/** A fresh six-seat table (30 dice total), opening its very first bid of the
 * round: `bid: null`, so `getLegalActions` offers every quantity from 1
 * through the ceiling (30) at every face — 180 raises, no doubt (nothing
 * exists yet to doubt). The exact "~180 subidas legales" the launch prompt
 * names as the reason this cannot be a flat list. */
function freshTableOpeningState(): MatchState {
  return {
    players: [
      { id: P0, seat: 0, dice: [1, 2, 3, 4, 5] },
      { id: P1, seat: 1, dice: [1, 2, 3, 4, 5] },
      { id: P2, seat: 2, dice: [1, 2, 3, 4, 5] },
      { id: P3, seat: 3, dice: [1, 2, 3, 4, 5] },
      { id: P4, seat: 4, dice: [1, 2, 3, 4, 5] },
      { id: P5, seat: 5, dice: [1, 2, 3, 4, 5] },
    ],
    phase: { kind: "bidding", turnSeat: 0, bid: null },
  };
}

/** Two seats, one die each (2 total dice): the current bid already equals
 * the ceiling `(2, 6)`. `raisesFrom` returns empty by construction
 * (`bids.ts`), so `getLegalActions` offers exactly one action: doubt. */
function atTheCeilingState(): MatchState {
  return {
    players: [
      { id: P0, seat: 0, dice: [3] },
      { id: P1, seat: 1, dice: [4] },
    ],
    phase: { kind: "bidding", turnSeat: 0, bid: { quantity: 2, face: 6 } },
  };
}

/** Ten dice on the table, bid already at `(10, 5)` — one face short of that
 * quantity's own ceiling face. Exactly one raise is legal: `(10, 6)`. This
 * unit's own named trap: a picker that renders columns only for OFFERED
 * faces would show a 1x1 grid here, indistinguishable from a bug that
 * enables everything. The fence is that five siblings at the SAME quantity
 * render disabled, not absent. */
function oneLegalRaiseState(): MatchState {
  return {
    players: [
      { id: P0, seat: 0, dice: [1, 1, 1, 1, 1] },
      { id: P1, seat: 1, dice: [2, 2, 2, 2, 2] },
    ],
    phase: { kind: "bidding", turnSeat: 0, bid: { quantity: 10, face: 5 } },
  };
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

function cellsIn(container: HTMLElement): readonly HTMLButtonElement[] {
  return [...container.querySelectorAll<HTMLButtonElement>(".hexdev-mentiroso-bid-cell")];
}

function enabledCellsIn(container: HTMLElement): readonly HTMLButtonElement[] {
  return cellsIn(container).filter((cell) => !cell.disabled);
}

describe("bid-picker: a fresh six-seat table opening its first bid — the ~180-raise worst case", () => {
  it("renders exactly one row per quantity from 1 through the ceiling, all six faces enabled in every row", () => {
    const container = mountContainer();
    const legalActions = getLegalActions(freshTableOpeningState(), P0);
    expect(legalActions).toHaveLength(180); // 30 quantities x 6 faces, bid === null

    renderMentirosoBidPicker(container, legalActions, () => {});

    const rows = [...container.querySelectorAll<HTMLElement>(".hexdev-mentiroso-bid-row")];
    expect(rows).toHaveLength(30);
    expect(rows.map((row) => row.dataset.quantity)).toEqual(Array.from({ length: 30 }, (_unused, index) => String(index + 1)));
    expect(enabledCellsIn(container)).toHaveLength(180);
  });

  it("offers no doubt control at all — nothing exists yet to doubt", () => {
    const container = mountContainer();
    renderMentirosoBidPicker(container, getLegalActions(freshTableOpeningState(), P0), () => {});
    expect(container.querySelector(".hexdev-mentiroso-bid-doubt")).toBeNull();
  });

  it("dispatches the exact offered raise object on a click, never a reconstructed one", () => {
    const container = mountContainer();
    const legalActions = getLegalActions(freshTableOpeningState(), P0);
    const onAction = vi.fn<(action: MentirosoAction) => void>();
    renderMentirosoBidPicker(container, legalActions, onAction);

    const cell = container.querySelector<HTMLButtonElement>('[data-quantity="15"][data-face="4"]')!;
    cell.click();

    const expected = legalActions.find((action) => action.type === "raise" && action.bid.quantity === 15 && action.bid.face === 4);
    expect(onAction).toHaveBeenCalledExactlyOnceWith(expected);
  });
});

describe("bid-picker: at the ceiling — mentiroso-rules' one forced move, and its own control", () => {
  it("renders no raise grid at all — a control that cannot raise must not exist, not merely be disabled everywhere", () => {
    const container = mountContainer();
    const legalActions = getLegalActions(atTheCeilingState(), P0);
    expect(legalActions).toEqual([{ type: "doubt", playerId: P0 }]);

    renderMentirosoBidPicker(container, legalActions, () => {});

    expect(container.querySelector(".hexdev-mentiroso-bid-grid")).toBeNull();
    expect(container.querySelector(".hexdev-mentiroso-bid-picker-notice")).not.toBeNull();
  });

  it("still offers exactly one control: doubt, and dispatches it", () => {
    const container = mountContainer();
    const legalActions = getLegalActions(atTheCeilingState(), P0);
    const onAction = vi.fn<(action: MentirosoAction) => void>();
    renderMentirosoBidPicker(container, legalActions, onAction);

    const buttons = [...container.querySelectorAll("button")];
    expect(buttons).toHaveLength(1);
    (buttons[0] as HTMLButtonElement).click();
    expect(onAction).toHaveBeenCalledExactlyOnceWith({ type: "doubt", playerId: P0 });
  });
});

describe("bid-picker: exactly one legal raise — 'offer the legal ones' vs 'offer them all' must stay distinguishable", () => {
  it("renders one row of six faces, exactly one enabled, the other five disabled — never absent", () => {
    const container = mountContainer();
    const legalActions = getLegalActions(oneLegalRaiseState(), P0);
    const raises = legalActions.filter((action) => action.type === "raise");
    expect(raises).toHaveLength(1); // this unit's own named trap fixture

    renderMentirosoBidPicker(container, legalActions, () => {});

    const rows = [...container.querySelectorAll<HTMLElement>(".hexdev-mentiroso-bid-row")];
    expect(rows).toHaveLength(1);
    const cells = cellsIn(container);
    expect(cells).toHaveLength(6); // every face rendered, not just the offered one
    expect(enabledCellsIn(container)).toHaveLength(1);
    expect(enabledCellsIn(container)[0]!.dataset.face).toBe("6");
  });

  it("also offers doubt, since a real bid is already on the table", () => {
    const container = mountContainer();
    renderMentirosoBidPicker(container, getLegalActions(oneLegalRaiseState(), P0), () => {});
    expect(container.querySelector(".hexdev-mentiroso-bid-doubt")).not.toBeNull();
  });

  it("a disabled cell never dispatches, even when clicked directly", () => {
    const container = mountContainer();
    const onAction = vi.fn<(action: MentirosoAction) => void>();
    renderMentirosoBidPicker(container, getLegalActions(oneLegalRaiseState(), P0), onAction);

    const illegalCell = container.querySelector<HTMLButtonElement>('[data-quantity="10"][data-face="3"]')!;
    expect(illegalCell.disabled).toBe(true);
    illegalCell.click();
    expect(onAction).not.toHaveBeenCalled();
  });
});

describe("bid-picker: the header's face numbers line up with the button columns beneath them", () => {
  /**
   * FOUND BY LOOKING (`bid-picker.scene.test.ts`'s own phone-width render,
   * per `AGENTS.md`'s "todos los defectos visuales... los encontró alguien
   * mirando"): the header row's blank corner `<span>` held no text, so it
   * had no intrinsic width at all, while the row-label span below it always
   * holds a digit — the two never matched widths, and the face numbers at
   * the top rendered bunched at the left edge instead of sitting over their
   * own columns.
   */
  it("keeps the header corner exactly as wide as a row's own quantity label", () => {
    const container = mountContainer();
    renderMentirosoBidPicker(container, getLegalActions(oneLegalRaiseState(), P0), () => {});

    const corner = container.querySelector<HTMLElement>(".hexdev-mentiroso-bid-header-row > *:first-child")!;
    const rowLabel = container.querySelector<HTMLElement>(".hexdev-mentiroso-bid-row-label")!;
    expect(corner.getBoundingClientRect().width).toBe(rowLabel.getBoundingClientRect().width);
  });

  it("aligns every header face number directly above its own column of buttons", () => {
    const container = mountContainer();
    renderMentirosoBidPicker(container, getLegalActions(oneLegalRaiseState(), P0), () => {});

    const headerCells = [...container.querySelectorAll<HTMLElement>(".hexdev-mentiroso-bid-header-cell")];
    const bodyCells = cellsIn(container);
    expect(headerCells).toHaveLength(6);
    expect(bodyCells).toHaveLength(6);
    for (let index = 0; index < 6; index += 1) {
      expect(Math.round(headerCells[index]!.getBoundingClientRect().left)).toBe(Math.round(bodyCells[index]!.getBoundingClientRect().left));
    }
  });
});

describe("bid-picker: not this seat's turn — nothing is offered, and nothing is rendered", () => {
  it("renders an empty container when legalActions is empty", () => {
    const container = mountContainer();
    const legalActions = getLegalActions(freshTableOpeningState(), P5); // P5 is not seat 0, not the turn
    expect(legalActions).toEqual([]);

    renderMentirosoBidPicker(container, legalActions, () => {});

    expect(container.childElementCount).toBe(0);
  });
});
