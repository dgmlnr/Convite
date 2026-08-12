import { afterEach, describe, expect, it } from "vitest";
import { createTeamMatch, getLegalActions, getViewFor, startHand } from "@hexdev/truco-engine";
import type { DealInput, PlayerId } from "@hexdev/truco-engine";
import { createMatchTableRenderer } from "./table.js";

/**
 * FU-4 (debt follow-up): the 2v2 side-seat gutters must be
 * CONTAINER-relative, never VIEWPORT-relative.
 *
 * The whole felt is driven by the `hexdev-truco-shell` @container axis
 * (table-styles.ts, PR3): every tier decision — card size, gaps, padding,
 * band heights, even the grid STRUCTURE — answers "how wide is MY box", not
 * "how wide is the browser window", because an embedded widget's available
 * width is its own container's width, which legitimately differs from the
 * host page's viewport. The 2v2 gutter tracks were the one leftover that
 * still read the viewport (`15vw`/`16vw`): in any embed whose container is
 * narrower than the viewport — the widget's normal life — `vw` over-reserved
 * gutter width that the container never actually had.
 *
 * This suite pins the container-relative contract with real geometry, in a
 * browser whose viewport width (Vitest browser mode's 414px default)
 * deliberately DIFFERS from every mounted container width, so a
 * viewport-relative regression cannot pass by coincidence:
 *   - compact (375px container): each gutter track must resolve to 15% of
 *     the CONTAINER's width (56.25px), subject to the 34px floor — under
 *     `15vw` it wrongly measured 15% of the 414px viewport (62.1px).
 *   - medium (700px container, `@container (min-width: 640px)`): each
 *     gutter track must resolve to 16% of the CONTAINER's width (112px),
 *     subject to the 72px floor — under `16vw` the 414px viewport yielded
 *     66.24px, BELOW the 72px floor, so both gutters silently collapsed to
 *     their minimum instead of scaling with the (much wider) container.
 * The 34px/72px floors themselves are asserted only as the max() term of the
 * expectation formula: exercising a genuinely floor-bound width would need a
 * sub-227px 2v2 container, below any tier this table supports.
 */

const SELF = "gutter-self" as PlayerId;
const OPPONENT = "gutter-opponent" as PlayerId;
const TEAMMATE = "gutter-teammate" as PlayerId;
const OPPONENT_2 = "gutter-opponent-2" as PlayerId;

/** Same fixture as `table-height-stability.browser.test.ts`'s own
 * `DEAL_2V2_MAXIMAL` (duplicated, not imported — neither file exports its
 * fixtures, matching this repo's established per-file-owns-its-fixtures
 * convention). A freshly-dealt hand is enough here: the gutter tracks exist
 * from the first render, independent of any play. */
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

let container: HTMLElement;

afterEach(() => {
  container.remove();
  document.getElementById("hexdev-truco-matchstick-defs")?.remove();
  document.getElementById("hexdev-truco-table-styles")?.remove();
});

function mountedContainer(width: number): HTMLElement {
  container = document.createElement("div");
  container.style.width = `${width}px`;
  document.body.appendChild(container);
  return container;
}

async function waitForArt(el: HTMLElement): Promise<void> {
  const images = [...el.querySelectorAll("img")];
  await Promise.all(images.map((img) => img.decode()));
}

/** The two tiers whose 2v2 gutter tracks carry the percentage-of-container
 * contract. Wide/ultra (>=900px) are deliberately absent: their gutter
 * tracks already use `16%` (a grid-relative unit), never a viewport unit,
 * so they never had this defect. */
const TIERS = [
  { width: 375, ratio: 0.15, floor: 34, tier: "compact (base rule)" },
  { width: 700, ratio: 0.16, floor: 72, tier: "medium (@container >= 640px)" },
] as const;

describe.each(TIERS)("2v2 side gutters are container-relative, never viewport-relative (FU-4) — $width px, $tier", ({ width, ratio, floor }) => {
  it(`left/right gutter tracks each measure ${ratio * 100}% of the CONTAINER's width (floor ${floor}px), not of the viewport`, async () => {
    const el = mountedContainer(width);
    const render = createMatchTableRenderer();
    const seatOrder: readonly [PlayerId, PlayerId, PlayerId, PlayerId] = [SELF, OPPONENT, TEAMMATE, OPPONENT_2];
    const state = startHand(createTeamMatch({ seatOrder, pointsToWin: 30, dealerSeat: 3 }), DEAL_2V2);
    render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
    await waitForArt(el);

    // Validity guard: the whole point of this suite is that the container's
    // width and the viewport's width are DIFFERENT numbers — if they ever
    // coincided, a viewport-relative regression would produce the exact same
    // pixels as the container-relative contract and this test would prove
    // nothing at this width.
    const shellWidth = el.getBoundingClientRect().width;
    expect(shellWidth, "sanity: the shell container width must differ from the viewport width, or this test cannot tell cqw from vw").not.toBe(window.innerWidth);

    const felt = el.querySelector(".hexdev-truco-table");
    if (felt === null) throw new Error("test setup: felt not rendered");

    // The used track sizes, straight from the resolved grid — this is real
    // geometry (Chromium serializes gridTemplateColumns as used pixel
    // values), not a re-derivation of the stylesheet's arithmetic.
    const tracks = getComputedStyle(felt).gridTemplateColumns.split(" ").map((t) => parseFloat(t));
    expect(tracks, `sanity: the 2v2 grid at ${width}px must have exactly 3 column tracks (gutter / center / gutter)`).toHaveLength(3);
    const [leftTrack, , rightTrack] = tracks as [number, number, number];

    const expected = Math.max(floor, ratio * shellWidth);
    expect(Math.abs(leftTrack - expected), `left gutter track: measured ${leftTrack}px, expected ${expected}px (${ratio * 100}% of the ${shellWidth}px container, floor ${floor}px; viewport is ${window.innerWidth}px)`).toBeLessThan(0.5);
    expect(Math.abs(rightTrack - expected), `right gutter track: measured ${rightTrack}px, expected ${expected}px (${ratio * 100}% of the ${shellWidth}px container, floor ${floor}px; viewport is ${window.innerWidth}px)`).toBeLessThan(0.5);

    // Bind the track numbers to the real seat furniture they exist for: the
    // left/right anchors are grid items stretched across those exact tracks,
    // so their rendered rectangles must agree with the resolved track sizes.
    const leftAnchor = el.querySelector('[data-position="left"]');
    const rightAnchor = el.querySelector('[data-position="right"]');
    if (leftAnchor === null || rightAnchor === null) throw new Error("test setup: left/right seat anchors not rendered — is this really a 4-seat table?");
    expect(Math.abs(leftAnchor.getBoundingClientRect().width - leftTrack), "left anchor width vs its own track").toBeLessThan(0.5);
    expect(Math.abs(rightAnchor.getBoundingClientRect().width - rightTrack), "right anchor width vs its own track").toBeLessThan(0.5);
  });
});
