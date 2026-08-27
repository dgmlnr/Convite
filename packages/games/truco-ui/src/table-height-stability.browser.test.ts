import { afterEach, describe, expect, it } from "vitest";
import {
  applyAction,
  createHeadToHeadMatch,
  createTeamMatch,
  getLegalActions,
  getViewFor,
  startHand,
} from "@hexdev/truco-engine";
import type { Action, DealInput, MatchState, PlayerId } from "@hexdev/truco-engine";
import { createMatchTableRenderer } from "./table.js";

/**
 * The literal bug report: "a banner appears on the table, the window grows;
 * it resolves, the window shrinks" — the host page's embedded iframe resizes
 * to match the widget's own reported content height (design §6:
 * `ResizeObserver` on `document.documentElement` -> `resize { height }`), and
 * every transient piece of table chrome (a pending call, a hand-outcome
 * acknowledgement, the señas picker opening) was changing that content height.
 *
 * This suite proves the fix at its real source: the table renderer's own
 * rendered DOM, driven through a REAL hand via the REAL engine (never a
 * hand-authored view) — not the postMessage/iframe plumbing, which only
 * relays whatever height this DOM naturally has. `apps/widget-app/src/main.ts`
 * observes `document.documentElement`, whose own height is likewise
 * content-driven with no ancestor imposing a fixed height — the same
 * situation `mountedContainer` below deliberately reproduces (no fixed
 * height, unlike `table.visual.test.ts`'s own screenshot fixtures, which set
 * one on purpose for a stable capture).
 */

const SELF = "height-self" as PlayerId;
const OPPONENT = "height-opponent" as PlayerId;
const TEAMMATE = "height-teammate" as PlayerId;
const OPPONENT_2 = "height-opponent-2" as PlayerId;

const DEAL_1V1: DealInput = [
  [
    { suit: "espada", rank: 4 },
    { suit: "oro", rank: 7 },
    { suit: "basto", rank: 2 },
  ],
  [
    { suit: "copa", rank: 12 },
    { suit: "espada", rank: 5 },
    { suit: "oro", rank: 3 },
  ],
];

const DEAL_2V2: DealInput = [
  [
    { suit: "espada", rank: 1 },
    { suit: "basto", rank: 1 },
    { suit: "oro", rank: 1 },
  ],
  [
    { suit: "copa", rank: 4 },
    { suit: "espada", rank: 4 },
    { suit: "basto", rank: 4 },
  ],
  [
    { suit: "oro", rank: 5 },
    { suit: "copa", rank: 5 },
    { suit: "espada", rank: 5 },
  ],
  [
    { suit: "basto", rank: 6 },
    { suit: "oro", rank: 6 },
    { suit: "copa", rank: 6 },
  ],
];

/** A maximal 1v1 hand (T-7 fence): the exact split-then-decided-at-trick-3
 * deck `card-play.test.ts`'s own end-to-end fixture already proves produces
 * exactly 3 resolved tricks, not fewer, paired here with a full envido chain
 * AND a fully-escalated truco chain (truco -> retruco -> vale cuatro, each
 * accepted) — the tallest possible combination of transient chrome (the
 * widest calls row, both banners in sequence, three growing piles) this
 * table can ever show at once. */
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

/** A maximal 2v2 hand (T-7 fence): reuses `card-play.test.ts`'s own
 * split-then-decided-at-trick-3 four-seat fixture, paired with a full envido
 * chain and a fully-escalated truco chain traded across both teams — the
 * tallest and widest possible combination this table can ever show. */
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

/** PR3-T2 (tasks §7): parameterized over the four container tiers (compact
 * 375, medium 700, wide 960, ultra 1280 — tasks §3.8) instead of the single
 * hardcoded phone width this suite used before PR3. Deliberately NO fixed
 * height — see the file docstring for why that matters here. */
function mountedContainer(width: number): HTMLElement {
  container = document.createElement("div");
  container.style.width = `${width}px`;
  document.body.appendChild(container);
  return container;
}

/** Card art loads asynchronously; awaiting it removes a source of height
 * flakiness unrelated to this suite's own subject, same discipline
 * `table.visual.test.ts`'s own `waitForArt` already established. */
async function waitForArt(el: HTMLElement): Promise<void> {
  const images = [...el.querySelectorAll("img")];
  await Promise.all(images.map((img) => img.decode()));
}

/**
 * Whoever currently holds the floor, and the opponent who would answer them.
 *
 * Opening a truco is taking the floor, so it belongs to the seat on turn —
 * and after a trick resolves that seat is its WINNER, which these chains do
 * not (and should not) hard-code. Naming the caller literally made every one
 * of them depend on which card happened to win, which is exactly the kind of
 * fixture that breaks for a reason unrelated to what it measures.
 */
function openTruco(state: MatchState): { readonly caller: PlayerId; readonly answerer: PlayerId } {
  const hand = state.hand;
  if (hand === undefined || hand === null) throw new Error("test setup: no hand in progress");
  const caller = state.players.find((player) => player.seat === hand.turnSeat);
  if (caller === undefined) throw new Error("test setup: nobody holds the turn");
  const answerer = state.players.find((player) => player.teamId !== caller.teamId);
  if (answerer === undefined) throw new Error("test setup: the caller has no opponent");
  return { caller: caller.id, answerer: answerer.id };
}

function dispatch(state: MatchState, action: Action): MatchState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`test setup: illegal action ${JSON.stringify(action)} — ${result.violation}`);
  return result.state;
}
/**
 * The whole declaration round, everybody saying their number.
 *
 * A reveal used to be ONE action that settled the envido for every seat. It
 * is a round now — one `declare-envido` per player, from the mano around the
 * table. Declaring for everybody reproduces the old outcome exactly (the
 * highest number wins either way), which is what keeps these fixtures
 * measuring what they always measured. Conceding is left out on purpose:
 * "son buenas" ends the round for the conceding TEAM, which is a different
 * scenario and belongs to the engine's own tests.
 */
