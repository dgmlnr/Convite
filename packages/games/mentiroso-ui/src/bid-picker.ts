import { DIE_FACES } from "@hexdev/mentiroso-engine";
import type { DieFace, MentirosoAction } from "@hexdev/mentiroso-engine";

/**
 * The bid picker (SDD `mentiroso`, work unit E3/task 5.3, design D2):
 * quantity x face over `getLegalActions`'s own output, and only that output.
 *
 * TAKES `legalActions`, NEVER A `MatchState`. `dice-ui` learns no rule
 * (launch prompt), and neither does this file: it never calls
 * `ceilingFor`/`raisesFrom` itself, the same `{ view, legalActions }` payload
 * split every other renderer in this repo already uses
 * (`generala-ui/src/scorecard.ts`'s own `renderGeneralaScorecard`,
 * `escoba-ui/src/mark-then-play.ts`) — the server computes the legal set
 * once, off the real `MatchState`, and every renderer only ever draws it.
 *
 * WHY BIDIMENSIONAL, AND WHY DISABLED RATHER THAN ABSENT (launch prompt,
 * verbatim): a fresh six-seat table offers up to 180 legal raises — far too
 * many for a flat list — but a bid is a PAIR `(quantity, face)`, so the
 * natural control is a grid: quantity down the rows, the six faces across
 * every row, illegal combinations rendered disabled rather than missing.
 * That is a deliberate departure from `scorecard.ts`'s own "not a `<button
 * disabled>`" convention for an ALREADY-FIXED eleven-box sheet — this grid's
 * own shape is not fixed at all (it can be one row or thirty), and disabling
 * lets a player see the LATTICE they are climbing, not just today's rung.
 *
 * OFFERS EXACTLY WHAT `legalActions` OFFERS, NOT ONE COMBINATION MORE. The
 * grid's own row range (`minQuantity`..`maxQuantity`) and its six columns
 * (`DIE_FACES`, always all six, never derived from the offered faces alone)
 * are drawn from the shape of `raises`, but which CELLS are enabled is
 * decided by membership in `raises` alone — this unit's own named trap is a
 * fixture with exactly one legal raise, where deriving columns from the
 * offered faces (instead of the fixed six) would collapse the grid to
 * 1-row-by-1-column, and "the legal ones" would look identical to "all of
 * them". Columns stay fixed at six precisely so that collapse cannot happen.
 *
 * THE CEILING (mentiroso-rules R-CEILING) IS ITS OWN BRANCH, GATED ON
 * `raises.length === 0`, NEVER ON `legalActions.length === 1`. Doubt is
 * appended to a nonempty raise list too (any ordinary mid-bidding turn), so
 * `legalActions.length` alone cannot tell "the ceiling" apart from "an
 * ordinary turn with a small number of raises" — only the RAISE count can,
 * and that is the one this file reads. At the ceiling, no grid is rendered
 * at all — the launch prompt's own "no muestres un control de subir que no
 * puede hacer nada", rendered as what it structurally is: a control that
 * cannot exist, not a grid every one of whose cells happens to be disabled.
 *
 * OPENING A ROUND (`bid === null`) HAS NO DOUBT TO OFFER EITHER — nothing
 * exists yet to doubt (mentiroso-rules), so `legalActions` never carries one
 * and this file never invents one; the doubt button is gated on the offer's
 * own presence, symmetrically with the raise grid above.
 */
export type MentirosoBidPickerRender = (
  container: HTMLElement,
  legalActions: readonly MentirosoAction[],
  onAction: (action: MentirosoAction) => void,
) => void;

type RaiseAction = Extract<MentirosoAction, { readonly type: "raise" }>;
type DoubtAction = Extract<MentirosoAction, { readonly type: "doubt" }>;

function isRaise(action: MentirosoAction): action is RaiseAction {
  return action.type === "raise";
}

function isDoubt(action: MentirosoAction): action is DoubtAction {
  return action.type === "doubt";
}

/** "cuatro cincos" — the ruleset's own spoken form of a bid
 * (`convite/mentiroso/reglas-decididas`), reused verbatim as the accessible
 * name for a raise cell rather than a bare "5" that says nothing about what
 * pressing it does. */
const FACE_WORDS: Readonly<Record<DieFace, string>> = {
  1: "unos",
  2: "doses",
  3: "treses",
  4: "cuatros",
  5: "cincos",
  6: "seises",
};

