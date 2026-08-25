import { afterEach, describe, expect, it } from "vitest";
import { createHeadToHeadMatch, createTeamMatch, getLegalActions, getViewFor, startHand } from "@hexdev/truco-engine";
import type { DealInput, PlayerId } from "@hexdev/truco-engine";
import { createMatchTableRenderer } from "./table.js";

/**
 * A decoration may only be as wide as the thing it decorates.
 *
 * WHAT WAS REPORTED, from real 2v2 play: "las líneas amarillas pisan
 * contenidos... del compañero que le pisa las cartas".
 *
 * WHAT IT WAS. The partner/opponent accent is a 4px inset edge, and it sat on
 * the ANCHOR. An anchor is a LANE, not a seat: measured at a 1550px shell the
 * top anchor spans 955px, so the partner's accent drew a gold rule clean
 * across the felt — level with the bottom edge of the partner's three cards
 * and 13px inside the turn ring's own gold outline, which is two parallel
 * gold lines through the same cards. The side anchors had the quieter version
 * of it: their accent landed on the inner edge (x=1052 for the right seat),
 * reading as a stray vertical line on the cloth.
 *
 * WHY THE DESIGN INTENT SURVIVES THE FIX. The stylesheet's own rationale for
 * this accent is that colour "is not the only signal — the real text label
 * carries the rest". That makes the label the primary surface and the colour
 * a reinforcement, so moving the colour ONTO the label is the intent at its
 * proper scale rather than a retreat from it. Both relations still differ,
 * and both still differ in a place the eye is already reading.
 *
 * WHAT THIS FENCES, and it is deliberately about SIZE rather than about which
 * selector won: an accent belongs to a seat, so it may not be painted at lane
 * width. A future rule that moves it back to the anchor — or onto any other
 * full-width box — fails here no matter how it is spelled.
 */

const SELF = "accent-self" as PlayerId;
const OPPONENT = "accent-opponent" as PlayerId;
const TEAMMATE = "accent-teammate" as PlayerId;
const OPPONENT_2 = "accent-opponent-2" as PlayerId;

