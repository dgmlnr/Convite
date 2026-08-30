import { afterEach, describe, expect, it } from "vitest";
import type { Card, TeamId } from "@hexdev/escoba-engine";
import { renderEscobaTable } from "./table.js";
import { ensureTableStyles, TABLE_STYLE_ID } from "./table-styles.js";
import { renderEscobaPiles } from "./piles.js";
import type { TeamIdentity } from "./piles.js";
import { ensurePilesStyles, PILES_STYLE_ID } from "./piles-styles.js";

/**
 * THE HOST'S FONT DOES NOT DECIDE THIS LAYOUT.
 *
 * `createEscobaRenderer` (widget-app's game-ui-registry.ts) replaces the
 * match container's `className` wholesale once a match starts, so the table
 * and piles never actually sit under widget-app's own `.convite-chrome`
 * (where `--gx-font-family` is otherwise applied) — each container-query
 * root has to pin its OWN font, the same fence truco-ui's own
 * `table-height-stability.browser.test.ts` already applies for its shell
 * (`.hexdev-truco-table-shell`). This file is that fence's escoba twin.
 *
 * Two things are proven together, at every width a card-width breakpoint
 * changes at (table-styles.ts: <400px / 400-640px / >=640px; piles-styles.ts:
 * <400px / >=400px):
 *
 *   1. the css var actually reaches the element — computed `font-family`
 *      contains the face the host set, never a silent fall-through to the
 *      browser's own default; missing this is exactly the bug this file was
 *      written to catch (table/piles carried NO font-family declaration at
 *      all before this fence existed).
 *   2. card layout (fixed px custom properties, image-only card content) does
 *      not move a pixel across faces — proving the geometry genuinely does
 *      not depend on font metrics, not merely that nothing today happens to
 *      vary them.
 */
const FACES = ["system-ui", '"DejaVu Sans"', '"Liberation Sans"'] as const;
const WIDTHS = [320, 500, 700] as const; // one width inside each of table-styles.ts's three card-width tiers

function bareFaceName(face: string): string {
  return face.replace(/"/g, "");
}

let container: HTMLElement;
let probe: HTMLStyleElement | undefined;

afterEach(() => {
  container.remove();
  probe?.remove();
  document.getElementById(TABLE_STYLE_ID)?.remove();
  document.getElementById(PILES_STYLE_ID)?.remove();
});

function freshContainer(widthPx: number): HTMLElement {
  container = document.createElement("div");
  container.style.width = `${widthPx}px`;
  document.body.appendChild(container);
  return container;
}

/**
 * THE TABLE'S WIDTH TIER IS THE FELT'S QUESTION NOW, so the width goes on a
 * felt and the table is its child.
 *
 * `WIDTHS` above promises "one width inside each of table-styles.ts's three
 * card-width tiers", and that promise is the only reason this file proves
 * anything about tiers at all. Since the container-query root moved up to
 * `.hexdev-escoba-felt` (so the player's own hand could be tiered by the same
 * query instead of sitting at the untiered default), a table mounted bare has
 * no container to ask and answers every width identically — 320, 500 and 700
 * would all have drawn the same card and the three cases would have collapsed
 * into one without a single assertion going red. Restoring the felt keeps the
 * three cases three.
 *
 * The piles keep the bare box below: `.hexdev-escoba-piles` is still its own
 * container-query root (piles-styles.ts), so nothing about them moved.
 */
function freshTable(widthPx: number): HTMLElement {
  const felt = freshContainer(widthPx);
  felt.className = "hexdev-escoba-felt";
  const tableEl = document.createElement("div");
  felt.appendChild(tableEl);
  return tableEl;
}

/** Through `--gx-font-family`, which is the knob a host page really turns —
 * same technique as truco-ui's own font fence. */
function setFace(selector: string, face: string): void {
  probe = document.createElement("style");
  probe.dataset.fontProbe = "true";
  probe.textContent = `${selector} { --gx-font-family: ${face}; }`;
  document.head.appendChild(probe);
}

const FOUR_CARDS: readonly Card[] = [
  { suit: "oro", rank: 5 },
  { suit: "espada", rank: 3 },
  { suit: "copa", rank: 7 },
  { suit: "basto", rank: 10 },
];

describe("renderEscobaTable — layout does not depend on the host's font (spec: escoba-table-ui)", () => {
  it.each(WIDTHS)("%ipx: the host's font reaches the table, and card layout measures the same under every face", (width) => {
    ensureTableStyles(document);
    const heights = new Map<string, number>();
    const widthsMeasured = new Map<string, number>();

    for (const face of FACES) {
      const el = freshTable(width);
      renderEscobaTable(el, FOUR_CARDS);
      setFace(".hexdev-escoba-table", face);

      expect(getComputedStyle(el).fontFamily, `${face} at ${width}px did not reach the table's own font-family`).toContain(bareFaceName(face));

      const rect = el.getBoundingClientRect();
      heights.set(face, rect.height);
      widthsMeasured.set(face, rect.width);

      probe?.remove();
      // The FELT, not the table: `el` is a child now, and leaving its parent
      // behind would stack an empty box per face on the document.
      container.remove();
    }

    const [baselineHeight] = heights.values();
    for (const [face, height] of heights) {
      expect(Math.abs(height - baselineHeight!), `${face}: table height moved to ${height}px at ${width}px`).toBeLessThan(1);
    }
    const [baselineWidth] = widthsMeasured.values();
    for (const [face, measured] of widthsMeasured) {
      expect(Math.abs(measured - baselineWidth!), `${face}: table width moved to ${measured}px at ${width}px`).toBeLessThan(1);
    }
  });
});

const TEAM_A = "team-a" as TeamId;
const TEAM_B = "team-b" as TeamId;
const TEAMS: readonly TeamIdentity[] = [{ id: TEAM_A }, { id: TEAM_B }];
const PILES: Readonly<Record<TeamId, readonly Card[]>> = {
  [TEAM_A]: [
    { suit: "oro", rank: 5 },
    { suit: "espada", rank: 3 },
  ],
  [TEAM_B]: [{ suit: "copa", rank: 7 }],
};

describe("renderEscobaPiles — layout does not depend on the host's font (spec: escoba-table-ui)", () => {
  it.each(WIDTHS)("%ipx: the host's font reaches the piles, and card layout measures the same under every face", (width) => {
    ensurePilesStyles(document);
    const heights = new Map<string, number>();

    for (const face of FACES) {
      const el = freshContainer(width);
      renderEscobaPiles(el, TEAMS, PILES);
      setFace(".hexdev-escoba-piles", face);

      expect(getComputedStyle(el).fontFamily, `${face} at ${width}px did not reach the piles' own font-family`).toContain(bareFaceName(face));

      heights.set(face, el.getBoundingClientRect().height);

      probe?.remove();
      el.remove();
    }

    const [baseline] = heights.values();
    for (const [face, height] of heights) {
      expect(Math.abs(height - baseline!), `${face}: piles height moved to ${height}px at ${width}px`).toBeLessThan(1);
    }
  });
});
