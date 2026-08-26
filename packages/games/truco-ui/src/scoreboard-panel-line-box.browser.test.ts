import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createHeadToHeadMatch, getLegalActions, getViewFor, startHand } from "@hexdev/truco-engine";
import type { DealInput, PlayerId } from "@hexdev/truco-engine";
import { TABLE_STYLE_ID } from "./table-styles.js";
import { createMatchTableRenderer } from "./table.js";

/**
 * The third box on this table to be measured against a fixed pixel budget
 * while its own height was decided by whatever font the machine happened to
 * draw with — and the first one where pinning the leading was NOT the fix.
 *
 * `table-height-budget.browser.test.ts` gives the compact scoreboard panel a
 * hard ceiling, and the same file's `PHONE_VIEWPORT_CEILING` now spends this
 * panel's height against a 601px phone viewport. Both are constants: the same
 * number on every machine. What the panel actually COST was not.
 *
 * WHY THE SIBLINGS' FIX DOES NOT WORK HERE, measured rather than assumed.
 * `trick-feedback-line-box.browser.test.ts` and
 * `banner-lane-line-box.browser.test.ts` both close the same defect by pinning
 * `line-height`, because in both cases the height at risk is a LINE BOX, which
 * is what a leading controls. This panel's height was driven by its rotated
 * "Malas"/"Buenas" captions, and a `writing-mode: vertical-rl` element's
 * PHYSICAL HEIGHT is its INLINE size — the sum of its glyph advance widths.
 * `line-height` controls that element's block size, which after the rotation is
 * its physical WIDTH. So a pinned leading moves the one dimension that was
 * never the problem. Measured over six probe faces at 375px, worst-case score:
 *
 *   as shipped                                     92.94 .. 210.70 (spread 122.70)
 *   captions shrunk to 0.5rem                      76.00 .. 210.70 (spread 100.00)
 *   captions shrunk AND every leading pinned       76.00 .. 150.31 (spread  74.31)
 *   captions out of flow, team label pinned        76.00 .. 76.00  (spread   0)
 *
 * The third row is the one worth reading twice: it is the sibling fix applied
 * faithfully, and it still leaves 74px of font-dependence, because the caption
 * is measured along the axis a leading cannot reach. Hence the actual fix — the
 * caption leaves the flow entirely (visually hidden, still announced, the same
 * `clip-path: inset(50%)` treatment `.hexdev-truco-announcer` and
 * `.hexdev-truco-pending-call-turn` already use) and the panel's height falls to
 * the casita SVGs, which are pure geometry with no font in the path at all.
 *
 * WHAT REMAINS TEXT, and is therefore pinned the sibling way: the team label
 * ("NOSOTROS"/"ELLOS") still stands in the row. Its leading is pinned so its
 * line box costs one number, and it is `white-space: nowrap` so its line COUNT
 * is one too — the wrap axis the siblings explicitly leave open, closable here
 * only because this label's vocabulary is two fixed words, exactly the
 * reasoning `.hexdev-truco-sena-notice` already uses for its own six.
 *
 * So unlike its two siblings, this fence claims BOTH axes: not "one height per
 * wrap shape" but one height, full stop, over faces that differ in vertical
 * metrics AND in advance width.
 *
 * MIRRORED, NOT IMPORTED, from those two files: neither exports anything (nor
 * should it), and importing a `.browser.test.ts` module for its helpers would
 * re-register its suites inside this file's run. The synthetic-face technique is
 * reproduced here; the three files are expected to drift only where the elements
 * genuinely differ — which, as above, is the whole point of this one.
 */

const SELF = "panel-line-box-self" as PlayerId;
const OPPONENT = "panel-line-box-opponent" as PlayerId;

/** Same fixture as `table-height-budget.browser.test.ts`'s own
 * `DEAL_1V1_MAXIMAL`, duplicated rather than imported for the reason that file
 * gives: no browser-test file here exports its fixtures. The deal is incidental
 * — nothing below measures the felt — but rendering the REAL table is not: the
 * panel's compact layout only exists inside the shell's own `@container` axis. */
const DEAL_1V1: DealInput = [
  [
    { suit: "espada", rank: 1 },
    { suit: "basto", rank: 4 },
    { suit: "espada", rank: 7 },
  ],
  [
    { suit: "espada", rank: 4 },
    { suit: "basto", rank: 1 },
    { suit: "oro", rank: 4 },
  ],
];

