import { afterEach, describe, expect, it } from "vitest";
import { applyAction, createHeadToHeadMatch, createTeamMatch, getLegalActions, getViewFor, startHand } from "@hexdev/truco-engine";
import type { Action, DealInput, MatchState, PlayerId } from "@hexdev/truco-engine";
import { createMatchTableRenderer } from "./table.js";

/**
 * A FIT fence for the action band: when two call groups are simultaneously
 * legal, the band shows both — it does not scroll one of them out of reach.
 *
 * THE GAP THIS CLOSES, and why every existing fence was green while the bug
 * shipped. `table-height-budget.browser.test.ts` measures the BASELINE
 * (just-dealt) state, where no call is pending and the action band holds at
 * most one group; `table-height-stability.browser.test.ts` measures whether
 * height CHANGES, which it does not, because the band is a fixed grid track
 * by design. So the one state where the band is actually under pressure —
 * an unanswered call, where answering AND escalating are both legal — was
 * measured by nothing at all.
 *
 * WHAT WENT WRONG. `.hexdev-truco-calls-row` is `flex-direction: column`, so
 * the response group and the opening group stack. Each group carries
 * `min-height: 40px` and the row adds a 6px gap, so two groups need 86px
 * inside a band whose compact track (`--hx-band-action-total`) is 40px.
 * `.hexdev-truco-action-bar` has `overflow-y: auto`, so the excess became a
 * scrollbar: the player saw "Quiero / No quiero" and a sliver of a second
 * row, with "Retruco" and "Envido" below the fold of a 40px strip they had
 * no reason to suspect could scroll.
 *
 * That y-scroller is documented in `table-styles.ts` as "real, load-bearing
 * work" for exactly this case. It is real, and it was the wrong answer: a
 * scrollbar inside a 40px strip is not an affordance a player discovers
 * mid-hand, on a clock, with a call to answer. The band is one strip, so the
 * groups belong side by side in it — which is what this fence pins, and the
 * y-scroller stays as the genuine last-resort valve it was meant to be.
 *
 * MEASURED, not asserted from the CSS: this file drives the real engine to a
 * real unanswered-truco state and measures the rendered band, so a future
 * change to either the group markup or the band's own track has to keep the
 * player's legal moves reachable.
 */

const SELF = "fit-self" as PlayerId;
const OPPONENT = "fit-opponent" as PlayerId;
const TEAMMATE = "fit-teammate" as PlayerId;
const OPPONENT_2 = "fit-opponent-2" as PlayerId;

/** Same fixture as `table-height-budget.browser.test.ts`'s own
 * `DEAL_1V1_MAXIMAL` — this repo's established convention is that each
 * browser-test file owns its own fixture literals rather than importing
 * them from a sibling that does not export them. */
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

/** Same shape as `table-height-stability.browser.test.ts`'s own helper. */
function dispatch(state: MatchState, action: Action): MatchState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`fence setup: engine rejected ${action.type} — ${result.violation}`);
  return result.state;
}

/**
 * The real two-group state: the opponent has called truco and it is on SELF
 * to answer. `envido-chain.ts`'s own `canOpenEnvido` rule keeps envido legal
 * while a truco call sits unanswered, so the engine offers a response group
 * (quiero / no quiero) AND an opening group (retruco / envido) at once.
 *
 * Derived from the engine rather than hand-written as a literal array: the
 * point of the fence is that a state the engine can really reach fits, and a
 * synthetic `legalActions` array would prove only that the CSS handles an
 * array someone invented.
 */
function pendingTrucoState(seats: "1v1" | "2v2"): MatchState {
  const base =
    seats === "1v1"
      // dealerSeat 0 puts the mano on seat 1 — OPPONENT — in both shapes,
      // and OPPONENT is who calls below. Opening a call is taking the floor,
      // and the floor starts with the mano (truco-chain.ts), so a fixture
      // that wants a call ON the local player has to seat the caller as mano.
      ? startHand(createHeadToHeadMatch({ playerAId: SELF, playerBId: OPPONENT, pointsToWin: 30, dealerSeat: 0 }), DEAL_1V1)
      : startHand(createTeamMatch({ seatOrder: [SELF, OPPONENT, TEAMMATE, OPPONENT_2], pointsToWin: 30, dealerSeat: 0 }), DEAL_2V2);
  return dispatch(base, { type: "call-truco", playerId: OPPONENT, level: "truco" });
}

/**
 * WIDTH LIST. The six from `table-height-budget.browser.test.ts` (the four
 * container tiers plus the two `@container` boundary widths), and 570 —
 * which is not a tier boundary but the width the bug was actually reported
 * at, in a widget embedded in an ordinary 760px-wide article column. A fence
 * that only samples the tiers can miss a tier's own interior, and this one
 * did.
 */
const WIDTHS = [375, 570, 640, 700, 900, 960, 1280] as const;

