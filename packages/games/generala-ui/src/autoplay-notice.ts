import type { CategoryId } from "@hexdev/generala-engine";

import { AUTOPLAY_SLOT_CLASS, ensureAutoplayNoticeStyles } from "./autoplay-notice-styles.js";
import { CATEGORY_LABELS } from "./scorecard.js";

/**
 * A box THIS seat's card grew without this seat pressing anything.
 *
 * There is exactly one thing in this game that writes into somebody's card
 * without their press, and it is the server's turn timer: `onTurnExpired` runs
 * one bot action for the seat that ran out of time. The seat is deliberately
 * NOT handed over — `MatchRoom` records the difference between this and a
 * disconnect in so many words — so the next turn is theirs again, with a fresh
 * clock.
 */
export interface GeneralaAutoplay {
  readonly category: CategoryId;
  readonly value: number;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** A clock face, because what happened is about time and nothing else. Drawn
 * rather than written for the reasons the planilla's own marks are: a glyph
 * would be the platform's artwork at the platform's size, and a path takes its
 * ink from CSS where a contrast fence can read it. `aria-hidden`, because the
 * sentence beside it already says the whole thing. */
const CLOCK_STROKES: readonly string[] = ["M8 2.6a5.4 5.4 0 1 0 0 10.8 5.4 5.4 0 0 0 0-10.8z", "M8 5.2 L8 8 L10.2 9.4"];

function makeClockMark(doc: Document): SVGElement {
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", "hexdev-generala-autoplay-mark");
  for (const outline of CLOCK_STROKES) {
    const stroke = doc.createElementNS(SVG_NS, "path");
    stroke.setAttribute("d", outline);
    svg.appendChild(stroke);
  }
  return svg;
}

/**
 * WHAT HAPPENED, WHY, AND THE PART THAT IS EASY TO GET WRONG.
 *
 * The box is named the way the planilla names it — `CATEGORY_LABELS`, shared —
 * and the value is said out loud, for the same reason the region says a zero
 * out loud: a category spent for nothing is the most consequential thing that
 * can be on a card.
 *
 * THE SECOND SENTENCE IS NOT REASSURANCE PADDING. A player who comes back to a
 * box they did not choose has no way to tell "the timer played one turn for
 * me" from "I was replaced by a bot", and those are different games. The
 * transport answers it —`onTurnExpired` resolves ONE turn and leaves the
 * controller alone, unlike `takeOverSeat` — and this is the only place that
 * answer reaches the person it is about.
 */
function autoplaySentence(autoplay: GeneralaAutoplay): string {
  return `Se acabó tu tiempo: el bot anotó ${String(autoplay.value)} en ${CATEGORY_LABELS[autoplay.category]} por vos. El asiento sigue siendo tuyo y el próximo turno vuelve con reloj nuevo.`;
}

/**
 * THE BOX YOU DID NOT CHOOSE, EXPLAINED WHERE YOU CAN STILL READ IT.
 *
 * WHY THIS EXISTS BESIDE THE REGION RATHER THAN INSTEAD OF IT. The live region
 * already says this — `announcer.ts` amends its own sentence when a box was
 * autoplayed — and that is the right place for a player who cannot see the
 * card. It is the wrong place for the player this event actually happens to.
 * A region is TRANSIENT: the very next throw overwrites it, and it is spoken
 * at the moment it changes. This event's defining feature is that the player
 * WAS NOT LOOKING; by the time they look back, the sentence is gone. So the
 * notice stays on screen until they do something, and the two halves answer
 * two different people.
 *
 * IT IS NOT A LIVE REGION, and that is the whole reason both can exist. Two
 * regions announcing the same event queue up and read it twice; one region and
 * one persistent panel say it once and leave it readable. Assistive tech still
 * reaches this text by navigating to it, which is what a persistent panel is
 * FOR — it simply does not shout.
 *
 * A BOXED NOTE, NOT AN EDGE-RULED ONE, and the difference is deliberate: the
 * servida callout two elements up is a panel with a rule down its leading edge,
 * it appears once per turn for a whole match, and the two can be on screen at
 * the same time. Three states drawn identically is a defect this planilla has
 * already shipped once. The border on all four sides, the clock, and the words
 * are three separate ways to tell them apart, and none of them is a hue.
 *
 * `null` CLEARS IT, which is how the board takes it away the moment the player
 * acts.
 */
export function renderGeneralaAutoplayNotice(container: HTMLElement, autoplay: GeneralaAutoplay | null): void {
  const doc = container.ownerDocument;
  ensureAutoplayNoticeStyles(doc);

  // THE SLOT NAMES ITSELF, and it is not decoration. The board mounts this
  // container once and hands it `null` on nearly every render, so for most of
  // a match it is an EMPTY element in a `gap: 12px` column — which is 12px of
  // the phone's height spent on nothing, on every board where the timer never
  // fired. Found by looking: the whole card below it sat 12px lower than it
  // does on `main`, and no assertion in this repository can see a gap.
  //
  // Set here rather than by the board, the way `renderGeneralaScorecard` sets
  // its own container's class: the sheet that hides the empty slot and the
  // code that empties it are then one file, and a board cannot forget.
  container.className = AUTOPLAY_SLOT_CLASS;
  if (autoplay === null) {
    container.replaceChildren();
    return;
  }

  const note = doc.createElement("p");
  note.className = "hexdev-generala-autoplay";
  const words = doc.createElement("span");
  words.textContent = autoplaySentence(autoplay);
  note.append(makeClockMark(doc), words);
  container.replaceChildren(note);
}