const DEAL_2V2: DealInput = [
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

let container: HTMLElement;

afterEach(() => {
  container.remove();
  document.getElementById("hexdev-truco-matchstick-defs")?.remove();
  document.getElementById("hexdev-truco-table-styles")?.remove();
});

async function mount(seats: "1v1" | "2v2", width = 1280): Promise<HTMLElement> {
  container = document.createElement("div");
  container.style.width = `${String(width)}px`;
  document.body.appendChild(container);

  const state =
    seats === "1v1"
      ? startHand(createHeadToHeadMatch({ playerAId: SELF, playerBId: OPPONENT, pointsToWin: 30, dealerSeat: 1 }), DEAL_1V1)
      : startHand(createTeamMatch({ seatOrder: [SELF, OPPONENT, TEAMMATE, OPPONENT_2], pointsToWin: 30, dealerSeat: 3 }), DEAL_2V2);

  createMatchTableRenderer()(container, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
  await Promise.all([...container.querySelectorAll("img")].map((img) => img.decode()));
  return container;
}

/**
 * An inset shadow shaped like an EDGE RULE, which is what this accent is and
 * what the report was about: offset onto one side, no blur, no spread. That
 * shape is deliberately narrower than "has an inset shadow" — plenty of
 * surfaces here carry a legitimate inset hairline or an inner glow (the
 * action bar's own 680px one is a panel treatment, not a line), and a fence
 * that flagged those would be measuring the wrong thing and would have to be
 * suppressed case by case until it meant nothing.
 *
 * THICKNESS IS PART OF THE SHAPE. A 1px inset edge is a BORDER -- the action
 * bar draws one along its own bottom to separate the band from the cloth, and
 * at a hairline it delineates a surface rather than crossing anything. The
 * defect was a 4px rule at lane width. So this looks for accents of 2px or
 * more, which is the point where an edge stops reading as the boundary of a
 * panel and starts reading as a line drawn over the table.
 *
 * Computed form is `<color> <x>px <y>px <blur>px <spread>px inset`, and
 * multiple shadows are comma-joined — which is why this matches on the four
 * lengths rather than splitting the string, since every rgb()/rgba() colour
 * in it carries commas of its own.
 */
const EDGE_RULE = /(-?[\d.]+)px (-?[\d.]+)px (-?[\d.]+)px (-?[\d.]+)px inset/g;

const ACCENT_MIN_PX = 2;

function paintsEdgeRule(node: HTMLElement): boolean {
  const shadow = getComputedStyle(node).boxShadow;
  for (const [, x, y, blur, spread] of shadow.matchAll(EDGE_RULE)) {
    const thickness = Math.max(Math.abs(Number.parseFloat(x ?? "0")), Math.abs(Number.parseFloat(y ?? "0")));
    if (thickness >= ACCENT_MIN_PX && Number.parseFloat(blur ?? "0") === 0 && Number.parseFloat(spread ?? "0") === 0) return true;
  }
  return false;
}

/** Every edge rule on the table, at the width it is painted. The felt itself
 * is excluded by name: its own hairline IS the table's edge, the one
 * decoration that legitimately spans the table. */
function accentWidths(el: HTMLElement): { cls: string; width: number }[] {
  return [...el.querySelectorAll<HTMLElement>("*")]
    .filter((node) => !node.classList.contains("hexdev-truco-table"))
    .filter((node) => paintsEdgeRule(node))
    .map((node) => ({ cls: node.className.toString(), width: node.getBoundingClientRect().width }));
}

describe("the partner/opponent accent belongs to a seat, not to a lane", () => {
  it("no accent is painted at anything like the width of the felt", async () => {
    const el = await mount("2v2");
    const feltWidth = el.querySelector(".hexdev-truco-table")!.getBoundingClientRect().width;
    expect(feltWidth, "fence setup: the felt has a real width to compare against").toBeGreaterThan(400);

    const painted = accentWidths(el);
    expect(painted.length, "fence setup: something really is painting an edge rule, so this can fail").toBeGreaterThan(0);
    for (const { cls, width } of painted) {
      expect(width, `"${cls}" paints an inset accent ${String(Math.round(width))}px wide, against a ${String(Math.round(feltWidth))}px felt`).toBeLessThan(feltWidth * 0.4);
    }
  });

  it("the anchors themselves paint nothing — an anchor is the lane, not the seat", async () => {
    const el = await mount("2v2");
    const anchors = [...el.querySelectorAll<HTMLElement>(".hexdev-truco-anchor[data-relation]")];
    expect(anchors.length, "fence setup: 2v2 really does tag its anchors with a relation").toBeGreaterThan(0);

    for (const anchor of anchors) {
      expect(getComputedStyle(anchor).boxShadow, `the ${String(anchor.dataset.position)} anchor paints no edge of its own`).toBe("none");
    }
  });

  it("the label carries it instead, and partner still does not look like opponent", async () => {
    const el = await mount("2v2");
    const shadowFor = (relation: string): string => {
      const label = el.querySelector<HTMLElement>(`[data-relation="${relation}"] .hexdev-truco-relation-label`);
      if (label === null) throw new Error(`fence setup: 2v2 renders a ${relation} label`);
      return getComputedStyle(label).boxShadow;
    };

    const partner = shadowFor("partner");
    const opponent = shadowFor("opponent");
    expect(partner, "the accent moved onto the label rather than disappearing").not.toBe("none");
    expect(opponent).not.toBe("none");
    expect(partner, "the two relations stay distinguishable at a glance").not.toBe(opponent);
  });
});

describe("1v1 is untouched: it has no relations to accent", () => {
  it("renders no relation accent at all", async () => {
    const el = await mount("1v1");
    for (const label of el.querySelectorAll<HTMLElement>(".hexdev-truco-relation-label")) {
      expect(getComputedStyle(label).boxShadow, "the whole relation block is 2v2-scoped by design").toBe("none");
    }
  });
});
