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

/**
 * The widest the bar ever gets: a rival opened the envido, so the viewer owes
 * an answer AND may escalate -- quiero, no quiero, envido envido, real
 * envido, falta envido, five buttons at once. This is the state the
 * horizontal scroller exists FOR, which is exactly why it has to behave.
 */
function envidoAnswerState(): MatchState {
  // Dealer on seat 0 makes seat 1 mano, so the round runs 1, 2, 3, 0 -- and
  // the last of each team to speak is its PIE, which here is seat 3 and the
  // viewer on seat 0. Opening the envido belongs to the pie
  // (envido-chain.ts), so seats 1 and 2 have to play before seat 3 can call
  // it: a first version of this fixture had seat 1 call straight after the
  // deal and the engine rejected it outright.
  let state = startHand(createTeamMatch({ seatOrder: [SELF, OPPONENT, TEAMMATE, OPPONENT_2], pointsToWin: 30, dealerSeat: 0 }), DEAL_2V2);
  for (const seat of [1, 2]) {
    const player = state.players[seat]!;
    const play = getLegalActions(state, player.id).find((action) => action.type === "play-card");
    if (play === undefined) throw new Error(`fixture: seat ${String(seat)} could not play`);
    state = dispatch(state, play);
  }
  return dispatch(state, { type: "call-envido", playerId: OPPONENT_2, level: "envido" });
}