function declareAll(state: MatchState): MatchState {
  let next = state;
  for (let i = 0; i < next.players.length; i += 1) {
    const seat = (next.hand!.manoSeat + i) % next.players.length;
    const who = next.players.find((player) => player.seat === seat)!;
    next = dispatch(next, { type: "declare-envido", playerId: who.id, declaration: "points" });
  }
  return next;
}


function findPlayCard(state: MatchState, playerId: PlayerId): Action | undefined {
  return getLegalActions(state, playerId).find((action) => action.type === "play-card");
}

/** Plays one legal card for whichever of the two given players currently owes
 * one — mirrors the real turn order without this test tracking `turnSeat`
 * itself. */
function playNextCard(state: MatchState, a: PlayerId, b: PlayerId): MatchState {
  return playNextCardAmong(state, [a, b]);
}

/** Generalization of playNextCard over any number of seats (2v2's four
 * players): exactly one of them has a legal play-card action at a time
 * (whoever `turnSeat` names), so checking every candidate and dispatching
 * the first hit is equivalent to tracking `turnSeat` directly. */

/**
 * Who, if anyone, is currently offered an envido to open.
 *
 * In 2v2 only a PIE may open one (envido-opener.test.ts) and a pie is never
 * the mano, so this is empty at the top of the hand: seats have to play their
 * way there first. `walkToAnEnvido` below is what these sequences use instead
 * of calling one from a named seat.
 */
function whoMayOpenAnEnvido(state: MatchState, players: readonly PlayerId[]): PlayerId | undefined {
  return players.find((player) => getLegalActions(state, player).some((action) => action.type === "call-envido"));
}

function playNextCardAmong(state: MatchState, players: readonly PlayerId[]): MatchState {
  for (const player of players) {
    const play = findPlayCard(state, player);
    if (play !== undefined) return dispatch(state, play);
  }
  throw new Error("test setup: no legal play-card action for any given player — is the hand already decided?");
}

/** Asserts every recorded height matches the first, within a tolerance loose
 * enough to absorb genuine sub-pixel layout rounding but tight enough that
 * ANY transient banner/picker's own real content height (tens of pixels)
 * still fails it. */
function expectStableHeights(heights: readonly number[]): void {
  expect(heights.length).toBeGreaterThan(2);
  const baseline = heights[0]!;
  for (const [index, height] of heights.entries()) {
    expect(Math.abs(height - baseline), `render #${index}: ${height}px vs baseline ${baseline}px`).toBeLessThan(1);
  }
}

/** PR3-T2's own regression fence (tasks §7 exit gate): the four container
 * tiers this suite now runs at (tasks §3.8: compact/medium/wide/ultra).
 * 375 is the pre-PR3 width, kept first so it stays the visually-obvious
 * "nothing changed here" row. */
const WIDTHS = [375, 700, 960, 1280] as const;

