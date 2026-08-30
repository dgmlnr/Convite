/**
 * THE SIDE RAIL — one home for everything a player reads BETWEEN decisions,
 * in two shapes: a thin handle on a phone, a real column when there is room.
 *
 * WHY. Slice R3 put four true facts on this screen — the turn, each other
 * seat's cards, the stock, this hand's escobas — and stacked every one as a
 * full-width row above the cards: six lines of text before the first card at
 * 375px, the third seat chip wrapping alone onto a centred row of its own.
 * The facts were right; the layout was the whole problem.
 *
 * THE SHAPE IS TRUCO'S; NONE OF THE CODE IS. `truco-ui` solves the same
 * problem with `.hexdev-truco-side-rail`, and this package is L1 — a boundary
 * `pnpm check:boundaries` really does enforce — so the pattern was read and
 * rewritten here, as `match-styles.ts` re-declares the felt rather than
 * reaching for the shell's.
 *
 * THE SPLIT THAT MATTERS: whose turn it is never enters the rail. That has to
 * be answerable without tapping anything, so the turn badge stays on the felt
 * and everything else moves in here — truco's own division exactly.
 *
 * NO READ-BACK OF THE OPEN STATE, unlike truco: that table rebuilds its whole
 * subtree per broadcast and must recover `data-open` or slam the drawer shut
 * under a reader. Escoba's composition root mounts once and mutates after, so
 * this runs ONCE per match and the state lives on the element it was set on.
 */

export interface EscobaRailElements {
  readonly railEl: HTMLElement;
  readonly bodyEl: HTMLElement;
  readonly tabEl: HTMLButtonElement;
}

/** Spanish, voseo, matching `i18n.ts`'s voice — and the word for what is
 * inside: a tanteador is a real table's score-keeper. */
const TAB_OPEN = "Tanteador";
const TAB_CLOSE = "Cerrar tanteador";

/** Ids must be unique in ONE document, and the scenes really do mount two
 * matches side by side. A counter, not a constant. */
let railBodySequence = 0;

/** Builds the rail, closed — narrow, that is a handle and nothing else. From
 * 640 container-px up `rail-styles.ts` opens the body unconditionally and
 * hides the handle, so a drawer shut on a phone can never leave a wide table
 * with an empty column. */
export function createEscobaRail(): EscobaRailElements {
  const railEl = document.createElement("div");
  railEl.className = "hexdev-escoba-side-rail";
  railEl.dataset.open = "false";

  const bodyEl = document.createElement("div");
  bodyEl.className = "hexdev-escoba-rail-body";
  bodyEl.id = `hexdev-escoba-rail-body-${String(++railBodySequence)}`;

  const tabEl = document.createElement("button");
  tabEl.type = "button";
  tabEl.className = "hexdev-escoba-rail-tab";
  tabEl.textContent = TAB_OPEN;
  // WCAG 4.1.2: aria-expanded promises a revealable region and aria-controls
  // names it. Set together here and flipped together below, so neither can
  // ever dangle without the other.
  tabEl.setAttribute("aria-expanded", "false");
  tabEl.setAttribute("aria-controls", bodyEl.id);
  tabEl.addEventListener("click", () => {
    const open = railEl.dataset.open !== "true";
    railEl.dataset.open = String(open);
    tabEl.setAttribute("aria-expanded", String(open));
    tabEl.textContent = open ? TAB_CLOSE : TAB_OPEN;
  });

  railEl.append(tabEl, bodyEl);
  return { railEl, bodyEl, tabEl };
}
