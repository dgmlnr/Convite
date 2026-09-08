import { CATEGORY_IDS } from "@hexdev/generala-engine";
import type { CategoryId, PlayerView, SeatView } from "@hexdev/generala-engine";

import { ensureScorecardStyles } from "./scorecard-styles.js";

/**
 * The eleven boxes, in the words a player at this table uses for them.
 *
 * The four juegos mayores and the doble are named exactly as the decided
 * ruleset names them (`convite/generala/reglas-decididas`): Escalera, Full,
 * Póker, Generala, Generala doble. The upper six are the Spanish plurals of
 * the numbers, which is what a printed planilla prints — the engine calls them
 * `ones`..`sixes` because those boxes ARE just the numbers, and that is an
 * identifier, not a label.
 *
 * Keyed by `CategoryId` rather than listed in parallel, so a twelfth box fails
 * to compile here instead of rendering an empty row header.
 */
const CATEGORY_LABELS: Readonly<Record<CategoryId, string>> = {
  ones: "Unos",
  twos: "Doses",
  threes: "Treses",
  fours: "Cuatros",
  fives: "Cincos",
  sixes: "Seises",
  escalera: "Escalera",
  full: "Full",
  poker: "Póker",
  generala: "Generala",
  "generala-doble": "Generala doble",
};

/**
 * Whose column this is, from the seat reading the planilla.
 *
 * "Vos" and "Rival" are the pair `escoba-ui`'s scoreboard already uses for the
 * same job. The number appears only when there is more than one rival to tell
 * apart: Generala registers two seats, but the engine is written N-seat (D11)
 * and a three-handed table would otherwise show two columns both headed
 * "Rival", which is worse than a number nobody needs at two.
 */
function seatLabel(seat: SeatView, self: SeatView, rivals: number): string {
  if (seat.seat === self.seat) return "Vos";
  return rivals > 1 ? `Rival ${String(seat.seat + 1)}` : "Rival";
}

/** Seat order, which is the order the columns are in. A planilla at a real
 * table has one column per player in the order they sit, and keeping that
 * makes a column's POSITION the same fact for everyone looking at it — the
 * view's `self` / `others` split is about who is reading, not about where
 * anybody sits. */
function seatsInOrder(view: PlayerView): readonly SeatView[] {
  return [view.self, ...view.others].sort((left: SeatView, right: SeatView) => left.seat - right.seat);
}

/**
 * What one box reads as, and the three states are three different facts.
 *
 * `null` is OPEN: nobody has written here and it is still worth playing for.
 * `0` is CROSSED: written, spent, and never scorable again — the box a player
 * gave up. Anything else is what it is worth. The engine draws that
 * distinction with `null` versus `0` for exactly this reason (`state.ts`), and
 * this is where it reaches somebody's eye; a planilla that rendered a spent
 * box and an open one the same way would be hiding the single most useful
 * thing about a rival's card.
 */
function fillCell(cell: HTMLTableCellElement, value: number | null): void {
  if (value === null) {
    cell.dataset.state = "open";
    cell.textContent = "";
    return;
  }
  cell.dataset.state = value === 0 ? "crossed" : "filled";
  cell.textContent = String(value);
}

/**
 * THE PLANILLA: every seat's card, on one sheet, visible to everybody.
 *
 * A real `<table>` (D8), not a grid of `div`s wearing `role="table"`. Every
 * cell here means "this category, for this seat", and that pairing is the
 * whole content — `<th scope="row">` per category and `<th scope="col">` per
 * seat is how the element itself carries it, so a screen reader announces both
 * headers on arrival and no code was written to make that happen. The rejected
 * alternative re-declares, in ARIA, semantics the element already has, and
 * every one of those re-declarations is a chance to get it wrong.
 *
 * BOTH CARDS, ALWAYS. Generala redacts nothing — `getViewFor` is a projection
 * and not a redaction (D6) — and the rival's card is not a courtesy: knowing
 * which boxes they have already spent is what makes blocking play possible at
 * all (Spec B). So this renders every column of `view.cards`, not the seat's
 * own.
 *
 * THE TOTALS ARE READ, NEVER SUMMED. `PlayerView.totals` is derived by the
 * engine precisely so a consumer does not re-derive it (`view.ts`'s own
 * argument for carrying it), and a planilla adding up its own rendered strings
 * would be a second source of truth about the score that could disagree with
 * the first.
 *
 * IT DRAWS A CARD AND NOT A MOVE. Nothing here is pressable yet: an open box
 * the acting seat may write, previewing what this roll would put in it, is the
 * next unit's, and it needs the offer list this signature deliberately does not
 * take. A callback for a control that does not exist is the forward-looking API
 * this repository's barrels argue against.
 */
export function renderGeneralaScorecard(container: HTMLElement, view: PlayerView): void {
  const doc = container.ownerDocument;
  ensureScorecardStyles(doc);
  container.className = "hexdev-generala-scorecard";

  const seats = seatsInOrder(view);
  const table = doc.createElement("table");
  table.className = "hexdev-generala-scorecard-table";

  const caption = doc.createElement("caption");
  caption.className = "hexdev-generala-scorecard-caption";
  caption.textContent = "Planilla";
  table.appendChild(caption);

  const head = doc.createElement("thead");
  const headRow = doc.createElement("tr");
  // The top-left cell heads neither a row nor a column. A `<th>` there would
  // claim to head the column of category names, and assistive tech would read
  // it into all eleven of them.
  const corner = doc.createElement("td");
  corner.className = "hexdev-generala-scorecard-corner";
  headRow.appendChild(corner);
  for (const seat of seats) {
    const column = doc.createElement("th");
    column.scope = "col";
    column.dataset.seat = String(seat.seat);
    column.textContent = seatLabel(seat, view.self, view.others.length);
    headRow.appendChild(column);
  }
  head.appendChild(headRow);
  table.appendChild(head);

  const body = doc.createElement("tbody");
  for (const category of CATEGORY_IDS) {
    const row = doc.createElement("tr");
    row.dataset.category = category;

    const header = doc.createElement("th");
    header.scope = "row";
    header.textContent = CATEGORY_LABELS[category];
    row.appendChild(header);

    for (const seat of seats) {
      const cell = doc.createElement("td");
      cell.className = "hexdev-generala-scorecard-cell";
      cell.dataset.seat = String(seat.seat);
      fillCell(cell, view.cards[seat.seat]?.[category] ?? null);
      row.appendChild(cell);
    }
    body.appendChild(row);
  }
  table.appendChild(body);

  const foot = doc.createElement("tfoot");
  const totalRow = doc.createElement("tr");
  const totalHeader = doc.createElement("th");
  totalHeader.scope = "row";
  totalHeader.textContent = "Total";
  totalRow.appendChild(totalHeader);
  for (const seat of seats) {
    const cell = doc.createElement("td");
    cell.dataset.seat = String(seat.seat);
    cell.textContent = String(view.totals[seat.seat] ?? 0);
    totalRow.appendChild(cell);
  }
  foot.appendChild(totalRow);
  table.appendChild(foot);

  container.replaceChildren(table);
}
