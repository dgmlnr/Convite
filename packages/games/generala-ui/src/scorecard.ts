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
 * Whether this seat is the one being offered boxes at all — asked of the offer
 * list, exactly as `offerFor` is.
 *
 * IT IS A DIFFERENT QUESTION FROM "may this box be written", and since the
 * crossing ladder landed the two genuinely come apart. A seat on turn is
 * offered every box worth something plus ONE worth nothing (ruleset §Orden
 * obligatorio de tachado), so most of its open boxes carry no offer — and a
 * preview still belongs in every one of them, because what a box would pay is
 * how a player decides where to spend the turn. A seat that is not choosing
 * gets no previews at all: the dice on the table are not theirs to score, and a
 * number under their name would be a promise about somebody else's throw.
 */
function isChoosing(scores: readonly ScoreAction[], seat: SeatView): boolean {
  return scores.some((score) => score.playerId === seat.playerId);
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
/**
 * The open box a zero may NOT go in: the number, and nothing to press.
 *
 * WHAT A PLAYER MUST NEVER BE UNABLE TO TELL APART is "worth nothing" from "not
 * allowed", and the two arrive together here — a box the ladder has not reached
 * is exactly a box worth nothing, since anything worth something is always
 * writable. Rendering nothing at all would take the number away and leave an
 * open box looking like the rival's; rendering a disabled button would put a
 * control in the tab order for a move that does not exist, which `truco-ui`'s
 * `calls.browser.test.ts` already refuses to do for an illegal call.
 *
 * So the number stays and the affordance goes. NOT A `<button disabled>` and
 * not a colour: it is a plain span at the same 0.5 the open-box dash is drawn
 * at (`scorecard-styles.ts`, measured at 4.67:1 on the shipped board), so it
 * reads as the notation for "open, and worth nothing" rather than as a control
 * somebody greyed out. It keeps the control's box so eleven rows do not change
 * height as boxes come in and out of the offer list.
 */
function makeLockedPreview(doc: Document, preview: number): HTMLSpanElement {
  const locked = doc.createElement("span");
  locked.className = "hexdev-generala-score-locked";
  locked.textContent = String(preview);
  return locked;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * A PENCIL: this press WRITES A NUMBER.
 *
 * Two strokes, because two is what makes it a pencil rather than a wedge: the
 * body, whose bottom-left corner is the point, and the short line across it
 * that a real pencil's ferrule draws. Both stroked from one `currentColor`,
 * so the mark takes whatever ink the control it sits in is wearing — which is
 * what lets the hover state invert the whole button, mark included, with one
 * declaration instead of a second palette.
 */
const PENCIL_STROKES: readonly string[] = ["M3 13 L3.8 10.2 L10.5 3.5 L12.5 5.5 L5.8 12.2 Z", "M9.4 4.6 L11.4 6.6"];

/**
 * A CROSS: this press SPENDS THE BOX AT ZERO.
 *
 * The same two diagonals somebody draws through a box on paper, which is what
 * the ruleset's own verb means — `tachar` (§Orden obligatorio de tachado). It
 * is red as well, and the ORDER of those two facts is the whole accessibility
 * argument: the SHAPE is what tells the two presses apart (WCAG 1.4.1), the
 * colour only says how much it costs. A player who cannot see red still sees
 * an X where every other box has a pencil.
 */
const CROSS_STROKES: readonly string[] = ["M4.5 4.5 L11.5 11.5", "M11.5 4.5 L4.5 11.5"];

/**
 * The mark, as vector rather than as a character.
 *
 * NOT AN EMOJI AND NOT A FONT GLYPH. "✏️" and "❌" are colour emoji: the
 * platform picks the artwork, the hue is not ours to measure against a
 * background, and the two would not even be the same SIZE as each other on
 * every phone. A path is the same drawing everywhere, takes its ink from CSS
 * where a contrast fence can read it, and — the property this file's own
 * assertions lean on — contributes NOTHING to `textContent`, so the button's
 * visible text stays the preview number alone.
 *
 * `aria-hidden`, because the sentence is already on the button: the accessible
 * name says "Anotar 45 en Póker" or "Tachar 0 en Póker", and a mark announced
 * beside it would be the same fact twice with no name for it.
 */
function makePressMark(doc: Document, crossing: boolean): SVGElement {
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", `hexdev-generala-press-mark hexdev-generala-press-mark--${crossing ? "cross" : "write"}`);
  for (const outline of crossing ? CROSS_STROKES : PENCIL_STROKES) {
    const stroke = doc.createElementNS(SVG_NS, "path");
    stroke.setAttribute("d", outline);
    svg.appendChild(stroke);
  }
  return svg;
}

/**
 * ANOTAR AND TACHAR ARE TWO MOVES, AND THEY USED TO LOOK LIKE ONE.
 *
 * Every offered box rendered as a bare number, so the box that would SPEND a
 * category for nothing was a `0` sitting in a column of numbers — and a `0`
 * does not read as an option, it reads as a dead cell. Crossing out is a
 * legitimate play and sometimes the right one (ruleset §Orden obligatorio de
 * tachado gives it its own ladder), so it gets a mark of its own.
 *
 * THE TWO ARE TOLD APART BY WHAT THE PRESS WOULD WRITE, and nothing else is
 * consulted. `preview === 0` IS crossing out — the ruleset defines the verb
 * that way ("Escribir un CERO (tachar)") — so this file learns no rule to
 * decide it, exactly as it learns none to decide which boxes are pressable.
 * The ladder's own consequence falls out for free: at most one box is ever
 * crossable, so at most one X is ever on the card, and the pencils around it
 * are what make that one mark loud.
 *
 * THE NUMBER STAYS, AND IT IS STILL THE POINT. A player chooses by comparing
 * eleven numbers to each other; the mark says which of two things a press
 * does, it does not say what the box is worth. So the mark is added ABOVE the
 * number rather than in place of it, and the numbers stay in one aligned
 * column down the card.
 *
 * NOT A HOVER STATE. This widget opens on a phone, where there is no pointer
 * to reveal anything with — the same argument `scorecard-styles.ts` already
 * makes for the rest-state tint on this control.
 *
 * THE VERB IN THE ACCESSIBLE NAME CHANGES WITH IT. "Anotar 0 en Póker" and
 * "Tachar 0 en Póker" are the same press described two ways, and only the
 * second one says what it costs. One word differs, which is the distinction
 * this change is; the number stays inside the name so it still contains the
 * control's visible text (WCAG 2.5.3).
 */
function makeScoreControl(doc: Document, label: string, preview: number, onPress: () => void): HTMLButtonElement {
  const crossing = preview === 0;
  const button = doc.createElement("button");
  button.type = "button";
  button.className = "hexdev-generala-score";
  button.dataset.press = crossing ? "cross" : "write";
  const value = doc.createElement("span");
  value.className = "hexdev-generala-score-value";
  value.textContent = String(preview);
  button.append(makePressMark(doc, crossing), value);
  button.setAttribute("aria-label", `${crossing ? "Tachar" : "Anotar"} ${String(preview)} en ${label}`);
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
 * IT READS THE OFFER LIST AND NEVER THE RULES, and since the crossing ladder
 * landed it reads TWO questions out of it instead of one. Which boxes are
 * pressable: does this list contain a `score` for this seat and this category?
 * And which seat is choosing at all: does it contain any `score` for this seat?
 * Answering both off the list keeps the planilla correct in states it was never
 * separately taught — another seat's turn, the moment the cup is shaking, a box
 * already written, a match that is over, and now a box that is open and worth
 * nothing and still not a legal target. The same argument `tray.ts` makes for
 * holds, and the reason neither file knows what a rule is.
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
      // EVERY OPEN BOX OF THE SEAT THAT IS CHOOSING CARRIES ITS NUMBER, not
      // only the ones it may write. Knowing a box would pay nothing is how a
      // player plans, and the crossing ladder made most of them unwritable
      // without making them uninteresting.
      const preview = card === undefined || card[category] !== null || !isChoosing(scores, seat) ? null : previewOf(view.turn, card, category);
      if (preview !== null) {
        cell.appendChild(offer === undefined ? makeLockedPreview(doc, preview) : makeScoreControl(doc, CATEGORY_LABELS[category], preview, () => onScore(offer)));
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
