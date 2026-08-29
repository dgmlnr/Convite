import { afterEach, describe, expect, it } from "vitest";
import type { Card } from "@hexdev/escoba-engine";
import { buildDeck, cardValue } from "@hexdev/escoba-engine";
import { renderEscobaTable } from "./table.js";
import { ensureTableStyles, TABLE_STYLE_ID } from "./table-styles.js";

let container: HTMLElement;

afterEach(() => {
  container.remove();
  document.getElementById(TABLE_STYLE_ID)?.remove();
});

function freshContainer(widthPx: number): HTMLElement {
  container = document.createElement("div");
  container.style.width = `${widthPx}px`;
  document.body.appendChild(container);
  return container;
}

// escoba/invariante-de-paridad-de-la-mesa: a table made entirely of
// even-VALUE cards (2,4,6,8,10 — sota=8, rey=10) never releases any of them,
// because 15 minus an even value is always odd and therefore unreachable by
// any subset sum of an all-even table. It saturates at exactly 20 cards —
// the deck's own count of even-valued cards — which is the real structural
// ceiling this design settled on (design §M1), not a hypothetical.
function twentyEvenCards(): readonly Card[] {
  return buildDeck().filter((card) => cardValue(card) % 2 === 0);
}

describe("renderEscobaTable (spec: escoba-table-ui, static render)", () => {
  it("renders nothing when the table is empty", () => {
    const el = freshContainer(400);

    renderEscobaTable(el, []);

    expect(el.children).toHaveLength(0);
  });

  it("renders every card of a given HandState.table, in order, with real card art", () => {
    const el = freshContainer(400);
    const table: readonly Card[] = [
      { suit: "oro", rank: 5 },
      { suit: "espada", rank: 3 },
      { suit: "copa", rank: 7 },
      { suit: "basto", rank: 10 },
    ];

    renderEscobaTable(el, table);

    const cards = [...el.querySelectorAll<HTMLElement>("[data-card]")];
    expect(cards.map((c) => c.dataset.card)).toEqual(["5-oro", "3-espada", "7-copa", "10-basto"]);
    expect(cards[0]!.querySelector("img")?.src).toContain("5-oro.webp");
  });

  it("holds a 20-card table — the structural ceiling — with every card inside the container and no horizontal overflow", () => {
    ensureTableStyles(document);
    const el = freshContainer(360); // a narrow, realistic embed width
    const table = twentyEvenCards();
    expect(table).toHaveLength(20);

    renderEscobaTable(el, table);

    const cards = [...el.querySelectorAll<HTMLElement>("[data-card]")];
    expect(cards).toHaveLength(20);

    const containerRect = el.getBoundingClientRect();
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      expect(rect.left).toBeGreaterThanOrEqual(containerRect.left - 0.5);
      expect(rect.right).toBeLessThanOrEqual(containerRect.right + 0.5);
    }
    // The cards wrapped onto more rows instead of spilling past the right
    // edge — a fixed-column layout sized for the common 3-8 card case is
    // exactly the failure mode this asserts against.
    expect(el.scrollWidth).toBeLessThanOrEqual(el.clientWidth + 1);
  });
});