/** T-7 fence, exact numbers (tasks §7/PR3-T2): the two MAXIMAL cases below
 * are this file's own named "fence, not a one-time check" — this locks
 * their baseline (freshly-dealt, nothing-happened-yet) rendered height to
 * an exact, measured number per width x seat-count, on top of the existing
 * purely-relative expectStableHeights check both already run. 375's values
 * are byte-for-byte what this suite measured before PR3-T1's axis change
 * (proving zero pixel leakage into the compact tier); 700/960/1280 are
 * freshly measured against PR3-T1's own per-tier scalar constants (RED-
 * first: measured with a temporary loose assertion, then locked here — see
 * apply-progress for the exact RED readings). A value drifting later means
 * either a real regression or an intentional constant change that must
 * update this table deliberately, never silently.
 *
 * PR4 (tasks §8, THS-2): re-measured at every width after moving the call
 * log into the felt's own grid ("log" column, in flow at wide/ultra) —
 * EVERY value below is UNCHANGED (960/1280 included, the two tiers where the
 * log is now genuinely in flow). This was verified by actually re-running
 * this suite, not assumed from the PR3 numbers still looking plausible; see
 * the dedicated "PR4: the felt's height with an empty call log matches..."
 * fence below for the direct, minimal proof of WHY (the log's own max-height
 * budget never exceeds what the top/center/bottom rows already reserve).
 *
 * PR5 (tasks §9, THS-2 — this PR modifies layout, so the fence must extend
 * in the same PR): re-measured all 8, RED-first (temporarily loosened the
 * tolerance to observe the real numbers, see table-height-budget.browser.
 * test.ts's own identically-sourced RED readings for the same 8 values —
 * both files measure the same baseline state, so they share one real
 * measurement pass). EVERY value grew — the banner lane and action-bar row
 * both add real height everywhere now, unlike PR4's zero-delta relocation:
 *   375  1v1: 561.9375   -> 669.9375   | 2v2: 684.75      -> 732.75
 *   700  1v1: 554.96875  -> 690.96875  | 2v2: 725.421875  -> 837.421875
 *   960  1v1: 669.375    -> 817.375    | 2v2: 749.421875  -> 873.421875
 *   1280 1v1: 746.59375  -> 910.59375  | 2v2: 903.609375  -> 1043.609375
 * Every delta matches its own tier's formula terms exactly, term-for-term —
 * no unaccounted growth:
 *   1v1 (banner + action + felt-gap): 375 +108 (60+40+8) | 700 +136
 *     (76+48+12) | 960 +148 (80+52+16) | 1280 +164 (84+56+24)
 *   2v2 (action-total + felt-gap — the banner term is deliberately absent
 *     from the 2v2 formula, tasks §9/PR5-T5): 375 +48 (40+8) | 700 +112
 *     (100+12) | 960 +124 (108+16) | 1280 +140 (116+24)
 * See table-height-budget.browser.test.ts for the full compact-1v1-total-vs-
 * the-530-601px-window accounting.
 *
 * FU-3 (debt: compact scoreboard strip): the 375px rows drop by exactly
 * 65.65625px each — the scoreboard panel's own compaction (measured
 * 158.59375px -> 92.9375px at compact, see table-styles.ts's FU-3 block and
 * table-height-budget.browser.test.ts's own FU-3 fence), reaching the shell
 * total unchanged through the felt (the felt itself did not move a pixel):
 *   375 1v1: 669.9375 -> 604.28125 | 2v2: 732.75 -> 667.09375
 * 700/960/1280 are untouched — the panel is a side COLUMN there, outside
 * FU-3's compact-only (width < 640px) container query, re-verified by this
 * suite staying green at those widths with the values below unchanged.
 *
 * THE PHONE FOLD: the 375px row now reads ONE number for both seat counts, and
 * that is the shape of the fix rather than a coincidence. Two compact changes
 * land here (table-styles.ts): the 2v2 side seats' card backs shrink to 45px,
 * which stops the side column driving the middle row and hands that job to the
 * centre column — the one box that is identical in both seat counts, so 2v2
 * converges on 1v1's own height and cannot be pushed below it by shrinking
 * those backs further; and the compact scoreboard panel drops 92.9375 ->
 * 76.00px with its rotated captions out of flow. Measured, RED-first (this
 * suite failed with both real numbers in its message before they were locked
 * in here):
 *   375 1v1: 604.28125 -> 587.34375  (-16.9375, the panel alone)
 *   375 2v2: 667.09375 -> 587.34375  (-79.75, the panel plus the whole 62.8125
 *                                     the two side stacks used to cost)
 * Both now sit 13.66px under PHONE_VIEWPORT_CEILING, the 601px phone viewport
 * table-height-budget.browser.test.ts asserts. 700/960/1280 are untouched
 * again, and for the same reason as FU-3: both changes are inside compact-only
 * (width < 640px) container queries.
 *
 * THE LAST FONT ON THE CRITICAL PATH: the three 2v2 rows below drop by exactly
 * 0.09375px each — `.hexdev-truco-relation-label` (the "Compañero"/"Rival"
 * pill, 2v2 ONLY, which is why no "1v1" row moves and why this outlived three
 * rounds of the same bug) gaining the `line-height: 1.2` its sibling boxes
 * already carried. Its filled line box was `normal`, so this table's total was
 * really reporting whichever face the machine resolved `system-ui` to: headed
 * Chromium answered Adwaita Sans (label 14px), headless answered Noto Sans
 * (16px), and the four 2v2 rows here were the last tests in the repo that
 * disagreed between the two modes. 9.92px x 1.2 + 2px padding = 13.90625px,
 * now the label's height on every machine.
 *   700  2v2: 837.421875  -> 837.328125
 *   960  2v2: 873.421875  -> 873.328125
 *   1280 2v2: 1043.609375 -> 1043.515625
 * 375 2v2 (587.34375) does not move: at compact the side column is not the
 * tallest column, so the label had no reach into this total there — measured,
 * not reasoned. Re-locking these three is HONESTY, NOT NECESSITY, and worth
 * saying plainly: `expectExactHeight`'s tolerance is 0.5px and the delta is
 * 0.09375px, so the CSS fix alone turns these rows green in both modes with
 * the old numbers still written here. They are updated because a constant that
 * names a height nothing measures any more is a slow lie, not because anything
 * was red. The property that makes them portable at all now has its own fence:
 * relation-label-line-box.browser.test.ts.
 *
 *
 * ONE BANNER RESERVE FOR EVERY TIER (375 both: -4; 700 1v1: -20; 960 1v1: -24;
 * 1280 1v1: -28). `--hx-band-banner` used to be a ladder of five literals
 * (60/76/80/84/112) because the pending-call pill WRAPPED, and wrapped
 * differently at every width. That pill no longer paints in this lane at all
 * -- it moved onto the seat that spoke (.hexdev-truco-seat-call) -- and the
 * two occupants left over never wrap: measured in real Chromium at
 * 375/700/960/1280/1550 in BOTH seat counts, the senas strip is 50px and the
 * end-of-hand banner 47px, flat. The ladder collapses to one 56px reserve
 * (50px worst case + ~12% for font variance), and each row here drops by
 * exactly the reserve that tier used to carry.
 *   375  1v1: 587.34375 -> 561.34375   375  2v2: 587.34375 -> 583.34375
 *   700  1v1: 690.96875 -> 648.96875
 *   960  1v1: 817.375   -> 771.375
 *   1280 1v1: 910.59375 -> 860.59375
 * 1v1 drops a further 22px on top of that because the reserve splits ONCE, by
 * SEAT COUNT: `table.ts` mounts exactly two things into the lane, and the
 * señas strip (50px) is 2v2-only -- there is no partner to signal to in 1v1,
 * whose lane therefore holds the 29.28px end-of-hand banner alone and reserves
 * 34px. That split is the one this token is allowed; splitting by WIDTH is
 * what banner-lane-reserve.browser.test.ts now rejects, in both directions
 * (too small clips the strip, too large is this same silent waste).
 * THE 2v2 ROWS AT 700/960/1280 DO NOT MOVE, and that is the interesting half:
 * those totals are set by the side column (three backs stacked vertically),
 * which is taller than the centre column's banner-plus-trick stack, so the
 * banner lane has no reach into them -- measured, not reasoned, and the same
 * fact `--hx-fit-residual`'s own comment in table-styles.ts leans on for the
 * 2v2 fullscreen fit. Which is also why 2v2 fullscreen gained nothing here:
 * that layout was already AT its fit limit (table-viewport-fit rejects -34px
 * where -28px passes), so the residual absorbs the 28px the banner gave up
 * instead of spending it on bigger cards.
 * ULTRA 2v2, THE ACTION BAR STOPS STACKING (1280 2v2: 1043.515625 ->
 * 983.515625). The two strips -- calls, then senas -- stacked at every tier
 * from 640px up, which the 640px block introduced when the bar really was too
 * narrow to seat both. Measured at ultra it no longer is: the calls row asks
 * 166px and senas 102px inside a bar 955px wide, so the stack was spending a
 * whole extra band of HEIGHT to buy width that was already there. From 1280px
 * up they sit side by side and --hx-band-action-total drops from
 * calc(56px * 2 + 4px) back to one 56px strip.
 *
 * The delta is that 60px and nothing else, which is the point of re-locking it
 * here rather than widening the tolerance: this row is the only one that moves
 * (375/700/960 keep the stacked bar, and every 1v1 row is untouched because
 * --hx-band-action-total was only ever overridden for 2v2), and it moves by
 * exactly the band the felt got back. A height that changed by some other
 * amount would mean this change reached something it had no business
 * reaching. Note that what this file actually fences -- the height never
 * MOVING across a played hand -- stayed green throughout: expectStableHeights
 * passed, and only this pinned constant went stale. */
