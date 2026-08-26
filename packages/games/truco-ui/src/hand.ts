import { cardId } from "@hexdev/truco-engine";
import type { Action, Card } from "@hexdev/truco-engine";
import { getCardArt } from "@hexdev/spanish-deck-ui";
import { TABLE_STRINGS } from "./strings.js";

export interface HandCallbacks {
  onPlayCard(card: Card): void;
}

/** A card is playable exactly when the engine's own `getLegalActions`
 * offered a matching `play-card` action — this is the ONLY legality check in
 * this file; nothing about turn order, pending calls, or hand ownership is
 * re-derived here (architectural rule: legality comes from the engine). */
function isPlayable(card: Card, legalActions: readonly Action[]): boolean {
  return legalActions.some((action) => action.type === "play-card" && cardId(action.card) === cardId(card));
}

/**
 * Renders the LOCAL player's own hand with the real card art
 * (`@hexdev/spanish-deck-ui`). A playable card is a real `<button>` — it
 * genuinely invites a tap; an unplayable one is a plain element with no click
 * handler at all, so it never looks tappable and never reacts to a tap (spec:
 * "unplayable ones must not invite a tap").
 *
 * HOW EACH ONE ANNOUNCES ITSELF (WCAG 4.1.2). A playable card is a button
 * whose accessible name is the image it contains — the card's own Spanish name
 * and nothing else, because "botón" already says it can be pressed.
 *
 * The locked one used to carry `aria-disabled="true"`, which is inert on a
 * `div`: that attribute qualifies an INTERACTIVE role, and this element has
 * none, so it was never announced. Removing it alone would have left the two
 * cards distinguishable only by "imagen" vs "botón" — a game rule inferred
 * from an ARIA role. So the state is said instead: `role="img"` plus a label
 * naming the card AND its condition. The role is what makes that honest —
 * `img` is a leaf, so the card is ONE named object rather than an unnamed box
 * around a picture, which is also why the inner `alt` is emptied here and only
 * here (two names for one thing is the failure this replaces, not a second
 * safety net).
 */
export function renderHand(container: HTMLElement, hand: readonly Card[], legalActions: readonly Action[], callbacks: HandCallbacks): void {
  container.replaceChildren();
  container.className = "hexdev-truco-hand";

  for (const card of hand) {
    const playable = isPlayable(card, legalActions);
    const art = getCardArt(card);

    const el = document.createElement(playable ? "button" : "div");
    el.className = playable ? "hexdev-truco-card hexdev-truco-card--playable" : "hexdev-truco-card hexdev-truco-card--locked";
    el.dataset.card = cardId(card);
    el.dataset.playable = String(playable);
    if (playable) {
      (el as HTMLButtonElement).type = "button";
      el.addEventListener("click", () => callbacks.onPlayCard(card));
    } else {
      el.setAttribute("role", "img");
      el.setAttribute("aria-label", TABLE_STRINGS.lockedCard(art.alt));
    }

    const img = document.createElement("img");
    img.src = art.src;
    img.width = art.width;
    img.height = art.height;
    img.alt = playable ? art.alt : "";
    el.appendChild(img);

    container.appendChild(el);
  }
}
