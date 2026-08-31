import type { Chronometer } from "./chronometer.js";
import { mahjongMatchOverMessage } from "./match-over.js";
import type { MahjongOutcomeInfo } from "./match-over.js";

/**
 * THE PANEL THAT ENDS THE MATCH — the sentence, and the two ways out.
 *
 * Modelled on `escoba-ui/match-outcome.ts` deliberately and closely: same
 * dialog semantics, same `focusOnOpen` convention, same "`null` clears it"
 * contract, same two deliberately-different departure callbacks. This is the
 * shipped house idiom for exactly this screen, and inventing a second one for
 * a game that has no scoreboard would be a departure with nothing behind it.
 *
 * WHAT IT DOES NOT COPY IS THE SCORE LINE, because there is nothing to score.
 * A solitaire has one seat and two endings, and the whole message is the one
 * sentence `match-over.ts` builds. No invented headline sits above it: the
 * sentence IS the headline, and it carries the dialog's accessible name.
 */

/**
 * THE CHRONOMETER IS READ HERE AND NOWHERE ELSE ON THIS PATH.
 *
 * The panel renders exactly when the match is over, so this is the moment the
 * board was cleared — which is why `finish()` is called from here rather than
 * from a caller who would have to be told when to call it. The reading
 * freezes on that first call, so every later repaint of this panel shows the
 * same figure.
 *
 * `null` is a RESUMED match, and it is the whole honesty mechanism: see
 * `createChronometer`, which is where the decision is made and argued.
 */
export interface MahjongMatchOverViewProps {
  readonly outcome: MahjongOutcomeInfo;
  readonly chronometer: Chronometer | null;
  /** Deal another board. */
  readonly onPlayAgain?: () => void;
  /** Leave the table. A rematch and a return to the lobby are deliberately
   * NOT the same callback — the same distinction `escoba-ui` records.
   * Omitted: no leave button and no Escape handler. */
  readonly onLeaveMatch?: () => void;
  /** True only on the render that OPENS the panel; the caller tracks that
   * transition. Mirrors `truco-ui`'s and `escoba-ui`'s own convention. */
  readonly focusOnOpen?: boolean;
}

export const MATCH_OVER_STYLE_ID = "hexdev-mahjong-match-over-styles";

/**
 * The panel's own sheet — a string, because this package builds with plain
 * `tsc -b` and has no bundler to resolve a stylesheet import, exactly like
 * `board-styles.ts`.
 *
 * IT MEASURES NOTHING, same rule as the board: no container query is needed
 * because there is no geometry here, only a sentence and two buttons that lay
 * themselves out. `no-measurement.test.ts` scans this file too.
 */
export function buildMatchOverStylesheet(): string {
  return `
/* THE POSITIONED ANCESTOR THE PANEL HANGS OFF, and it belongs here for the
   same reason \`escoba-ui\`'s own overlay sheet declares its match wrapper:
   this is the first thing that needs to anchor an absolutely-positioned
   child over that box, so this is where the rule that makes it possible
   goes. The class is the one \`apps/widget-app\`'s registry entry sets on the
   match container. */
.hexdev-mahjong-match {
  position: relative;
}

.hexdev-mahjong-match-over:empty {
  display: none;
}

.hexdev-mahjong-match-over {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  gap: 1rem;
  padding: 1.5rem;
  text-align: center;
  /* THE SAME TOKENS THE BOARD READS, and the prefix is the correction a
     person looking at this screen found. It was \`--hexdev-color-primary\`,
     which is not a token this product has: the accepted vocabulary is the
     CLOSED seven-name \`--gx-*\` set in \`widget-protocol/theme-tokens.ts\`,
     and every other surface in the repository reads it. So this panel could
     never take a tenant's theme, and on a tenant with a themed felt it would
     have painted a hardcoded green over a board of another colour. Nothing
     could see that: the panel had no scene until the slice that made it
     reachable.

     DARKENED AND OPAQUE, not translucent, so the board behind a DEADLOCK is
     covered rather than shown through. Considered and rejected: a scrim
     would keep the stuck board visible under its own verdict, which reads
     well — and would put white text over 144 arbitrary tile faces with no
     contrast fence anywhere in this package, in a repository that already
     keeps a whole contrast suite because of that exact defect class. The two
     endings also share one panel, and a cleared board has nothing left
     behind it, so opaque is the only treatment that looks the same both
     times. */
  background: color-mix(in srgb, var(--gx-color-primary, #1e5c43) 82%, black);
  color: var(--gx-color-on-primary, #f8fafc);
  /* Every other screen in this product is set in the tenant's own face, or
     in the system sans underneath it. This panel is a SIBLING of the board
     rather than a child, so it inherited nothing from
     \`.hexdev-mahjong-board\` and came out in the browser's default SERIF —
     the only serif in the product, on the one screen that is made entirely
     of words. Found by looking. */
  font-family: var(--gx-font-family, system-ui, sans-serif);
}

.hexdev-mahjong-match-over-message {
  margin: 0;
  /* THE SENTENCE IS THE HEADLINE — there is no other heading on this screen,
     because a solitaire has no score line to put above it. At 1.25rem it sat
     in the middle of an empty felt looking like a caption for something that
     was not there. \`escoba-ui\`'s own headline is 1.5rem/800 and it has a
     score line under it; this one carries the whole ending on its own. */
  font-size: 1.5rem;
  font-weight: 700;
  /* A sentence, not a slogan: it wraps rather than shrinking the board's
     felt out from under it. */
  max-inline-size: 28ch;
  text-wrap: balance;
}

.hexdev-mahjong-match-over-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: center;
}

.hexdev-mahjong-match-over-actions button {
  font: inherit;
  padding: 0.5rem 1.25rem;
  border-radius: 0.5rem;
  border: 1px solid currentColor;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
`;
}

