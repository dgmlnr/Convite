import { afterEach, describe, expect, it } from "vitest";
import { TABLE_STYLE_ID, buildTableStylesheet, ensureTableStyles } from "./table-styles.js";

/**
 * WCAG 2.1 AA 1.4.11 (non-text contrast) for the two OUTLINED controls that
 * sit on the felt: the opening-call buttons and the señas toggle.
 *
 * Both are transparent, so their 2px border is the entire boundary of the
 * control — there is no fill to see. That border read `--gx-color-primary`,
 * defaulting to #2f6f4f, and measured 2.28:1 against the recessed action lane
 * and 1.97:1 against bare cloth. Their LABELS pass comfortably (12.17:1, the
 * --hx-felt-text fence next door), so a sighted player could still read the
 * word — but the thing that says "this is a button, and it ends here" was
 * below the 3:1 floor.
 *
 * TWO defects in one declaration, and the fix answers both:
 *
 * 1. CONTRAST. --hx-felt-outline is bright enough to clear 3:1 against the
 *    lane at any position on the cloth (the arithmetic below).
 * 2. CROSS-ZONE COUPLING, the exact class Tanda 3 closed for felt TEXT and
 *    Tanda 2 closed for the focus ring, one property over. A tenant's
 *    --gx-color-primary describes the tenant's OWN surface; the recessed lane
 *    is not one, and no pairwise guard in widget-protocol can measure a tenant
 *    token against a colour that is not in its vocabulary. So this border is
 *    private and fixed, like the ink it encloses.
 *
 * WHY THE BRIGHTEST STOP IS THE BAR. The cloth is a radial gradient
 * (--truco-cloth-lit → --truco-table-cloth at 55% → --truco-cloth-deep), and
 * the lane is a translucent black over whatever part of it the action band
 * covers. Which part that is depends on the felt's height and the tier, and
 * the band is a FIXED pixel track — so a short felt pulls the band closer to
 * the gradient's bright centre. Rather than reason about where the band lands
 * per tier, this suite demands 3:1 against the composite over the BRIGHTEST
 * stop, which is the lightest background the lane can ever produce anywhere on
 * the cloth. Clearing that clears every tier by construction, with no geometry
 * argument to re-check when a breakpoint moves.
 *
 * Composited in integer sRGB channels, which is what actually reaches an 8-bit
 * framebuffer, and which reproduces the audit's own 2.28:1 for the old value
 * exactly.
 */

/** WCAG 2.1 AA, 1.4.11 — user-interface components and graphical objects. */
const NON_TEXT_CONTRAST = 3;

/** The composite the lane paints over the gradient's brightest stop: the
 * lightest background these borders can sit on anywhere on the felt. */
const BRIGHTEST_LANE_COMPOSITE_RATIO = 3.29;

type Rgb = readonly [number, number, number];

const mounted: HTMLElement[] = [];

afterEach(() => {
  while (mounted.length > 0) mounted.pop()!.remove();
  document.getElementById(TABLE_STYLE_ID)?.remove();
});

/** One sRGB channel, gamma-expanded to linear light (WCAG 2.1 relative
 * luminance, step 1) — same arithmetic as the chrome contrast suite. */
function toLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance([r, g, b]: Rgb): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (lighter! + 0.05) / (darker! + 0.05);
}

/** A custom property's value comes back as AUTHORED, not canonicalised — so
 * this has to read both the `#rrggbb` the cloth stops use and the
 * `rgba(0,0,0,.18)` (leading-dot alpha included) the lane uses. A resolved
 * `border-color` always arrives as rgb()/rgba(), which the same parser covers. */
function parseColour(value: string): { readonly rgb: Rgb; readonly alpha: number } {
  const trimmed = value.trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(trimmed);
  if (hex !== null) {
    const digits = hex[1]!;
    return { rgb: [0, 2, 4].map((i) => Number.parseInt(digits.slice(i, i + 2), 16)) as unknown as Rgb, alpha: 1 };
  }
  const numbers = trimmed.match(/-?\d*\.?\d+/g);
  if (numbers === null || numbers.length < 3) throw new Error(`unparseable colour: ${value}`);
  return {
    rgb: [Number(numbers[0]), Number(numbers[1]), Number(numbers[2])] as unknown as Rgb,
    alpha: numbers.length > 3 ? Number(numbers[3]) : 1,
  };
}

