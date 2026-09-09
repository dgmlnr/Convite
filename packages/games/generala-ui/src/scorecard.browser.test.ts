import { page } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";

import { CATEGORY_IDS, applyPlayerAction, applyRoll, createMatch, getLegalActions, getViewFor, scoreFor } from "@hexdev/generala-engine";
import type { ApplyResult, CategoryId, DieFace, GeneralaAction, MatchState, PlayerId, PlayerView, ScoreAction } from "@hexdev/generala-engine";

import { renderGeneralaScorecard } from "./scorecard.js";
import { SCORE_TAP_MIN, SCORECARD_STYLE_ID } from "./scorecard-styles.js";

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
  /** This seat's column heading, and the totals cell at the foot of it — the
   * two cells of a column that are not one of the eleven boxes. */
  readonly head: (seat: number) => HTMLTableCellElement;
  readonly total: (seat: number) => HTMLTableCellElement;
  readonly button: (category: CategoryId, seat: number) => HTMLButtonElement | null;
  readonly buttons: () => readonly HTMLButtonElement[];
  /** The preview of an open box the crossing ladder has not reached: the number
   * with nothing to press. */
  readonly locked: (category: CategoryId, seat: number) => HTMLElement | null;
  readonly lockedAll: () => readonly HTMLElement[];
  readonly dispatched: readonly ScoreAction[];
  readonly offers: () => readonly GeneralaAction[];
  /** Roll these faces and STOP, leaving the turn in `deciding` with a seat
   * that may write a box. This is the state the preview exists for. */
  readonly roll: (faces: readonly DieFace[]) => void;
  /** Apply the engine's OWN hold offer for this `keep`, exactly as the room
   * would, so the next roll lands at a higher `rollsUsed`. */
  readonly hold: (keep: readonly number[]) => void;
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
  let offers: readonly GeneralaAction[] = [];
  const dispatched: ScoreAction[] = [];
  const draw = (): void => {
    view = getViewFor(state, seatId);
    offers = getLegalActions(state, seatId);
    renderGeneralaScorecard(container, view, offers, (action) => dispatched.push(action));
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
    dispatched,
    offers: () => offers,
    button: (category, seat) => table().querySelector<HTMLButtonElement>(`tbody tr[data-category="${category}"] td[data-seat="${String(seat)}"] button`),
    buttons: () => [...table().querySelectorAll<HTMLButtonElement>("tbody button")],
    locked: (category, seat) => table().querySelector<HTMLElement>(`tbody tr[data-category="${category}"] td[data-seat="${String(seat)}"] .hexdev-generala-score-locked`),
    lockedAll: () => [...table().querySelectorAll<HTMLElement>("tbody .hexdev-generala-score-locked")],
    roll: (faces) => {
      state = accept(applyRoll(state, faces));
      draw();
    },
    hold: (keep) => {
      const turn = state.turn;
      if (turn.phase !== "deciding") throw new Error(`a hold needs a deciding turn, and this one is ${turn.phase}`);
      const actor = state.players[turn.seat]!;
      const offer = getLegalActions(state, actor).find((action) => action.type === "hold" && action.keep.length === keep.length && action.keep.every((index, at) => index === keep[at]));
      if (offer === undefined) throw new Error(`the engine did not offer a hold of [${keep.join(", ")}]`);
      state = accept(applyPlayerAction(state, offer));
      draw();
    },
    cell: (category, seat) => {
      const found = table().querySelector<HTMLTableCellElement>(`tbody tr[data-category="${category}"] td[data-seat="${String(seat)}"]`);
      if (found === null) throw new Error(`no cell for ${category} at seat ${String(seat)}`);
      return found;
    },
    head: (seat) => {
      const found = table().querySelector<HTMLTableCellElement>(`thead th[data-seat="${String(seat)}"]`);
      if (found === null) throw new Error(`no column heading for seat ${String(seat)}`);
      return found;
    },
    total: (seat) => {
      const found = table().querySelector<HTMLTableCellElement>(`tfoot td[data-seat="${String(seat)}"]`);
      if (found === null) throw new Error(`no total for seat ${String(seat)}`);
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
 *
 * THE CROSSED BOX IS THE DOBLE AND IT HAS TO BE. A zero goes only in the
 * highest-paying open box (ruleset §Orden obligatorio de tachado), so on a card
 * with nothing written that is the only box a seat may spend on nothing.
 */
function playedOut(planilla: Planilla): void {
  planilla.playTurn([6, 6, 6, 2, 1], "sixes"); // seat 0 → 18
  planilla.playTurn([1, 1, 2, 3, 4], "generala-doble"); // seat 1 → 0, crossed
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

  /**
   * THE UPPER SIX ARE THE DIGIT, WHICH THE TEST ABOVE CANNOT SEE.
   *
   * It asks two things of a row header — that it says something, and that it
   * is not the engine's English identifier — and "Unos" satisfies both while
   * being exactly what the decided ruleset calls wrong: "en una planilla esas
   * filas son el número, no su plural" (§Etiquetas de la sección superior).
   * A general assertion about six labels cannot tell a right word from a
   * wrong one, so this pins the six of them by name.
   *
   * PAIRED WITH THE FIVE THAT ARE STILL WORDS, in one table, because the rule
   * is a SPLIT and not a blanket: the juegos mayores keep their names, and a
   * change that turned every row into a number would pass a fence that only
   * looked at the top half.
   */
  it.each([
    ["ones" as CategoryId, "1"],
    ["twos" as CategoryId, "2"],
    ["threes" as CategoryId, "3"],
    ["fours" as CategoryId, "4"],
    ["fives" as CategoryId, "5"],
    ["sixes" as CategoryId, "6"],
    ["escalera" as CategoryId, "Escalera"],
    ["full" as CategoryId, "Full"],
    ["poker" as CategoryId, "Póker"],
    ["generala" as CategoryId, "Generala"],
    ["generala-doble" as CategoryId, "Generala doble"],
  ])("heads the %s row exactly '%s', which is what the decided ruleset calls that box", (category, label) => {
    const planilla = seatPlanilla();

    const header = planilla.table().querySelector<HTMLElement>(`tbody tr[data-category="${category}"] th`);
    expect(header?.textContent?.trim()).toBe(label);
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
    renderGeneralaScorecard(container, getViewFor(createMatch([SEAT, RIVAL, third]), SEAT), [], () => {});

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
    expect(planilla.cell("generala-doble", 1).textContent?.trim()).toBe("0");
    expect(planilla.cell("generala-doble", 1).dataset.state).toBe("crossed");

    // An OPEN box and a box CROSSED AT ZERO are different facts and must not
    // look like each other: one is still worth playing for, the other is gone
    // for good. `null` versus `0` is the engine's own distinction and this is
    // where it reaches a player's eye.
    expect(planilla.cell("generala-doble", 0).dataset.state).toBe("open");
    expect(planilla.cell("generala-doble", 0).textContent?.trim()).toBe("");
    expect(planilla.cell("generala-doble", 1).dataset.state).not.toBe(planilla.cell("generala-doble", 0).dataset.state);
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

    expect(planilla.cell("generala-doble", 1).dataset.state).toBe("crossed");
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

describe("generala scorecard: an open box the acting seat may write is a control that says what it is worth", () => {
  it("previews every open box with the value the ENGINE would write there, never one this UI derived", () => {
    const planilla = seatPlanilla();
    planilla.roll([6, 6, 6, 2, 1]);

    // EVERY OPEN BOX CARRIES ITS NUMBER, and only some of them carry a control.
    // `[6,6,6,2,1]` pays in three boxes, so those three plus `generala-doble` —
    // the one box a zero may go in — are pressable, and the other seven show
    // what they would be worth without offering to write it.
    const card = planilla.view().cards[0]!;
    const offered: readonly CategoryId[] = ["ones", "twos", "sixes", "generala-doble"];
    for (const category of CATEGORY_IDS) {
      const preview = planilla.button(category, 0) ?? planilla.locked(category, 0);
      expect(preview, `${category} is open, so it must show what it is worth`).not.toBeNull();
      expect(preview?.textContent?.trim()).toBe(String(scoreFor(category, [6, 6, 6, 2, 1], 1, card)));
      expect(planilla.button(category, 0) !== null, `${category} pressable`).toBe(offered.includes(category));
    }
    expect(planilla.buttons()).toHaveLength(offered.length);
    expect(planilla.lockedAll()).toHaveLength(CATEGORY_IDS.length - offered.length);
    // The worked example the ruleset itself cites, written out so the loop
    // above cannot be satisfied by a UI that agrees with a wrong `scoreFor`.
    expect(planilla.button("sixes", 0)?.textContent?.trim()).toBe("18");
    // "18" ON ITS OWN IS NOT A SENTENCE ANYBODY CAN ACT ON. The number is
    // the visible label because that is what is being compared across eleven
    // boxes; the accessible name has to say what pressing it DOES, and it
    // contains the visible text so the two agree (WCAG 2.5.3).
    expect(planilla.button("sixes", 0)?.getAttribute("aria-label")).toBe("Anotar 18 en 6");
  });

  it("carries the roll counter into the preview, so a servida shows the servida value", () => {
    const servida = seatPlanilla();
    servida.roll([1, 2, 3, 4, 5]);
    // 25, not 20: `rollsUsed === 1` at scoring time is the whole of what
    // servida means. A preview computed from the dice alone shows 20 here and
    // passes every other assertion in this file.
    expect(servida.button("escalera", 0)?.textContent?.trim()).toBe("25");

    const armada = seatPlanilla();
    armada.roll([1, 2, 3, 4, 5]);
    armada.hold([0, 1, 2, 3]);
    armada.roll([5]);
    const turn = armada.view().turn;
    expect(turn.phase === "deciding" ? turn.rollsUsed : turn.phase).toBe(2);
    expect(armada.button("escalera", 0)?.textContent?.trim()).toBe("20");
  });

  it("carries the CARD into the preview, so the doble is worth nothing until a generala is written", () => {
    const planilla = seatPlanilla();
    // FIVE OF A KIND, ARMADA. It cannot be reached in one throw: five of a
    // kind on a turn's FIRST roll wins the match outright, before anybody
    // chooses anything, so the doble is only ever reachable armada — which
    // is exactly the corollary the closed ruleset records.
    planilla.roll([5, 5, 5, 5, 1]);
    planilla.hold([0, 1, 2, 3]);
    planilla.roll([5]);
    // With the generala box still open. The
    // doble pays 100 only when `card.generala` holds a real generala, so
    // here it is worth 0 and the generala box is worth 50. A preview that
    // read the dice and forgot the card shows 100 in both.
    expect(planilla.button("generala", 0)?.textContent?.trim()).toBe("50");
    expect(planilla.button("generala-doble", 0)?.textContent?.trim()).toBe("0");
  });

  it("refuses the escalera al as, because the engine does", () => {
    // THE CARD IS WALKED DOWN TO THE ESCALERA ON PURPOSE. A box worth nothing
    // is only writable at the top of the crossing ladder, so reading this
    // preview off the planilla at all needs the four boxes above the escalera
    // spent — which is a position a real match reaches, and the cheapest way
    // to keep the assertion rather than weaken it.
    const planilla = seatPlanilla();
    planilla.playTurn([1, 1, 2, 3, 4], "generala-doble"); // seat 0 crosses the top rung
    planilla.playTurn([1, 2, 3, 4, 5], "escalera"); // seat 1 takes a turn
    planilla.playTurn([1, 1, 2, 3, 4], "generala");
    planilla.playTurn([6, 6, 6, 2, 1], "sixes");
    planilla.playTurn([1, 1, 2, 3, 4], "poker");
    planilla.playTurn([1, 1, 2, 3, 4], "ones");
    planilla.playTurn([1, 1, 2, 3, 4], "full");
    planilla.playTurn([1, 1, 2, 3, 4], "twos");
    planilla.roll([3, 4, 5, 6, 1]);

    // `3-4-5-6-1` is listed by the popular set as "opcional, a convenir de
    // antemano", and the decided ruleset leaves it out. A UI with its own
    // idea of a straight shows 20 here.
    expect(planilla.button("escalera", 0)?.textContent?.trim()).toBe("0");
  });

  it("dispatches the engine's own offer OBJECT, once, and only from a press", () => {
    const planilla = seatPlanilla();
    planilla.roll([6, 6, 6, 2, 1]);
    expect(planilla.dispatched).toHaveLength(0);

    planilla.button("sixes", 0)!.click();

    expect(planilla.dispatched).toHaveLength(1);
    // `toContain` compares by IDENTITY against the engine's own list. Since
    // PR #257 the room admits an action only when `sameAction` matches one
    // the game offered, so an equal-looking object this file assembled would
    // be unsubmittable — and a deep-equality assertion would not know.
    expect(planilla.offers()).toContain(planilla.dispatched[0]);
    expect(planilla.dispatched[0]?.category).toBe("sixes");
  });

  it("puts no control on a box already written, nor on anybody else's card", () => {
    const planilla = seatPlanilla();
    playedOut(planilla);
    planilla.roll([6, 6, 6, 2, 1]);

    // Written boxes: gone for good, and a filled box never reopens.
    expect(planilla.button("sixes", 0)).toBeNull();
    expect(planilla.cell("sixes", 0).textContent?.trim()).toBe("18");

    // THE RIVAL'S COLUMN IS NEVER PRESSABLE, and it carries no preview either.
    // Not because this file knows whose turn it is — it reads the offers, and
    // every `score` in that list names its own actor, so a column can only grow
    // a control, or a number for a throw it is not scoring, when the engine
    // offered something FOR THAT SEAT.
    for (const category of CATEGORY_IDS) {
      expect(planilla.button(category, 1), `${category} at the rival's seat`).toBeNull();
      expect(planilla.locked(category, 1), `${category} previewed on the rival's card`).toBeNull();
    }
  });

  it("offers nothing while the cup is shaking, and nothing on another seat's turn", () => {
    const shaking = seatPlanilla();
    expect(shaking.view().turn.phase).toBe("awaiting-roll");
    expect(shaking.buttons()).toHaveLength(0);

    expect(shaking.lockedAll()).toHaveLength(0);

    const theirTurn = seatPlanilla();
    playedOut(theirTurn);
    theirTurn.playTurn([1, 1, 1, 2, 3], "ones");
    theirTurn.roll([2, 2, 4, 5, 6]);
    // Seat 1 is deciding, so somebody has offers — just not this seat, and a
    // preview under this seat's name would be a number for somebody else's
    // throw.
    expect(theirTurn.view().turn.phase).toBe("deciding");
    expect(theirTurn.buttons()).toHaveLength(0);
    expect(theirTurn.lockedAll()).toHaveLength(0);
  });
  it("makes the whole box the target, corner for corner", () => {
    const planilla = seatPlanilla();
    planilla.roll([6, 6, 6, 2, 1]);

    // WHAT A FINGER AIMS AT IS THE BOX, not the two or three characters
    // inside it. A control that only covers its own text leaves most of a
    // ruled box inert, and a press that lands a few pixels off does nothing
    // at all — with no feedback, because the cell around it is not a
    // control. Corner for corner is the assertion that says the two are the
    // same rectangle — give or take the ruled line between boxes, which
    // `border-collapse: collapse` makes a SHARED 1px that each of the two
    // cells owns half of, so the content box a control fills starts half a
    // pixel inside its cell's border box. Measured, not allowed for in
    // advance: without it this read 165.55 against 165.05.
    const RULE = 1;
    const cell = planilla.cell("sixes", 0).getBoundingClientRect();
    const control = planilla.button("sixes", 0)!.getBoundingClientRect();
    expect(control.left - cell.left).toBeLessThanOrEqual(RULE);
    expect(cell.right - control.right).toBeLessThanOrEqual(RULE);
    expect(control.top - cell.top).toBeLessThanOrEqual(RULE);
    expect(cell.bottom - control.bottom).toBeLessThanOrEqual(RULE);
    // AND IT IS NEVER SHORTER THAN A THUMB. Eleven of these stack down a
    // phone, so the row height IS the target height; the standard's 44px is
    // the floor a control declares for itself rather than inherits from
    // whatever the table happened to lay out.
    expect(control.height).toBeGreaterThanOrEqual(SCORE_TAP_MIN);
  });

  it("keeps a box you may still take from one you may not, and both from one already spent", () => {
    const planilla = seatPlanilla();
    playedOut(planilla);
    planilla.playTurn([1, 1, 2, 3, 5], "generala-doble"); // seat 0 crosses the doble at 0
    planilla.playTurn([2, 2, 4, 5, 6], "twos"); // seat 1 takes a turn
    planilla.roll([6, 6, 6, 2, 1]); // seat 0 deciding again

    // FOUR BOXES, FOUR MEANINGS, AND THREE OF THEM READ "0". `generala` is
    // open, worth nothing, and the one box a zero may go in — so it is
    // pressable. `threes` is open and worth nothing and may NOT be written,
    // because the ladder has not reached it. `generala-doble` was crossed out
    // and is gone for good. `sixes` holds a real 18 somebody wrote. On an
    // ordinary roll most previews are 0, so a column of them sits beside the
    // ones already spent, and a player choosing where to spend a turn has to
    // tell all four apart at a glance — including "worth nothing" from "not
    // allowed", which is the distinction the ladder introduced.
    const worthNothingNow = planilla.button("generala", 0);
    const worthNothingAndLocked = planilla.locked("threes", 0);
    const spent = planilla.cell("generala-doble", 0);
    const written = planilla.cell("sixes", 0);
    expect(worthNothingNow?.textContent?.trim()).toBe("0");
    expect(worthNothingAndLocked?.textContent?.trim()).toBe("0");
    expect(spent.textContent?.trim()).toBe("0");
    expect(written.textContent?.trim()).toBe("18");
    // The premise: `threes` really is open, so this is a rule and not a filled box.
    expect(planilla.cell("threes", 0).dataset.state).toBe("open");

    // Struck through means spent; nothing else here is.
    expect(getComputedStyle(spent).textDecorationLine).toBe("line-through");
    expect(getComputedStyle(worthNothingNow!).textDecorationLine).toBe("none");
    expect(getComputedStyle(worthNothingAndLocked!).textDecorationLine).toBe("none");

    // A box still on offer is marked as one AT REST, not only under a pointer
    // that a phone does not have — and the box that is NOT on offer carries
    // neither that mark nor full weight, so the two zeros beside each other
    // cannot be read as the same thing.
    expect(getComputedStyle(worthNothingNow!).backgroundColor).not.toBe(getComputedStyle(written).backgroundColor);
    expect(getComputedStyle(worthNothingAndLocked!).backgroundColor).not.toBe(getComputedStyle(worthNothingNow!).backgroundColor);
    expect(Number(getComputedStyle(worthNothingAndLocked!).opacity)).toBeLessThan(Number(getComputedStyle(worthNothingNow!).opacity));
  });

  it("draws no open-box dash underneath a box that carries a preview", () => {
    const planilla = seatPlanilla();
    planilla.roll([6, 6, 6, 2, 1]);

    // The dash means "nothing here yet". Printed on top of a number it means
    // nothing at all, and it reads as "— 18".
    expect(getComputedStyle(planilla.cell("sixes", 0), "::after").content).toBe("none");
    expect(getComputedStyle(planilla.cell("sixes", 1), "::after").content).toBe('"—"');
  });
});

/** Sub-pixel slack, the same order of magnitude `dice-tray-fit.browser.test.ts`
 * allows: these are real laid-out boxes, not integers. */
const EPSILON = 0.5;

describe("generala scorecard: it fits the narrow end of the range, measured rather than eyeballed", () => {
  it.each([320, 375])("at %i px nothing overflows the page and no category name is clipped", async (width) => {
    await page.viewport(width, 900);
    const planilla = seatPlanilla();
    playedOut(planilla);
    planilla.roll([6, 6, 6, 2, 1]);

    // A planilla wider than the phone is one a player scrolls sideways to
    // read, and for a grid that means losing the column headers off the left
    // edge — the one thing that makes a cell mean anything.
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);

    const table = planilla.table().getBoundingClientRect();
    expect(table.left).toBeGreaterThanOrEqual(-EPSILON);
    expect(table.right).toBeLessThanOrEqual(width + EPSILON);

    // EVERY CATEGORY NAME ON ONE LINE. The row headers do not wrap, so a
    // label column too narrow to hold "Generala doble" overflows measurably
    // instead of quietly stacking into two lines and turning an eleven-row
    // planilla into a twenty-row one on the phone that could least afford it.
    for (const header of planilla.table().querySelectorAll<HTMLElement>("tbody th")) {
      expect(header.scrollWidth, `${header.textContent ?? ""} is clipped at ${String(width)}px`).toBeLessThanOrEqual(header.clientWidth + EPSILON);
    }
  });

  it.each([320, 375])("at %i px every box on offer is a target a thumb can hit, and the rest keep its footprint", async (width) => {
    await page.viewport(width, 900);
    const planilla = seatPlanilla();
    planilla.roll([6, 6, 6, 2, 1]);

    // Four of the eleven: the three `[6,6,6,2,1]` pays in, plus the one box a
    // zero may go in.
    const rects = planilla.buttons().map((button) => button.getBoundingClientRect());
    expect(rects).toHaveLength(4);
    for (const rect of rects) {
      expect(rect.width, `a score control is ${String(rect.width)}px wide at ${String(width)}px`).toBeGreaterThanOrEqual(SCORE_TAP_MIN - EPSILON);
      expect(rect.height, `a score control is ${String(rect.height)}px tall at ${String(width)}px`).toBeGreaterThanOrEqual(SCORE_TAP_MIN - EPSILON);
    }

    // AND A BOX THAT IS NOT ON OFFER TAKES EXACTLY THE SAME ROOM. Boxes move
    // in and out of the offer list on every throw, so a preview that shrank
    // when its box stopped being writable would make eleven rows jump around
    // under the thumb reaching for one of them.
    const locked = planilla.lockedAll().map((element) => element.getBoundingClientRect());
    expect(locked).toHaveLength(CATEGORY_IDS.length - 4);
    for (const rect of locked) {
      expect(rect.width).toBeCloseTo(rects[0]!.width, 1);
      expect(rect.height).toBeCloseTo(rects[0]!.height, 1);
    }
  });

  it.each([320, 375])("at %i px the planilla is eleven rows tall and not nineteen", async (width) => {
    await page.viewport(width, 900);
    const planilla = seatPlanilla();
    playedOut(planilla);

    // A LABEL COLUMN TOO NARROW ABSORBS IT BY GROWING TALLER, which is the
    // failure no width measurement can see: "Generala doble" quietly stacks
    // onto two lines and the card gets a row taller than its neighbours on
    // the phone that could least afford it. Every row the same height is the
    // claim that says it did not, and it is what the row headers' refusal to
    // wrap exists to protect — the two are measured together here because
    // neither is observable alone at the shipped width.
    const heights = [...planilla.table().querySelectorAll<HTMLElement>("tbody tr")].map((row) => row.getBoundingClientRect().height);
    expect(heights).toHaveLength(CATEGORY_IDS.length);
    for (const height of heights) expect(height).toBeCloseTo(heights[0]!, 1);
  });

  it.each([320, 375])("at %i px a column is the same width whatever number happens to be in it", async (width) => {
    await page.viewport(width, 900);
    const planilla = seatPlanilla();
    planilla.roll([6, 6, 6, 2, 1]);

    // THE COLUMNS DO NOT DEPEND ON THEIR CONTENTS, and this is the assertion
    // that says so. A content-sized table gives the column holding "0" less
    // room than the one holding "18", so two controls side by side are
    // different sizes — and the whole planilla re-flows as the match fills
    // it in, moving a box under the thumb that is reaching for it.
    const widths = planilla.buttons().map((button) => button.getBoundingClientRect().width);
    for (const buttonWidth of widths) expect(buttonWidth).toBeCloseTo(widths[0]!, 1);

    const seatCells = [0, 1].map((seat) => planilla.cell("generala-doble", seat).getBoundingClientRect().width);
    expect(seatCells[0]).toBeCloseTo(seatCells[1]!, 1);
  });});

/**
 * WHOSE TURN IT IS, ON THE ONE SURFACE EVERY SEAT IS ALREADY LOOKING AT.
 *
 * The board had no answer to it. A player joining mid-match, or coming back
 * to the tab, had to infer the turn from the ABSENCE of things — no throw
 * control, no pressable box — which is a deduction rather than a cue, and one
 * that reads identically to "this board is broken". Found by looking; no
 * assertion could have seen it, because every element it depends on was
 * already correct.
 *
 * THE MARK IS AN ATTRIBUTE ON EVERY CELL OF THE COLUMN, and that shape is the
 * decision. A column is not an element — `<col>` cannot be given a background
 * that paints over a cell's own — so "the column on turn" has to be said once
 * per cell or not at all. Saying it in the DOM rather than in a class on the
 * table is what lets the sheet stay a single selector and keeps this file's
 * assertions about the CELL a player's eye lands on.
 */
describe("generala planilla: the column of the seat that is playing", () => {
  it("marks the heading, all eleven boxes and the total of the column on turn — and nothing outside it", () => {
    const planilla = seatPlanilla();
    planilla.roll([6, 6, 6, 2, 1]);
    // The premise, read off the engine: seat 0 opens, so seat 0's column is
    // the one that should carry the mark.
    expect(planilla.view().turn.seat).toBe(0);

    expect(planilla.head(0).dataset.turn).toBe("active");
    expect(planilla.total(0).dataset.turn).toBe("active");
    for (const category of CATEGORY_IDS) expect(planilla.cell(category, 0).dataset.turn, category).toBe("active");

    // AND THE OTHER COLUMN CARRIES NOTHING, which is the half that makes the
    // mark mean something: an attribute on every cell of the table would
    // satisfy every assertion above and highlight the whole planilla.
    expect(planilla.head(1).dataset.turn).toBeUndefined();
    expect(planilla.total(1).dataset.turn).toBeUndefined();
    for (const category of CATEGORY_IDS) expect(planilla.cell(category, 1).dataset.turn, category).toBeUndefined();
  });

  it("follows the SEAT on turn and never the seat reading the card", () => {
    // Read from seat 1 while seat 0 is playing. From here the marked column
    // is the RIVAL's, which is exactly the case an implementation keyed on
    // `view.self` gets backwards while looking right from seat 0 — the two
    // questions are indistinguishable for as long as the reader is the seat
    // that happens to be playing.
    const planilla = seatPlanilla(RIVAL);
    planilla.roll([6, 6, 6, 2, 1]);

    expect(planilla.view().turn.seat).toBe(0);
    expect(planilla.view().self.seat).toBe(1);
    expect(planilla.head(0).dataset.turn).toBe("active");
    expect(planilla.head(0).textContent).toBe("Rival");
    expect(planilla.head(1).dataset.turn).toBeUndefined();
  });

  it("moves the mark to the other column when a box is written and the turn passes", () => {
    const planilla = seatPlanilla();
    planilla.playTurn([6, 6, 6, 2, 1], "sixes");

    expect(planilla.view().turn.seat).toBe(1);
    expect(planilla.head(1).dataset.turn).toBe("active");
    expect(planilla.head(0).dataset.turn).toBeUndefined();
  });

  it("marks no column at all once the match is over, because nobody is on turn any more", () => {
    // THE ENGINE KEEPS ADVANCING THE TURN PAST THE LAST BOX. `applyScore`
    // hands `awaiting-roll` to `(seat + 1) % players.length` whether or not
    // any card still has room, so a finished match arrives with `turn.seat`
    // pointing at a seat that will never play — and a planilla reading the
    // turn alone would sit under the verdict overlay highlighting it.
    // THE BOXES ARE WRITTEN IN AN ORDER THE RULES ALLOW, which is not
    // `CATEGORY_IDS`. `[1,2,3,4,5]` pays in six boxes and nothing in the other
    // five, and a zero goes only in the highest-paying open box — so the six
    // that pay come first, and the five that do not follow down the ladder.
    const playable: readonly CategoryId[] = ["ones", "twos", "threes", "fours", "fives", "escalera", "generala-doble", "generala", "poker", "full", "sixes"];
    const planilla = seatPlanilla();
    for (const category of playable) {
      planilla.playTurn([1, 2, 3, 4, 5], category);
      planilla.playTurn([1, 2, 3, 4, 5], category);
    }

    expect(planilla.view().outcome).not.toBeNull();
    expect(planilla.view().turn.seat).toBe(0);
    for (const seat of [0, 1]) {
      expect(planilla.head(seat).dataset.turn, `heading ${String(seat)}`).toBeUndefined();
      expect(planilla.total(seat).dataset.turn, `total ${String(seat)}`).toBeUndefined();
      for (const category of CATEGORY_IDS) expect(planilla.cell(category, seat).dataset.turn, `${category}/${String(seat)}`).toBeUndefined();
    }
  });
});
