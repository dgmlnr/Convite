import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { TeamId } from "@hexdev/truco-engine";
import { TABLE_STYLE_ID, ensureTableStyles } from "./table-styles.js";
import { describeTrickOutcome } from "./trick-feedback.js";

/**
 * `table-height-stability.browser.test.ts` forbids the table resizing during a
 * played hand. Until this file existed it held only by LUCK, and the luck was
 * whichever font the machine happened to draw with.
 *
 * `.hexdev-truco-trick-feedback` is the one line of text on this table that is
 * EMPTY for most of a hand and fills in the moment a trick resolves. It buys
 * itself room for that with `min-height: 1.2em`, and that reservation is a
 * fixed multiple of its own font-size — the same number on every machine. What
 * it actually costs once it HAS text is not: with no `line-height` of its own
 * the filled line box is `normal`, which every font answers differently out of
 * its own ascent/descent/line-gap. Measured here, at the element's own
 * 0.85rem, against a 16.3125px reservation:
 *
 *   Liberation Sans 15 | Adwaita Sans 16 | DejaVu Sans 16 | Noto Sans 19
 *
 * So the fence passed on this desktop with 0.31px to spare and failed by
 * 2.6875px for anyone whose system font is Noto Sans — and "anyone" includes
 * this repo's own headless runs, where fontconfig picks exactly that. The
 * table visibly grew mid-hand for those users. Nothing about the table was
 * wrong for the other users; nothing about it was right, either.
 *
 * These two tests are deliberately NOT about a number and NOT about a font.
 * They pin the PROPERTY that makes the number irrelevant: this line occupies
 * the same height filled as it reserves empty, so it cannot move the table
 * whatever draws it. That survives someone later changing the reservation from
 * `1.2em` to anything else — there is no constant here to update, only two
 * measurements of the same element that have to agree.
 *
 * Both tests measure the element itself rather than the whole table on
 * purpose: a two-and-a-half pixel line box is the entire mechanism, and
 * proving it here is what stops `table-height-stability`'s eight much slower
 * whole-hand journeys from being the only thing that would notice.
 */

const MY_TEAM = "line-box-self:team" as TeamId;
const RIVAL_TEAM = "line-box-rival:team" as TeamId;

/** Every string this element can ever hold, from the one function that fills
 * it (`table.ts` -> `describeTrickOutcome`) — read from the source rather than
 * retyped, so a new outcome string is measured here the day it is added. */
const FEEDBACK_TEXTS = [
  describeTrickOutcome(MY_TEAM, MY_TEAM),
  describeTrickOutcome(MY_TEAM, RIVAL_TEAM),
  describeTrickOutcome(MY_TEAM, null),
] as const;

/** Chromium lays out in 1/64px, not whole pixels, so two boxes that agree
 * exactly can still land one unit apart after independent rounding. One unit
 * is therefore the tightest honest tolerance — and it is two orders of
 * magnitude below the growth this file exists to catch (2.6875px). */
const ONE_LAYOUT_UNIT = 1 / 64;

const shells: HTMLElement[] = [];

afterEach(() => {
  for (const shell of shells.splice(0)) shell.remove();
  document.getElementById(TABLE_STYLE_ID)?.remove();
});

interface LineBoxReading {
  /** The `--gx-font-family` value this row was rendered with. */
  readonly family: string;
  /** Height of the line while it is EMPTY: the space it reserves for itself. */
  readonly reserved: number;
  /** Tallest height it reaches with real text in it. */
  readonly filled: number;
  /** What THIS font's own metrics ask for (`line-height: normal`, no floor) —
   * the thing that differs per font, and the reason `reserved` is not enough
   * on its own. Measured with the reservation and any explicit line-height
   * removed, so it keeps reporting the font's true appetite after the fix. */
  readonly naturalLineBox: number;
}

function feedbackLine(text: string): HTMLParagraphElement {
  const el = document.createElement("p");
  el.className = "hexdev-truco-trick-feedback";
  el.textContent = text;
  return el;
}

