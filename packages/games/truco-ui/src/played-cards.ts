import type { HandPlay } from "@hexdev/truco-engine";
import { getCardArt } from "@hexdev/spanish-deck-ui";
import type { TableAnchor } from "./seat-position.js";

/**
 * Renders the trick currently in progress in the table's centre, each card
 * placed at the anchor of the seat that played it (spec: "positioned so it
 * is obvious who played what"). Played cards are PUBLIC once played — unlike
 * an unplayed hand, `getViewFor`'s own docstring calls this out explicitly —
 * so this renders the real front art, never a back.
 */
export function renderPlayedCards(container: HTMLElement, plays: readonly HandPlay[], positions: ReadonlyMap<number, TableAnchor>): void {
  container.replaceChildren();
  container.className = "hexdev-truco-trick";

  for (const play of plays) {
    const position = positions.get(play.seat) ?? "bottom";
    const art = getCardArt(play.card);

    const el = document.createElement("div");
    el.className = `hexdev-truco-card hexdev-truco-played hexdev-truco-played--${position}`;
    el.dataset.playedBySeat = String(play.seat);
    el.dataset.position = position;

    const img = document.createElement("img");
    img.src = art.src;
    img.width = art.width;
    img.height = art.height;
    img.alt = art.alt;
    el.appendChild(img);

    container.appendChild(el);
  }
}
