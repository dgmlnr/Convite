import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = dirname(fileURLToPath(import.meta.url));

/**
 * THE WIDGET NEVER MEASURES ITS OWN BOX — and this is a SOURCE scan, which is
 * a choice with a measurement behind it.
 *
 * The behavioural version of this fence does not exist. Planting
 * `globalThis.innerWidth` inside `bindingTileWidth` — a real viewport read,
 * exactly the thing forbidden here — left the entire node suite green and
 * eslint at exit 0, because under Node there is no `innerWidth` to read and
 * the expression falls through unchanged. A rule about what the code MAY
 * CONSULT cannot be checked by running it in an environment that has nothing
 * to consult.
 *
 * WHY THE RULE EXISTS AT ALL. This board is embedded in someone else's page
 * inside an iframe the host sizes. Its available room is its CONTAINER's,
 * never the viewport's, and the two are different numbers — a widget that
 * asks the window gets an answer about a box it is not in. Container queries
 * and `dvh` (fullscreen only, where the host really has pinned the widget to
 * the window) are the whole of the sizing input, and every other route is
 * closed here rather than in a review comment.
 *
 * THE SECOND HALF is the one that is easy to lose: counts and coordinates
 * pushed into custom properties are WRITE-ONLY. Reading one back with
 * `getPropertyValue` would make the DOM a second source of truth about the
 * board's state, which the renderer's own `Map` already is.
 */
const FORBIDDEN: readonly (readonly [string, RegExp])[] = [
  ["ResizeObserver", /\bResizeObserver\b/],
  ["matchMedia", /\bmatchMedia\b/],
  ["innerWidth", /\binnerWidth\b/],
  ["innerHeight", /\binnerHeight\b/],
  ["outerWidth", /\bouterWidth\b/],
  ["visualViewport", /\bvisualViewport\b/],
  ["getBoundingClientRect", /\bgetBoundingClientRect\b/],
  ["getClientRects", /\bgetClientRects\b/],
  ["offsetWidth", /\boffsetWidth\b/],
  ["offsetHeight", /\boffsetHeight\b/],
  ["clientWidth", /\bclientWidth\b/],
  ["clientHeight", /\bclientHeight\b/],
  ["scrollWidth", /\bscrollWidth\b/],
  ["scrollHeight", /\bscrollHeight\b/],
  ["getComputedStyle", /\bgetComputedStyle\b/],
  ["window.screen", /\bscreen\s*\.\s*(width|height)\b/],
  ["getPropertyValue", /\bgetPropertyValue\b/],
];

/** Every production module in this package — tests deliberately excluded,
 * because a test measuring a real element is exactly how the fences in this
 * package prove the sheet did what it said. */
function productionSources(): readonly string[] {
  return readdirSync(SRC).filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"));
}

/**
 * COMMENTS COME OUT FIRST, and that is not a loophole — it is what makes the
 * rule statable at all. Every module here names the forbidden APIs in prose,
 * because "this package does not use `ResizeObserver`" is the single most
 * useful sentence a reader of a container-query stylesheet can find. A scan
 * that could not tell a docblock from a call would force the documentation to
 * stop naming what it forbids.
 *
 * A line comment has to be at the start of a line or preceded by WHITESPACE.
 * That is what spares a URL in a string — `https://host/a//b` has no space
 * before either slash pair — and eating the rest of such a line would hide
 * real code behind a link.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

function offendersIn(source: string): readonly string[] {
  return FORBIDDEN.filter(([, pattern]) => pattern.test(source)).map(([name]) => name);
}

describe("nothing in this package measures anything", () => {
  it("scans every production module this package actually ships", () => {
    // R6 twice over. An empty file list, or a filter that dropped the modules
    // that do the sizing, would make every assertion below pass while
    // checking nothing. Named individually because the file that matters most
    // is the stylesheet, and a rename is exactly how it would fall out.
    const files = productionSources();
    expect(files.length).toBeGreaterThan(4);
    expect(files).toContain("board-styles.ts");
    expect(files).toContain("board-geometry.ts");
    expect(files).toContain("hit-test.ts");
  });

  it("and the scan can actually fail — every pattern is proven against a line that trips it", () => {
    // R18's shape. A refusal fence is worth nothing until the thing it
    // refuses has been shown to be refused: a regex with a typo in it reports
    // "clean" forever, and nobody would ever see the difference. Each pattern
    // is fed a line a real defect would look like.
    const samples: readonly string[] = [
      "const observer = new ResizeObserver(() => {});",
      "if (window.matchMedia('(min-width: 640px)').matches) return;",
      "const w = window.innerWidth;",
      "const h = window.innerHeight;",
      "const ow = window.outerWidth;",
      "const vv = window.visualViewport;",
      "const box = element.getBoundingClientRect();",
      "const rects = element.getClientRects();",
      "const w2 = element.offsetWidth;",
      "const h2 = element.offsetHeight;",
      "const w3 = element.clientWidth;",
      "const h3 = element.clientHeight;",
      "const w4 = element.scrollWidth;",
      "const h4 = element.scrollHeight;",
      "const style = getComputedStyle(element);",
      "const w5 = screen.width;",
      "const v = element.style.getPropertyValue('--mj-tile-width');",
    ];
    expect(samples).toHaveLength(FORBIDDEN.length);
    for (const [index, [name]] of FORBIDDEN.entries()) {
      expect(offendersIn(samples[index]!), `the pattern for ${name} did not fire on a line that should trip it`).toContain(name);
    }
  });

  it("strips the prose and keeps the code, proven on a line that is both", () => {
    // Without this the scan could be passing because `stripComments` ate the
    // whole file. One sample that carries a forbidden name in a block
    // comment, a second in a line comment, a real call between them, and a
    // URL that must survive.
    const sample = ["/* matchMedia is never used here */", "const w = window.innerWidth; // ResizeObserver neither", "const doc = 'https://example.test/a//b';"].join("\n");
    const stripped = stripComments(sample);

    expect(offendersIn(stripped)).toEqual(["innerWidth"]);
    expect(stripped).toContain("https://example.test/a//b");
  });

  it.each(productionSources())("%s consults no box, no viewport and no custom property it wrote", (file) => {
    const stripped = stripComments(readFileSync(join(SRC, file), "utf8"));
    expect(stripped.trim().length, "fence setup: the comment stripper left nothing to scan").toBeGreaterThan(0);
    expect(offendersIn(stripped)).toEqual([]);
  });
});