/** Mounts the real element under the real stylesheet, with one font pinned.
 *
 * `--gx-font-family` on the shell is how a tenant's own theme reaches this
 * text in production (`table-styles.ts`: `font-family: var(--gx-font-family,
 * system-ui, sans-serif)`), so setting the custom property is the honest way
 * to ask "what happens to a user whose theme names THIS font" — not a bare
 * `font-family` override that would bypass the same `var()` a real theme goes
 * through. */
function readLineBox(family: string): LineBoxReading {
  ensureTableStyles(document);
  const shell = document.createElement("div");
  shell.className = "hexdev-truco-table-shell";
  shell.style.setProperty("--gx-font-family", family);
  // The narrowest tier the table supports. Every string above fits on one line
  // at this width in every font here, so a wrapped second line can never be
  // mistaken for the growth under test.
  shell.style.width = "375px";
  document.body.appendChild(shell);
  shells.push(shell);

  const empty = shell.appendChild(feedbackLine(""));
  const filled = FEEDBACK_TEXTS.map((text) => shell.appendChild(feedbackLine(text)));
  const natural = FEEDBACK_TEXTS.map((text) => {
    const el = shell.appendChild(feedbackLine(text));
    el.style.minHeight = "0";
    el.style.lineHeight = "normal";
    return el;
  });

  const heightOf = (el: HTMLElement): number => el.getBoundingClientRect().height;
  return {
    family,
    reserved: heightOf(empty),
    filled: Math.max(...filled.map(heightOf)),
    naturalLineBox: Math.max(...natural.map(heightOf)),
  };
}

function expectFilledCostsExactlyWhatItReserved(rows: readonly LineBoxReading[]): void {
  for (const row of rows) {
    expect(
      Math.abs(row.filled - row.reserved),
      `${row.family}: reserves ${row.reserved}px empty but occupies ${row.filled}px filled — this font's own line box wants ${row.naturalLineBox}px`,
    ).toBeLessThanOrEqual(ONE_LAYOUT_UNIT);
  }
}

function describeReadings(rows: readonly LineBoxReading[]): string {
  return rows.map((row) => `${row.family} (natural line box ${row.naturalLineBox}px)`).join(", ");
}

/**
 * The machine-independent half. Every metric below comes from ONE embedded
 * font FILE — the same DejaVu Sans the visual suite already vendors for the
 * same reason (`visual/setup.ts`: pin a file, never an OS font NAME) — with
 * its vertical metrics overridden per face. `ascent-override` and friends are
 * exactly the inputs `line-height: normal` is computed from, so a face built
 * this way is not a stand-in for a differently-proportioned font: it IS one,
 * minus the need for the machine to have it installed.
 *
 * That is what makes this row of the fence the same on a fresh clone, on CI,
 * on macOS and on a container with no fonts at all — which the sibling test
 * below, measuring real installed fonts, can never promise.
 */
const SYNTHETIC_FACES = [
  // Well under the reservation: the line stays at its floor. Proves the
  // property is "the same height", not "always as tall as the font asks".
  { name: "HexDev Probe Squat", ascentOverride: "50%", descentOverride: "10%", lineGapOverride: "0%" },
  // A hair over — the exact shape of the real bug, which cleared the
  // reservation by 2.6875px and was invisible on the machine that shipped it.
  { name: "HexDev Probe Snug", ascentOverride: "100%", descentOverride: "20%", lineGapOverride: "0%" },
  // Far over, twice, so a fix that merely re-tuned the reservation upward
  // until this desktop's font fitted would still be caught here.
  { name: "HexDev Probe Tall", ascentOverride: "200%", descentOverride: "100%", lineGapOverride: "0%" },
  { name: "HexDev Probe Towering", ascentOverride: "400%", descentOverride: "200%", lineGapOverride: "50%" },
] as const;

const EMBEDDED_FONT_URL = new URL("../../../../visual/fonts/DejaVuSans.woff2", import.meta.url).href;