describe.each(WIDTHS)("action band FIT with an unanswered call — %ipx", (width) => {
  it.each(["1v1", "2v2"] as const)("%s: every legal call stays reachable without scrolling the band", async (seats) => {
    const el = mountedContainer(width);
    const render = createMatchTableRenderer();
    const state = pendingTrucoState(seats);
    const legalActions = getLegalActions(state, SELF);
    render(el, getViewFor(state, SELF), legalActions, () => {});
    await waitForArt(el);

    const groups = el.querySelectorAll(".hexdev-truco-calls-group");
    expect(groups.length, "fence setup: this state really does offer two simultaneous call groups").toBe(2);

    const bar = el.querySelector(".hexdev-truco-action-bar");
    if (bar === null) throw new Error("fence setup: action bar not rendered");
    expect(bar.scrollHeight, `action band vertical overflow at ${String(width)}px (${seats})`).toBeLessThanOrEqual(bar.clientHeight + 1);
  });
});

/**
 * The bar at its ORDINARY widest: the viewer is on turn, nothing has been
 * called, and all three of Truco, Envido and the señas control are offered.
 *
 * Dealer on seat 0 makes seat 1 mano, which puts the viewer (seat 0) last in
 * the round -- and the last of a team to speak is its PIE, which is who may
 * open the envido (envido-chain.ts). Three plays hand the turn to them. A
 * fixture that simply dealt and stopped offers no Envido at all, and the
 * two-button bar it produces fits everywhere, which is exactly how a first
 * version of this fence passed while a phone was cutting a button off.
 */
function openingTurnState(): MatchState {
  let state = startHand(createTeamMatch({ seatOrder: [SELF, OPPONENT, TEAMMATE, OPPONENT_2], pointsToWin: 30, dealerSeat: 0 }), DEAL_2V2);
  for (const seat of [1, 2, 3]) {
    const player = state.players[seat]!;
    const play = getLegalActions(state, player.id).find((action) => action.type === "play-card");
    if (play === undefined) throw new Error(`fixture: seat ${String(seat)} could not play`);
    state = dispatch(state, play);
  }
  return state;
}

describe("the ordinary opening bar fits without scrolling", () => {
  // Reported from a phone: "el boton de señas/consulta se corta un poquito a
  // la derecha". Measured at 375px: the band was 334px wide against 340px of
  // buttons -- six pixels over, and mine. The felt had just started reserving
  // a 25px lane on its right for the drawer's handle, and the action bar sits
  // inside that padding like every other row.
  //
  // NOT "the bar never scrolls", which would contradict a deliberate,
  // documented decision: horizontal scrolling inside a group is the valve for
  // a fully escalated envido chain, and a player can find it. What this
  // fences is the ORDINARY state -- three buttons, nothing called yet, the
  // thing on screen for most of a hand -- fitting the band it is given.
  it.each(WIDTHS)("%ipx: Truco, Envido and señas all fit the band with nothing scrolled away", async (width) => {
    const el = mountedContainer(width);
    const render = createMatchTableRenderer();
    const state = openingTurnState();
    render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
    await waitForArt(el);

    const bar = el.querySelector(".hexdev-truco-action-bar");
    if (bar === null) throw new Error("fence setup: action bar not rendered");
    const labels = [...bar.querySelectorAll("button")].map((x) => x.textContent ?? "");
    expect(labels.length, `fence setup: the bar must carry the ordinary three, got ${labels.join(" | ")}`).toBeGreaterThanOrEqual(3);

    expect(
      bar.scrollWidth - bar.clientWidth,
      `${String(width)}px: ${String(bar.scrollWidth)}px of buttons in a ${String(bar.clientWidth)}px band`,
    ).toBeLessThanOrEqual(1);
  });
});

describe("every legal call button is actually visible inside the band, not merely non-overflowing", () => {
  it.each(WIDTHS)("%ipx: no call button's box falls outside the band's own box", async (width) => {
    const el = mountedContainer(width);
    const render = createMatchTableRenderer();
    const state = pendingTrucoState("1v1");
    render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
    await waitForArt(el);

    const bar = el.querySelector(".hexdev-truco-action-bar");
    if (bar === null) throw new Error("fence setup: action bar not rendered");
    const barBox = bar.getBoundingClientRect();
    const buttons = [...el.querySelectorAll<HTMLButtonElement>(".hexdev-truco-call")];
    expect(buttons.length, "fence setup: the pending-truco state renders call buttons").toBeGreaterThan(0);

    for (const button of buttons) {
      const box = button.getBoundingClientRect();
      // Vertical only: horizontal scrolling inside a group is the deliberate,
      // documented valve for a long envido escalation (`table-styles.ts`),
      // and a player can find it. A button hidden BELOW a 40px strip is the
      // failure this asserts against.
      expect(box.bottom, `"${button.textContent ?? ""}" bottom edge vs band bottom at ${String(width)}px`).toBeLessThanOrEqual(barBox.bottom + 1);
      expect(box.top, `"${button.textContent ?? ""}" top edge vs band top at ${String(width)}px`).toBeGreaterThanOrEqual(barBox.top - 1);
    }
  });
});

