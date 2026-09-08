import { page } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";

import { CATEGORY_IDS, applyPlayerAction, applyRoll, createMatch, getLegalActions, getViewFor } from "@hexdev/generala-engine";
import type { ApplyResult, CategoryId, DieFace, MatchState, PlayerId, PlayerView } from "@hexdev/generala-engine";

import { renderGeneralaScorecard } from "./scorecard.js";
import { SCORECARD_STYLE_ID } from "./scorecard-styles.js";

/**
 * THE PLANILLA, AND WHY IT IS A `<table>` AND NOT A GRID OF DIVS.
 *
 * A scorecard is tabular data in the strict sense: every cell means "this
 * category, for this seat", and that pairing is the whole content. A real
 * `<table>` carries it — `<th scope="row">` per category, `<th scope="col">`
 * per seat — so a screen reader announces both headers when the cell is
 * reached and nobody writes a line of code to make that happen. A CSS grid of
 * `div`s wearing `role="table"` was rejected in design (D8) for the reason
 * this file keeps testable: it re-declares semantics the element already
 * carries, and every one of those re-declarations is a chance to get it
 * wrong.
 *
 * THE STATE UNDER TEST IS THE ENGINE'S, NEVER A LITERAL. Every card below is
 * filled by playing a turn through `createMatch` → `applyRoll` →
 * `applyPlayerAction`, and every value shown is one `scoreFor` decided. A
 * planilla driven by hand-built `Scorecard` objects could only read back what
 * this file put there — `board.test.ts:144-152`'s measured lesson — and, in
 * particular, "0 is a crossed-out box" would be a fact about the test rather
 * than about the game.
 *
 * WHAT THIS FILE DOES NOT COVER YET is the score button: an open box the
 * acting seat may write, previewing what this roll would put in it. That is
 * the next unit, and this one deliberately renders a planilla that can be
 * READ and not yet one that can be pressed.
 */

const SEAT = "seat-0" as PlayerId;
const RIVAL = "seat-1" as PlayerId;
const SEATS: readonly PlayerId[] = [SEAT, RIVAL];

const mounted: HTMLElement[] = [];
afterEach(async () => {
  while (mounted.length > 0) mounted.pop()!.remove();
  await page.viewport(414, 896);
});

function accept(result: ApplyResult): MatchState {
  if (!result.ok) throw new Error(`the engine refused a step this test depends on: ${result.violation.code}`);
  return result.state;
}

interface Planilla {
  readonly container: HTMLElement;
  readonly state: () => MatchState;
  readonly view: () => PlayerView;
  readonly table: () => HTMLTableElement;
  readonly cell: (category: CategoryId, seat: number) => HTMLTableCellElement;
  /** Roll these five faces for whoever is on turn and write the box named. The
   * `score` applied is the engine's OWN offer, so a category this test asks
   * for that the engine would not accept fails loudly here instead of
   * producing a card nobody could have reached. */
  readonly playTurn: (faces: readonly DieFace[], category: CategoryId) => void;
  readonly redraw: () => void;
}

function seatPlanilla(seatId: PlayerId = SEAT): Planilla {
  const container = document.createElement("div");
  document.body.appendChild(container);
  mounted.push(container);

  let state = createMatch(SEATS);
  let view = getViewFor(state, seatId);
  const draw = (): void => {
    view = getViewFor(state, seatId);
    renderGeneralaScorecard(container, view);
  };
  draw();

  const table = (): HTMLTableElement => {
    const found = container.querySelector("table");
    if (found === null) throw new Error("the planilla rendered no <table>");
    return found;
  };

  return {
    container,
    state: () => state,
    view: () => view,
    table,
    cell: (category, seat) => {
      const found = table().querySelector<HTMLTableCellElement>(`tbody tr[data-category="${category}"] td[data-seat="${String(seat)}"]`);
      if (found === null) throw new Error(`no cell for ${category} at seat ${String(seat)}`);
      return found;
    },
    playTurn: (faces, category) => {
      state = accept(applyRoll(state, faces));
      const turn = state.turn;
      if (turn.phase !== "deciding") throw new Error(`expected to be deciding after a roll, and the turn is ${turn.phase}`);
      const actor = state.players[turn.seat]!;
      const offer = getLegalActions(state, actor).find((action) => action.type === "score" && action.category === category);
      if (offer === undefined) throw new Error(`the engine did not offer ${category} to seat ${String(turn.seat)}`);
      state = accept(applyPlayerAction(state, offer));
      draw();
    },
    redraw: draw,
  };
}

