import { CUP_ART_HEIGHT, CUP_ART_WIDTH, getCupArtUrl } from "./art.js";

/**
 * The three things a cubilete can be doing, and there is no fourth.
 *
 * NOT A VERB A CALLER CALLS — `shake()`, `tip()` — but a STATE it declares.
 * The difference is the whole design. A verb owns a clock: it has to decide
 * when the shaking stops, which means this package would have to know that a
 * roll is coming, how long the server takes, and what happens if it never
 * comes. A state owns nothing: the board says what is true right now, and
 * the stylesheet draws it. When the truth changes the drawing changes, and a
 * throw that never arrives leaves a cup that never stops shaking — which is
 * exactly the honest picture of a table that is still waiting.
 *
 * IT IS ALSO WHY THIS PACKAGE STILL LEARNS NO RULES. "Shaking" is not
 * `awaiting-roll` and "tipping" is not `deciding`: they are what a cubilete
 * looks like, and the mapping from a turn's phase onto one of them lives in
 * whoever owns the turn. `generala-ui` reads its own engine's phase and picks
 * one of these three; a different game with different phases would pick from
 * the same three, and this file would not change.
 */
export type CupGesture = "still" | "shaking" | "tipping";

/**
 * Where the gesture is written. Exported because the stylesheet, the setter
 * and every test that reads one back must all name the same attribute, and a
 * fourth hand-typed copy of the string is how those quietly stop being the
 * same attribute.
 */
export const CUP_GESTURE_ATTRIBUTE = "data-cup-gesture";

/**
 * The cubilete as a thing standing on a table, ready to be gestured at.
 *
 * MOUNTED WITH A GESTURE ALREADY WRITTEN — `still`, from the first frame the
 * browser can paint. The reasoning is `die.ts`'s, whose whole contract is
 * that a die's decided pose is on the element BEFORE anything appends it:
 * nothing here should ever be corrected after the fact, so there is no
 * instant at which this element exists without an answer to "what is the cup
 * doing".
 *
 * `aria-hidden`, AND THAT IS NOT A SHRUG. A cubilete going through a throw is
 * real information, and it is information a board's live region is already
 * obliged to say in words — `generala-ui`'s tray states it plainly for the
 * empty slots beside this ("the dice are in the cup" is the announcer's
 * sentence to say). A decorative image announcing the same fact a second
 * time in a different vocabulary is not double coverage, it is a screen
 * reader saying everything twice.
 *
 * NO `ensureDiceStyles` CALL, matching `createDieSceneElement` rather than
 * `createDiceCup`: a piece factory hands back an element and the mounter
 * ensures the sheet, while the thing that builds a whole mounted fragment
 * does it itself. `generala-ui/tray.ts` already ensures on every render, so
 * the real consumer is covered by its own first line.
 */
export function createCupElement(doc: Document): HTMLElement {
  const cup = doc.createElement("div");
  cup.className = "hexdev-dice-cup-piece";
  cup.setAttribute("aria-hidden", "true");
  cup.setAttribute(CUP_GESTURE_ATTRIBUTE, "still" satisfies CupGesture);

  const art = doc.createElement("img");
  art.src = getCupArtUrl().href;
  art.width = CUP_ART_WIDTH;
  art.height = CUP_ART_HEIGHT;
  art.alt = "";
  cup.appendChild(art);
  return cup;
}

/**
 * Declares what the cubilete is doing now.
 *
 * SAFE TO CALL ON EVERY RENDER, and that is a property of this function
 * rather than of the browser. A board redraws its tray on every broadcast AND
 * on every die a player presses, so this is called far more often than the
 * gesture actually changes. Writing an unchanged attribute would in fact not
 * restart a CSS animation — a running animation restarts only when its
 * computed `animation-name` list changes — but that is a rule about browsers
 * that a caller would have to know and trust. Not writing is a rule about
 * this function, which a caller can read.
 *
 * WHICH MEANS A GESTURE PLAYS EXACTLY ONCE PER TRANSITION INTO IT. `tipping`
 * is a one-shot keyframe: it runs when the attribute changes to it and never
 * again until something else has been true in between. That is the correct
 * behaviour and also the honest limitation — two throws with no waiting state
 * observed between them would tip the cup once. A board never produces that
 * (a turn cannot reach a second roll without passing through waiting for it),
 * and if a dropped broadcast ever did, the failure is a gesture that does not
 * play rather than one that plays wrong.
 */
export function setCupGesture(cup: HTMLElement, gesture: CupGesture): void {
  if (cup.getAttribute(CUP_GESTURE_ATTRIBUTE) === gesture) return;
  cup.setAttribute(CUP_GESTURE_ATTRIBUTE, gesture);
}
