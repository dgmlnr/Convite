import { cardId } from "@hexdev/truco-engine";
import type { Action, Card } from "@hexdev/truco-engine";
import { getCardArt } from "@hexdev/spanish-deck-ui";

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
 * Renders the LOCAL player's own hand with the real Fournier 1878 art
 * (`@hexdev/spanish-deck-ui`). A playable card is a real `<button>` — it
 * genuinely invites a tap; an unplayable one is a plain, `aria-disabled`
 * element with no click handler at all, so it never looks tappable and never
 * reacts to a tap (spec: "unplayable ones must not invite a tap").
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
    if (!playable) el.setAttribute("aria-disabled", "true");
    if (playable) {
      (el as HTMLButtonElement).type = "button";
      el.addEventListener("click", () => callbacks.onPlayCard(card));
    }

    const img = document.createElement("img");
    img.src = art.src;
    img.width = art.width;
    img.height = art.height;
    img.alt = art.alt;
    el.appendChild(img);

    container.appendChild(el);
  }
}
