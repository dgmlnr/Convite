import { afterEach, describe, expect, it } from "vitest";
import { createHeadToHeadMatch, createTeamMatch, getLegalActions, getViewFor, startHand } from "@hexdev/truco-engine";
import type { DealInput, PlayerId } from "@hexdev/truco-engine";
import { createMatchTableRenderer } from "./table.js";

/**
 * PR3-T3 (tasks §7): a HEIGHT-BUDGET fence — distinct from
 * `table-height-stability.browser.test.ts`'s own STABILITY fence (which
 * proves height never CHANGES across a played hand at a fixed width). This
 * file proves the opposite direction: that the felt's rendered height at its
 * tallest reachable state (the MAXIMAL fixtures below) stays under an
 * explicit BUDGET ceiling per width x seat-count, so a future change cannot
 * silently blow the table past a reasonable size without this suite going
 * RED first.
 *
 * PROVISIONAL (tasks §7/§12): `BUDGET` below is measured against PR3's own
 * scalar-only layout (card width/gap/padding — no banner/action bands
 * reserve any space yet, since those are consumed starting PR5). PR5-T10
 * re-measures this exact table once the banner lane and action-bar row add
 * real height, and updates these same constants deliberately (never
 * silently) — this file's own name and this docblock are what a PR5
 * implementer finds when they come back to update it.
 *
 * WIDTH LIST — approved deviation from the tasks artifact's own [375, 700,
 * 960, 1280] (PR3a's four container tiers): this file additionally measures
 * at 640 and 900, the exact `@container hexdev-truco-shell` boundary widths
 * PR3-T1 declared (`min-width: 640px` / `min-width: 900px`). The PR3a native
 * review flagged that no fence had ever exercised a container query AT its
 * own boundary (only the tier interiors, at 700/960, were covered) — a
 * regression that only shows up exactly at the boundary (e.g. an off-by-one
 * in `min-width` arithmetic, or a rounding edge in a `calc()`) would pass
 * every existing fence and still ship. Adding these two rows closes that gap
 * without touching `table-height-stability.browser.test.ts`'s own width
 * list, which stays scoped to its original four tiers per PR3a.
 */

const SELF = "budget-self" as PlayerId;
const OPPONENT = "budget-opponent" as PlayerId;
const TEAMMATE = "budget-teammate" as PlayerId;
const OPPONENT_2 = "budget-opponent-2" as PlayerId;

/** Same fixture as `table-height-stability.browser.test.ts`'s own
 * `DEAL_1V1_MAXIMAL` (duplicated here, not imported — neither file exports
 * its fixtures, matching this repo's own established convention of each
 * browser-test file owning its own fixture literals, e.g.
 * `table-2v2.visual.test.ts`'s `FIXED_DEAL_4`/`PILED_DEAL_4`). */
const DEAL_1V1_MAXIMAL: DealInput = [
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

/** Same fixture as `table-height-stability.browser.test.ts`'s own
 * `DEAL_2V2_MAXIMAL` — see the note above `DEAL_1V1_MAXIMAL`. */
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

/** The BASELINE (dealt, nothing has happened yet) state of each MAXIMAL
 * fixture is sufficient for this budget measurement — it is not a weaker
 * substitute for actually playing the hand out. `table-height-stability.
 * browser.test.ts`'s own `expectStableHeights` fence already independently
 * proves, for these exact same fixtures at 375/700/960/1280, that the
 * felt's height NEVER changes across the whole played hand at a fixed
 * width (baseline === mid-hand === fully-resolved). Re-deriving that same
 * invariant here by re-running the entire dispatch chain would duplicate
 * ~80 lines this file has no independent reason to own; this file's own
 * job is strictly the budget ceiling, not stability, so it measures the one
 * baseline render and trusts the sibling fence for the rest. */
const WIDTHS = [375, 640, 700, 900, 960, 1280] as const;

/** ~8% headroom above the measured baseline, rounded up to a whole pixel —
 * PROVISIONAL, see the file docblock. RED-first: measured with a loose
 * `toBeLessThanOrEqual(-1)` probe (deliberately unsatisfiable), which failed
 * with the real number in every message; those 12 real numbers were then
 * multiplied by 1.08 and rounded up here, and the assertion switched to the
 * real ceiling below. Exact measured baselines (record kept for the next
 * implementer who re-derives these): 375px 561.9375/684.75, 640px+700px
 * (SAME tier — 640 already satisfies the medium `@container` `min-width:
 * 640px` boundary, confirming it is inclusive, not exclusive)
 * 554.96875/725.421875, 900px+960px (SAME tier, same reasoning for the wide
 * `min-width: 900px` boundary) 669.375/749.421875, 1280px
 * 746.59375/903.609375. */
const BUDGET: Record<(typeof WIDTHS)[number], { readonly "1v1": number; readonly "2v2": number }> = {
  375: { "1v1": 607, "2v2": 740 },
  640: { "1v1": 600, "2v2": 784 },
  700: { "1v1": 600, "2v2": 784 },
  900: { "1v1": 723, "2v2": 810 },
  960: { "1v1": 723, "2v2": 810 },
  1280: { "1v1": 807, "2v2": 976 },
};

describe.each(WIDTHS)("table height BUDGET (PR3-T3, provisional pre-band ceiling) — %ipx", (width) => {
  it("1v1 MAXIMAL: baseline rendered height stays under budget", async () => {
    const el = mountedContainer(width);
    const render = createMatchTableRenderer();
    const state = startHand(
      createHeadToHeadMatch({ playerAId: SELF, playerBId: OPPONENT, pointsToWin: 30, dealerSeat: 1 }),
      DEAL_1V1_MAXIMAL,
    );
    render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
    await waitForArt(el);

    const height = el.getBoundingClientRect().height;
    expect(height, `1v1 baseline height at ${width}px`).toBeLessThanOrEqual(BUDGET[width]["1v1"]);
  });

  it("2v2 MAXIMAL: baseline rendered height stays under budget", async () => {
    const el = mountedContainer(width);
    const render = createMatchTableRenderer();
    const seatOrder: readonly [PlayerId, PlayerId, PlayerId, PlayerId] = [SELF, OPPONENT, TEAMMATE, OPPONENT_2];
    const state = startHand(createTeamMatch({ seatOrder, pointsToWin: 30, dealerSeat: 3 }), DEAL_2V2_MAXIMAL);
    render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
    await waitForArt(el);

    const height = el.getBoundingClientRect().height;
    expect(height, `2v2 baseline height at ${width}px`).toBeLessThanOrEqual(BUDGET[width]["2v2"]);
  });
});