/* ONE RAIL: 375px drops another 84px, and both other tiers are untouched.
 *   375  1v1: 561.34375 -> 477.34375   375  2v2: 583.34375 -> 499.34375
 * The scoreboard used to be an in-flow strip stacked above the felt on a
 * phone, and the call log floated over the centre of the cloth. They share
 * one rail now, and on this tier that rail is a DRAWER: out of flow behind a
 * tab, so the strip's 84px go back to the table. Exactly 84 in both seat
 * counts, because it is the same strip in both.
 *
 * Out of flow is also what keeps this file's real fence green. In flow, a
 * rail holding the call log GROWS as the chain does -- which is the height
 * moving across a played hand, the one thing here forbids. Measured before
 * the drawer: this suite failed at 375px on exactly those steps.
 *
 * 700/960/1280 needed no update at all: from 640 up the rail was already a
 * fixed-width column of the shell's own height, so moving the log into it
 * changes what the column holds and never how tall anything is. */
/* THE TURN RING'S OWN LANE: +5px at 375, +1px at 700, nothing above.
 *   375  1v1: 477.34375 -> 482.34375   375  2v2: 499.34375 -> 504.34375
 *   700  1v1: 648.96875 -> 649.96875   700  2v2: 837.328125 -> 838.328125
 * The active-turn ring is an outline plus a halo, both painted outside the
 * hand and taking no layout space -- so the action bar one grid row below sat
 * under 5px of gold at compact. The hand now reserves whatever the grid gap
 * does not already cover (--hx-ring-reach minus --hx-felt-gap), which is 5px
 * where the gap is 8 and 1px where it is 12, and exactly zero from wide up
 * where the gap already exceeds the ring. Card size pays for it, which is why
 * it is the shortfall and not the whole reach. */
const MAXIMAL_BASELINE_HEIGHT: Record<(typeof WIDTHS)[number], { readonly "1v1": number; readonly "2v2": number }> = {
  /* THE PARTNER'S CARDS JOIN THE RIVALS' SIZE: 2v2 at 375 drops 23px more.
   *   375  2v2: 504.34375 -> 481.4375
   * The seat across the table was the only one of the three back-only seats
   * still drawing a full-size card, and it draws three of them in a row --
   * so it was the tallest row on a phone's felt. 1v1 is untouched: it has no
   * such seat. */
  /* THE SCROLLBAR'S OWN LANE: +10px at 375, and only there.
   *   375  1v1: 482.34375 -> 492.34375   375  2v2: 481.4375 -> 491.4375
   * The call band stopped being a scroller of its own -- it was wrapping a
   * second, outer scroller around the groups that already scroll, so a player
   * had two nested boxes to drag. With the scrolling where it belongs, the
   * group's horizontal scrollbar takes its 10px inside the band instead of
   * outside it. Measured off the group's own box, not guessed. */
  /* THE TURN RING GETS ITS ROOM, and 2v2 is the only shape that pays for it.
   *   375  2v2: 491.4375   -> 496.421875   (+4.98, the compact card size)
   *   700  2v2: 786.328125 -> 793.328125   (+7)
   *   960  2v2: 817.328125 -> 824.328125   (+7)
   *  1280  2v2: 983.515625 -> 990.515625   (+7)
   * The ring paints 13px outside the box it belongs to and the anchor gap was
   * 6, so 7px of gold ran through each seat's own RIVAL/COMPAÑERO chip.
   * Reserved in the gap, on every anchor and every turn, so the table cannot
   * reflow as the turn goes round. 1v1 has no relation labels and does not
   * move. */
  375: { "1v1": 492.34375, "2v2": 496.421875 },
  /* THE BAND GIVES BACK WHAT IT WAS RESERVING FOR A STRIP IT NO LONGER HAS.
   *   700  2v2: 838.328125 -> 786.328125   (-52)
   *   960  2v2: 873.328125 -> 817.328125   (-56)
   * 2v2 carried a señas strip beside the calls, so from 640px up the band
   * stacked the two and booked a double height for them. That control is in
   * the side rail now; the band holds one strip and books one strip. 1v1 never
   * had the second strip and does not move. */
  700: { "1v1": 649.96875, "2v2": 793.328125 },
  960: { "1v1": 771.375, "2v2": 824.328125 },
  1280: { "1v1": 860.59375, "2v2": 990.515625 },
};

function expectExactHeight(actual: number, expected: number, label: string): void {
  expect(Math.abs(actual - expected), `${label}: measured ${actual}px, expected ${expected}px`).toBeLessThan(0.5);
}