/** Chromium lays out in 1/64px, so two boxes that agree exactly can still land
 * one unit apart after independent rounding — the same tightest-honest
 * tolerance both siblings settled on, and three orders of magnitude below the
 * spreads measured here (up to 123px). */
const ONE_LAYOUT_UNIT = 1 / 64;

/** The compact tier, at both ends of it. 320px is the narrowest width this
 * table is exercised at anywhere in the repo; 375px is the phone
 * `PHONE_VIEWPORT_CEILING` is spent against. Above 640px the panel becomes a
 * side column with no height budget of its own, which is a different element's
 * problem and deliberately out of scope here. */
const WIDTHS = [320, 375] as const;

/**
 * Both ends of the score range, because they are different DOM.
 *
 * 28-27 at target 30 is the worst case a match can reach — malas full and
 * buenas near-full on both sides, 12 casitas, the exact fixture the FU-3 fence
 * in `table-height-budget.browser.test.ts` already measures. 0-0 is the other
 * extreme: two ghost casitas and the shortest possible sticks row, which is
 * where a text box has the best chance of becoming the row's tallest item.
 */
/* THE COUNT IS THE SAME AT EVERY SCORE NOW, which is the point of it. The
 * tally draws every piece the match can ever hold from the first render and
 * strikes them as they are won, so a 30-point board is twelve casitas at 0-0
 * and twelve at 28-27. That is also what makes this suite's real subject --
 * the panel costing one fixed height -- easier to hold rather than harder:
 * the picture no longer changes size as the match runs. */
const SCORES = [
  { label: "worst case (28-27)", scores: [28, 27] as const, casitas: 12 },
  { label: "opening score (0-0, the whole tally waiting)", scores: [0, 0] as const, casitas: 12 },
] as const;

const containers: HTMLElement[] = [];

afterEach(() => {
  for (const container of containers.splice(0)) container.remove();
  document.getElementById(TABLE_STYLE_ID)?.remove();
  document.getElementById("hexdev-truco-matchstick-defs")?.remove();
});

/**
 * Mounts the REAL table at one width, score and font, and hands back its
 * scoreboard panel.
 *
 * `--gx-font-family` on the container is how a tenant's own theme reaches this
 * text in production (`table-styles.ts`: `.hexdev-truco-table-shell` sets
 * `font-family: var(--gx-font-family, system-ui, sans-serif)`), so setting the
 * custom property asks the honest question — what happens to a player whose
 * theme names THIS font — rather than a bare `font-family` override that would
 * bypass the same `var()` a real theme goes through.
 *
 * Card art is deliberately not awaited: no card is inside this panel, and every
 * card box on the felt is sized from `--truco-card-width` in CSS rather than
 * from an image's intrinsic size, so a decoded image moves nothing measured
 * here.
 */
function mountPanel(width: number, family: string, scores: readonly [number, number]): HTMLElement {
  const container = document.createElement("div");
  container.style.width = `${width}px`;
  container.style.setProperty("--gx-font-family", family);
  document.body.appendChild(container);
  containers.push(container);

  const base = startHand(
    createHeadToHeadMatch({ playerAId: SELF, playerBId: OPPONENT, pointsToWin: 30, dealerSeat: 1 }),
    DEAL_1V1,
  );
  // Score set directly on the constructed state — the same convention
  // `table-height-budget.browser.test.ts`'s own FU-3 fence and
  // `table.visual.test.ts`'s `withNonTrivialScore` already use.
  const state = { ...base, teams: base.teams.map((team, index) => ({ ...team, score: scores[index] ?? 0 })) };
  createMatchTableRenderer()(container, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});

  // The panel lives in the side rail, and on this tier the rail is a DRAWER
  // that opens shut — so a measurement taken as rendered would be taken on
  // `display: none` and come back 0 for every probe font. The suite's own
  // guard caught exactly that ("every probe font asks this panel for the same
  // height, so this test cannot detect the bug it exists for"), which is what
  // a guard is for. Opened here, deliberately: what is under test is the
  // panel's line box, not whether the drawer starts open.
  const rail = container.querySelector<HTMLElement>(".hexdev-truco-side-rail");
  if (rail === null) throw new Error("test setup: the side rail did not mount");
  rail.dataset.open = "true";

  const panel = container.querySelector<HTMLElement>(".hexdev-truco-scoreboard-panel");
  if (panel === null) throw new Error("test setup: the scoreboard panel did not mount");
  return panel;
}

