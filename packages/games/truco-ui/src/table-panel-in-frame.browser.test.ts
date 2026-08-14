import { afterEach, describe, expect, it } from "vitest";
import { createHeadToHeadMatch, createTeamMatch, getLegalActions, getViewFor, startHand } from "@hexdev/truco-engine";
import type { DealInput, PlayerId } from "@hexdev/truco-engine";
import { createMatchTableRenderer } from "./table.js";

/**
 * A POSITION fence for the scoreboard panel: given a host that hands the
 * widget a DEFINITE height with room to spare, the panel must stay entirely
 * inside that frame.
 *
 * The gap this closes (found by an audit of every existing fence): nothing in
 * this repo combined a definite-height ancestor with an assertion about WHERE
 * the panel ends up.
 *   - every `truco-ui` fixture (visual and browser) mounts WIDTH-ONLY, so the
 *     felt's `min-height` never had a resolvable percentage to claim;
 *   - the three `*.visual.test.ts` files DOCUMENTED the eviction in prose
 *     instead of forbidding it in an assertion;
 *   - `table.browser.test.ts` proves the panel is a DOM sibling of the felt
 *     (structure, not position);
 *   - `table-height-budget.browser.test.ts` proves the panel's OWN height
 *     stays under a ceiling (size, not position);
 *   - `card-render-size.browser.test.ts` is the single fixture that ever set
 *     an explicit height (`squeezedContainer(100)` — literally the eviction
 *     condition) but it measures a CARD against the felt's clip edge and
 *     never looks at the panel at all.
 * So `.hexdev-truco-table`'s own `min-height: max(100%, calc(...))` could
 * claim the whole layout height, push the panel out of frame by its own
 * height plus one gap, and every one of those fences stayed green.
 *
 * RED-FIRST, against that unmodified `max(100%, ...)` CSS (the repo's own
 * convention of recording the measured failure, cf.
 * `table-height-budget.browser.test.ts`): both COLUMN rows failed, and by
 * exactly the panel's own height plus one 8px gap, which is the signature of
 * this defect rather than of content that merely did not fit —
 *   1v1 at 320px, 645px host: panel bottom 745.94 vs frame 645.00 (+100.94)
 *   2v2 at 320px, 708px host: panel bottom 808.94 vs frame 708.00 (+100.94)
 * (panel 92.94 + gap 8 = 100.94, both). Dropping the `max(100%, ...)` term
 * turned both green with no other change.
 *
 * WHY A ROOMY HEIGHT, NOT A SQUEEZED ONE: a host shorter than the felt's own
 * essential floor is a DIFFERENT, already-specified case — the felt is
 * supposed to overflow its shell there rather than clip a card
 * (`card-render-size.browser.test.ts` round 5), and the panel leaving the
 * frame is then the honest consequence of content that genuinely does not
 * fit. The defect this file forbids is the panel leaving a frame that had
 * ample room for it. Hence `hostHeightFor` below: measure the shell's own
 * natural (auto-height) size first, then hand it that PLUS real slack.
 * Self-calibrating on purpose — this fence must not double as a height
 * budget, which is `table-height-budget.browser.test.ts`'s job and would
 * otherwise go stale here as a second, competing set of magic numbers.
 *
 * BOTH SIDES OF THE 640px BOUNDARY, deliberately: `@container
 * hexdev-truco-shell (min-width: 640px)` flips `.hexdev-truco-shell-layout`
 * from column to row, which moves the panel from BELOW the felt to BESIDE it
 * (`order: 0`). Only the column case can be evicted by a felt claiming the
 * full height, so the wide rows here have never been red and are not expected
 * to be — they are the boundary half of the fence, pinning that a future
 * layout change cannot start evicting the panel on the side of the breakpoint
 * where it currently cannot. Same reasoning for running 1v1 and 2v2: the seat
 * count changes the felt's own `min-height` formula
 * (`[data-seat-count="4"]`), so one seat count alone would leave the other's
 * formula unfenced.
 */

const SELF = "in-frame-self" as PlayerId;
const OPPONENT = "in-frame-opponent" as PlayerId;
const TEAMMATE = "in-frame-teammate" as PlayerId;
const OPPONENT_2 = "in-frame-opponent-2" as PlayerId;

/** Same fixture as `table-height-budget.browser.test.ts`'s own
 * `DEAL_1V1_MAXIMAL` (duplicated, not imported — no browser-test file here
 * exports its fixtures, matching this repo's established
 * per-file-owns-its-fixtures convention). A freshly-dealt hand is enough:
 * the panel exists from the first render, and the felt's `min-height` does
 * not depend on how far the hand has been played. */
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

/** Same fixture as `table-height-budget.browser.test.ts`'s own
 * `DEAL_2V2_MAXIMAL` — see the note above `DEAL_1V1`. */
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

/** How much genuinely-unused room the host hands the widget on top of what
 * the content actually measures. Big enough that no sub-pixel or
 * intrinsic-sizing wobble can explain a panel landing outside the frame. */
const HOST_SLACK_PX = 40;

