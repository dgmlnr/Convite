import { afterEach, describe, expect, it } from "vitest";
import { TABLE_STYLE_ID, ensureTableStyles } from "./table-styles.js";

/**
 * The CROSS-ZONE class, closed structurally (Tanda 3, design §10).
 *
 * Four felt rules used to paint their text with the TENANT's
 * --gx-color-on-surface while sitting on a background no tenant token can
 * reach: the cloth itself, the outlined opening-call buttons and the señas
 * toggle (both transparent over the recessed action lane), and the relation
 * label (its own fixed rgba(0,0,0,.4) scrim). Design §10 says the game table
 * keeps its own identity, "deliberately outside this vocabulary entirely" —
 * but its TEXT was still inside it, which is the whole defect.
 *
 * A pairwise contrast guard cannot see this. Measured, and reproduced exactly
 * by widget-protocol's own contrastRatio: a perfectly self-consistent
 * light-brand theme (white --gx-color-surface, near-black #1a1a1a
 * --gx-color-on-surface) passes EVERY pair that can be formed from the tenant
 * vocabulary, and then renders felt text at 1.47:1 against the cloth and lane
 * text at 1.28:1. Nothing pairwise is wrong; the pairing that breaks is
 * between a tenant token and a colour that is not one.
 *
 * Same argument Tanda 2 already made for the focus ring one layer up
 * (table-styles.ts's .hexdev-truco-table-shell :focus-visible rule: "--hx-gold,
 * FIXED, not a --gx-* tenant token — the same decoupling argument the felt
 * itself makes"), and that rule's own comment named this as the coupling
 * "Tanda 3 unwinds for felt text". This is that unwinding.
 *
 * ZERO PAINT CHANGE by construction: --hx-felt-text carries #f2f2f2, the exact
 * value all four rules already fell back to. Nothing repaints for a tenant
 * with no theme, which is every tenant today.
 */

const TENANT_TEXT_TOKEN = "--gx-color-on-surface";
/** A hostile-but-self-consistent tenant value: the near-black half of the
 * light-brand theme that defeats a pairwise guard. */
const HOSTILE_TENANT_TEXT = "rgb(26, 26, 26)";
/** What --hx-felt-text holds, as getComputedStyle serialises it. */
const FELT_TEXT = "rgb(242, 242, 242)";

const mounted: HTMLElement[] = [];

afterEach(() => {
  while (mounted.length > 0) mounted.pop()!.remove();
  document.getElementById(TABLE_STYLE_ID)?.remove();
  document.documentElement.style.removeProperty(TENANT_TEXT_TOKEN);
});

function mount(className: string, wrapperClassName?: string): HTMLElement {
  ensureTableStyles(document);
  const element = document.createElement(className === "hexdev-truco-senas-toggle" ? "button" : "div");
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

/** Every site that draws text over a background outside the tenant
 * vocabulary. The class is closed when the list is empty of --gx- readers, so
 * the list itself is the fence: a fifth site added later fails here the moment
 * it reads the tenant token instead of the private one. */
const CROSS_ZONE_SITES = [
  { name: "the cloth itself (inherited by every felt descendant that sets no colour of its own)", className: "hexdev-truco-table", wrapper: undefined },
  { name: "an outlined opening-call button, transparent over the recessed action lane", className: "hexdev-truco-call", wrapper: "hexdev-truco-calls-group hexdev-truco-calls-group--opening" },
  { name: "the señas toggle, transparent over that same lane", className: "hexdev-truco-senas-toggle", wrapper: undefined },
  { name: "the 2v2 relation label, over its own fixed black scrim", className: "hexdev-truco-relation-label", wrapper: undefined },
] as const;

describe("felt text is decoupled from the tenant's text colour (cross-zone leak, design §10)", () => {
  for (const site of CROSS_ZONE_SITES) {
    it(`${site.name} paints the private felt ink by default`, () => {
      const element = mount(site.className, site.wrapper);

      expect(getComputedStyle(element).color).toBe(FELT_TEXT);
    });

    it(`${site.name} is unmoved by a tenant ${TENANT_TEXT_TOKEN} override`, () => {
      const element = mount(site.className, site.wrapper);

      document.documentElement.style.setProperty(TENANT_TEXT_TOKEN, HOSTILE_TENANT_TEXT);

      expect(getComputedStyle(element).color).toBe(FELT_TEXT);
    });
  }

  it("still lets the tenant colour the text it legitimately owns — a rule over the TENANT's own surface keeps following the tenant", () => {
    // The other four --gx-color-on-surface readers in this stylesheet
    // (scoreboard panel, seña notice, match-over overlay, call log) all paint
    // themselves --gx-color-surface first, so foreground and background move
    // together and the pairwise guard genuinely governs them. Decoupling
    // those too would not close a leak; it would delete real theming.
    const panel = mount("hexdev-truco-scoreboard-panel");

    document.documentElement.style.setProperty(TENANT_TEXT_TOKEN, HOSTILE_TENANT_TEXT);

    expect(getComputedStyle(panel).color).toBe(HOSTILE_TENANT_TEXT);
  });
});