interface Reading {
  readonly face: string;
  /** What the panel really costs the widget. */
  readonly height: number;
  /**
   * What THIS font's own metrics ask for — the same panel re-measured with the
   * compact treatment undone in place: the captions rotated back into flow and
   * every pinned leading released. This is the quantity that differs per font,
   * and the reason a fixed pixel budget was never safe; measuring it this way
   * keeps it reporting the font's true appetite AFTER the fix instead of the
   * fix's own constant.
   */
  readonly natural: number;
}

function read(panel: HTMLElement, face: string): Reading {
  // MEASURED AS CONTENT, not as a box. The panel's BOX height comes from the
  // rail it sits in now (a flex basis of zero, so the rail decides), which
  // makes it the same under every probe font by construction -- and left this
  // suite measuring a constant, which its own guard below caught and said so.
  // What the suite was always about is the height the panel's CONTENT asks
  // for, and that still moves with whatever font draws the labels.
  const height = panel.scrollHeight;

  const captions = [...panel.querySelectorAll<HTMLElement>(".hexdev-truco-score-label")];
  const labels = [...panel.querySelectorAll<HTMLElement>(".hexdev-truco-team-label")];
  for (const caption of captions) {
    caption.style.cssText = "writing-mode: vertical-rl; transform: rotate(180deg); position: static; width: auto; height: auto; margin: 0; overflow: visible; clip-path: none; white-space: normal;";
  }
  for (const label of labels) label.style.cssText = "line-height: normal; white-space: normal;";
  const natural = panel.scrollHeight;
  for (const node of [...captions, ...labels]) node.style.cssText = "";

  return { face, height, natural };
}

function describeRows(rows: readonly Reading[]): string {
  return rows.map((row) => `${row.face} ${row.height}px (its own font metrics want ${row.natural}px)`).join(", ");
}

/**
 * Every face below is built from ONE embedded font FILE — the same DejaVu Sans
 * the visual suite already vendors for the same reason (`visual/setup.ts`: pin a
 * file, never an OS font NAME) — with its metrics overridden per face.
 *
 * TWO AXES, unlike either sibling, because this panel was exposed on both.
 * `ascent-override`/`descent-override`/`line-gap-override` are exactly the
 * inputs `line-height: normal` is computed from, so those four faces are
 * genuinely differently-proportioned fonts (the axis a leading pins).
 * `size-adjust` scales the drawn glyphs, so it moves ADVANCE WIDTHS — the axis
 * that decides a rotated caption's physical height and whether a label wraps,
 * and the one both siblings name as out of their reach. A fix that only pinned
 * the leading passes the first four and fails the last two.
 */
const SYNTHETIC_FACES = [
  // Well under any budget: proves the property is "the same height", not
  // "always as tall as the font asks".
  { name: "HexDev Panel Probe Squat", ascentOverride: "50%", descentOverride: "10%", lineGapOverride: "0%", sizeAdjust: "100%" },
  // A hair over, the shape every one of these bugs has had so far: invisible on
  // the machine that shipped it.
  { name: "HexDev Panel Probe Snug", ascentOverride: "100%", descentOverride: "20%", lineGapOverride: "0%", sizeAdjust: "100%" },
  // Far over, twice, so a fix that merely re-tuned the budget upward until this
  // desktop's font fitted would still be caught.
  { name: "HexDev Panel Probe Tall", ascentOverride: "200%", descentOverride: "100%", lineGapOverride: "0%", sizeAdjust: "100%" },
  { name: "HexDev Panel Probe Towering", ascentOverride: "400%", descentOverride: "200%", lineGapOverride: "50%", sizeAdjust: "100%" },
  // The advance-width axis, in both directions: a font that draws the same
  // strings half as long and one that draws them more than twice as long.
  { name: "HexDev Panel Probe Narrow", ascentOverride: "100%", descentOverride: "20%", lineGapOverride: "0%", sizeAdjust: "50%" },
  { name: "HexDev Panel Probe Wide", ascentOverride: "100%", descentOverride: "20%", lineGapOverride: "0%", sizeAdjust: "220%" },
] as const;

const EMBEDDED_FONT_URL = new URL("../../../../visual/fonts/DejaVuSans.woff2", import.meta.url).href;

/**
 * `size-adjust` is a real `@font-face`/`FontFace` descriptor and has been
 * since Chromium 92 — it is simply missing from this TypeScript release's
 * `FontFaceDescriptors`, which still lists only the ascent/descent/line-gap
 * overrides the two sibling files use. Widened here rather than erased with an
 * `as`, so the descriptor this fence's whole advance-width axis depends on is
 * named and typed instead of hidden.
 */
