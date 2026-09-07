import { createDieSceneElement } from "@hexdev/dice-ui";
import type { DieFace } from "@hexdev/generala-engine";

/**
 * One slot of the tray: the die that is sitting in it, or the gap where a die
 * used to be while the cup is shaking.
 *
 * `button` is `null` for that gap and non-null for a die, so a caller never
 * has to ask the DOM what kind of node it is holding. The two are kept apart
 * in the TYPE rather than behind an `instanceof` at every use, because "this
 * slot is empty" is a fact about the turn, not about an element.
 */
export interface DieSlot {
  /** What goes into the tray, whichever of the two this is. */
  readonly node: HTMLElement;
  /** The control, when there is a die to control. */
  readonly button: HTMLButtonElement | null;
}

/**
 * A DIE THE PLAYER CAN HOLD — a real `<button aria-pressed>`, never a `div`
 * with `role="button"`.
 *
 * The argument is the one `dice.ts` already makes for the cup: a native
 * button is in the tab order, is activated by Enter AND Space, reports its
 * own disabled state, and needs no key handling written by hand. A
 * `role="button"` div would have to re-implement all four, and the fourth is
 * the one that is always forgotten.
 *
 * WHAT THIS DOES NOT KNOW IS WHETHER HOLDING IS LEGAL. A hold is a RULE, and
 * this file — like `dice-ui` below it — has no idea what one is. It draws a
 * pressed state somebody else decided and reports a press to somebody else
 * who will decide what it means. `tray.ts` owns that decision and reads it
 * off the engine's own offer list.
 *
 * THE FACE CROSSES THE ONE SEAM D14 LEAVES OPEN. `generala-engine`'s
 * `DieFace` and `dice-ui`'s are declared separately and deliberately — the
 * die as a VALUE a rule reads, and the die as a PICTURE — and they meet here
 * and nowhere else, exactly as `escoba-engine`'s `Card` and
 * `spanish-deck-ui`'s already do. Both are the same literal union, so this
 * hand-off needs no cast and no adapter; the day one of them gains or loses a
 * member, THIS LINE stops compiling, which is the type-level fence D14 asks
 * for without a test that would only restate it.
 *
 * IT BRINGS ITS OWN SIZE. `createDieSceneElement` returns
 * `.hexdev-dice-scene-box`, the sized layout box slice 12 added precisely so
 * that a board composing dice into a tray owns no geometry: the responsive
 * ladder is already on that element, and this package never names a pixel.
 */
export function createDieSlot(doc: Document, face: DieFace | null, index: number, onToggle: (index: number) => void): DieSlot {
  if (face === null) return { node: createEmptySlot(doc), button: null };

  const button = doc.createElement("button");
  button.type = "button";
  button.className = "hexdev-generala-die";
  button.dataset.index = String(index);
  // The die's number is in its accessible name because the artwork carries
  // none: `dice-ui` marks every facelet image `alt=""` on purpose (a cube
  // ships all six numbers permanently, so five of them are never the decided
  // face). Without this a screen reader would announce five identical
  // unlabelled buttons.
  button.setAttribute("aria-label", `Dado ${String(index + 1)}: ${String(face)}`);
  button.setAttribute("aria-pressed", "false");
  button.addEventListener("click", () => onToggle(index));
  button.appendChild(createDieSceneElement(doc, face, index));
  return { node: button, button };
}

/**
 * The gap a thrown die leaves, drawn rather than left out.
 *
 * A tray that simply removed the three dice in the cup would reflow twice per
 * throw — narrower while the roll is in flight, wider when it lands — and the
 * two dice the player HELD would jump sideways under their finger. This keeps
 * the row the width it was.
 *
 * It wears `.hexdev-dice-scene-box` for its size, which is not a borrowed
 * class name: it IS the element `dice-ui` sizes, responsive ladder included,
 * so the gap is exactly as wide as the die that will land in it at every
 * breakpoint and this package still names no pixel. Hidden from assistive
 * tech because "a die is being thrown" is the announcer's sentence to say,
 * not five empty boxes' (`dice-announcer.ts`, and slice 15's own job).
 */
function createEmptySlot(doc: Document): HTMLElement {
  const slot = doc.createElement("div");
  slot.className = "hexdev-generala-die hexdev-generala-die--empty hexdev-dice-scene-box";
  slot.setAttribute("aria-hidden", "true");
  return slot;
}