/**
 * Four turns that leave one of every readable state on the board.
 *
 * Seat 0 gets a filled box and a servida one; seat 1 gets a box crossed at
 * zero and a filled one. Nine boxes stay open on each card. Five distinct
 * faces open the escalera turn so "servida" is the counter and not a
 * coincidence — it is scored at `rollsUsed === 1`, which is the only thing
 * that makes it 25 rather than 20.
 */
function playedOut(planilla: Planilla): void {
  planilla.playTurn([6, 6, 6, 2, 1], "sixes"); // seat 0 → 18
  planilla.playTurn([1, 1, 2, 3, 4], "fives"); // seat 1 → 0, crossed
  planilla.playTurn([1, 2, 3, 4, 5], "escalera"); // seat 0 → 25 servida
  planilla.playTurn([3, 3, 3, 2, 2], "full"); // seat 1 → 35 servida
}

describe("generala scorecard: it is a real table, and the row/column association is the element's own", () => {
  it("renders exactly one <table> and re-declares no table semantics on anything else", () => {
    const planilla = seatPlanilla();

    expect(planilla.container.querySelectorAll("table")).toHaveLength(1);
    // A `role` here would mean somebody rebuilt the table out of divs and
    // then told assistive tech to pretend otherwise, which is exactly the
    // shape D8 rejected.
    expect(planilla.container.querySelectorAll('[role="table"], [role="row"], [role="cell"], [role="columnheader"], [role="rowheader"]')).toHaveLength(0);
  });

  it("gives every one of the eleven categories a <th scope=row>, in the engine's own order", () => {
    const planilla = seatPlanilla();

    const rows = [...planilla.table().querySelectorAll<HTMLTableRowElement>("tbody tr")];
    expect(rows.map((row) => row.dataset.category)).toEqual([...CATEGORY_IDS]);

    for (const row of rows) {
      const header = row.querySelector("th");
      expect(header, `${String(row.dataset.category)} has no row header`).not.toBeNull();
      expect(header?.getAttribute("scope")).toBe("row");
      expect(header?.textContent?.trim().length ?? 0).toBeGreaterThan(0);
      // NOT THE ENGINE'S IDENTIFIER. `ones` and `generala-doble` are names
      // for a rule, in English, and rendering them would put English on an
      // otherwise Spanish screen while satisfying every "it says something"
      // assertion — which is exactly the class of defect this repository has
      // only ever caught by a person looking at it.
      expect(header?.textContent?.trim()).not.toBe(row.dataset.category);
    }

    // The one label pinned by name: the eleventh box, whose name comes
    // verbatim from the decided ruleset and which exists only because that
    // ruleset was the one chosen.
    expect(rows.at(-1)?.querySelector("th")?.textContent?.trim()).toBe("Generala doble");
  });

  it("gives every seat a <th scope=col>, and leaves the corner cell a header of nothing", () => {
    const planilla = seatPlanilla();

    const columns = [...planilla.table().querySelectorAll<HTMLTableCellElement>("thead th[scope=col]")];
    expect(columns).toHaveLength(SEATS.length);
    expect(columns.map((column) => column.dataset.seat)).toEqual(["0", "1"]);
    for (const column of columns) expect(column.textContent?.trim().length ?? 0).toBeGreaterThan(0);

    // The top-left cell labels neither a row nor a column. A `<th>` there
    // would claim to head the category column, and a screen reader would read
    // it into every category name.
    const corner = planilla.table().querySelector("thead tr")?.firstElementChild;
    expect(corner?.tagName).toBe("TD");
    expect(corner?.textContent?.trim()).toBe("");
  });

  it("leaves a box nobody has written in blank, instead of writing a nought in it", () => {
    const planilla = seatPlanilla();
    playedOut(planilla);

    // `null` IS NOT `0`. A planilla that filled every unwritten box with a
    // nought would open a match showing twenty-two of them, every one a lie
    // about a category still worth playing for — and the engine keeps the two
    // apart (`state.ts`) precisely so that nobody downstream conflates them.
    expect(planilla.cell("threes", 0).textContent).toBe("");
    expect(planilla.cell("sixes", 0).textContent).toBe("18");
  });

  it("carries a totals row that reads the view's own totals rather than summing the cells again", () => {
    const planilla = seatPlanilla();
    playedOut(planilla);

    const totals = planilla.table().querySelector<HTMLTableRowElement>("tfoot tr");
    expect(totals, "the planilla has no totals row").not.toBeNull();
    expect(totals?.querySelector("th")?.getAttribute("scope")).toBe("row");

    const view = planilla.view();
    // 43 and 35 — written out so a totals row that silently showed zeros, or
    // one that summed a column of rendered strings, cannot pass by agreeing
    // with itself.
    expect(view.totals).toEqual([43, 35]);
    for (const [seat, total] of view.totals.entries()) {
      const cell = totals?.querySelector<HTMLTableCellElement>(`td[data-seat="${String(seat)}"]`);
      expect(cell?.textContent?.trim()).toBe(String(total));
    }
  });
});

