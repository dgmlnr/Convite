import { ensureDiceStyles } from "@hexdev/dice-ui";
import type { DieFace, GeneralaAction, HoldAction, Turn } from "@hexdev/generala-engine";

import { createDieSlot } from "./die-button.js";
import type { DieSlot } from "./die-button.js";
import { ensureTrayStyles } from "./tray-styles.js";

/** Where the tray draws itself. One element the caller mounts and keeps,
 * never one this renderer creates — the same contract `escoba-ui`'s
 * `MarkThenPlayElements` states, so the board decides the layout and this
 * file decides only what goes in it. */
export interface GeneralaTrayElements {
  readonly diceEl: HTMLElement;
}

export type GeneralaTrayRender = (elements: GeneralaTrayElements, turn: Turn, legalActions: readonly GeneralaAction[]) => void;

/**
 * The five faces this turn is showing, or the gaps where dice are still in
 * the cup.
 *
 * `awaiting-roll` carries `slots` — `null` in every position about to be
 * thrown — which is exactly the shape this tray draws, so no arithmetic
 * happens here. `servida-win` carries no dice at all: five of a kind off the
 * cup ends the match before anybody chooses anything, and there is nothing
 * left to show.
 */
function facesOf(turn: Turn): readonly (DieFace | null)[] {
  switch (turn.phase) {
    case "awaiting-roll":
      return turn.slots;
    case "deciding":
      return turn.dice;
    case "servida-win":
      return [];
  }
}

function holdsIn(legalActions: readonly GeneralaAction[]): readonly HoldAction[] {
  return legalActions.filter((action): action is HoldAction => action.type === "hold");
}

/**
 * THE TRAY, AND THE ONE THING IT REFUSES TO DO.
 *
 * `dice-ui` ships a cup, and `createDiceCup(...).roll()` is deliberately NOT
 * called from anywhere in this package. Its own docstring says what it does —
 * it replaces the whole tray — which is right for five dice nobody is keeping
 * and destroys the game the moment a player holds one. It is not deleted and
 * not redesigned; it is simply not the thing a Generala board wants (D8).
 *
 * A HELD DIE IS THE SAME ELEMENT AFTERWARDS, and identity is keyed on the
 * FACE IN THE SLOT rather than on this closure's memory of what was held. A
 * held die's face is unchanged by construction — the roll splices
 * positionally into the empty slots — so the two rules agree, and the face is
 * the one of them that is still right after a reconnect, a replay, or a
 * broadcast this tray did not cause. Remembering the last hold instead would
 * be a second source of truth about the same fact, and the drift would only
 * ever show up as a die that flickered.
 *
 * PRESSES ACCUMULATE HERE. A per-die press toggles a pending selection and
 * nothing else; nothing is dispatched, because the action union leaves no
 * room for it to be — there is exactly one `hold` per roll and applying it
 * transitions the phase, so five presses cannot be five actions. What turns a
 * selection into that one action is the roll control, and it arrives with the
 * slice that can commit it.
 *
 * THE TRAY READS THE OFFER LIST AND NEVER THE RULES. Whether a die may be
 * held at all is answered by one question — does this list contain any
 * `hold`? — rather than by this file learning what `rollsUsed === 3` means.
 * That is what makes it correct in three states it was never separately
 * taught: the third throw, another seat's turn, and the moment the cup is
 * shaking all answer the same way, because the engine offers nothing in any
 * of them.
 */
export function createGeneralaTray(): GeneralaTrayRender {
  const held = new Set<number>();
  let slots: DieSlot[] = [];
  let drawnFaces: readonly (DieFace | null)[] = [];
  /** The arguments of the render in force, so the toggle below reads the
   * CURRENT turn instead of the one that happened to build its element. A
   * held die survives re-renders, so a listener closing over its own render's
   * arguments would go stale exactly on the dice the player is keeping. */
  let current: { elements: GeneralaTrayElements; turn: Turn; legalActions: readonly GeneralaAction[] } | null = null;

  const toggle = (index: number): void => {
    if (current === null) return;
    if (held.has(index)) held.delete(index);
    else held.add(index);
    render(current.elements, current.turn, current.legalActions);
  };

  const render: GeneralaTrayRender = (elements, turn, legalActions) => {
    current = { elements, turn, legalActions };
    const doc = elements.diceEl.ownerDocument;
    ensureDiceStyles(doc);
    ensureTrayStyles(doc);
    elements.diceEl.className = "hexdev-generala-tray";

    const faces = facesOf(turn);
    // ARE THE ELEMENTS THIS CLOSURE HOLDS STILL IN THIS CONTAINER? Asked of
    // the DOM rather than of a remembered container reference, because the
    // two are not the same question: comparing the container catches a
    // renderer mounted somewhere else and misses one whose container somebody
    // emptied under it, and in that second case every `replaceWith` below
    // would land on a detached node and the tray would silently draw nothing.
    // `board.ts`'s own `surface.parentElement !== container` asks it this way
    // for the same reason. Every other path keeps whatever it can.
    if (slots.length !== faces.length || slots[0]?.node.parentElement !== elements.diceEl) {
      slots = faces.map((face, index) => createDieSlot(doc, face, index, toggle));
      elements.diceEl.replaceChildren(...slots.map((slot) => slot.node));
      drawnFaces = faces;
      held.clear();
    } else {
      let anyChanged = false;
      for (const [index, face] of faces.entries()) {
        if (face === drawnFaces[index]) continue;
        const replacement = createDieSlot(doc, face, index, toggle);
        slots[index]!.node.replaceWith(replacement.node);
        slots[index] = replacement;
        anyChanged = true;
      }
      drawnFaces = faces;
      // A selection is about THESE faces. The moment any of them changes the
      // player is deciding again, so a mark left over from the previous throw
      // would be a hold nobody chose.
      if (anyChanged) held.clear();
    }

    const canHold = holdsIn(legalActions).length > 0;
    for (const [index, slot] of slots.entries()) {
      if (slot.button === null) continue;
      slot.button.disabled = !canHold;
      slot.button.setAttribute("aria-pressed", String(held.has(index)));
    }
  };

  return render;
}