describe("the trick-feedback line costs exactly what it reserved, whatever font draws it", () => {
  const loaded: FontFace[] = [];

  beforeAll(async () => {
    for (const face of SYNTHETIC_FACES) {
      // Un-caught deliberately, same discipline as `visual/setup.ts`: a probe
      // font that failed to load would quietly become whatever the machine
      // offers instead, and a fence measuring an unknown font proves nothing.
      const fontFace = new FontFace(face.name, `url(${EMBEDDED_FONT_URL})`, {
        ascentOverride: face.ascentOverride,
        descentOverride: face.descentOverride,
        lineGapOverride: face.lineGapOverride,
      });
      document.fonts.add(fontFace);
      loaded.push(fontFace);
      await fontFace.load();
    }
    await document.fonts.ready;
  });

  afterAll(() => {
    for (const fontFace of loaded) document.fonts.delete(fontFace);
  });

  it("holds for vertical metrics from far under the reservation to far over it (synthetic faces, one embedded file — no machine font involved)", () => {
    const rows = SYNTHETIC_FACES.map((face) => readLineBox(`'${face.name}'`));

    // Without this the whole test could pass while proving nothing: four faces
    // that all happened to fit under the reservation would agree perfectly and
    // say nothing about the case that broke. At least one has to genuinely
    // overflow, or there was no fence here at all.
    expect(
      rows.filter((row) => row.naturalLineBox > row.reserved + ONE_LAYOUT_UNIT).length,
      `no probe font overflows the ${rows[0]!.reserved}px reservation, so this test cannot detect the bug it exists for — ${describeReadings(rows)}`,
    ).toBeGreaterThan(0);

    expectFilledCostsExactlyWhatItReserved(rows);
  });
});

/** Font families this machine might have. Never assumed — every one is probed
 * below and dropped if absent, because a row that silently rendered in the
 * fallback instead would be a green tick for a font that was never tested. */
const CANDIDATE_INSTALLED_FAMILIES = [
  "Adwaita Sans",
  "Arial",
  "Cantarell",
  "DejaVu Sans",
  "Helvetica Neue",
  "Liberation Sans",
  "Noto Sans",
  "Roboto",
  "Segoe UI",
  "Ubuntu",
  "Verdana",
] as const;

/** The CSS generic families, which resolve to a real installed font by
 * definition on every platform — so this test still measures several genuinely
 * different sets of metrics on a machine that has none of the names above. */
const GENERIC_FAMILIES = ["serif", "sans-serif", "monospace", "cursive", "system-ui"] as const;

const FALLBACK_BASES = ["monospace", "serif", "sans-serif"] as const;

function textWidth(family: string): number {
  const probe = document.createElement("span");
  probe.style.cssText = "position:absolute;left:-9999px;top:-9999px;white-space:nowrap;font-size:72px";
  probe.style.fontFamily = family;
  probe.textContent = "mmmmmwwwwwlliiiiOO0123";
  document.body.appendChild(probe);
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  return width;
}

/**
 * Whether the machine can really draw this family.
 *
 * `document.fonts.check()` cannot answer it — measured in this browser it
 * returns `true` for a family literally named "Totally Not A Real Font 12345".
 * Rendering is the only honest question: a family the machine does not have
 * falls back to the base silently, at exactly the base's own width, so a
 * family that changes the width against ANY of three different bases is
 * genuinely being used.
 */
function isReallyInstalled(family: string): boolean {
  return FALLBACK_BASES.some((base) => textWidth(`'${family}', ${base}`) !== textWidth(base));
}

describe("the trick-feedback line costs exactly what it reserved, in the real fonts this machine has", () => {
  it("holds for every generic family and every candidate family actually installed here", () => {
    const installed = CANDIDATE_INSTALLED_FAMILIES.filter(isReallyInstalled).map((family) => `'${family}'`);
    const rows = [...GENERIC_FAMILIES, ...installed].map(readLineBox);

    // The failure this guards against is the one that makes a font matrix
    // worthless: every row silently resolving to the same fallback, so a dozen
    // green ticks describe a single font. Distinct natural line boxes are
    // direct proof the rows really are different fonts.
    expect(
      new Set(rows.map((row) => row.naturalLineBox)).size,
      `every family resolved to the same metrics — this matrix is measuring one font under several names: ${describeReadings(rows)}`,
    ).toBeGreaterThan(1);

    expectFilledCostsExactlyWhatItReserved(rows);
  });
});
