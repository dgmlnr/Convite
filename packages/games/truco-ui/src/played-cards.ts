import type { HandPlay } from "@hexdev/truco-engine";
import { getCardArt } from "@hexdev/spanish-deck-ui";
import type { TableAnchor } from "./seat-position.js";

/**
 * Renders every card played THIS HAND, per seat, oldest first (spec:
 * "Persistent Per-Seat Card Piles") — not only the trick in progress; the
 * caller (`table.ts`) is what decides the exact `plays` slice, this module
 * only lays out whatever it is given. Each card is placed at the anchor of
 * the seat that played it (spec: "positioned so it is obvious who played
 * what"). Played cards are PUBLIC once played — unlike an unplayed hand,
 * `getViewFor`'s own docstring calls this out explicitly — so this renders
 * the real front art, never a back.
 *
 * "Most recent on top" (spec) is DOM ORDER ALONE — later siblings paint
 * above earlier ones. No `z-index`: `plays` is already chronological, so the
 * walk below naturally appends children in the right paint order.
 */
export function renderPlayedCards(container: HTMLElement, plays: readonly HandPlay[], positions: ReadonlyMap<number, TableAnchor>): void {
  container.replaceChildren();
  container.className = "hexdev-truco-trick";

  // Per-seat pile depth, independent of the other seat's own count — a seat
  // that has played twice and one that has played once both count from 0.
  const pileCounts = new Map<number, number>();

  for (const play of plays) {
    const position = positions.get(play.seat) ?? "bottom";
    const art = getCardArt(play.card);
    const pileIndex = pileCounts.get(play.seat) ?? 0;
    pileCounts.set(play.seat, pileIndex + 1);

    const el = document.createElement("div");
    el.className = `hexdev-truco-card hexdev-truco-played hexdev-truco-played--${position}`;
    el.dataset.playedBySeat = String(play.seat);
    el.dataset.position = position;
    // `dataset.pileIndex` (tests) and the matching `--truco-pile-index`
    // custom property (table-styles.ts's CSS arithmetic) are the SAME
    // number, set once, so the two never drift out of sync. Index 0 always
    // multiplies out to a zero offset in the stylesheet — a single-card
    // trick stays byte-identical to before this change (table-mid-hand's
    // own visual baseline depends on exactly this).
    el.dataset.pileIndex = String(pileIndex);
    el.style.setProperty("--truco-pile-index", String(pileIndex));

    const img = document.createElement("img");
    img.src = art.src;
    img.width = art.width;
    img.height = art.height;
    img.alt = art.alt;
    el.appendChild(img);

    container.appendChild(el);
  }
}
