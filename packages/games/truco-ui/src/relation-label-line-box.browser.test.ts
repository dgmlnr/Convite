import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTeamMatch, getLegalActions, getViewFor, startHand } from "@hexdev/truco-engine";
import type { DealInput, PlayerId } from "@hexdev/truco-engine";
import { TABLE_STYLE_ID } from "./table-styles.js";
import { createMatchTableRenderer } from "./table.js";

/**
 * The fourth box on this table measured against a fixed pixel constant while
 * its own height was decided by whatever font the machine happened to draw
 * with — and the last of that residue.
 *
 * `.hexdev-truco-relation-label` is the "Compañero"/"Rival" pill on another
 * seat's anchor. `table.ts` renders it in 2v2 ONLY (`others.length > 1`), which
 * is exactly why this one survived three rounds of the same bug being fixed
 * elsewhere: the four `"1v1"` rows of `table-height-stability`'s own
 * `MAXIMAL_BASELINE_HEIGHT` never contain this element at all, so half that
 * table could not have caught it however carefully it was read.
 *
 * As shipped it set `font-size: 0.62rem` (9.92px) and `padding: 1px 6px` and no
 * `line-height`, so its filled line box was `normal` — whatever this font's own
 * ascent/descent/line-gap ask for. The side anchors (`[data-position="left"]`
 * and `["right"]`) are `flex-direction: column`, so that height stacks above
 * the card pile and propagates straight into the table's reported total.
 * Measured here at 700px across the probe faces below, as shipped:
 * 831.42 … 875.42 — 44px of pure font-dependence inside a number
 * `table-height-stability` locks to the hundredth of a pixel.
 *
 * That is also the whole of the headed/headless split `vitest.config.ts` used
 * to describe as "a ~1.6px constant offset": headed Chromium resolves
 * `system-ui` to Adwaita Sans metrics (line box 12px, element 14px), headless
 * resolves it to Noto Sans (14px, element 16px), and the resulting +2.000000px
 * landed on 700, 960 and 1280 alike. 375px is immune — not because the label
 * is absent there, but because at compact the side column is not the tallest
 * column (THE PHONE FOLD, `table-height-stability`'s own docblock). It is
 * measured below anyway rather than skipped: "immune" is a claim about today's
 * layout, and the cheapest way to keep it true is to assert it.
 *
 * SAME FIX AS TWO OF THE THREE SIBLINGS, PLUS THE HALF THE THIRD ONE NEEDED.
 * `line-height: 1.2` pins the line BOX — the axis `trick-feedback-line-box`
 * and `banner-lane-line-box` both close. `white-space: nowrap` pins the line
 * COUNT — the axis `banner-lane-line-box` deliberately leaves open (its pill
 * has no bounded vocabulary and nowrap would trade a vertical overflow for a
 * horizontal one) and `scoreboard-panel-line-box`'s team label does close, on
 * exactly the reasoning that applies here: this element's entire vocabulary is
 * two fixed words.
 *
 * So this fence claims BOTH axes, and it claims them on the number that
 * actually reaches a player: the shell's own reported height — the same box
 * `apps/widget-app/src/main.ts` observes and resizes the host iframe to, and
 * the same box `table-height-stability` locks. There is no constant in this
 * file to keep in step with that one; there is one table measured against
 * itself under several fonts, which is what makes the constants over there
 * mean something on a machine that is not this one.
 *
 * MIRRORED, NOT IMPORTED, from the three sibling files: none of them exports
 * anything (nor should it), and importing a `.browser.test.ts` module for its
 * helpers would re-register its suites inside this file's run. The
 * synthetic-face technique is reproduced here; the files are expected to drift
 * only where the elements genuinely differ.
 */

const SELF = "relation-label-self" as PlayerId;
const OPPONENT = "relation-label-opponent" as PlayerId;
const TEAMMATE = "relation-label-teammate" as PlayerId;
const OPPONENT_2 = "relation-label-opponent-2" as PlayerId;

/** `table-height-stability.browser.test.ts`'s own `DEAL_2V2_MAXIMAL`,
 * duplicated rather than imported for the reason that file's own siblings give:
 * no browser-test file here exports its fixtures. Using the maximal deal is not
 * incidental — the baseline (dealt, nothing has happened yet) render of THIS
 * deck is the exact state whose height that file locks per width, so the totals
 * measured below are the same totals those constants name. */
