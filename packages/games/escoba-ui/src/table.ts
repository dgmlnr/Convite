import { getCardArt } from "@hexdev/spanish-deck-ui";
import { cardId } from "@hexdev/escoba-engine";
import type { Card } from "@hexdev/escoba-engine";

/**
 * Slice P: a table card that appears in some legal capture becomes an
 * interactive TOGGLE — a real `<button aria-pressed>`, never a
 * `role="button"` div, so keyboard reach/activation is free (the same
 * reason `truco-ui/src/hand.ts` picks `<button>` for its playable cards).
 * Omitted entirely, this parameter changes NOTHING about slice N's render.
 */
export interface TableInteraction {
  readonly markableIds: ReadonlySet<string>;
  readonly markedIds: ReadonlySet<string>;
  onToggle(id: string): void;
}

/**
 * Render of the face-up cards in the middle of an escoba table
 * (HandState.table): STATIC by default (slice N), interactive when
 * `interaction` is supplied (slice P, `mark-then-play.ts`). No team piles
 * here (`piles.ts`, slice O). The table genuinely grows/shrinks up to a
 * structural ceiling of 20 cards (escoba/invariante-de-paridad-de-la-mesa),
 * so the layout (table-styles.ts) must hold at that count.
 */
export function renderEscobaTable(container: HTMLElement, table: readonly Card[], interaction?: TableInteraction): void {
  container.replaceChildren();
  container.className = "hexdev-escoba-table";

  for (const card of table) {
    const id = cardId(card);
    const art = getCardArt(card);
    const markable = interaction?.markableIds.has(id) ?? false;

    const el = document.createElement(markable ? "button" : "div");
    el.dataset.card = id;

    if (markable) {
      const marked = interaction!.markedIds.has(id);
      const button = el as HTMLButtonElement;
      button.type = "button";
      button.className = `hexdev-escoba-card hexdev-escoba-card--markable${marked ? " hexdev-escoba-card--marked" : ""}`;
      button.setAttribute("aria-pressed", String(marked));
      button.addEventListener("click", () => interaction!.onToggle(id));
    } else {
      el.className = "hexdev-escoba-card";
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
