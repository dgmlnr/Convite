import { afterEach, describe, expect, it } from "vitest";
import { ensureMatchstickDefs, renderCasita, renderGhostCasita, renderScoreboard } from "./scoreboard.js";
import { TABLE_STYLE_ID, ensureTableStyles } from "./table-styles.js";

let container: HTMLElement;

afterEach(() => {
  container.remove();
  document.getElementById("hexdev-truco-matchstick-defs")?.remove();
});

function freshContainer(): HTMLElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  return container;
}

describe("renderCasita — the matchstick 'casita' (approved prototype geometry, ported not redesigned)", () => {
  it("draws exactly `points` matchstick groups, up to 5 (4 sides + 1 diagonal)", () => {
    const el = freshContainer();
    el.innerHTML = renderCasita(3, 64);

    expect(el.querySelectorAll("svg > g > g")).toHaveLength(3);
  });

  it("draws all 5 pieces (the square plus its corner-to-corner diagonal) at 5 points", () => {
    const el = freshContainer();
    el.innerHTML = renderCasita(5, 64);

    expect(el.querySelectorAll("svg > g > g")).toHaveLength(5);
  });

  it("the stick stretches with size, but the head ellipse radii never change — scaling the whole match must not deform the head", () => {
    const small = freshContainer();
    small.innerHTML = renderCasita(1, 34);
    const big = document.createElement("div");
    document.body.appendChild(big);
    big.innerHTML = renderCasita(1, 96);

    const smallHead = small.querySelector("ellipse")!;
    const bigHead = big.querySelector("ellipse")!;
    expect(smallHead.getAttribute("rx")).toBe(bigHead.getAttribute("rx"));
    expect(smallHead.getAttribute("ry")).toBe(bigHead.getAttribute("ry"));

    const smallStick = small.querySelector("rect")!;
    const bigStick = big.querySelector("rect")!;
    expect(Number(bigStick.getAttribute("width"))).toBeGreaterThan(Number(smallStick.getAttribute("width")));

    big.remove();
  });

  it("leaves deliberate air at the corners — no two matchsticks in the square share an endpoint", () => {
    const el = freshContainer();
    el.innerHTML = renderCasita(4, 64);

    const groups = [...el.querySelectorAll("svg > g > g")];
    // Each piece is translated to its own (x y) origin (see `transform="translate(...)"`
    // in the ported geometry) — if two pieces shared an origin, they'd touch.
    const origins = groups.map((g) => g.getAttribute("transform"));
    expect(new Set(origins).size).toBe(origins.length);
  });

  it("references the shared gradients by url(), never a hardcoded fill literal on the stick or head", () => {
    const el = freshContainer();
    el.innerHTML = renderCasita(1, 64);

    expect(el.querySelector("rect")?.getAttribute("fill")).toBe("url(#hexdev-truco-wood)");
    expect(el.querySelector("ellipse")?.getAttribute("fill")).toBe("url(#hexdev-truco-head)");
  });
});

describe("ensureMatchstickDefs — wood and head colours come from CSS custom properties", () => {
  it("every gradient stop's colour is a CSS custom property, never a hardcoded hex literal", () => {
    ensureMatchstickDefs(document);
    const defs = document.getElementById("hexdev-truco-matchstick-defs")!;

    expect(defs.innerHTML).not.toMatch(/stop-color:\s*#[0-9a-fA-F]/);
    expect(defs.innerHTML).toContain("var(--truco-match-wood");
    expect(defs.innerHTML).toContain("var(--truco-match-head");
  });
});

describe("ensureMatchstickDefs — the shared gradient/filter defs block", () => {
  it("injects exactly one defs block into the document, even when called twice", () => {
    ensureMatchstickDefs(document);
    ensureMatchstickDefs(document);

    expect(document.querySelectorAll("#hexdev-truco-matchstick-defs")).toHaveLength(1);
  });
});

describe("renderGhostCasita — zero has to look intentional, not empty", () => {
  it("draws all 5 pieces, distinctly marked as a ghost, never a blank box", () => {
    const el = freshContainer();
    el.innerHTML = renderGhostCasita(64);

    const svg = el.querySelector("svg")!;
    expect(svg.dataset.ghostCasita).toBe("true");
    expect(svg.querySelectorAll("g > g")).toHaveLength(5);
  });

  it("never uses the CSS opacity property to fade a piece — a literal muted fill, not a blend with whatever sits behind it", () => {
    const el = freshContainer();
    el.innerHTML = renderGhostCasita(64);

    expect(el.innerHTML).not.toMatch(/style="[^"]*opacity/);
    expect(el.querySelectorAll("rect, ellipse")[0]!.getAttribute("fill")).toBe("var(--truco-match-ghost-wood)");
  });

  it("renderScoreboard falls back to the ghost casita for a group with zero points, instead of rendering nothing", () => {
    const el = freshContainer();

    renderScoreboard(el, { score: 0, target: 30 });

    const malas = el.querySelector<HTMLElement>('[data-score-group="malas"]')!;
    const buenas = el.querySelector<HTMLElement>('[data-score-group="buenas"]')!;
    expect(malas.querySelector("svg")?.dataset.ghostCasita).toBe("true");
    expect(buenas.querySelector("svg")?.dataset.ghostCasita).toBe("true");
  });
});