describe("generala scorecard: there is a column per seat, in seat order, named for whoever is reading", () => {
  it("puts the same columns, in the same places, in front of both seats", () => {
    const mine = seatPlanilla(SEAT);
    const theirs = seatPlanilla(RIVAL);
    playedOut(mine);
    playedOut(theirs);

    // THE COLUMNS ARE IN SEAT ORDER FOR EVERYBODY, and this is what says so.
    // The view hands a seat its own `self` first and the rest after, so a
    // planilla that drew them in the order it received them would put the
    // reader's own card first and every seat would see a different table.
    // Column POSITION is the one thing two players point at across a phone.
    const columnsOf = (planilla: Planilla): (string | undefined)[] =>
      [...planilla.table().querySelectorAll<HTMLTableCellElement>("thead th[scope=col]")].map((column) => column.dataset.seat);
    expect(columnsOf(mine)).toEqual(["0", "1"]);
    expect(columnsOf(theirs)).toEqual(["0", "1"]);

    // The one thing that legitimately differs: whose column is whose. Each
    // seat's own column says so IN ITS OWN WORDS, and the other's does not —
    // a planilla heading both columns the same way passes every assertion
    // above and is unreadable, and one that swapped them would have a player
    // planning around their rival's card believing it was theirs.
    const nameOf = (planilla: Planilla, seat: number): string | undefined =>
      planilla.table().querySelector<HTMLTableCellElement>(`thead th[data-seat="${String(seat)}"]`)?.textContent?.trim();
    expect(nameOf(mine, 0)).toBe("Vos");
    expect(nameOf(mine, 1)).not.toBe(nameOf(mine, 0));
    expect(nameOf(mine, 0)).toBe(nameOf(theirs, 1));
    expect(nameOf(mine, 1)).toBe(nameOf(theirs, 0));
  });

  it("tells two rivals apart at a table the engine can seat but the game does not register", () => {
    // The engine is written N-seat (D11) and Generala registers two. Three
    // columns is what turns "Rival" from a name into an ambiguity, so the
    // number appears exactly there and not at a table of two, where it would
    // be a digit nobody needs.
    const container = document.createElement("div");
    document.body.appendChild(container);
    mounted.push(container);
    const third = "seat-2" as PlayerId;
    renderGeneralaScorecard(container, getViewFor(createMatch([SEAT, RIVAL, third]), SEAT));

    const names = [...container.querySelectorAll<HTMLTableCellElement>("thead th[scope=col]")].map((column) => column.textContent?.trim());
    expect(names).toHaveLength(3);
    expect(new Set(names).size, `two columns share a name: ${names.join(", ")}`).toBe(3);
    expect(names[0]).toBe("Vos");
  });

  it("keeps drawing every box after a re-render, so a broadcast never empties a card", () => {
    const planilla = seatPlanilla();
    playedOut(planilla);
    planilla.redraw();

    expect(planilla.cell("sixes", 0).textContent?.trim()).toBe("18");
    expect(planilla.cell("full", 1).textContent?.trim()).toBe("35");
    expect(planilla.table().querySelectorAll("tbody tr")).toHaveLength(CATEGORY_IDS.length);
  });
});