describe.each(WIDTHS)("createMatchTableRenderer — the table's own reported height stays constant across a whole played hand (stable window height) — %ipx", (width) => {
  it("1v1: envido called/accepted/revealed, a trick resolves, truco called/accepted, cards played to a decided hand — the height never changes", async () => {
    const el = mountedContainer(width);
    const render = createMatchTableRenderer();
    const heights: number[] = [];

    const recordRender = async (state: MatchState): Promise<void> => {
      const view = getViewFor(state, SELF);
      const legal = getLegalActions(state, SELF);
      render(el, view, legal, () => {});
      await waitForArt(el);
      heights.push(el.getBoundingClientRect().height);
    };

    let state = startHand(
      createHeadToHeadMatch({ playerAId: SELF, playerBId: OPPONENT, pointsToWin: 30, dealerSeat: 1 }),
      DEAL_1V1,
    );
    await recordRender(state); // baseline: dealt, nothing has happened yet

    state = dispatch(state, { type: "call-envido", playerId: SELF, level: "envido" });
    await recordRender(state); // pending-call banner: "Envido"

    state = dispatch(state, { type: "respond-envido", playerId: OPPONENT, response: "quiero" });
    await recordRender(state); // banner clears — accepted, awaiting reveal

    state = declareAll(state);
    await recordRender(state); // envido revealed, points awarded, still no banner

    state = playNextCard(state, SELF, OPPONENT); // mano leads trick 1
    await recordRender(state);

    state = playNextCard(state, SELF, OPPONENT); // trick 1 resolves
    await recordRender(state); // trick-feedback line now announces the winner

    const opening = openTruco(state);
    state = dispatch(state, { type: "call-truco", playerId: opening.caller, level: "truco" });
    await recordRender(state); // pending-call banner: "Truco"

    state = dispatch(state, { type: "respond-truco", playerId: opening.answerer, response: "quiero" });
    await recordRender(state); // banner clears again

    let guard = 0;
    while (state.hand !== null && !state.hand.outcome.decided) {
      if (guard++ > 10) throw new Error("test setup: hand never decided — possible infinite loop");
      state = playNextCard(state, SELF, OPPONENT);
      await recordRender(state);
    }

    expectStableHeights(heights);
  });

  it("1v1: a truco call declined ends the hand immediately — pending banner, then hand-outcome banner, height still never changes", async () => {
    const el = mountedContainer(width);
    const render = createMatchTableRenderer();
    const heights: number[] = [];

    const recordRender = async (state: MatchState): Promise<void> => {
      const view = getViewFor(state, SELF);
      const legal = getLegalActions(state, SELF);
      render(el, view, legal, () => {});
      await waitForArt(el);
      heights.push(el.getBoundingClientRect().height);
    };

    let state = startHand(
      createHeadToHeadMatch({ playerAId: SELF, playerBId: OPPONENT, pointsToWin: 30, dealerSeat: 1 }),
      DEAL_1V1,
    );
    await recordRender(state); // baseline

    const opening = openTruco(state);
    state = dispatch(state, { type: "call-truco", playerId: opening.caller, level: "truco" });
    await recordRender(state); // pending-call banner: "Truco"

    state = dispatch(state, { type: "respond-truco", playerId: opening.answerer, response: "no-quiero" });
    await recordRender(state); // pending clears, hand-outcome banner: "Ganaste la mano"

    expectStableHeights(heights);
  });

  it("2v2: envido called/accepted/revealed, cards played seat-by-seat, tricks resolved, truco called/accepted, cards played to a decided hand — the height never changes", async () => {
    const el = mountedContainer(width);
    const render = createMatchTableRenderer();
    const heights: number[] = [];

    const recordRender = async (state: MatchState): Promise<void> => {
      const view = getViewFor(state, SELF);
      const legal = getLegalActions(state, SELF);
      render(el, view, legal, () => {});
      await waitForArt(el);
      heights.push(el.getBoundingClientRect().height);
    };

    // Partners sit ACROSS the table (design: 0/2 vs 1/3, matching
    // truco-engine's own createTeamMatch geometry) — SELF (seat 0) and
    // TEAMMATE (seat 2) are one team; OPPONENT (seat 1) and OPPONENT_2
    // (seat 3) are the other. dealerSeat 3 makes SELF mano.
    const seatOrder: readonly [PlayerId, PlayerId, PlayerId, PlayerId] = [SELF, OPPONENT, TEAMMATE, OPPONENT_2];
    let state = startHand(createTeamMatch({ seatOrder, pointsToWin: 30, dealerSeat: 3 }), DEAL_2V2);
    await recordRender(state); // baseline: dealt, nothing has happened yet

    const allFourSeats = [SELF, OPPONENT, TEAMMATE, OPPONENT_2] as const;

    // Only a PIE may open an envido and a pie is never the mano, so the seats
    // ahead of it play on the way to the call. That is the same "opponent hand
    // shrinking seat by seat" case this test is about, just reached before the
    // envido instead of after it — and every step of it is recorded.
    let opener = whoMayOpenAnEnvido(state, allFourSeats);
    while (opener === undefined) {
      state = playNextCardAmong(state, allFourSeats);
      await recordRender(state);
      opener = whoMayOpenAnEnvido(state, allFourSeats);
    }
    state = dispatch(state, { type: "call-envido", playerId: opener, level: "envido" });
    await recordRender(state); // pending-call banner: "Envido"

    const envidoAnswerer = allFourSeats.find((player) => getLegalActions(state, player).some((action) => action.type === "respond-envido"))!;
    state = dispatch(state, { type: "respond-envido", playerId: envidoAnswerer, response: "quiero" });
    await recordRender(state); // banner clears — accepted, awaiting reveal

    state = declareAll(state);
    await recordRender(state); // envido revealed, still no banner

    // Trick 1 finishes, however many seats it has left.
    while (state.hand!.trickOutcomes.length === 0) {
      state = playNextCardAmong(state, allFourSeats);
      await recordRender(state);
    }

    const opening = openTruco(state);
    state = dispatch(state, { type: "call-truco", playerId: opening.caller, level: "truco" });
    await recordRender(state); // pending-call banner: "Truco"

    state = dispatch(state, { type: "respond-truco", playerId: opening.answerer, response: "quiero" });
    await recordRender(state); // banner clears again

    let guard = 0;
    while (state.hand !== null && !state.hand.outcome.decided) {
      if (guard++ > 20) throw new Error("test setup: hand never decided — possible infinite loop");
      state = playNextCardAmong(state, allFourSeats);
      await recordRender(state);
    }

    expectStableHeights(heights);
  });

  it("2v2: opening and closing the señas picker never changes the table's height", async () => {
    const el = mountedContainer(width);
    const render = createMatchTableRenderer();

    const seatOrder: readonly [PlayerId, PlayerId, PlayerId, PlayerId] = [SELF, OPPONENT, TEAMMATE, OPPONENT_2];
    const state = startHand(createTeamMatch({ seatOrder, pointsToWin: 30, dealerSeat: 1 }), DEAL_2V2);
    const view = getViewFor(state, SELF);
    const legal = getLegalActions(state, SELF);
    expect(legal.some((action) => action.type === "send-sena")).toBe(true); // sanity: señas are really on the table for this fixture

    render(el, view, legal, () => {});
    await waitForArt(el);
    const before = el.getBoundingClientRect().height;

    const toggle = el.querySelector<HTMLButtonElement>('button[data-action="senas-toggle"]');
    if (toggle === null) throw new Error("test setup: señas toggle not rendered — is send-sena really legal?");

    toggle.click(); // open — the six-signal row appears
    const opened = el.getBoundingClientRect().height;

    toggle.click(); // close — the row clears again
    const closed = el.getBoundingClientRect().height;

    expect(Math.abs(opened - before), `opened: ${opened}px vs before: ${before}px`).toBeLessThan(1);
    expect(Math.abs(closed - before), `closed: ${closed}px vs before: ${before}px`).toBeLessThan(1);
  });

  // T-7 fence (design/tasks: must be GREEN before the pile change lands and
  // STAY green through every later PR-3/PR-4 task — a fence, not a one-time
  // check). Both cases below reach the tallest state this table can ever
  // render: a full envido chain, a truco chain escalated to its ceiling, and
  // all three tricks resolved — every transient banner and every seat's pile
  // at its largest, all at once.
  it("1v1 MAXIMAL: full envido chain + fully-escalated truco chain + three resolved tricks — the tallest possible state, height never changes (T-7 fence)", async () => {
    const el = mountedContainer(width);
    const render = createMatchTableRenderer();
    const heights: number[] = [];

    const recordRender = async (state: MatchState): Promise<void> => {
      const view = getViewFor(state, SELF);
      const legal = getLegalActions(state, SELF);
      render(el, view, legal, () => {});
      await waitForArt(el);
      heights.push(el.getBoundingClientRect().height);
    };

    let state = startHand(
      createHeadToHeadMatch({ playerAId: SELF, playerBId: OPPONENT, pointsToWin: 30, dealerSeat: 1 }),
      DEAL_1V1_MAXIMAL,
    );
    await recordRender(state); // baseline

    // 1v1 keeps opening from the mano: with two seats, "the last two in play
    // order" is everybody, so the pie rule is vacuously satisfied here.
    state = dispatch(state, { type: "call-envido", playerId: SELF, level: "envido" });
    await recordRender(state);
    state = dispatch(state, { type: "respond-envido", playerId: OPPONENT, response: "quiero" });
    await recordRender(state);
    state = declareAll(state);
    await recordRender(state);

    const opening = openTruco(state);
    state = dispatch(state, { type: "call-truco", playerId: opening.caller, level: "truco" });
    await recordRender(state);
    state = dispatch(state, { type: "respond-truco", playerId: opening.answerer, response: "quiero" });
    await recordRender(state);
    state = dispatch(state, { type: "call-truco", playerId: OPPONENT, level: "retruco" }); // only the non-calling team may escalate
    await recordRender(state);
    state = dispatch(state, { type: "respond-truco", playerId: SELF, response: "quiero" });
    await recordRender(state);
    state = dispatch(state, { type: "call-truco", playerId: SELF, level: "valeCuatro" }); // escalated to the ceiling — no level above this
    await recordRender(state);
    state = dispatch(state, { type: "respond-truco", playerId: OPPONENT, response: "quiero" });
    await recordRender(state); // fully escalated and accepted — the widest possible calls row, already retired

    // Trick 1: SELF (mano) leads and wins with 1-espada over 4-espada.
    state = dispatch(state, { type: "play-card", playerId: SELF, card: DEAL_1V1_MAXIMAL[0]![0]! });
    await recordRender(state);
    state = dispatch(state, { type: "play-card", playerId: OPPONENT, card: DEAL_1V1_MAXIMAL[1]![0]! });
    await recordRender(state); // trick 1 resolves — the first pile card appears on both seats

    // Trick 2: SELF leads again (won trick 1); OPPONENT wins with 1-basto over 4-basto — split so far.
    state = dispatch(state, { type: "play-card", playerId: SELF, card: DEAL_1V1_MAXIMAL[0]![1]! });
    await recordRender(state);
    state = dispatch(state, { type: "play-card", playerId: OPPONENT, card: DEAL_1V1_MAXIMAL[1]![1]! });
    await recordRender(state); // trick 2 resolves — split, trick 3 must decide

    // Trick 3: OPPONENT leads (won trick 2); SELF wins with 7-espada over 4-oro, deciding the hand.
    state = dispatch(state, { type: "play-card", playerId: OPPONENT, card: DEAL_1V1_MAXIMAL[1]![2]! });
    await recordRender(state);
    state = dispatch(state, { type: "play-card", playerId: SELF, card: DEAL_1V1_MAXIMAL[0]![2]! });
    await recordRender(state); // hand decided — two full three-card piles, a full call log, hand-outcome banner: all at once

    expect(state.hand?.trickOutcomes).toHaveLength(3); // sanity: this really is the maximal case, not an early decision
    expect(state.hand?.outcome.decided).toBe(true);
    expectStableHeights(heights);
    expectExactHeight(heights[0]!, MAXIMAL_BASELINE_HEIGHT[width]["1v1"], `1v1 baseline height at ${width}px`);
  });

  it("2v2 MAXIMAL: full envido chain + fully-escalated truco chain + three resolved tricks — the tallest possible state, height never changes (T-7 fence)", async () => {
    const el = mountedContainer(width);
    const render = createMatchTableRenderer();
    const heights: number[] = [];

    const recordRender = async (state: MatchState): Promise<void> => {
      const view = getViewFor(state, SELF);
      const legal = getLegalActions(state, SELF);
      render(el, view, legal, () => {});
      await waitForArt(el);
      heights.push(el.getBoundingClientRect().height);
    };

    const seatOrder: readonly [PlayerId, PlayerId, PlayerId, PlayerId] = [SELF, OPPONENT, TEAMMATE, OPPONENT_2];
    let state = startHand(createTeamMatch({ seatOrder, pointsToWin: 30, dealerSeat: 3 }), DEAL_2V2_MAXIMAL);
    await recordRender(state); // baseline

    const opening = openTruco(state);
    state = dispatch(state, { type: "call-truco", playerId: opening.caller, level: "truco" });
    await recordRender(state);
    state = dispatch(state, { type: "respond-truco", playerId: opening.answerer, response: "quiero" });
    await recordRender(state);
    state = dispatch(state, { type: "call-truco", playerId: OPPONENT, level: "retruco" }); // team B escalates
    await recordRender(state);
    state = dispatch(state, { type: "respond-truco", playerId: TEAMMATE, response: "quiero" }); // any team A player may answer
    await recordRender(state);
    state = dispatch(state, { type: "call-truco", playerId: SELF, level: "valeCuatro" }); // team A escalates to the ceiling
    await recordRender(state);
    state = dispatch(state, { type: "respond-truco", playerId: OPPONENT_2, response: "quiero" });
    await recordRender(state); // fully escalated and accepted, both teams having taken a turn calling

    // Trick 1: SELF leads (mano), turn order 0 -> 1 -> 2 -> 3; team A's 1-espada (SELF) wins.
    state = dispatch(state, { type: "play-card", playerId: SELF, card: DEAL_2V2_MAXIMAL[0]![0]! });
    await recordRender(state);
    state = dispatch(state, { type: "play-card", playerId: OPPONENT, card: DEAL_2V2_MAXIMAL[1]![0]! });
    await recordRender(state);

    // THE ENVIDO LANDS HERE, two cards in, and that is the rule rather than a
    // convenience: only a PIE may open one, a pie is never the mano, so the
    // earliest a 2v2 envido can be opened is the third seat to speak —
    // TEAMMATE, who has the floor now and has not played yet.
    state = dispatch(state, { type: "call-envido", playerId: TEAMMATE, level: "envido" });
    await recordRender(state);
    state = dispatch(state, { type: "respond-envido", playerId: OPPONENT_2, response: "quiero" });
    await recordRender(state);
    state = declareAll(state);
    await recordRender(state);

    state = dispatch(state, { type: "play-card", playerId: TEAMMATE, card: DEAL_2V2_MAXIMAL[2]![0]! });
    await recordRender(state);
    state = dispatch(state, { type: "play-card", playerId: OPPONENT_2, card: DEAL_2V2_MAXIMAL[3]![0]! });
    await recordRender(state); // trick 1 resolves — the first pile card appears on all four seats

    // Trick 2: SELF leads again (held trick 1's winning card); team B's 3-basto (OPPONENT_2) wins — split so far.
    state = dispatch(state, { type: "play-card", playerId: SELF, card: DEAL_2V2_MAXIMAL[0]![1]! });
    await recordRender(state);
    state = dispatch(state, { type: "play-card", playerId: OPPONENT, card: DEAL_2V2_MAXIMAL[1]![1]! });
    await recordRender(state);
    state = dispatch(state, { type: "play-card", playerId: TEAMMATE, card: DEAL_2V2_MAXIMAL[2]![1]! });
    await recordRender(state);
    state = dispatch(state, { type: "play-card", playerId: OPPONENT_2, card: DEAL_2V2_MAXIMAL[3]![1]! });
    await recordRender(state); // trick 2 resolves — split, trick 3 must decide

    // Trick 3: OPPONENT_2 leads (won trick 2); turn order wraps 3 -> 0 -> 1 -> 2. Team A's 3-espada (SELF) decides the hand.
    state = dispatch(state, { type: "play-card", playerId: OPPONENT_2, card: DEAL_2V2_MAXIMAL[3]![2]! });
    await recordRender(state);
    state = dispatch(state, { type: "play-card", playerId: SELF, card: DEAL_2V2_MAXIMAL[0]![2]! });
    await recordRender(state);
    state = dispatch(state, { type: "play-card", playerId: OPPONENT, card: DEAL_2V2_MAXIMAL[1]![2]! });
    await recordRender(state);
    state = dispatch(state, { type: "play-card", playerId: TEAMMATE, card: DEAL_2V2_MAXIMAL[2]![2]! });
    await recordRender(state); // hand decided — four full three-card piles, a full call log, hand-outcome banner: all at once

    expect(state.hand?.trickOutcomes).toHaveLength(3); // sanity: this really is the maximal case, not an early decision
    expect(state.hand?.outcome.decided).toBe(true);
    expectStableHeights(heights);
    expectExactHeight(heights[0]!, MAXIMAL_BASELINE_HEIGHT[width]["2v2"], `2v2 baseline height at ${width}px`);
  });

  // PR4-T10 (tasks §8, THS-2 — this PR modifies layout, so the fence must
  // extend in the same PR, not later). Before PR4, .hexdev-truco-call-log was
  // position: absolute at EVERY width — "a long call chain never grows the
  // felt" was trivially true by construction (an out-of-flow element cannot
  // affect layout at all), and the two MAXIMAL fences above already covered
  // it only incidentally, as one step inside a much longer journey. At
  // wide/ultra (>=900px, table-styles.ts's own @container (min-width: 900px)
  // block) the log is now a REAL in-flow grid child spanning the felt's own
  // top/center/bottom rows — this invariant is no longer free, so it gets its
  // own direct, minimal proof here rather than being inferred from the
  // broader journey. (At compact/medium it stays trivially true, same as
  // before PR4, since the log is still position: absolute there — running
  // this fence at every width anyway costs nothing and documents that the
  // invariant holds everywhere, not only where it is non-trivial.)
  //
  // MEASURED, not assumed: at every width in WIDTHS, the empty-log and
  // fully-escalated-log heights below came out IDENTICAL (within this
  // suite's own <1px tolerance) — i.e. table-height-stability's own
  // MAXIMAL_BASELINE_HEIGHT constants above needed ZERO update from PR4. The
  // reason is structural, not coincidental: .hexdev-truco-call-log's own
  // max-height is capped at two card-heights (table-styles.ts:
  // "calc(var(--truco-card-width) * 336 / 220 * 2)"), while the felt's own
  // min-height formula alone already reserves at least 3.7 card-heights
  // (1v1) / 5 card-heights (2v2) across the SAME top/center/bottom rows the
  // log now spans — so the log's own maximum possible content contribution
  // is, by construction, always smaller than what those rows already
  // reserve for the anchors/trick-area/hand, and it never forces additional
  // row growth. A future change to either constant could invert that
  // inequality silently; this fence is what would go RED first if it did.
  it("PR4: the felt's height with an empty call log matches its height with a fully-escalated 10-entry call chain — the log rail (in flow at wide/ultra) contains its own content instead of growing the felt", async () => {
    const el = mountedContainer(width);
    const render = createMatchTableRenderer();

    let state = startHand(
      createHeadToHeadMatch({ playerAId: SELF, playerBId: OPPONENT, pointsToWin: 30, dealerSeat: 1 }),
      DEAL_1V1_MAXIMAL,
    );
    render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
    await waitForArt(el);
    const emptyLogHeight = el.getBoundingClientRect().height; // zero call-log entries yet

    state = dispatch(state, { type: "call-envido", playerId: SELF, level: "envido" });
    state = dispatch(state, { type: "respond-envido", playerId: OPPONENT, response: "quiero" });
    state = declareAll(state);
    const opening = openTruco(state);
    state = dispatch(state, { type: "call-truco", playerId: opening.caller, level: "truco" });
    state = dispatch(state, { type: "respond-truco", playerId: opening.answerer, response: "quiero" });
    state = dispatch(state, { type: "call-truco", playerId: OPPONENT, level: "retruco" }); // only the non-calling team may escalate
    state = dispatch(state, { type: "respond-truco", playerId: SELF, response: "quiero" });
    state = dispatch(state, { type: "call-truco", playerId: SELF, level: "valeCuatro" }); // escalated to the ceiling
    state = dispatch(state, { type: "respond-truco", playerId: OPPONENT, response: "quiero" });
    render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
    await waitForArt(el);
    const fullLogHeight = el.getBoundingClientRect().height; // 9 call-log entries + the tantos row

    expect(el.querySelectorAll(".hexdev-truco-call-log-entry").length, "sanity: the log really did grow to its full chain").toBe(10);
    expect(
      Math.abs(fullLogHeight - emptyLogHeight),
      `empty-log height ${emptyLogHeight}px vs fully-escalated-chain height ${fullLogHeight}px at ${width}px`,
    ).toBeLessThan(1);
  });
});

