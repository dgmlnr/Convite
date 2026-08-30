import { page } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import type { Card } from "@hexdev/escoba-engine";
import { buildDeck, cardValue } from "@hexdev/escoba-engine";
import { renderEscobaTable } from "./table.js";
import { ensureTableStyles, TABLE_STYLE_ID } from "./table-styles.js";

let container: HTMLElement;

afterEach(async () => {
  container.remove();
  document.getElementById(TABLE_STYLE_ID)?.remove();
  document.documentElement.removeAttribute("data-hexdev-layout");
  await page.viewport(414, 896); // visual/README.md's own default
});

/**
 * A TABLE UNDER A FELT, which is the only place a table ever is.
 *
 * This used to mount the table bare on the body, at an explicit width, and
 * that was convenient rather than faithful: `game-ui-registry.ts` has always
 * appended it inside `.hexdev-escoba-felt`. It stopped being merely unfaithful
 * when `table-styles.ts` moved its container-query root up to the felt so the
 * hand could be tiered too — a bare table now has nothing to ask, so it draws
 * at the untiered default whatever width it is given, and the width tiers this
 * file exercises would have quietly stopped being exercised at all.
 *
 * So the felt is the box with the width on it, and the table is its child at
 * `width: 100%`. NOTHING BELOW IS WEAKENED BY IT: the 20-card assertion still
 * measures the table's own rect against its own cards and still demands no
 * horizontal overflow — it just does so at the size the real screen picks.
 */
function freshTable(widthPx: number): HTMLElement {
  container = document.createElement("div");
  container.className = "hexdev-escoba-felt";
  container.style.width = `${widthPx}px`;
  document.body.appendChild(container);
  const tableEl = document.createElement("div");
  container.appendChild(tableEl);
  return tableEl;
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
    const el = freshTable(400);

    renderEscobaTable(el, []);

    expect(el.children).toHaveLength(0);
  });

  it("renders every card of a given HandState.table, in order, with real card art", () => {
    const el = freshTable(400);
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
    const el = freshTable(360); // a narrow, realistic embed width
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

/**
 * A CARD IS THE SHAPE OF A CARD, at every width and in every mode.
 *
 * NOTHING IN THIS REPO LOOKED AT PROPORTION. Every geometry fence escoba has
 * measures where a box IS — inside its container, above the fold, not wrapped
 * onto a second row — and a squashed card passes all of them. The one thing
 * that makes an image of a baraja read as a baraja is the only property
 * nobody was asserting.
 *
 * WHY IT WAS WORTH SUSPECTING RATHER THAN MERELY COVERING. `getCardArt`
 * stamps width="220" height="336" on every img while the WebP behind it is
 * 329x520 — 0.6548 against 0.6327, 3.5% apart — so the browser lays a card
 * out at one shape and repaints it at another the moment its bytes decode.
 * That is also 3.5% the fullscreen height budget spends on a row it has not
 * measured yet. `table-styles.ts` now declares the art's real ratio on the
 * img, which is what this asserts.
 *
 * THE RATIO IS THE IMG'S, NOT THE CARD BOX'S, and the distinction is load-
 * bearing: a markable card is a <button> carrying a 2px dashed border, so its
 * BOX is honestly 4px wider and taller than the art inside it (0.6488 rather
 * than 0.6327 at the landscape tier — measured, not distortion). The card
 * being drawn is the img.
 *
 * FULLSCREEN IS IN HERE because that is the only mode where a HEIGHT budget
 * constrains anything, and therefore the only mode where an ancestor could
 * ever squash an img instead of shrinking it.
 */
describe("a card keeps the art's own proportions (spec: escoba-table-ui)", () => {
  /** The forty fronts in `spanish-deck-ui/assets/fronts` are every one of them
   * 329x520 — measured, all forty. Not `CARD_WIDTH / CARD_HEIGHT`, which is
   * the deck's LOGICAL box and the very number this fence exists to catch a
   * layout for. */
  const ART_RATIO = 329 / 520;

  const THREE_CARDS: readonly Card[] = [
    { suit: "oro", rank: 7 },
    { suit: "copa", rank: 3 },
    { suit: "espada", rank: 12 },
  ];

  async function ratios(el: HTMLElement): Promise<readonly number[]> {
    const images = [...el.querySelectorAll("img")];
    await Promise.all(images.map((img) => img.decode()));
    return images.map((img) => {
      const rect = img.getBoundingClientRect();
      return rect.width / rect.height;
    });
  }

  // One width per tier the sheet actually declares — under 400, the 400-640
  // band, and past 640 — so a tier that quietly stopped preserving the ratio
  // has a row of its own to fail in.
  it.each([360, 500, 828])("inline at %ipx of felt: every card is drawn at the art's ratio", async (width) => {
    ensureTableStyles(document);
    const el = freshTable(width);

    renderEscobaTable(el, THREE_CARDS);

    const measured = await ratios(el);
    expect(measured).toHaveLength(THREE_CARDS.length);
    for (const ratio of measured) expect(ratio).toBeCloseTo(ART_RATIO, 3);
  });

  it("fullscreen on a rotated phone, where a height budget is the thing sizing the card", async () => {
    await page.viewport(844, 390);
    document.documentElement.setAttribute("data-hexdev-layout", "fullscreen");
    ensureTableStyles(document);
    const el = freshTable(676); // the felt's own width beside the 168px rail

    renderEscobaTable(el, THREE_CARDS);

    const measured = await ratios(el);
    expect(measured).toHaveLength(THREE_CARDS.length);
    for (const ratio of measured) expect(ratio).toBeCloseTo(ART_RATIO, 3);
  });

  /**
   * THE SHIFT ITSELF, and it is the half a ratio assertion cannot see: an img
   * that only ever gets its shape from a decoded bitmap is the right shape
   * once the bitmap is there and the WRONG one for every frame before it.
   * `aspect-ratio` is what makes the two the same, so this reads the computed
   * value rather than waiting for a load nobody controls the timing of.
   */
  it("declares that ratio rather than waiting for the bytes to supply it", () => {
    ensureTableStyles(document);
    const el = freshTable(500);

    renderEscobaTable(el, THREE_CARDS);

    const img = el.querySelector("img");
    expect(img).not.toBeNull();
    // Chromium serialises the resolved ratio with spaces around the slash.
    expect(getComputedStyle(img!).aspectRatio.replace(/\s+/gu, "")).toBe("329/520");
  });
});