/**
 * THE SAME BAND, FROM THE OTHER SIDE: the strips stack only while the bar is
 * genuinely too narrow to seat them.
 *
 * 2v2 carries a second strip (señas) that 1v1 has no use for, and the 640px
 * block stacks the two from that width UP — with no ceiling, so ultra
 * inherited it. There the stack costs a whole extra band
 * (`--hx-band-action-total` = one strip x2, plus a 4px seam) of the one
 * dimension this felt is actually short of, and it buys width that was never
 * scarce: measured at a 1550px shell the calls row asks 166px and señas
 * 102px, inside a bar 955px wide.
 *
 * So from 1280px up they sit side by side, `--hx-band-action-total` drops
 * back to one strip, and the fullscreen fit formula — which subtracts that
 * same variable through `var()` — grows the card out of it with no second
 * constant to keep in sync. Measured effect at a 1550x837 shell: the 2v2
 * card goes 99x151 -> 109x166.
 *
 * WHY THIS IS FENCED FROM BOTH SIDES. The interesting property is not "they
 * are in a row at ultra" but that the two forms each stay where they were
 * measured to belong. A future tier change that lets ultra fall back to the
 * stack silently gives that band back, and the only thing that would notice
 * is `table-height-stability`'s pinned 1280/2v2 constant — which reads as a
 * height, not as a reason. This says the reason.
 */
describe("2v2 action band: the strips stack only where the bar cannot seat them", () => {
  async function strips(width: number): Promise<{ bar: DOMRect; calls: DOMRect; senas: DOMRect; callsEl: HTMLElement; senasEl: HTMLElement }> {
    const el = mountedContainer(width);
    const render = createMatchTableRenderer();
    const state = pendingTrucoState("2v2");
    render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
    await waitForArt(el);

    const barEl = el.querySelector<HTMLElement>(".hexdev-truco-action-bar");
    const callsEl = el.querySelector<HTMLElement>(".hexdev-truco-calls-row");
    // ONE strip for everything the player can say to their partner: the
    // picker's toggle is the allowance, and asking is an item inside it. A
    // brief attempt at two separate strips overflowed the band at four tiers
    // at once — it is a fixed two-track row — and this fence is what said so.
    const senasEl = el.querySelector<HTMLElement>(".hexdev-truco-senas");
    if (barEl === null || callsEl === null || senasEl === null) {
      throw new Error("fence setup: 2v2 renders an action bar with both a calls row and a señas strip");
    }
    return { bar: barEl.getBoundingClientRect(), calls: callsEl.getBoundingClientRect(), senas: senasEl.getBoundingClientRect(), callsEl, senasEl };
  }

  it("1280px: side by side in ONE band, and neither strip has to scroll to show itself", async () => {
    const { bar, calls, senas, callsEl, senasEl } = await strips(1280);

    // Side by side is exactly this: disjoint horizontally, overlapping
    // vertically. Asserting the pair rather than a flex-direction keeps the
    // fence on the geometry the player sees.
    const horizontallyDisjoint = calls.right <= senas.left + 1 || senas.right <= calls.left + 1;
    expect(horizontallyDisjoint, "the two strips occupy different horizontal space").toBe(true);
    expect(Math.min(calls.bottom, senas.bottom) - Math.max(calls.top, senas.top), "and share the same band vertically").toBeGreaterThan(0);

    // ONE band: both strips span it, so the bar is a single strip tall rather
    // than two. A stacked bar would put each at about half this.
    for (const [name, box] of [["calls", calls], ["señas", senas]] as const) {
      expect(box.height, `the ${name} strip fills the band's full height`).toBeGreaterThan(bar.height - 2);
    }

    // Width was the whole reason for the move, so prove there is room to
    // spare rather than a hidden scroller in either strip.
    for (const [name, node] of [["calls", callsEl], ["señas", senasEl]] as const) {
      expect(node.scrollWidth, `${name} strip horizontal overflow`).toBeLessThanOrEqual(node.clientWidth + 1);
    }

    // Centred, not packed left. The base bar leaves justify-content at
    // flex-start — harmless while the strips stretched full-width in a
    // column, and very visible once they shrink to content in a row.
    const leftGap = Math.min(calls.left, senas.left) - bar.left;
    const rightGap = bar.right - Math.max(calls.right, senas.right);
    expect(leftGap, "the pair is not packed against one edge of the bar").toBeGreaterThan(8);
    expect(Math.abs(leftGap - rightGap), "the free space falls evenly on both sides").toBeLessThan(2);
  });

  it("960px: still stacked — the reclaim is scoped to the tier that measured room for it", async () => {
    const { calls, senas } = await strips(960);

    const verticallyDisjoint = calls.bottom <= senas.top + 1 || senas.bottom <= calls.top + 1;
    expect(verticallyDisjoint, "below the ultra tier the two strips keep their own rows").toBe(true);
  });
});