/**
 * THE HOST'S FONT DOES NOT DECIDE THIS TABLE'S HEIGHT.
 *
 * Found by CI, on the second machine that ever ran this suite. The runner's
 * `system-ui` resolves to DejaVu Sans and this table came out 31.9px taller
 * there than on the machine it was written on -- 528.33 against 496.42, a
 * number every pinned baseline in this file would have to be rewritten for.
 *
 * THE WIDGET CANNOT PIN ITS OWN FONT, and that is the point rather than an
 * oversight: it declares `font-family: var(--gx-font-family, system-ui,
 * sans-serif)` so it inherits the type of the page that embeds it. So the
 * fence cannot ask for one font. It asks for something better: that the height
 * be the SAME whichever font arrives.
 *
 * Two faces every Linux box has, plus the machine default, driven through the
 * same override a host really uses. This is the width-axis twin of the four
 * line-box fences this file already carries -- same doctrine, same sentence:
 * a box whose size a font is still deciding is the defect, and the fix is to
 * pin the property, never to recalibrate the constant.
 */
describe("the table's height does not depend on the host's font", () => {
  const FACES = ["system-ui", '"DejaVu Sans"', '"Liberation Sans"'] as const;

  it.each([320, 375, 414] as const)("%ipx: 2v2 measures the same under every face", async (width) => {
    const heights = new Map<string, number>();

    for (const face of FACES) {
      const el = mountedContainer(width);
      // Through --gx-font-family, which is the knob a host page really turns.
      const style = el.ownerDocument.createElement("style");
      style.dataset.fontProbe = "true";
      style.textContent = `.hexdev-truco-table-shell { --gx-font-family: ${face}; }`;
      el.ownerDocument.head.appendChild(style);

      const render = createMatchTableRenderer();
      const state = startHand(createTeamMatch({ seatOrder: [SELF, OPPONENT, TEAMMATE, OPPONENT_2], pointsToWin: 30, dealerSeat: 3 }), DEAL_2V2);
      render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
      await waitForArt(el);

      heights.set(face, el.getBoundingClientRect().height);
      style.remove();
      el.remove();
      el.ownerDocument.getElementById("hexdev-truco-matchstick-defs")?.remove();
      el.ownerDocument.getElementById("hexdev-truco-table-styles")?.remove();
    }

    const measured = [...heights.entries()];
    const [, baseline] = measured[0]!;
    for (const [face, height] of measured) {
      expect(Math.abs(height - baseline), `${face} measured ${String(height)}px against ${String(baseline)}px`).toBeLessThan(1);
    }
  });
});