describe("generala scorecard: every seat's whole card is visible to every seat", () => {
  it("shows filled boxes, boxes crossed at zero and open boxes, and never reads two of them the same", () => {
    const planilla = seatPlanilla();
    playedOut(planilla);

    // Seat 0's own column.
    expect(planilla.cell("sixes", 0).textContent?.trim()).toBe("18");
    expect(planilla.cell("sixes", 0).dataset.state).toBe("filled");
    expect(planilla.cell("escalera", 0).textContent?.trim()).toBe("25");
    expect(planilla.cell("escalera", 0).dataset.state).toBe("filled");

    // The rival's, which is the half that makes blocking play possible.
    expect(planilla.cell("full", 1).textContent?.trim()).toBe("35");
    expect(planilla.cell("full", 1).dataset.state).toBe("filled");
    expect(planilla.cell("fives", 1).textContent?.trim()).toBe("0");
    expect(planilla.cell("fives", 1).dataset.state).toBe("crossed");

    // An OPEN box and a box CROSSED AT ZERO are different facts and must not
    // look like each other: one is still worth playing for, the other is gone
    // for good. `null` versus `0` is the engine's own distinction and this is
    // where it reaches a player's eye.
    expect(planilla.cell("fives", 0).dataset.state).toBe("open");
    expect(planilla.cell("fives", 0).textContent?.trim()).toBe("");
    expect(planilla.cell("fives", 1).dataset.state).not.toBe(planilla.cell("fives", 0).dataset.state);
  });

  it("draws the same eleven-by-two grid for the rival as it draws for this seat", () => {
    const mine = seatPlanilla(SEAT);
    const theirs = seatPlanilla(RIVAL);
    playedOut(mine);
    playedOut(theirs);

    // Spec B: the cards are public, and "public" is exactly this — the two
    // seats' renders agree cell for cell, state included. A redaction, or a
    // planilla that drew only the seat it belongs to, breaks this and nothing
    // else would notice. The columns already agree (above); this is the half
    // that says what is IN them agrees too.
    for (const category of CATEGORY_IDS) {
      for (const seat of [0, 1]) {
        const a = mine.cell(category, seat);
        const b = theirs.cell(category, seat);
        expect(b.textContent, `${category} at seat ${String(seat)}`).toBe(a.textContent);
        expect(b.dataset.state, `${category} at seat ${String(seat)}`).toBe(a.dataset.state);
      }
    }
  });

  it("still knows what each box is after a re-render, so a broadcast never forgets a crossing", () => {
    const planilla = seatPlanilla();
    playedOut(planilla);
    planilla.redraw();

    expect(planilla.cell("fives", 1).dataset.state).toBe("crossed");
    expect(planilla.cell("sixes", 0).dataset.state).toBe("filled");
    expect(planilla.cell("threes", 0).dataset.state).toBe("open");
  });
});

describe("generala scorecard: the sheet it needs is in the document, and it is there once", () => {
  it("injects the stylesheet, and the boxes really are ruled by it", () => {
    const planilla = seatPlanilla();

    expect(document.getElementById(SCORECARD_STYLE_ID)).not.toBeNull();
    // THE RULES BETWEEN THE BOXES ARE DRAWN BY CSS AND BY NOTHING ELSE, and a
    // browser draws none of its own: a bare `<td>` has no border at all. They
    // are what turns a stack of numbers into a grid somebody can read a row
    // across, so without this sheet the planilla is a correct table nobody
    // can follow. Deleting the `ensure` call reds here and nowhere else —
    // every other assertion in this file reads the DOM, which an unstyled
    // planilla builds perfectly well.
    const ruled = getComputedStyle(planilla.cell("ones", 0));
    expect(ruled.borderTopStyle).toBe("solid");
    expect(ruled.borderTopWidth).toBe("1px");

    // AND THE MARK ON AN OPEN BOX IS DRAWN BY CSS AND BY NOTHING ELSE. Its
    // cell is deliberately empty in the markup — a screen reader reading a
    // blank cell is telling the truth — so the notation a sighted player
    // reads the card by exists only if this sheet is live.
    expect(getComputedStyle(planilla.cell("ones", 0), "::after").content).toBe('"—"');
  });

  it("does not stack a second <style> on every render", () => {
    const planilla = seatPlanilla();
    planilla.redraw();
    seatPlanilla();

    expect(document.querySelectorAll(`#${SCORECARD_STYLE_ID}`)).toHaveLength(1);
  });
});