/** Source-over composite, rounded to integer channels: the byte a screen
 * really shows, and the model the audit's own measurements used. */
function composite(over: { readonly rgb: Rgb; readonly alpha: number }, under: Rgb): Rgb {
  return under.map((channel, i) => Math.round(over.rgb[i]! * over.alpha + channel * (1 - over.alpha))) as unknown as Rgb;
}

function rootToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name);
}

/** The lane composited over each of the cloth gradient's three stops. Read off
 * the live tokens, never restated as literals here: a stylesheet that darkens
 * or brightens the cloth must be re-measured, not silently trusted. */
function laneComposites(): readonly { readonly name: string; readonly rgb: Rgb }[] {
  const lane = parseColour(rootToken("--truco-cloth-lane"));
  return (
    [
      ["the gradient's brightest stop (--truco-cloth-lit)", "--truco-cloth-lit"],
      ["the cloth's base tone (--truco-table-cloth)", "--truco-table-cloth"],
      ["the gradient's darkest stop (--truco-cloth-deep)", "--truco-cloth-deep"],
    ] as const
  ).map(([name, token]) => ({ name, rgb: composite(lane, parseColour(rootToken(token)).rgb) }));
}

function mount(className: string, wrapperClassName?: string): HTMLElement {
  ensureTableStyles(document);
  const element = document.createElement("button");
  element.className = className;
  if (wrapperClassName === undefined) {
    document.body.appendChild(element);
    mounted.push(element);
    return element;
  }
  const wrapper = document.createElement("div");
  wrapper.className = wrapperClassName;
  wrapper.appendChild(element);
  document.body.appendChild(wrapper);
  mounted.push(wrapper);
  return element;
}

/** The two transparent-on-lane controls, and nothing else: a filled button's
 * boundary is its fill, which this floor does not govern. */
const OUTLINED_ON_FELT = [
  { name: "an opening-call button", className: "hexdev-truco-call", wrapper: "hexdev-truco-calls-group hexdev-truco-calls-group--opening" },
  { name: "the señas toggle", className: "hexdev-truco-senas-toggle", wrapper: undefined },
] as const;

describe("outlined felt controls keep a visible boundary (WCAG 2.1 AA, 1.4.11)", () => {
  for (const control of OUTLINED_ON_FELT) {
    it(`${control.name} clears 3:1 against the lane over every stop of the cloth gradient`, () => {
      const border = parseColour(getComputedStyle(mount(control.className, control.wrapper)).borderTopColor).rgb;

      for (const background of laneComposites()) {
        const ratio = contrastRatio(border, background.rgb);
        expect(ratio, `${control.name}'s border vs ${background.name}`).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST);
      }
    });

    it(`${control.name} measures the pinned ratio against the lightest composite the lane can produce`, () => {
      const border = parseColour(getComputedStyle(mount(control.className, control.wrapper)).borderTopColor).rgb;

      expect(contrastRatio(border, laneComposites()[0]!.rgb)).toBeCloseTo(BRIGHTEST_LANE_COMPOSITE_RATIO, 2);
    });

    it(`${control.name} is unmoved by a tenant --gx-color-primary override — the boundary is private, like the ink inside it`, () => {
      const element = mount(control.className, control.wrapper);
      const untenanted = getComputedStyle(element).borderTopColor;

      // A perfectly plausible tenant primary that would put the border back
      // under 3:1 on its own; the point is that it cannot reach this rule at
      // all any more, not that this particular value is bad.
      document.documentElement.style.setProperty("--gx-color-primary", "rgb(26, 26, 26)");
      try {
        expect(getComputedStyle(element).borderTopColor).toBe(untenanted);
      } finally {
        document.documentElement.style.removeProperty("--gx-color-primary");
      }
    });
  }

  it("leaves no tenant-token border on either control in the stylesheet source — the class is closed, not patched case by case", () => {
    expect(buildTableStylesheet()).not.toContain("border: 2px solid var(--gx-color-primary");
  });
});