/** Sub-pixel tolerance, same 0.5px convention as
 * `card-render-size.browser.test.ts`'s own clip-edge assertion. */
const EPSILON_PX = 0.5;

const mounted: HTMLElement[] = [];

afterEach(() => {
  while (mounted.length > 0) mounted.pop()!.remove();
  document.getElementById("hexdev-truco-matchstick-defs")?.remove();
  document.getElementById("hexdev-truco-table-styles")?.remove();
});

/** The mounted element IS what `table.ts` turns into
 * `.hexdev-truco-table-shell` (`container.className = ...`), so this mirrors
 * the real production ancestor chain with no extra wrapper — the same shape
 * `card-render-size.browser.test.ts`'s own `squeezedContainer` uses. Height
 * is left unset here; `hostHeightFor` sets it after measuring. */
function mountedContainer(width: number): HTMLElement {
  const container = document.createElement("div");
  container.style.width = `${width}px`;
  document.body.appendChild(container);
  mounted.push(container);
  return container;
}

async function waitForArt(el: HTMLElement): Promise<void> {
  const images = [...el.querySelectorAll("img")];
  await Promise.all(images.map((img) => img.decode()));
}

/** Turns an auto-height shell into a definite-height one WITH room to spare,
 * and returns the height applied. Measuring first is what keeps this a
 * position fence and not an accidental height budget. */
function applyRoomyHostHeight(shell: HTMLElement): number {
  const naturalHeight = shell.getBoundingClientRect().height;
  const hostHeight = Math.ceil(naturalHeight) + HOST_SLACK_PX;
  shell.style.height = `${hostHeight}px`;
  return hostHeight;
}

/** The assertion this whole file exists for: the panel's own box, entirely
 * inside the frame the host gave the widget. All four edges — the eviction
 * seen in the column layout is vertical, but the wide tier puts the panel on
 * the horizontal axis, and a fence that only ever looked down would be blind
 * there. */
function expectPanelWithinFrame(shell: HTMLElement, hostHeight: number, context: string): void {
  const panel = shell.querySelector<HTMLElement>(".hexdev-truco-scoreboard-panel");
  if (panel === null) throw new Error(`fence setup: scoreboard panel not rendered (${context})`);
  const frame = shell.getBoundingClientRect();
  const box = panel.getBoundingClientRect();
  const where = `${context}: host gave a definite ${hostHeight}px with ${HOST_SLACK_PX}px to spare`;

  expect(box.bottom, `${where} — panel bottom (${box.bottom.toFixed(2)}px) is below the frame's own bottom edge (${frame.bottom.toFixed(2)}px)`).toBeLessThanOrEqual(frame.bottom + EPSILON_PX);
  expect(box.top, `${where} — panel top (${box.top.toFixed(2)}px) is above the frame's own top edge (${frame.top.toFixed(2)}px)`).toBeGreaterThanOrEqual(frame.top - EPSILON_PX);
  expect(box.right, `${where} — panel right (${box.right.toFixed(2)}px) is past the frame's own right edge (${frame.right.toFixed(2)}px)`).toBeLessThanOrEqual(frame.right + EPSILON_PX);
  expect(box.left, `${where} — panel left (${box.left.toFixed(2)}px) is past the frame's own left edge (${frame.left.toFixed(2)}px)`).toBeGreaterThanOrEqual(frame.left - EPSILON_PX);
}

/** 320px: the compact tier, below the 640px container-query boundary — the
 * column layout, panel stacked below the felt, and the same narrow-phone
 * width `table.visual.test.ts` mounts. 960px: the wide tier, above the
 * boundary — the row layout, panel a side column, the width
 * `table-wide.visual.test.ts` already uses for that tier. */
const TIERS = [
  { width: 320, layout: "compact/column" },
  { width: 960, layout: "wide/row" },
] as const;

describe.each(TIERS)("scoreboard panel stays inside a definite-height host — $width px ($layout)", ({ width }) => {
  it("1v1: the panel is fully within the frame", async () => {
    const shell = mountedContainer(width);
    const state = startHand(
      createHeadToHeadMatch({ playerAId: SELF, playerBId: OPPONENT, pointsToWin: 30, dealerSeat: 1 }),
      DEAL_1V1,
    );
    createMatchTableRenderer()(shell, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
    await waitForArt(shell);

    const hostHeight = applyRoomyHostHeight(shell);
    expectPanelWithinFrame(shell, hostHeight, `1v1 at ${width}px`);
  });

  it("2v2: the panel is fully within the frame", async () => {
    const shell = mountedContainer(width);
    const seatOrder: readonly [PlayerId, PlayerId, PlayerId, PlayerId] = [SELF, OPPONENT, TEAMMATE, OPPONENT_2];
    const state = startHand(createTeamMatch({ seatOrder, pointsToWin: 30, dealerSeat: 3 }), DEAL_2V2);
    createMatchTableRenderer()(shell, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
    await waitForArt(shell);

    const hostHeight = applyRoomyHostHeight(shell);
    expectPanelWithinFrame(shell, hostHeight, `2v2 at ${width}px`);
  });
});
