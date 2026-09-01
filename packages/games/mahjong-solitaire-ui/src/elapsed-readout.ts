import type { Chronometer } from "./chronometer.js";
import { formatElapsed } from "./chronometer.js";

/**
 * THE CLOCK THE PLAYER WATCHES, as a value and then as an element that keeps
 * saying it.
 *
 * The chronometer was built to measure and to be read ONCE, at the end
 * (`chronometer.ts`: "It exists so that a player who has just cleared a
 * turtle can be told how long they took"). Asked for a figure visible during
 * play, the measuring stays exactly as it was — same closure, same clock,
 * same refusal on a resumed match — and what is added is a second face for
 * it. Nothing here decides anything about time; `elapsed()` does.
 *
 * THE RULE AND THE DOM ARE SPLIT, the same way `match-over.ts` and
 * `match-over-view.ts` are: `elapsedReadoutText` is arithmetic over two
 * numbers and can be fenced at exact values in the node suite, while the
 * ticking below can only be watched in a browser.
 */

/**
 * What the readout says right now, or `null` when it must not say anything.
 *
 * `null` IS THE RESUMED MATCH, propagated rather than re-decided. A caller
 * holding no chronometer is a caller who was refused a figure on purpose, and
 * the refusal has to survive this hop or the live readout becomes the honest
 * mechanism's way out: the panel would stay silent at the end while the felt
 * had been showing time-since-reload for the whole match.
 */
export function elapsedReadoutText(chronometer: Chronometer | null): string | null {
  return chronometer === null ? null : formatElapsed(chronometer.elapsed());
}

export const ELAPSED_READOUT_CLASS = "hexdev-mahjong-elapsed";
export const ELAPSED_READOUT_STYLE_ID = "hexdev-mahjong-elapsed-styles";

/**
 * Its own sheet, owned by the module that draws it — the arrangement
 * `match-over-view.ts` already uses next door, rather than a rule filed under
 * the board's sheet for an element that is the board's SIBLING.
 *
 * IT HANGS OFF `.hexdev-mahjong-match`, which the composition root already
 * declares `position: relative` for the completion panel. Absolutely placed
 * so the felt's own grid never has to make room for it: a readout in flow
 * would take height from the turtle, and the turtle's height is a budget
 * three other files compute.
 *
 * `pointer-events: none` BECAUSE IT COVERS TILES. It sits over a corner of a
 * board where every pixel is a hit target, and a clock that swallowed a press
 * would make the tiles under it quietly unplayable — the exact class of
 * silent defect this game has already produced once.
 *
 * TABULAR FIGURES so the reading does not jitter: proportional digits change
 * the string's width every time a 1 comes or goes, and a number that twitches
 * once a second in the corner of the eye is worse than no number.
 */
export function buildElapsedReadoutStylesheet(): string {
  return `
.${ELAPSED_READOUT_CLASS} {
  position: absolute;
  top: 0;
  right: 0;
  margin: 0.75rem;
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
  pointer-events: none;
  font-family: var(--gx-font-family, system-ui, sans-serif);
  font-size: 0.95rem;
  font-variant-numeric: tabular-nums;
  /* Bone on a dark wash, the same two colours the tiles and the felt already
     use, so the readout reads as part of the table rather than as chrome
     dropped on top of it. */
  color: #f4efe2;
  background: rgba(0, 0, 0, 0.28);
}
`;
}

/** Injects the sheet at most once per document — the same idempotence every
 * other `ensure*Styles` in this repo has. */
export function ensureElapsedReadoutStyles(doc: Document): void {
  if (doc.getElementById(ELAPSED_READOUT_STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = ELAPSED_READOUT_STYLE_ID;
  style.textContent = buildElapsedReadoutStylesheet();
  doc.head.appendChild(style);
}

/** Paints one reading. Idempotent, and it writes nothing when there is nothing
 * to say — an element left empty rather than an element carrying a stale
 * figure, because the second is what a resumed match would look like if this
 * ever ran for one. */
export function renderElapsedReadout(element: HTMLElement, chronometer: Chronometer | null): void {
  const text = elapsedReadoutText(chronometer);
  element.className = ELAPSED_READOUT_CLASS;
  element.hidden = text === null;
  element.textContent = text ?? "";
}

/** How the ticking is driven, injected so a fence can step it by hand instead
 * of waiting out real seconds. */
export interface ElapsedReadoutTicker {
  readonly start: (tick: () => void) => number;
  readonly stop: (handle: number) => void;
}

/**
 * The window's own timer, named here so the call site reads as a choice.
 *
 * ONE SECOND, because the readout is `m:ss` and a faster tick would repaint
 * the same string. It is not a countdown anybody acts on: nothing in this
 * game is refused because of the clock, so a reading that lands up to a
 * second late costs nothing at all.
 */
export function windowTicker(win: Window): ElapsedReadoutTicker {
  return {
    start: (tick) => win.setInterval(tick, 1000),
    stop: (handle) => {
      win.clearInterval(handle);
    },
  };
}

/**
 * Keep an element saying the time until it leaves the document.
 *
 * IT STOPS ITSELF, and that is not a nicety — it is the only arrangement this
 * contract allows. `GameUiEntry`'s renderer is
 * `(container, payload, dispatch, ...) => void` with NO teardown hook: there
 * is no callback fired when a match ends, when the player leaves, or when the
 * shell replaces the container, so an interval started here has nobody to
 * come back and clear it. Rather than widen a contract every game implements
 * for the sake of one game's clock, the ticker asks the one question that is
 * always answerable — is my element still in the document — and ends when the
 * answer is no. A board that was torn down cannot leave a timer behind,
 * whatever the caller forgot.
 *
 * THE STOP HANDLE IS RETURNED ANYWAY, for a caller that knows sooner than the
 * DOM does. It is a convenience and never the mechanism; a caller that drops
 * it is still safe, which is the property worth having.
 *
 * IT PAINTS BEFORE IT SCHEDULES, so the readout has its first figure at mount
 * instead of one tick later. With no chronometer it paints the empty state and
 * schedules NOTHING — a resumed match has no clock to run, so it must not
 * hold a timer either.
 */
export function startElapsedReadout(element: HTMLElement, chronometer: Chronometer | null, ticker: ElapsedReadoutTicker): () => void {
  renderElapsedReadout(element, chronometer);
  if (chronometer === null) return () => undefined;

  let stopped = false;
  const handle = ticker.start(() => {
    if (stopped) return;
    if (!element.isConnected) {
      stopped = true;
      ticker.stop(handle);
      return;
    }
    renderElapsedReadout(element, chronometer);
  });

  return () => {
    if (stopped) return;
    stopped = true;
    ticker.stop(handle);
  };
}
