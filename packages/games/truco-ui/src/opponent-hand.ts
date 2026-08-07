import { cardBackSvg } from "@hexdev/spanish-deck-ui";

/**
 * Renders an opponent's (or teammate's) hand as `cardsRemaining` face-down
 * backs — the ONLY thing `PlayerView.opponents`/`teammates` ever expose about
 * another player's hand (spec: "Per-Player View Redaction"). The back is the
 * tenant-themeable surface (obs 2955): it is always on screen, which is
 * exactly why it — never the front — carries the tenant's brand.
 */
export function renderOpponentHand(container: HTMLElement, cardsRemaining: number): void {
  container.replaceChildren();
  container.className = "hexdev-truco-opponent-hand";
  for (let i = 0; i < cardsRemaining; i += 1) {
    const back = document.createElement("div");
    back.className = "hexdev-truco-card hexdev-truco-card-back";
    back.dataset.cardBack = String(i);
    back.innerHTML = cardBackSvg();
    container.appendChild(back);
  }
}
