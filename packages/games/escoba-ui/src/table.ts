import { getCardArt } from "@hexdev/spanish-deck-ui";
import { cardId } from "@hexdev/escoba-engine";
import type { Card } from "@hexdev/escoba-engine";

/**
 * Static render of the face-up cards in the middle of an escoba table
 * (HandState.table). No interaction (mark-then-play lands in slice P) and
 * no team piles (slice O) -- this is only the shared face-up surface every
 * player sees identically.
 *
 * The table is escoba's central surface and, unlike truco's table, it
 * genuinely grows and shrinks during a hand, up to a structural ceiling of
 * 20 cards (escoba/invariante-de-paridad-de-la-mesa: the deck holds exactly
 * twenty even-valued cards, and an all-even table kills every even card
 * forever) -- reachable in real play, so the layout (table-styles.ts) must
 * hold at that count, not just at the common 3-8 card range.
 */
export function renderEscobaTable(container: HTMLElement, table: readonly Card[]): void {
  container.replaceChildren();
  container.className = "hexdev-escoba-table";

  for (const card of table) {
    const art = getCardArt(card);

    const el = document.createElement("div");
    el.className = "hexdev-escoba-card";
    el.dataset.card = cardId(card);

    const img = document.createElement("img");
    img.src = art.src;
    img.width = art.width;
    img.height = art.height;
    img.alt = art.alt;
    el.appendChild(img);

    container.appendChild(el);
  }
}