interface SizeAdjustableFontFaceDescriptors extends FontFaceDescriptors {
  readonly sizeAdjust?: string;
}

describe("the compact scoreboard panel costs the same height whatever font draws it", () => {
  const loaded: FontFace[] = [];

  beforeAll(async () => {
    for (const face of SYNTHETIC_FACES) {
      // Un-caught deliberately, same discipline as `visual/setup.ts`: a probe
      // font that failed to load would quietly become whatever the machine
      // offers instead, and a fence measuring an unknown font proves nothing.
      const descriptors: SizeAdjustableFontFaceDescriptors = {
        ascentOverride: face.ascentOverride,
        descentOverride: face.descentOverride,
        lineGapOverride: face.lineGapOverride,
        sizeAdjust: face.sizeAdjust,
      };
      const fontFace = new FontFace(face.name, `url(${EMBEDDED_FONT_URL})`, descriptors);
      document.fonts.add(fontFace);
      loaded.push(fontFace);
      await fontFace.load();
    }
    await document.fonts.ready;
  });

  afterAll(() => {
    for (const fontFace of loaded) document.fonts.delete(fontFace);
  });

  it("one height per width and score — over vertical metrics from squat to towering AND advance widths from half to double", () => {
    const groups: { readonly what: string; readonly rows: readonly Reading[] }[] = [];
    for (const width of WIDTHS) {
      for (const score of SCORES) {
        const rows = SYNTHETIC_FACES.map((face) => {
          const panel = mountPanel(width, `'${face.name}'`, score.scores);
          expect(panel.querySelectorAll("svg").length, `sanity: ${score.label} must really render ${score.casitas} casitas`).toBe(score.casitas);
          return read(panel, face.name);
        });
        for (const container of containers.splice(0)) container.remove();
        groups.push({ what: `${width}px ${score.label}`, rows });
      }
    }

    // Without this the whole test could pass while proving nothing: six faces
    // that all happened to leave the panel's height alone would agree perfectly
    // and say nothing about the case that broke. At least one probe font has to
    // genuinely disagree about what this panel costs, or there was no fence here
    // at all.
    for (const group of groups) {
      const naturals = group.rows.map((row) => row.natural);
      expect(
        Math.max(...naturals) - Math.min(...naturals),
        `${group.what}: every probe font asks this panel for the same height, so this test cannot detect the bug it exists for — ${describeRows(group.rows)}`,
      ).toBeGreaterThan(ONE_LAYOUT_UNIT);
    }

    for (const group of groups) {
      const heights = group.rows.map((row) => row.height);
      const spread = Math.max(...heights) - Math.min(...heights);
      expect(
        spread,
        `${group.what}: ${spread}px taller on one font than another, inside a panel whose budget is the same number on every machine — ${describeRows(group.rows)}`,
      ).toBeLessThanOrEqual(ONE_LAYOUT_UNIT);
    }
  });

  /**
   * The claim above, stated once as a mechanism rather than as a matrix: after
   * the fix there is no text at all in the panel's height path except one
   * label whose leading is pinned, so the panel's height is the casita SVG's
   * own geometry plus fixed padding. A future reader who breaks this test has
   * put a font back on the critical path — most likely by making the captions
   * visible again, which is the exact shape of the original defect.
   */
  it("the panel's height is its casitas' geometry, not its text: no text box in it is ever the tallest thing in its row", () => {
    const panel = mountPanel(375, `'${SYNTHETIC_FACES[3].name}'`, [28, 27]);
    const rows = [...panel.querySelectorAll<HTMLElement>(".hexdev-truco-scoreboard-group")];
    expect(rows.length, "sanity: one row per team").toBe(2);

    for (const [index, row] of rows.entries()) {
      const rowHeight = row.getBoundingClientRect().height;
      const sticks = row.querySelector<HTMLElement>(".hexdev-truco-score-sticks");
      if (sticks === null) throw new Error("test setup: a team row with no sticks");
      expect(
        Math.abs(rowHeight - sticks.getBoundingClientRect().height),
        `team row #${index} is ${rowHeight}px tall but its casitas are only ${sticks.getBoundingClientRect().height}px — something with a font in it is driving this row`,
      ).toBeLessThanOrEqual(ONE_LAYOUT_UNIT);
    }
  });
});