describe("the escalated bar scrolls without mangling itself", () => {
  // Reported from a phone with a full envido chain on screen: the first
  // button was cut on the LEFT ("uiero"), the last on the right, and three of
  // the five had their labels broken across two lines. Two separate defects
  // wearing one screenshot.
  //
  // The scroller itself is not the problem and is not being removed: it is
  // the deliberate, documented valve for exactly this state. What a scroller
  // may not do is squeeze its contents on the way, or park part of them
  // somewhere the player cannot scroll to.
  it.each(WIDTHS)("%ipx: no button is squeezed narrower than its own label", async (width) => {
    const el = mountedContainer(width);
    const render = createMatchTableRenderer();
    const state = envidoAnswerState();
    render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
    await waitForArt(el);

    const buttons = [...el.querySelectorAll<HTMLButtonElement>(".hexdev-truco-call")];
    expect(buttons.length, "fence setup: the escalated state offers no call buttons").toBeGreaterThanOrEqual(4);

    for (const button of buttons) {
      // COUNTED IN LINE BOXES, which is the only thing that actually says
      // "this label wrapped". Two earlier versions of this fence measured the
      // wrong thing and both were wrong in an instructive way: comparing each
      // button's HEIGHT against the shortest one's fired on the 4px the
      // response buttons differ by on purpose, and comparing scrollWidth
      // against clientWidth can never fire at all -- a label that wraps FITS,
      // that is what wrapping is for.
      //
      // A Range over the button's own text reports one client rect per line
      // box it occupies. Two rects, two lines.
      const range = button.ownerDocument.createRange();
      range.selectNodeContents(button);
      expect(
        range.getClientRects().length,
        `"${button.textContent ?? ""}" is drawn across ${String(range.getClientRects().length)} lines in a ${String(Math.round(button.getBoundingClientRect().width))}px box`,
      ).toBeLessThanOrEqual(1);
    }
  });

  it.each(WIDTHS)("%ipx: the band itself never becomes a second scroller around the groups", async (width) => {
    // ONE SCROLLER, NOT TWO NESTED. The call groups scroll on purpose -- the
    // documented valve for a fully escalated chain -- but the BAND around
    // them must not, or a player has to scroll one box to find another box to
    // scroll. Found by sweeping every width: the band was overflowing by a
    // constant 166px from 320 to 570, and constant is the tell -- something
    // inside was refusing to give way no matter how much room it had.
    //
    // It was `.hexdev-truco-calls-row` carrying flex: 0 0 auto, added while
    // stopping the BUTTONS from being squeezed. The buttons were the right
    // thing to freeze; the row around them was not.
    const el = mountedContainer(width);
    const render = createMatchTableRenderer();
    const state = envidoAnswerState();
    render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
    await waitForArt(el);

    const bar = el.querySelector<HTMLElement>(".hexdev-truco-action-bar");
    if (bar === null) throw new Error("fence setup: action bar not rendered");

    expect(
      bar.scrollWidth - bar.clientWidth,
      `the band holds ${String(bar.scrollWidth)}px in ${String(bar.clientWidth)}px, so it scrolls too`,
    ).toBeLessThanOrEqual(1);
  });

  it.each(WIDTHS)("%ipx: the first button can actually be reached", async (width) => {
    // `justify-content: center` on a box that overflows pushes the start of
    // the content off the left edge and out of the scroll range entirely —
    // the player can never bring it back. That is what cut "quiero" into
    // "uiero" and left no way to see the rest of it.
    const el = mountedContainer(width);
    const render = createMatchTableRenderer();
    const state = envidoAnswerState();
    render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
    await waitForArt(el);

    const bar = el.querySelector<HTMLElement>(".hexdev-truco-action-bar");
    const row = el.querySelector<HTMLElement>(".hexdev-truco-calls-row");
    if (bar === null || row === null) throw new Error("fence setup: action bar or calls row not rendered");
    // BOTH, because the group is the real scroller and the tray around it can
    // scroll too — zeroing only the tray leaves the row wherever it was and
    // measures a scroll position no player is looking at.
    // EVERY scroller in the tray, because the real one is neither of these
    // two: each call GROUP scrolls on its own. Zeroing only the outer boxes
    // measures a position no player is looking at, which is how a first
    // version of this fence kept failing on a fix that was already in place.
    for (const box of [bar, row, ...row.querySelectorAll<HTMLElement>(".hexdev-truco-calls-group")]) box.scrollLeft = 0;
    const first = row.querySelector<HTMLElement>(".hexdev-truco-call");
    if (first === null) throw new Error("fence setup: no call buttons");

    expect(
      first.getBoundingClientRect().left,
      `scrolled fully left, "${first.textContent ?? ""}" still starts at ${String(Math.round(first.getBoundingClientRect().left))}px against its group at ${String(Math.round(first.parentElement!.getBoundingClientRect().left))}px`,
    ).toBeGreaterThanOrEqual(first.parentElement!.getBoundingClientRect().left - 1);
  });
});

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
  // TWO buttons now, not three. The Seña/Consulta control moved to the side
  // rail (see "the band belongs to the calls" below), so the ordinary state
  // this fences is Truco and Envido -- and the band being roomier is the
  // point, not a weakening of the fence.
  it.each(WIDTHS)("%ipx: Truco and Envido fit the band with nothing scrolled away", async (width) => {
    const el = mountedContainer(width);
    const render = createMatchTableRenderer();
    const state = openingTurnState();
    render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
    await waitForArt(el);

    const bar = el.querySelector(".hexdev-truco-action-bar");
    if (bar === null) throw new Error("fence setup: action bar not rendered");
    const labels = [...bar.querySelectorAll("button")].map((x) => x.textContent ?? "");
    expect(labels.length, `fence setup: the bar must carry the ordinary calls, got ${labels.join(" | ")}`).toBeGreaterThanOrEqual(2);
    // AND THE THIRD CONTROL IS STILL REACHABLE, just not from here. A band
    // that fits because a control quietly stopped rendering would pass the
    // assertion below and be a worse table.
    expect(el.querySelector(".hexdev-truco-senas-toggle"), "the señas control still exists, in the rail").not.toBeNull();

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
 * ONE STRIP, AND THE BAND BOOKS ROOM FOR ONE STRIP.
 *
 * 2v2 used to carry a second strip beside the calls -- señas -- so from 640px
 * up the band stacked the two and reserved a double height for them, which the
 * 1280px tier then clawed back by seating them side by side. Three tiers of
 * machinery for one extra strip.
 *
 * That strip is in the side rail now, so the band holds exactly one thing at
 * every width. The reservation went with it, and this is the fence that says
 * the reservation must never come back: a band that books height for a strip
 * it does not have is 54px of felt gone, silently, between 640 and 1280 --
 * height being the one dimension this widget is genuinely short of.
 *
 * Asserted as a MEASURED height rather than by reading the custom property,
 * because the property is only a promise and the row is the fact.
 */
describe("the 2v2 band books room for one strip, because it holds one strip", () => {
  it.each([375, 640, 700, 900, 960, 1280] as const)("%ipx: the band is exactly as tall as the calls it carries", async (width) => {
    const el = mountedContainer(width);
    const render = createMatchTableRenderer();
    const state = pendingTrucoState("2v2");
    render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
    await waitForArt(el);

    const bar = el.querySelector<HTMLElement>(".hexdev-truco-action-bar");
    const calls = el.querySelector<HTMLElement>(".hexdev-truco-calls-row");
    if (bar === null || calls === null) throw new Error("fence setup: 2v2 renders an action bar with a calls row");

    // The band is the calls row's own height, not twice it. A 4px tolerance
    // for the seam a stacked band used to add: anything near a doubling fails
    // this by a mile, which is the failure worth catching.
    const barBox = bar.getBoundingClientRect();
    const callsBox = calls.getBoundingClientRect();
    expect(barBox.height - callsBox.height, `band ${String(Math.round(barBox.height))}px vs one strip ${String(Math.round(callsBox.height))}px`).toBeLessThanOrEqual(4);

    // And the strip really is alone in there: a second in-flow child would be
    // the old shape creeping back, whatever the heights happened to measure.
    const inFlow = [...bar.children].filter((child) => getComputedStyle(child).position !== "absolute");
    expect(inFlow.length, `the band's in-flow children: ${inFlow.map((c) => c.className).join(" | ")}`).toBe(1);
  });
});

/**
 * THE BAND'S WIDTH BUDGET, on the screen that has the least of it.
 *
 * Measured across twelve widths in the two worst states the game can reach.
 * At 320px the band has 304px to give and the Seña/Consulta toggle was taking
 * 162 of them -- 53%, more than every call button put together -- and never
 * yielded a pixel of it at any width, from 320 to 1440.
 *
 * What that did was worse than a tight fit. With a rival's envido escalated,
 * the two groups split what was left in proportion to what each wanted:
 *
 *     respuesta (Quiero / No quiero) .... 40px of the 184 it needs
 *     escalada  (Envido envido / ...) ... 82px of the 383 it needs
 *
 * The group the player MUST answer got half the room of the group they merely
 * MAY use. Forty pixels of "Quiero" while a turn clock runs.
 *
 * So: the toggle keeps its glyph and its count on the compact tier and lets
 * its words go visually-hidden, and the response group is served its natural
 * width before the opening group gets any. Both fences below are about that
 * one budget, from its two ends.
 */
describe("the band's width budget on the smallest screen", () => {
  it("the compact toggle is carried by its glyph, and still says what it is", async () => {
    // MEASURED WHERE THE RAIL IS A COLUMN. Below 640 the rail is a shut
    // drawer, so nothing inside it has a painted size at all -- a first
    // version of this asserted the glyph's width at 320 and read 0, which says
    // "the drawer is shut", not "the glyph is missing". The compact tier is
    // still what is under test: `--hx-rail-compact` styling is not what draws
    // the glyph, the base rule is, and the words' clip is asserted separately
    // below at the width where it applies.
    const el = mountedContainer(1280);
    const render = createMatchTableRenderer();
    const state = pendingTrucoState("2v2");
    render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
    await waitForArt(el);

    const toggle = el.querySelector<HTMLElement>(".hexdev-truco-senas-toggle");
    if (toggle === null) throw new Error("fence setup: no señas toggle in a state that offers señas");

    // SOMETHING IS PAINTED WHERE THE WORDS WILL BE CLIPPED. Asserted here
    // rather than left to a baseline image, because the visual suite shoots
    // `feltOf()` -- the felt, not the rail -- so no screenshot in this repo
    // covers this glyph at all.
    const icon = toggle.querySelector<SVGSVGElement>(".hexdev-truco-senas-icon");
    if (icon === null) throw new Error("the compact tier hides the words and no glyph replaced them");
    expect(icon.getBoundingClientRect().width, "the glyph's painted width").toBeGreaterThan(12);
    // Decorative, and marked so: the name comes from the words beside it.
    expect(icon.getAttribute("aria-hidden"), "the glyph must not join the accessible name").toBe("true");

    // AND THE NAME SURVIVES THE CLIP. Hiding the words visually is a layout
    // decision; hiding them from a screen reader would be a different and much
    // worse one. `display: none` and `visibility: hidden` both drop text out
    // of the accessible name -- the visually-hidden clip does not, which is
    // the entire reason the compact rule uses it.
    const compact = mountedContainer(320);
    const compactRender = createMatchTableRenderer();
    compactRender(compact, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
    await waitForArt(compact);
    const compactToggle = compact.querySelector<HTMLElement>(".hexdev-truco-senas-toggle");
    if (compactToggle === null) throw new Error("fence setup: no señas toggle at 320px");
    expect(compactToggle.textContent ?? "", "the toggle's accessible name at 320px").toContain("Seña/Consulta");
  });

  /* EVERY width the sweep covers, not just the narrowest.
   *
   * A first version of the fix scoped "answer first" to the compact tier, and
   * a first version of THIS fence only checked 320 -- so it passed while 640
   * and 768 still clipped the answer by 52 and 11 pixels. The rule is about
   * which group matters, not about how wide the screen is, and the fence has
   * to be able to say that. */
  const SWEPT = [320, 360, 375, 390, 414, 570, 640, 768, 900, 1024, 1280, 1440] as const;

  it.each(SWEPT)("%ipx: the group the player owes an answer to is served before the one they may skip", async (width) => {
    const el = mountedContainer(width);
    const render = createMatchTableRenderer();
    // A rival opened the envido: SELF owes quiero / no quiero, and MAY answer
    // with envido envido, real envido or falta envido. Two groups, one owed.
    const state = envidoAnswerState();
    render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
    await waitForArt(el);

    const response = el.querySelector<HTMLElement>(".hexdev-truco-calls-group--response");
    if (response === null) throw new Error("fence setup: the escalated state offers no response group");

    // The answer pair fits WHOLE. The escalation ladder is still free to
    // scroll -- three long calls will not fit a 320px phone whatever we do,
    // and that group is the one the scroller was built for.
    expect(response.scrollWidth, `the owed answer clipped at ${String(width)}px`).toBeLessThanOrEqual(response.clientWidth + 1);
  });
});

/**
 * THE BAND BELONGS TO THE CALLS.
 *
 * Even shrunk to a glyph and a number the Seña/Consulta toggle was taking 84
 * of a 320px band's 304, and the escalation ladder beside the owed answer was
 * getting 16px of the 383 it wanted -- a sliver the player cannot read as a
 * button, let alone as a scroller with two more behind it.
 *
 * So the control leaves the band for the side rail, which is the one place
 * that already answers this exact question twice: a persistent column from
 * 640px up, where nothing is hidden, and a tabbed drawer below it, where
 * things the player does not always need go. One DOM, two behaviours, no
 * runtime measurement -- truco-ui has never measured its own box and does not
 * start here (`.hexdev-truco-table-shell`'s own container-query note argues
 * why: an embedded widget's width is its container's, not the viewport's).
 *
 * WHAT MUST NOT GO WITH IT is the partner's answer. Consulting is worthless if
 * the reply lands inside a closed drawer, so the advice stays out on the felt
 * with the picker -- the same surface the player was already looking at when
 * they asked.
 */
describe("the band belongs to the calls, and the partner's answer stays visible", () => {
  const SWEPT = [320, 375, 640, 1280] as const;

  it.each(SWEPT)("%ipx: the Seña/Consulta control sits in the rail, not on the band", async (width) => {
    const el = mountedContainer(width);
    const render = createMatchTableRenderer();
    const state = pendingTrucoState("2v2");
    render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
    await waitForArt(el);

    const toggle = el.querySelector<HTMLElement>(".hexdev-truco-senas-toggle");
    if (toggle === null) throw new Error("fence setup: no señas toggle in a state that offers señas");

    expect(toggle.closest(".hexdev-truco-side-rail"), "the toggle's home").not.toBeNull();
    expect(toggle.closest(".hexdev-truco-action-bar"), "the toggle must be off the band").toBeNull();
  });

  it("320px: with the band to itself, the escalation ladder is a button and not a sliver", async () => {
    const el = mountedContainer(320);
    const render = createMatchTableRenderer();
    const state = envidoAnswerState();
    render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
    await waitForArt(el);

    const opening = el.querySelector<HTMLElement>(".hexdev-truco-calls-group--opening");
    if (opening === null) throw new Error("fence setup: the escalated state offers no opening group");

    // Measured, not wished for: 320px cannot fit 184px of owed answer plus
    // 383px of ladder however the pixels are arranged, so this group scrolls
    // and always will. What it may not do is be invisible. 90px is most of
    // "Envido envido" (134px) -- enough to read the call and to see there is
    // more of it off the edge. It was 16px.
    expect(opening.clientWidth, "the escalation ladder's painted width at 320px").toBeGreaterThanOrEqual(90);
  });

  it("the partner's answer is readable with the drawer shut", async () => {
    const el = mountedContainer(375);
    const render = createMatchTableRenderer();
    const state = pendingTrucoState("2v2");
    // The advice is the EIGHTH argument, never a field on the view: MatchRoom
    // sends it to the asking client alone, and a view that could carry it
    // would carry it to the whole table.
    render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {}, undefined, undefined, undefined, { advice: "quiero", asking: false });
    await waitForArt(el);

    const advice = el.querySelector<HTMLElement>(".hexdev-truco-consult-advice");
    if (advice === null) throw new Error("fence setup: an advice value rendered no advice");

    // The drawer is shut on the first render (the rail only opens on a tap),
    // so an answer mounted inside it is an answer the player never sees.
    expect(advice.closest(".hexdev-truco-side-rail"), "the answer must not be inside the drawer").toBeNull();
    expect(advice.getBoundingClientRect().width, "the answer's painted width").toBeGreaterThan(0);
  });
});
