import { cardBackSvg } from "@hexdev/spanish-deck-ui";
import { TABLE_STRINGS } from "./strings.js";

/**
 * Renders an opponent's (or teammate's) hand as `cardsRemaining` face-down
 * backs — the ONLY thing `PlayerView.opponents`/`teammates` ever expose about
 * another player's hand (spec: "Per-Player View Redaction"). The back is the
 * tenant-themeable surface (obs 2955): it is always on screen, which is
 * exactly why it — never the front — carries the tenant's brand.
 *
 * The count is also said in TEXT (WCAG 1.1.1): N decorative SVGs are a
 * picture of the number N, and a picture-only count reads as nothing at all.
 * Clip-rect hidden (the shared class, table-styles.ts) so it costs the
 * anchor's layout zero pixels, with the backs marked decorative — a back
 * carries no information the count does not already say, and it must NEVER
 * say more (the card identity is redacted engine-side; this module only ever
 * receives a number).
 */
export function renderOpponentHand(container: HTMLElement, cardsRemaining: number): void {
  container.replaceChildren();
  container.className = "hexdev-truco-opponent-hand";
  const count = document.createElement("span");
  count.className = "hexdev-truco-visually-hidden";
  count.dataset.cardCount = String(cardsRemaining);
  count.textContent = TABLE_STRINGS.cardsInHand(cardsRemaining);
  container.appendChild(count);
  for (let i = 0; i < cardsRemaining; i += 1) {
    const back = document.createElement("div");
    back.className = "hexdev-truco-card hexdev-truco-card-back";
    back.dataset.cardBack = String(i);
    back.setAttribute("aria-hidden", "true");
    back.innerHTML = cardBackSvg();
    container.appendChild(back);
  }
}