describe("renderScoreboard — split into malas y buenas", () => {
  it("renders a labeled 'Malas' group and a labeled 'Buenas' group", () => {
    const el = freshContainer();

    renderScoreboard(el, { score: 20, target: 30 });

    const groups = [...el.querySelectorAll<HTMLElement>("[data-score-group]")];
    expect(groups.map((g) => g.dataset.scoreGroup)).toEqual(["malas", "buenas"]);
  });

  it("renders one casita per 5 points within each group (20/30 -> 3 malas casitas, 1 buenas casita)", () => {
    const el = freshContainer();

    renderScoreboard(el, { score: 20, target: 30 });

    const malas = el.querySelector<HTMLElement>('[data-score-group="malas"]')!;
    const buenas = el.querySelector<HTMLElement>('[data-score-group="buenas"]')!;
    expect(malas.querySelectorAll("svg")).toHaveLength(3); // 15 malas points = 3 casitas of 5
    expect(buenas.querySelectorAll("svg")).toHaveLength(1); // 5 buenas points = 1 casita
  });
});

/**
 * WCAG 1.1.1, the second half (Tanda 1's named debt #3). The hidden total
 * already says "4 tantos", but the two run captions below it were bare words:
 * a reader heard "Nosotros, 4 tantos, Malas, Buenas" — two labels trailing off
 * with nothing labelled, because the only thing that ever carried each run's
 * value is an aria-hidden pile of SVG matchsticks.
 *
 * The VISIBLE caption is what goes aria-hidden, and the spoken line carries
 * the whole "Malas: 4" instead. Appending a count beside an exposed caption
 * would have read "Malas Malas: 4"; hiding the incomplete half and speaking
 * the complete one is the same trade this file already makes for the sticks.
 *
 * Order is load-bearing and asserted: the total stays FIRST, so a reader still
 * meets the number before the breakdown of it.
 */
describe("each score run says its own count out loud (WCAG 1.1.1)", () => {
  it("gives malas and buenas a complete spoken line, not a bare caption", () => {
    const el = freshContainer();

    renderScoreboard(el, { score: 4, target: 15 });

    expect(el.querySelector<HTMLElement>('[data-score-run="malas"]')?.textContent).toBe("Malas: 4");
    expect(el.querySelector<HTMLElement>('[data-score-run="buenas"]')?.textContent).toBe("Buenas: 0");
  });

  it("hides the visible caption from the reader, so the run is named exactly once", () => {
    const el = freshContainer();

    renderScoreboard(el, { score: 4, target: 15 });

    for (const caption of el.querySelectorAll<HTMLElement>(".hexdev-truco-score-label")) {
      expect(caption.getAttribute("aria-hidden"), `caption "${caption.textContent}"`).toBe("true");
    }
  });

  /** Text in document order with every aria-hidden subtree pruned — what a
   * reader actually traverses, which `textContent` cannot model (it would
   * include the muted caption and the matchsticks' own SVG whitespace). */
  function spokenText(root: HTMLElement): string {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        node.nodeType === Node.ELEMENT_NODE && (node as Element).getAttribute("aria-hidden") === "true" ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    let text = "";
    while (walker.nextNode() !== null) {
      if (walker.currentNode.nodeType === Node.TEXT_NODE) text += walker.currentNode.textContent ?? "";
    }
    return text.trim();
  }

  it("reads total first, then each run — the breakdown never arrives before the number it breaks down", () => {
    const el = freshContainer();

    renderScoreboard(el, { score: 18, target: 30 });

    expect(spokenText(el)).toBe("18 tantosMalas: 15Buenas: 3");
  });

  it("costs the panel no layout: every spoken line is out of flow, like the total beside it", () => {
    ensureTableStyles(document);
    const el = freshContainer();

    renderScoreboard(el, { score: 4, target: 15 });

    for (const spoken of el.querySelectorAll<HTMLElement>("[data-score-run]")) {
      expect(getComputedStyle(spoken).position, `run "${spoken.textContent}"`).toBe("absolute");
    }
    document.getElementById(TABLE_STYLE_ID)?.remove();
  });
});
