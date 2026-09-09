import { CATEGORY_IDS, scoreFor } from "@hexdev/generala-engine";
import type { CategoryId, GeneralaAction, PlayerView, ScoreAction, Scorecard, SeatView, Turn } from "@hexdev/generala-engine";

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
 *
 * EXPORTED FROM HERE, AND NOT FROM THE BARREL. `announcer.ts` says which box
 * was just written and has to call it what the planilla calls it — a region
 * announcing "Póker" over a row headed something else is two names for one
 * box, and a player who went to check the card would not find what they were
 * told. Sharing the map is what makes them agree; re-typing it would make
 * them agree today. Nothing OUTSIDE this package composes a box label, which
 * is the same line `SCORE_TAP_MIN` is drawn on.
 */
export const CATEGORY_LABELS: Readonly<Record<CategoryId, string>> = {
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
export function seatLabel(seat: SeatView, self: SeatView, rivals: number): string {
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
 * What THIS ROLL would put in that box, asked of the engine and never worked
 * out here.
 *
 * `scoreFor` takes four arguments and every one of them changes the answer:
 * an escalera is 25 servida and 20 armada, so `rollsUsed` decides it, and the
 * doble pays 100 only when the card already holds a real generala, so the
 * CARD decides that one. A preview built from the dice alone is wrong in both
 * cases and looks right in every other, which is exactly why it is not built
 * here at all (D8: never re-derived in the UI).
 *
 * `deciding` is the only phase with five faces to score. It is also the only
 * phase in which a `score` is ever offered, so the guard below is the type
 * narrowing the compiler needs rather than a case a caller can reach.
 */
function previewOf(turn: Turn, card: Scorecard, category: CategoryId): number | null {
  if (turn.phase !== "deciding") return null;
  return scoreFor(category, turn.dice, turn.rollsUsed, card);
}

/**
 * WHICH COLUMN IS PLAYING, or none.
 *
 * `turn.seat` alone is the wrong answer and it is wrong in exactly one state:
 * `applyScore` hands `awaiting-roll` to `(seat + 1) % players.length` whether
 * or not any card still has room, so a FINISHED match arrives here with the
 * turn pointing at a seat that will never play again. A planilla reading the
 * turn alone would sit under the verdict overlay quietly telling somebody it
 * was their go. `outcome` is the engine's own answer to "is this still a
 * game", read rather than re-derived, exactly as the totals are.
 */
function seatOnTurn(view: PlayerView): number | null {
  return view.outcome === null ? view.turn.seat : null;
}

/** The mark, written only where it belongs. A cell with no attribute is the
 * ordinary case, so the sheet needs one selector rather than two and nothing
 * has to be cleared between renders — the table is rebuilt whole. */
function markTurn(cell: HTMLTableCellElement, onTurn: boolean): void {
  if (onTurn) cell.dataset.turn = "active";
}

/**
 * The offer that writes THIS box for THIS seat, or nothing.
 *
 * Looked up by the offer's own `playerId`, not by comparing a seat to
 * `view.self`. The two agree today — a seat is only ever handed its own legal
 * actions — but only one of them stays right if that ever stops being true,
 * and reading the actor off the action is the same discipline `tray.ts` uses
 * for holds: the offer list is the authority, and this file learns no rule.
 */
function offerFor(scores: readonly ScoreAction[], seat: SeatView, category: CategoryId): ScoreAction | undefined {
  return scores.find((score) => score.category === category && score.playerId === seat.playerId);
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
 * The open box turned into the control that writes it.
 *
 * THE PREVIEW IS THE POINT. A player choosing where to spend a roll is
 * choosing between eleven numbers they would otherwise have to work out in
 * their head, eleven times, every turn — and the arithmetic is the game's,
 * not theirs to redo. It is the highest-value affordance on this screen and
 * it costs one call.
 *
 * The number is the visible label because that is what is being compared; the
 * accessible name says what pressing it DOES, since "18" on its own is not a
 * sentence anybody can act on (WCAG 2.5.3 is satisfied by the name containing
 * the visible text).
 */
function makeScoreControl(doc: Document, label: string, preview: number, onPress: () => void): HTMLButtonElement {
  const button = doc.createElement("button");
  button.type = "button";
  button.className = "hexdev-generala-score";
  button.textContent = String(preview);
  button.setAttribute("aria-label", `Anotar ${String(preview)} en ${label}`);
  button.addEventListener("click", onPress);
  return button;
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
 * IT READS THE OFFER LIST AND NEVER THE RULES. Which boxes are pressable is
 * one question — does this list contain a `score` for this seat and this
 * category? — and answering it makes the planilla correct in states it was
 * never separately taught: another seat's turn, the moment the cup is
 * shaking, a box already written, and a match that is over all offer nothing
 * and all draw the same card with nothing to press. The same argument
 * `tray.ts` makes for holds, and the reason neither file knows what a rule is.
 */
export type GeneralaScorecardRender = (
  container: HTMLElement,
  view: PlayerView,
  legalActions: readonly GeneralaAction[],
  onScore: (action: ScoreAction) => void,
) => void;

export const renderGeneralaScorecard: GeneralaScorecardRender = (container, view, legalActions, onScore) => {
  const doc = container.ownerDocument;
  ensureScorecardStyles(doc);
  container.className = "hexdev-generala-scorecard";

  const seats = seatsInOrder(view);
  const onTurn = seatOnTurn(view);
  const scores = legalActions.filter((action): action is ScoreAction => action.type === "score");
  const table = doc.createElement("table");
  table.className = "hexdev-generala-scorecard-table";

  const caption = doc.createElement("caption");
  caption.className = "hexdev-generala-scorecard-caption";
  caption.textContent = "Planilla";
  table.appendChild(caption);

  // ONE `<col>`, FOR THE ONE COLUMN THAT HAS A WIDTH. A column's width
  // belongs to the element that IS the column: under `table-layout: fixed`
  // the widths are read off the first ROW, which here starts at the blank
  // corner cell, so a width declared on the category headers is read one row
  // too late and never applies at all.
  //
  // No `<col>` for the seats, and that was measured rather than assumed. A
  // `<colgroup>` shorter than the table is legal, and the columns it does not
  // name split whatever is left over evenly — which is exactly the behaviour
  // wanted, and is what the seats already got when one `<col>` per seat was
  // declared alongside. Adding them back moved nothing, so they were a hook
  // for a caller that does not exist rather than a mechanism.
  const columns = doc.createElement("colgroup");
  const labelColumn = doc.createElement("col");
  labelColumn.className = "hexdev-generala-scorecard-labels";
  columns.appendChild(labelColumn);
  table.appendChild(columns);

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
    markTurn(column, seat.seat === onTurn);
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
      markTurn(cell, seat.seat === onTurn);
      const card = view.cards[seat.seat];
      fillCell(cell, card?.[category] ?? null);

      const offer = offerFor(scores, seat, category);
      const preview = card === undefined || offer === undefined ? null : previewOf(view.turn, card, category);
      if (offer !== undefined && preview !== null) {
        cell.appendChild(makeScoreControl(doc, CATEGORY_LABELS[category], preview, () => onScore(offer)));
      }
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
    markTurn(cell, seat.seat === onTurn);
    totalRow.appendChild(cell);
  }
  foot.appendChild(totalRow);
  table.appendChild(foot);

  container.replaceChildren(table);
};