export function ensureMatchOverStyles(doc: Document): void {
  if (doc.getElementById(MATCH_OVER_STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = MATCH_OVER_STYLE_ID;
  style.textContent = buildMatchOverStylesheet();
  doc.head.appendChild(style);
}

/**
 * Draw the ending, or clear it with `null`.
 *
 * `null` leaves an empty element rather than removing it, and the sheet's
 * `:empty { display: none }` is what makes that invisible — the board beneath
 * stays exactly where it was, never a blank replace. Same arrangement escoba's
 * overlay already uses.
 */
export function renderMahjongMatchOver(container: HTMLElement, props: MahjongMatchOverViewProps | null): void {
  const doc = container.ownerDocument;
  ensureMatchOverStyles(doc);
  container.replaceChildren();
  container.className = "hexdev-mahjong-match-over";
  container.onkeydown = null;

  if (props === null) {
    container.removeAttribute("role");
    container.removeAttribute("aria-modal");
    container.removeAttribute("aria-label");
    container.removeAttribute("tabindex");
    delete container.dataset.result;
    return;
  }

  const cleared = props.outcome.winnerIds.length > 0;
  container.dataset.result = cleared ? "cleared" : "deadlocked";
  container.setAttribute("role", "dialog");
  container.setAttribute("aria-modal", "true");
  container.tabIndex = -1;

  const message = doc.createElement("h2");
  message.className = "hexdev-mahjong-match-over-message";
  // The chronometer is read exactly once per ending, right here. A deadlock
  // is handed the same reading and refuses it — `mahjongMatchOverMessage`
  // owns that rule, and owns it as "ignore the argument" rather than trusting
  // this line not to supply one.
  const sentence = mahjongMatchOverMessage({ outcome: props.outcome, elapsedMs: props.chronometer?.finish() ?? null });
  message.textContent = sentence;
  container.appendChild(message);

  // THE DIALOG'S NAME IS THE SENTENCE ITSELF, set as `aria-label` rather than
  // pointed at the heading with `aria-labelledby`. An id would have to be
  // unique in a document this package does not own, and there is nothing else
  // here a name could come from — no title, no score, no invented headline.
  container.setAttribute("aria-label", sentence);

  const actions = doc.createElement("div");
  actions.className = "hexdev-mahjong-match-over-actions";

  if (props.onPlayAgain !== undefined) {
    const again = doc.createElement("button");
    again.type = "button";
    again.dataset.action = "play-again";
    again.textContent = "Otro tablero";
    again.addEventListener("click", props.onPlayAgain);
    actions.appendChild(again);
  }

  if (props.onLeaveMatch !== undefined) {
    const leave = doc.createElement("button");
    leave.type = "button";
    leave.dataset.action = "leave-match";
    leave.textContent = "Volver al lobby";
    leave.addEventListener("click", props.onLeaveMatch);
    actions.appendChild(leave);

    // Escape IS the way out — there is nothing left to cancel back to.
    container.onkeydown = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      props.onLeaveMatch?.();
    };
  }

  container.appendChild(actions);

  if (props.focusOnOpen === true) container.focus();
}