const DEAL_2V2_MAXIMAL: DealInput = [
  [
    { suit: "espada", rank: 1 },
    { suit: "basto", rank: 4 },
    { suit: "espada", rank: 3 },
  ],
  [
    { suit: "basto", rank: 5 },
    { suit: "oro", rank: 1 },
    { suit: "basto", rank: 6 },
  ],
  [
    { suit: "oro", rank: 4 },
    { suit: "copa", rank: 4 },
    { suit: "basto", rank: 4 },
  ],
  [
    { suit: "copa", rank: 5 },
    { suit: "basto", rank: 3 },
    { suit: "copa", rank: 6 },
  ],
];

/** Chromium lays out in 1/64px, so two boxes that agree exactly can still land
 * one unit apart after independent rounding — the same tightest-honest
 * tolerance all three siblings settled on, and three orders of magnitude below
 * the spread measured here (44px at 700px). */
const ONE_LAYOUT_UNIT = 1 / 64;

/** The four container tiers, the same list and for the same reason as
 * `table-height-stability`'s own: this file measures the totals that suite
 * locks, so it has to measure them where they are locked. */
const WIDTHS = [375, 700, 960, 1280] as const;

/** Every relation label this table can hold at 2v2: one partner across the top
 * and one rival on each side. Asserted rather than assumed on every mount — a
 * matrix that silently stopped rendering the element under test would agree
 * perfectly with itself and prove nothing. */
const LABELS_PER_2V2_TABLE = 3;

const containers: HTMLElement[] = [];

afterEach(() => {
  for (const container of containers.splice(0)) container.remove();
  document.getElementById(TABLE_STYLE_ID)?.remove();
  document.getElementById("hexdev-truco-matchstick-defs")?.remove();
});

/** Card art loads asynchronously. The two lane files skip awaiting it and say
 * why (their boxes hold no cards); this one measures the WHOLE table, so it
 * follows `table-height-stability`'s discipline instead and awaits — the suite
 * whose numbers this fence exists to make portable. */
async function waitForArt(el: HTMLElement): Promise<void> {
  await Promise.all([...el.querySelectorAll("img")].map((img) => img.decode()));
}

/**
 * Mounts the REAL 2v2 table at one tier with one font pinned, and hands back
 * the shell.
 *
 * The whole renderer rather than a hand-built anchor, because the propagation
 * under test is the point: this label is only a defect at all because the side
 * anchor is a flex COLUMN, so the label's own height stacks above the card pile
 * and reaches the shell. A label measured on its own would be a true
 * measurement of an element nobody resizes their window for.
 *
 * `--gx-font-family` on the container is how a tenant's own theme reaches this
 * text in production (`table-styles.ts`: `.hexdev-truco-table-shell` sets
 * `font-family: var(--gx-font-family, system-ui, sans-serif)`, and the anchors
 * inherit it), so setting the custom property asks the honest question — what
 * happens to a player whose theme names THIS font — rather than a bare
 * `font-family` override that would bypass the same `var()` a real theme goes
 * through. Note the container IS the shell: `table.ts` sets that class on the
 * element it is handed, so its own height is the widget's reported height.
 *
 * Partners sit ACROSS the table (0/2 vs 1/3, `createTeamMatch`'s own geometry);
 * `dealerSeat: 3` makes SELF mano — the same seating
 * `table-height-stability`'s 2v2 maximal fence uses.
 */
