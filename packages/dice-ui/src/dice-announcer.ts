/**
 * A screen-reader announcer for the roll's own result — mounted ONCE,
 * mutated afterward, the identical mechanism `truco-ui/announcer.ts` and
 * `apps/widget-app/status-view.ts` already use for the same reason: a live
 * region is announced because its CONTENT CHANGED while it sat in the
 * accessibility tree, and a region rebuilt alongside the dice on every roll
 * would announce nothing, however correct its `aria-live` attribute looks in
 * the DOM.
 *
 * REBUILT HERE RATHER THAN IMPORTED, on purpose: this package is L0
 * (`.dependency-cruiser.cjs`'s `l0-dice-ui-no-workspace-deps`) and must not
 * depend on `truco-ui` or any other workspace package to borrow ten lines of
 * DOM. What is shared across the three copies is the DISCIPLINE — POLITE,
 * ATOMIC, additions-only — not the module.
 *
 * THE RESULT IS GAME INFORMATION, NOT DECORATION
 * (`sdd/generala-props/explore` §4): a sighted player sees the toss unfold
 * over ~640ms; a screen-reader user must not be made to wait that long for
 * something a sighted player already watched happen. `dice.ts` calls
 * `announceRoll` the same instant it writes each die's resting pose —
 * before the toss animation is even added — never after it finishes.
 */
export function createDiceAnnouncer(doc: Document): HTMLElement {
  const announcer = doc.createElement("p");
  announcer.className = "hexdev-dice-announcer";
  announcer.setAttribute("aria-live", "polite");
  announcer.setAttribute("aria-atomic", "true");
  announcer.setAttribute("aria-relevant", "additions text");
  return announcer;
}

/**
 * "Tirada: 3, 5, 5, 2, 6" — plain language, not a pip count or a colour, so
 * the result is conveyed in text and not merely implied by how many circles
 * are on screen (the same reason `escoba-ui/scoreboard.ts`'s hand outcome
 * ships a spoken-sentence sibling beside its visual scoreboard).
 *
 * The equality guard is load-bearing, not an optimisation: a caller re-
 * announcing the identical roll (there is no reason to today, but nothing
 * here assumes there never will be) must not repeat the sentence to a
 * reader that treats every write as a change.
 */
export function announceRoll(announcer: HTMLElement, faces: readonly number[]): void {
  const message = `Tirada: ${faces.join(", ")}`;
  if (announcer.textContent === message) return;
  announcer.textContent = message;
}