function buildGrid(doc: Document, raises: readonly RaiseAction[], onAction: (action: MentirosoAction) => void): HTMLElement {
  const quantities = raises.map((raise) => raise.bid.quantity);
  const minQuantity = Math.min(...quantities);
  const maxQuantity = Math.max(...quantities);

  const grid = doc.createElement("div");
  grid.className = "hexdev-mentiroso-bid-grid";
  grid.setAttribute("role", "group");
  grid.setAttribute("aria-label", "Elegí cuántos dados y de qué cara");
  grid.style.display = "flex";
  grid.style.flexDirection = "column";
  grid.style.gap = "0.25rem";
  // Bounded, not viewport-relative (`cups.ts`'s own reasoning for staying off
  // `vh`-style units): up to 30 rows do not fit any screen at once, and this
  // widget opens inside an embedding iframe whose own height this file has
  // no way to know. A fixed scrollable window is legible on a phone and on a
  // desktop alike; the row itself, not the window, decides legibility.
  grid.style.maxHeight = "260px";
  grid.style.overflowY = "auto";

  // FOUND BY LOOKING (`bid-picker.scene.test.ts`'s own phone-width render,
  // AGENTS.md's own "todos los defectos visuales... los encontró alguien
  // mirando"): a blank `<span>` with no text has NO intrinsic width, while
  // every row's own quantity label always holds a digit — the two never
  // matched, so the header's face numbers rendered bunched at the left edge
  // instead of sitting above their own columns. Both widths below, and
  // `box-sizing: border-box` on every sized element, are the one set of
  // numbers the corner, every row label, every header face number, and
  // every button all size themselves to — so a header cell can never drift
  // out from over its own column again.
  const ROW_LABEL_WIDTH = "1.5rem";
  const CELL_WIDTH = "2.5rem";

  const header = doc.createElement("div");
  header.className = "hexdev-mentiroso-bid-header-row";
  header.style.display = "flex";
  header.style.gap = "0.25rem";
  const corner = doc.createElement("span");
  corner.style.width = ROW_LABEL_WIDTH;
  corner.style.boxSizing = "border-box";
  header.appendChild(corner);
  for (const face of DIE_FACES) {
    const label = doc.createElement("span");
    label.className = "hexdev-mentiroso-bid-header-cell";
    label.textContent = String(face);
    label.style.display = "inline-block";
    label.style.width = CELL_WIDTH;
    label.style.boxSizing = "border-box";
    label.style.textAlign = "center";
    header.appendChild(label);
  }
  grid.appendChild(header);

  for (let quantity = minQuantity; quantity <= maxQuantity; quantity += 1) {
    const row = doc.createElement("div");
    row.className = "hexdev-mentiroso-bid-row";
    row.dataset.quantity = String(quantity);
    row.style.display = "flex";
    row.style.gap = "0.25rem";

    const rowLabel = doc.createElement("span");
    rowLabel.className = "hexdev-mentiroso-bid-row-label";
    rowLabel.textContent = String(quantity);
    rowLabel.style.width = ROW_LABEL_WIDTH;
    rowLabel.style.boxSizing = "border-box";
    row.appendChild(rowLabel);

    for (const face of DIE_FACES) {
      const offer = raises.find((raise) => raise.bid.quantity === quantity && raise.bid.face === face);
      const cell = doc.createElement("button");
      cell.type = "button";
      cell.className = "hexdev-mentiroso-bid-cell";
      cell.dataset.quantity = String(quantity);
      cell.dataset.face = String(face);
      cell.textContent = String(face);
      cell.style.width = CELL_WIDTH;
      cell.style.minHeight = "2.5rem";
      cell.style.boxSizing = "border-box";
      // DISABLED, NEVER ABSENT (this file's own top docblock) — the one
      // clause this unit's negative controls exist to guard: deleting this
      // condition (always `false`) enables every cell in every row.
      cell.disabled = offer === undefined;
      cell.setAttribute("aria-label", `Subir a ${String(quantity)} ${FACE_WORDS[face]}`);
      if (offer !== undefined) cell.addEventListener("click", () => onAction(offer));
      row.appendChild(cell);
    }
    grid.appendChild(row);
  }

  return grid;
}

function buildDoubtButton(doc: Document, doubt: DoubtAction, onAction: (action: MentirosoAction) => void): HTMLButtonElement {
  const button = doc.createElement("button");
  button.type = "button";
  button.className = "hexdev-mentiroso-bid-doubt";
  button.textContent = "Dudar";
  button.setAttribute("aria-label", "Dudar de la apuesta actual");
  button.addEventListener("click", () => onAction(doubt));
  return button;
}

export const renderMentirosoBidPicker: MentirosoBidPickerRender = (container, legalActions, onAction) => {
  container.className = "hexdev-mentiroso-bid-picker";

  // NOT THIS SEAT'S TURN, OR NO PHASE OFFERS ANYTHING (`getLegalActions`
  // returns `[]` for every seat but the one in turn, and for every phase but
  // `bidding`). Rendering nothing at all — not an empty grid, not a disabled
  // doubt button — is this file's own answer to "offer exactly what is
  // offered": zero options means zero controls.
  if (legalActions.length === 0) {
    container.replaceChildren();
    return;
  }

  const doc = container.ownerDocument;
  const raises = legalActions.filter(isRaise);
  const doubt = legalActions.find(isDoubt);
  const fragment = doc.createDocumentFragment();

  if (raises.length === 0) {
    // THE CEILING — see this file's own top docblock. Gated on the RAISE
    // count, never on `legalActions.length`, which an ordinary turn could
    // also equal 1 for reasons that have nothing to do with the ceiling.
    const notice = doc.createElement("p");
    notice.className = "hexdev-mentiroso-bid-picker-notice";
    notice.textContent = "No hay ninguna subida legal. Sólo podés dudar.";
    fragment.appendChild(notice);
  } else {
    fragment.appendChild(buildGrid(doc, raises, onAction));
  }

  if (doubt !== undefined) fragment.appendChild(buildDoubtButton(doc, doubt, onAction));

  container.replaceChildren(fragment);
};
