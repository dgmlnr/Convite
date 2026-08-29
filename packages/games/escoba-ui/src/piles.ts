import { getCardArt } from "@hexdev/spanish-deck-ui";
import { cardId } from "@hexdev/escoba-engine";
import type { Card, TeamId } from "@hexdev/escoba-engine";

/**
 * The slice of `PlayerView.teams` this component actually needs — just the
 * id, in the order the caller wants piles laid out. Accepting the wider
 * `{ id, score }` shape too (structural typing) is deliberate: a caller
 * already holding a real `PlayerView` passes `view.teams` straight through,
 * no mapping required.
 */
export interface TeamIdentity {
  readonly id: TeamId;
}

/**
 * Static render of every TEAM's own capture pile (`HandState.piles`/
 * `HandView.piles`, design §D2) — never a player's. Piles are keyed by
 * `TeamId` from the engine outward, so a 4-seat pair's two captured piles
 * are ALREADY one entry under the shared team id by the time this runs:
 * this component renders exactly `teams.length` piles, always 2 (one team
 * of one in the 2-seat game, one team of two in the 4-seat game — art. 5.1,
 * the regulation is written for the pairs game), with no seat-count branch
 * anywhere in it. The combined pile is a property of the DATA, not of this
 * renderer choosing to merge anything.
 *
 * Capture piles are PUBLIC (design §D2: "every card in a pile was face-up
 * on the table before it was captured"), so every card renders with real
 * art, mirroring `renderEscobaTable`'s own per-card element shape.
 */
export function renderEscobaPiles(container: HTMLElement, teams: readonly TeamIdentity[], piles: Readonly<Record<TeamId, readonly Card[]>>): void {
  container.replaceChildren();
  container.className = "hexdev-escoba-piles";

  for (const team of teams) {
    const cards = piles[team.id] ?? [];

    const pile = document.createElement("div");
    pile.className = "hexdev-escoba-pile";
    pile.dataset.team = team.id;
    pile.dataset.count = String(cards.length);

    for (const card of cards) {
      const art = getCardArt(card);

      const el = document.createElement("div");
      el.className = "hexdev-escoba-pile-card";
      el.dataset.card = cardId(card);

      const img = document.createElement("img");
      img.src = art.src;
      img.width = art.width;
      img.height = art.height;
      img.alt = art.alt;
      el.appendChild(img);

      pile.appendChild(el);
    }

    container.appendChild(pile);
  }
}