async function mountTable(width: number, family: string): Promise<HTMLElement> {
  const container = document.createElement("div");
  container.style.width = `${width}px`;
  container.style.setProperty("--gx-font-family", family);
  document.body.appendChild(container);
  containers.push(container);

  const seatOrder: readonly [PlayerId, PlayerId, PlayerId, PlayerId] = [SELF, OPPONENT, TEAMMATE, OPPONENT_2];
  const state = startHand(createTeamMatch({ seatOrder, pointsToWin: 30, dealerSeat: 3 }), DEAL_2V2_MAXIMAL);
  createMatchTableRenderer()(container, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
  await waitForArt(container);

  expect(
    container.querySelectorAll(".hexdev-truco-relation-label").length,
    `sanity: a 2v2 table must render ${LABELS_PER_2V2_TABLE} relation labels — with none of them mounted this matrix measures nothing`,
  ).toBe(LABELS_PER_2V2_TABLE);
  return container;
}

interface Reading {
  readonly face: string;
  /** What the widget really reports to its host page. */
  readonly height: number;
  /** The tallest relation label on this table, as shipped. */
  readonly label: number;
  /** How many line boxes each label really occupies, joined — the wrap shape.
   * Faces built from one font FILE share every glyph advance width, so within
   * the vertical-metric matrix this string must be identical everywhere, and
   * that is what isolates the axis under test rather than asking the reader to
   * trust it. */
  readonly lines: string;
  /**
   * What THIS font's own metrics ask of the same table — re-measured in place
   * with every relation label's pin released (`line-height: normal`,
   * `white-space: normal`), which is precisely the pre-fix element. This is the
   * quantity that differs per font, and the reason a table locked to exact
   * pixels was never portable; measuring it this way keeps it reporting the
   * font's true appetite AFTER the fix instead of the fix's own constant.
   */
  readonly natural: number;
  /** The same release, measured on the tallest label rather than on the table
   * — so a failure message can say whether the table moved because this element
   * moved, or for some reason this file does not own. */
  readonly naturalLabel: number;
}

function labelHeights(container: HTMLElement): number[] {
  return [...container.querySelectorAll<HTMLElement>(".hexdev-truco-relation-label")].map((el) => el.getBoundingClientRect().height);
}

/** The containment half of `white-space: nowrap`'s bargain, asserted per label
 * against its OWN seat anchor: a line forbidden from wrapping overflows
 * sideways instead, and the felt's `overflow: hidden` would clip that silently
 * — no height would move, no fence above would notice. The advance-width
 * boundary of this claim is stated at the second test below. */
function expectLabelsFitTheirAnchors(container: HTMLElement, face: string): void {
  for (const label of container.querySelectorAll<HTMLElement>(".hexdev-truco-relation-label")) {
    const anchor = label.closest<HTMLElement>(".hexdev-truco-anchor");
    if (anchor === null) throw new Error("test setup: a relation label is not inside a seat anchor");
    const labelWidth = label.getBoundingClientRect().width;
    const anchorWidth = anchor.getBoundingClientRect().width;
    expect(
      labelWidth,
      `${face}: "${label.textContent}" is ${labelWidth}px wide inside a ${anchorWidth}px anchor — nowrap traded a vertical overflow for a horizontal one`,
    ).toBeLessThanOrEqual(anchorWidth + ONE_LAYOUT_UNIT);
  }
}

function read(container: HTMLElement, face: string): Reading {
  const height = container.getBoundingClientRect().height;
  const labels = [...container.querySelectorAll<HTMLElement>(".hexdev-truco-relation-label")];
  const lines = labels
    .map((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getClientRects().length;
    })
    .join("/");

  for (const el of labels) el.style.cssText = "line-height: normal; white-space: normal;";
  const natural = container.getBoundingClientRect().height;
  const naturalLabel = Math.max(...labelHeights(container));
  for (const el of labels) el.style.cssText = "";

  return { face, height, label: Math.max(...labelHeights(container)), lines, natural, naturalLabel };
}

function describeRows(rows: readonly Reading[]): string {
  return rows.map((row) => `${row.face} table ${row.height}px / label ${row.label}px (its own font metrics want ${row.natural}px / ${row.naturalLabel}px)`).join(", ");
}

/**
 * Every face below is built from ONE embedded font FILE — the same DejaVu Sans
 * the visual suite already vendors for the same reason (`visual/setup.ts`: pin
 * a file, never an OS font NAME) — with its metrics overridden per face.
 *
 * TWO AXES, because the fix closes both.
 * `ascent-override`/`descent-override`/`line-gap-override` are exactly the
 * inputs `line-height: normal` is computed from, so those four faces are
 * genuinely differently-proportioned fonts and not a stand-in for one: that is
 * the axis `line-height: 1.2` pins, and the axis the real bug travelled on
 * (Adwaita Sans vs Noto Sans differ in nothing else that mattered here).
 * `size-adjust` scales the drawn glyphs, so it moves ADVANCE WIDTHS — the axis
 * that decides whether two fixed words fit on one line, and therefore the one
 * `white-space: nowrap` pins.
 */
const SYNTHETIC_FACES = [
  // Well under anything: proves the property is "the same height", not "always
  // as tall as the font asks".
  { name: "HexDev Relation Probe Squat", ascentOverride: "50%", descentOverride: "10%", lineGapOverride: "0%", sizeAdjust: "100%" },
  // A hair over — the exact shape of the real bug, which moved the table by
  // 2.000000px and was invisible on the machine that shipped it.
  { name: "HexDev Relation Probe Snug", ascentOverride: "100%", descentOverride: "20%", lineGapOverride: "0%", sizeAdjust: "100%" },
  // Far over, twice, so a fix that merely re-tuned the locked constants until
  // this desktop's font fitted would still be caught here.
  { name: "HexDev Relation Probe Tall", ascentOverride: "200%", descentOverride: "100%", lineGapOverride: "0%", sizeAdjust: "100%" },
  { name: "HexDev Relation Probe Towering", ascentOverride: "400%", descentOverride: "200%", lineGapOverride: "50%", sizeAdjust: "100%" },
] as const;

/** The advance-width axis, in both directions: a font that draws the same two
 * words half as long and one that draws them more than twice as long. Kept
 * separate from the four above on purpose — mixing them into one matrix would
 * destroy the shared-advance-width property that makes that matrix a clean
 * reading of vertical metrics alone. */
const WIDTH_FACES = [
  { name: "HexDev Relation Probe Narrow", ascentOverride: "100%", descentOverride: "20%", lineGapOverride: "0%", sizeAdjust: "50%" },
  { name: "HexDev Relation Probe Snug", ascentOverride: "100%", descentOverride: "20%", lineGapOverride: "0%", sizeAdjust: "100%" },
  { name: "HexDev Relation Probe Wide", ascentOverride: "100%", descentOverride: "20%", lineGapOverride: "0%", sizeAdjust: "220%" },
] as const;

const EMBEDDED_FONT_URL = new URL("../../../../visual/fonts/DejaVuSans.woff2", import.meta.url).href;

/**
 * `size-adjust` is a real `@font-face`/`FontFace` descriptor and has been since
 * Chromium 92 — it is simply missing from this TypeScript release's
 * `FontFaceDescriptors`, which still lists only the ascent/descent/line-gap
 * overrides. Widened here rather than erased with an `as`, exactly as
 * `scoreboard-panel-line-box.browser.test.ts` already does, so the descriptor
 * this file's second axis depends on is named and typed instead of hidden.
 */
interface SizeAdjustableFontFaceDescriptors extends FontFaceDescriptors {
  readonly sizeAdjust?: string;
}

describe("the 2v2 relation label costs the same height whatever font draws it", () => {
  const loaded: FontFace[] = [];

  beforeAll(async () => {
    // `WIDTH_FACES` deliberately re-uses "Snug" as its middle row; adding the
    // same family twice would leave a duplicate registered after the teardown
    // below, so the two lists are de-duplicated by name here.
    const faces = [...SYNTHETIC_FACES, ...WIDTH_FACES].filter(
      (face, index, all) => all.findIndex((other) => other.name === face.name) === index,
    );
    for (const face of faces) {
      // Un-caught deliberately, same discipline as `visual/setup.ts`: a probe
      // font that failed to load would quietly become whatever the machine
      // offers instead, and a fence measuring an unknown font proves nothing.
      // Never `document.fonts.check()` for this — measured in this browser it
      // returns `true` for a family that does not exist.
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

  it("the table reports ONE height per tier — over vertical metrics from squat to towering", async () => {
    const groups: { readonly what: string; readonly rows: readonly Reading[] }[] = [];
    for (const width of WIDTHS) {
      const rows: Reading[] = [];
      for (const face of SYNTHETIC_FACES) {
        const container = await mountTable(width, `'${face.name}'`);
        expectLabelsFitTheirAnchors(container, face.name);
        rows.push(read(container, face.name));
      }
      for (const container of containers.splice(0)) container.remove();
      groups.push({ what: `${width}px 2v2`, rows });
    }

    // Without this the whole test could pass while proving nothing: four faces
    // the browser silently resolved to the same fallback would agree perfectly
    // and say nothing about the case that broke. Releasing the pin restores the
    // pre-fix element, so a genuine spread there is direct proof both that the
    // probe faces took effect AND that this label is really on the table's
    // height path — the two things this fence depends on.
    const naturalSpread = (rows: readonly Reading[]): number => Math.max(...rows.map((r) => r.natural)) - Math.min(...rows.map((r) => r.natural));
    expect(
      groups.filter((group) => naturalSpread(group.rows) > ONE_LAYOUT_UNIT).length,
      `no tier's table height moves when the label's pin is released, so this test cannot detect the bug it exists for — ${describeRows(groups[0]!.rows)}`,
    ).toBeGreaterThan(0);

    // Four faces off ONE file share every glyph advance width, so they must
    // wrap identically. Any height difference between them is therefore
    // vertical metrics and nothing else — the axis isolated by construction.
    for (const group of groups) {
      expect(
        new Set(group.rows.map((row) => row.lines)).size,
        `${group.what}: probe faces wrapped the label differently (${group.rows.map((r) => `${r.face} ${r.lines}`).join(", ")}), so this group is not isolating vertical metrics`,
      ).toBe(1);
    }

    for (const group of groups) {
      const heights = group.rows.map((row) => row.height);
      const spread = Math.max(...heights) - Math.min(...heights);
      expect(
        spread,
        `${group.what}: ${spread}px taller on one font than another, in a total table-height-stability.browser.test.ts locks to the same number on every machine — ${describeRows(group.rows)}`,
      ).toBeLessThanOrEqual(ONE_LAYOUT_UNIT);
    }
  });

  /**
   * The other axis, on the element that owns it.
   *
   * A pinned leading fixes the height of each line box and nothing about how
   * MANY there are, which is the boundary `banner-lane-line-box` states and
   * leaves open. `white-space: nowrap` closes it here — legitimate for this
   * element and few others, because "Compañero"/"Rival" is the whole
   * vocabulary and neither word can ever be joined by a third.
   *
   * Scoped to the label rather than the shell on purpose: a font that draws
   * every glyph 2.2x wider also rewraps the action bar and the call log, and
   * whether the TABLE survives that is those elements' fences' business, not
   * this one's. What is asserted here is exactly what this rule claims — one
   * line, one height, at any advance width.
   *
   * Both tests also assert the containment that makes nowrap honest (see
   * `expectLabelsFitTheirAnchors`), each at the widths it already runs: the
   * vertical-metric matrix everywhere, because its faces share DejaVu's
   * advance widths (a ~40px label, under every tier's track); this test at
   * 700px, where the side track is 112px and even the 220% face's ~76px label
   * fits. `WIDTH_FACES` is deliberately NOT extended to 375px: the side track
   * is 56.25px there, an extreme advance-width font genuinely CAN overflow it,
   * and the felt's `overflow: hidden` would clip the label. Whether that track
   * should grow for such a font is a design decision, out of this fence's
   * scope — not hygiene it forgot.
   */
  it("one line and one height across advance widths from half to double — the axis a leading cannot reach", async () => {
    const rows: (Reading & { readonly width: number })[] = [];
    for (const face of WIDTH_FACES) {
      const container = await mountTable(700, `'${face.name}'`);
      expectLabelsFitTheirAnchors(container, face.name);
      const label = container.querySelector<HTMLElement>(".hexdev-truco-relation-label")!;
      rows.push({ ...read(container, face.name), width: label.getBoundingClientRect().width });
    }

    // The advance-width axis's own non-vacuity guard: `size-adjust` is only
    // being applied if these three faces genuinely draw the same two words at
    // three different lengths. Three equal widths would mean one font under
    // three names, and the assertions below would be measuring nothing.
    expect(
      new Set(rows.map((row) => row.width)).size,
      `the size-adjust faces drew the label at the same width, so they are not really different fonts: ${rows.map((r) => `${r.face} ${r.width}px`).join(", ")}`,
    ).toBe(rows.length);

    for (const row of rows) {
      expect(row.lines, `${row.face}: the label wrapped to ${row.lines} lines — its two-word vocabulary must always be one`).toBe("1/1/1");
    }

    const heights = rows.map((row) => row.label);
    const spread = Math.max(...heights) - Math.min(...heights);
    expect(spread, `${spread}px taller on one font than another, on an element whose text is two fixed words — ${describeRows(rows)}`).toBeLessThanOrEqual(ONE_LAYOUT_UNIT);
  });
});
