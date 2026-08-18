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
 *
 * PR4 (tasks §8): re-ran this whole suite after moving the call log into the
 * felt's own grid ("log" column, in flow at 900px/1280px). Re-verified, not
 * silently skipped: every BUDGET ceiling still held (12/12 green, unchanged)
 * — the log's own bounded max-height never exceeds what the felt's other
 * rows already reserve, so nothing needed an update yet.
 *
 * PR5-T10 (tasks §9, FINAL — this is the re-measurement the docblock above
 * used to anticipate): re-measured all 12 (width x seat-count) baselines now
 * that the banner lane (`--hx-band-banner`, padding-top on
 * `.hexdev-truco-center`) and the action-bar row (`--hx-band-action-total`,
 * a real 4th grid-template-row track) both add real height. RED-first,
 * same-file precedent as PR3-T3's own: a deliberately-unsatisfiable
 * `toBeLessThanOrEqual(-1)` probe run first, all 12 failing with the real
 * measured numbers in every message; those 12 were then multiplied by 1.08
 * (rounded up) and locked in as the new `BUDGET` below. Old (PR3/PR4)
 * measured baseline -> new (PR5) measured baseline, per (width, mode) —
 * every one of the 12 grew, as expected (the bands add real height
 * everywhere, not just at compact):
 *   375  1v1: 561.9375   -> 669.9375   | 2v2: 684.75      -> 732.75
 *   640  1v1: 554.96875  -> 690.96875  | 2v2: 725.421875  -> 837.421875
 *   700  1v1: 554.96875  -> 690.96875  | 2v2: 725.421875  -> 837.421875
 *   900  1v1: 669.375    -> 817.375    | 2v2: 749.421875  -> 873.421875
 *   960  1v1: 669.375    -> 817.375    | 2v2: 749.421875  -> 873.421875
 *   1280 1v1: 746.59375  -> 910.59375  | 2v2: 903.609375  -> 1043.609375
 * (640/700 and 900/960 share one measured pair each — the same "SAME tier,
 * confirms the @container boundary is inclusive" fact this file's own width
 * list exists to prove, still holding after PR5's own changes.)
 *
 * COMPACT TOTAL vs. THE PHONE — the whole history of this paragraph, kept
 * because how it went wrong is the point. `el` in this file's own `it` blocks
 * is the shell element itself (`container.className =
 * "hexdev-truco-table-shell"` in table.ts), so every 375px number here is the
 * FULL widget total, scoreboard panel included.
 *
 * PR5 measured 669.9375px (1v1) against a phone window this repo has quoted as
 * "~530-601px iPhone SE viewport" since commit 2ece04e, and disclosed the ~69px
 * overrun honestly, in this paragraph, with two named causes: (1) the real
 * scoreboard panel measured ~158.6px, not the ~100px design §8.3 assumed; (2)
 * the felt's own content exceeded its `min-height` floor by ~24px. Then FU-3
 * paid cause (1) down to 92.9375px and brought 1v1 to 604.28125px — "within
 * ~3px of the 601px window ceiling", which this paragraph then recorded as
 * essentially arrived.
 *
 * IT WAS NOT ARRIVED, AND THE PARAGRAPH IS WHY IT STAYED THAT WAY. Every
 * number above was measured and honest, and the whole accounting was still
 * decorative, because nothing anywhere ASSERTED the 601px it kept quoting: the
 * only enforced compact ceiling was `BUDGET[375]`, a x1.08 multiple of whatever
 * the widget currently measured, which grows every time the widget does. So
 * 1v1 sat 3.28px over the window it was designed for and 2v2 sat 66.09px over
 * it — the scoreboard genuinely below the fold on a phone, a player scrolling
 * to see their own score — while this file was green and this docblock read
 * like a debt being paid down. Five debts in this repo have now had the same
 * shape: a comment claiming more than anything enforced.
 *
 * So the window is now `PHONE_VIEWPORT_CEILING` below, asserted on both seat
 * counts at 375px, and the two compact changes that get under it are argued at
 * `table-styles.ts` (the 2v2 side seats' 45px card backs, and the scoreboard
 * panel's captions leaving the flow). Measured after: 1v1 587.34375px, 2v2
 * 587.34375px — one number, 13.66px under the ceiling.
 *
 * WHAT REMAINS OPEN, stated as debt rather than as a plan: cause (2) above,
 * the felt's ~24.29px of real content past its own compact `min-height` floor.
 * It costs no height (a floor is a lower bound; the content is what renders),
 * so it is not what put this widget over the phone — it is a floor that
 * under-protects its own essential content under squeeze. The measured honest
 * constants are in `table-styles.ts`'s two `min-height` comments, and the
 * 4-seat one has been corrected there; the 1v1 one is deliberately left at its
 * wrong value with the right number written beside it, for the reason that
 * comment gives. */

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

/**
 * The phone the whole compact tier was designed for, ASSERTED rather than
 * described.
 *
 * PROVENANCE, traced with `git log -S` rather than restated from memory:
 * commit 2ece04e ("~530-601px iPhone SE viewport") is where this window first
 * appears. It survived as prose in three places — `table-styles.ts`'s own
 * banner-slot note, this file's docblock, and
 * `table-height-stability.browser.test.ts`'s — and in NONE of them as an
 * assertion. The only enforced compact ceiling was `BUDGET[375]`, which was
 * never a device number at all: it was the measured height times this file's
 * own 1.08 headroom convention, so every time the widget grew, the ceiling
 * grew with it. That is exactly how a 601px design target ended up shipping a
 * 667.09px 2v2 widget with the scoreboard below the fold, and how the comment
 * describing the window outlived the window itself.
 *
 * A headroom multiple is the right convention for the 640px+ rows, whose job
 * is "notice when this grows a lot". It is the wrong one for a phone, whose
 * job is "fit". So this row alone is an absolute: the widget's own total, at
 * the tallest state each seat count can reach, must fit a 601px viewport with
 * no scroll — because a player who has to scroll to see the score is the bug
 * this constant exists to prevent.
 *
 * It applies to BOTH seat counts deliberately. Targeting it surfaced that 1v1
 * was 3.28px over as well (604.28), not just 2v2 (667.09) — a fact the old
 * `BUDGET[375]` of 653/721 hid completely.
 */
const PHONE_VIEWPORT_CEILING = 601;

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
  /* The 375px row is the ONE row that is not a x1.08 headroom number: it is
   * PHONE_VIEWPORT_CEILING itself, a real device constraint. See that
   * constant's own note. */
  375: { "1v1": PHONE_VIEWPORT_CEILING, "2v2": PHONE_VIEWPORT_CEILING },
  640: { "1v1": 747, "2v2": 905 },
  700: { "1v1": 747, "2v2": 905 },
  900: { "1v1": 883, "2v2": 944 },
  960: { "1v1": 883, "2v2": 944 },
  1280: { "1v1": 984, "2v2": 1128 },
};

/** FU-3 (debt: compact scoreboard strip): the panel's own height ceiling at
 * the compact tier, measured at the WORST-CASE score a target-30 match can
 * show (28-27 -> malas full + buenas near-full on both sides, 6 casitas per
 * team, 12 total). Before FU-3 the strip measured 158.59px at 375px — the
 * malas/buenas groups stacked vertically inside an unstyled block
 * (.hexdev-truco-scoreboard had no CSS rule at all), paying the 47.8px
 * casita row height twice per team plus two caption lines. RED-first:
 * measured 158.59px against the pre-FU-3 CSS with this same assertion, then
 * the compact strip was laid out horizontally (one row per team) and this
 * ceiling locked to the new measured value (92.9375px) x 1.08 rounded up —
 * the file's established ~8% headroom convention.
 *
 * PHONE FOLD (this change): 92.9375px -> 76px, re-locked at 76 x 1.08 rounded
 * up. FU-3 shrank the casitas to 34px expecting to buy height and bought none:
 * the rotated "Buenas" caption beside them was 2.5px taller, so IT was the
 * row, and the casita size was free of effect. With the captions out of flow
 * (visually hidden, still announced — see table-styles.ts's own block, and
 * scoreboard-panel-line-box.browser.test.ts for why a pinned leading could not
 * fix a rotated caption) the row is the casita SVG's own geometry, and 28px
 * casitas finally spend as casita size. 8+8 padding + 2 x 28 + 4 gap = 76.00,
 * and unlike every previous value of this constant it is now the same 76.00 on
 * every font this repo can synthesize. */
const SCOREBOARD_COMPACT_WORST_CASE_BUDGET = 83;

describe("FU-3: the compact scoreboard strip stays a strip, not a block — 375px, worst-case score", () => {
  it("panel height at 28-27 (target 30, 6 casitas per team) stays under the compact budget", async () => {
    const el = mountedContainer(375);
    const render = createMatchTableRenderer();
    const base = startHand(
      createHeadToHeadMatch({ playerAId: SELF, playerBId: OPPONENT, pointsToWin: 30, dealerSeat: 1 }),
      DEAL_1V1_MAXIMAL,
    );
    // Score set directly on the constructed state — the same convention
    // table.visual.test.ts's withNonTrivialScore already uses; a score only
    // otherwise changes through full played hands this fence has no reason
    // to replay.
    const state = { ...base, teams: base.teams.map((team, index) => ({ ...team, score: index === 0 ? 28 : 27 })) };
    render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
    await waitForArt(el);

    const panel = el.querySelector(".hexdev-truco-scoreboard-panel");
    if (panel === null) throw new Error("fence setup: scoreboard panel not rendered");
    expect(panel.querySelectorAll("svg").length, "sanity: this really is the 12-casita worst case").toBe(12);
    const height = panel.getBoundingClientRect().height;
    expect(height, "compact scoreboard panel height at 375px, worst-case score").toBeLessThanOrEqual(
      SCOREBOARD_COMPACT_WORST_CASE_BUDGET,
    );
  });
});

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
