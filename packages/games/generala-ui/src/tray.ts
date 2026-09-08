import { ensureDiceStyles } from "@hexdev/dice-ui";
import { DICE_COUNT } from "@hexdev/generala-engine";
import type { DieFace, GeneralaAction, HoldAction, Turn } from "@hexdev/generala-engine";

import { createDieSlot } from "./die-button.js";
import type { DieSlot } from "./die-button.js";
import { ensureTrayStyles } from "./tray-styles.js";

/** Where the tray draws itself: the row of dice, and the control that throws
 * them. Two elements the caller mounts and keeps, never ones this renderer
 * creates — the same contract `escoba-ui`'s `MarkThenPlayElements` states, so
 * the board decides the layout and this file decides only what goes in it. */
export interface GeneralaTrayElements {
  readonly diceEl: HTMLElement;
  readonly rollEl: HTMLElement;
}

export type GeneralaTrayRender = (
  elements: GeneralaTrayElements,
  turn: Turn,
  legalActions: readonly GeneralaAction[],
  onHold: (action: HoldAction) => void,
) => void;

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

/** The offer whose `keep` is exactly this selection — the ONE action a press
 * may commit. Written the way `escoba-ui`'s `matchingAction` is and for the
 * identical reason: a selection matching no offer commits nothing, so this UI
 * cannot dispatch an action the engine would refuse. */
function matchingHold(holds: readonly HoldAction[], held: ReadonlySet<number>): HoldAction | undefined {
  return holds.find((hold) => hold.keep.length === held.size && hold.keep.every((index) => held.has(index)));
}

/** Keeping all five asks to re-roll nothing: it burns a throw and changes no
 * die, which is not a move at a real table either. The engine does not offer
 * it (`KEEP_SETS` is 31 and never 32), so the control says why instead of
 * offering a "Tirar 0 dados" nobody meant. */
const KEEPING_ALL_FIVE = "Guardar los cinco no es una tirada";

function rollLabel(throwing: number): string {
  if (throwing === DICE_COUNT) return `Tirar los ${String(DICE_COUNT)} dados`;
  return throwing === 1 ? "Tirar 1 dado" : `Tirar ${String(throwing)} dados`;
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
 * PRESSES ACCUMULATE HERE; EXACTLY ONE ACTION LEAVES. A per-die press toggles
 * a pending selection and dispatches nothing. The action union forces that
 * rather than a preference doing it: there is exactly one `hold` per roll and
 * applying it TRANSITIONS THE PHASE, so five presses cannot be five actions.
 * The "Tirar" control is what commits, and it commits the engine's own offer
 * OBJECT — never a `keep` array this file assembled. Since PR #257 the room
 * admits an action only if `sameAction` matches one the game offered, and it
 * walks arrays BY INDEX (`match-room.ts:220-232`): `[1, 0]` is not `[0, 1]`.
 * Dispatching the offer makes the canonical ascending order a fact instead of
 * a convention this file would have to remember.
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
  let roller: HTMLButtonElement | null = null;
  let current: { elements: GeneralaTrayElements; turn: Turn; legalActions: readonly GeneralaAction[]; onHold: (action: HoldAction) => void } | null = null;

  const redraw = (): void => {
    if (current !== null) render(current.elements, current.turn, current.legalActions, current.onHold);
  };

  const toggle = (index: number): void => {
    if (held.has(index)) held.delete(index);
    else held.add(index);
    redraw();
  };

  const throwThem = (): void => {
    if (current === null) return;
    const offer = matchingHold(holdsIn(current.legalActions), held);
    if (offer === undefined) return;
    // Cleared BEFORE the round trip, exactly as `mark-then-play.ts` clears its
    // marks: the dice the player just gave up must stop looking held the
    // instant they press, not whenever the server's next broadcast lands.
    held.clear();
    redraw();
    current.onHold(offer);
  };

  const render: GeneralaTrayRender = (elements, turn, legalActions, onHold) => {
    current = { elements, turn, legalActions, onHold };
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

    const holds = holdsIn(legalActions);
    for (const [index, slot] of slots.entries()) {
      if (slot.button === null) continue;
      slot.button.disabled = holds.length === 0;
      slot.button.setAttribute("aria-pressed", String(held.has(index)));
    }

    if (holds.length === 0) {
      // ABSENT, not disabled, and the asymmetry with the all-five case below
      // is the point. There the player is one press away from making it a
      // move again, so a greyed control is the truth. Here there is no throw
      // left to ask for at all, and an affordance for a move that does not
      // exist is worse than no affordance.
      elements.rollEl.replaceChildren();
      roller = null;
      return;
    }

    if (roller === null || roller.parentElement !== elements.rollEl) {
      roller = doc.createElement("button");
      roller.type = "button";
      roller.className = "hexdev-generala-roll";
      roller.addEventListener("click", throwThem);
      elements.rollEl.replaceChildren(roller);
    }
    const offer = matchingHold(holds, held);
    // Updated in place rather than rebuilt: a player who tabbed to this
    // control and then pressed a die would otherwise be dropped back onto the
    // body by the re-render their own press caused (WCAG 2.1.1/2.4.3, the
    // same defect `truco-ui`'s table renderer fences for by name).
    roller.disabled = offer === undefined;
    roller.textContent = offer === undefined ? KEEPING_ALL_FIVE : rollLabel(DICE_COUNT - held.size);
  };

  return render;
}
