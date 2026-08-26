import { afterEach, describe, expect, it } from "vitest";
import { applyAction, createHeadToHeadMatch, createTeamMatch, getLegalActions, getViewFor, startHand } from "@hexdev/truco-engine";
import type { Action, DealInput, MatchState, PlayerId } from "@hexdev/truco-engine";
import { createMatchTableRenderer } from "./table.js";

/**
 * PR3-T4 (tasks §7, skeleton) → PR5-T7/T9 (tasks §9, COMPLETED): the
 * ZERO-OVERLAP suite that proves TRZ-2/TRZ-3/TRZ-4/TRZ-5/TRZ-6 (the design's
 * Q2 hard mandate, THE MANDATE) now that the action bar is its own reserved
 * grid row (PR5-T1/T8) and the call-log rail is its own grid column at
 * wide/ultra (PR4-T4/T5). PR3 built the harness (the `overlaps` helper, the
 * width x seat-count loop, the pending-call fixture) and the two assertions
 * that were already meaningful pre-PR4/PR5. PR5-T7 fills in every remaining
 * `it.todo`: the three action-bar pairings (hand card, played pile, turn
 * badge — all tiers) and the call-log pairing (wide + ultra only, per
 * PR4-T8's documented narrow exception). See tasks §2.2 for why the
 * turn-badge assertion targets the EXISTING, UNMOVED
 * `.hexdev-truco-turn-badge` — blessed refinement 1 makes the axis conflict
 * structurally impossible by construction (the bar is a sibling grid row
 * below the same anchor the badge sits on top of), not by repositioning
 * either element.
 */

const SELF = "overlap-self" as PlayerId;
const OPPONENT = "overlap-opponent" as PlayerId;
const TEAMMATE = "overlap-teammate" as PlayerId;
const OPPONENT_2 = "overlap-opponent-2" as PlayerId;

/** Same fixture as `table-height-stability.browser.test.ts`'s own
 * `DEAL_1V1_MAXIMAL` (duplicated, not imported — see that file's own note on
 * why: neither file exports fixtures, matching this repo's established
 * per-file-owns-its-fixtures convention). */
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

/**
 * Lands the deal before anything is measured.
 *
 * The table plays a short dealing animation on the first render of every hand
 * -- every card translated and scaled for about half a second -- so a rect
 * taken straight after render is the rect of a card still in the air. This
 * suite is about the SETTLED table, so it settles it: the same distinction
 * the animation itself draws, made explicit rather than waited out.
 */
function settleDeal(el: HTMLElement): void {
  el.querySelector(".hexdev-truco-table--dealing")?.classList.remove("hexdev-truco-table--dealing");
}

async function waitForArt(el: HTMLElement): Promise<void> {
  const images = [...el.querySelectorAll("img")];
  await Promise.all(images.map((img) => img.decode()));
}

function dispatch(state: MatchState, action: Action): MatchState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`test setup: illegal action ${JSON.stringify(action)} — ${result.violation}`);
  return result.state;
}

/** The two rectangles overlap, per the tasks artifact's own 0.5px epsilon —
 * loose enough to absorb genuine sub-pixel layout rounding, tight enough
 * that a real collision (tens of pixels) still trips it. */
function overlaps(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
}

interface Edges {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** `inner` sits entirely within `outer`, same 0.5px epsilon as `overlaps`. */
function contains(outer: Edges, inner: DOMRect): boolean {
  return inner.left >= outer.left - 0.5 && inner.right <= outer.right + 0.5 && inner.top >= outer.top - 0.5 && inner.bottom <= outer.bottom + 0.5;
}

const isOutOfFlow = (position: string): boolean => position === "absolute" || position === "fixed";

/**
 * The rectangle a box is actually PAINTED within, after intersecting every
 * ancestor that genuinely clips it — the thing `getBoundingClientRect` alone
 * can never tell you, because a rect keeps reporting a box's layout position
 * long after an ancestor's `overflow` has stopped painting it (measured
 * directly on the pre-popover señas row: six buttons reporting a full 32px
 * rect each while 0 of those pixels reached the screen).
 *
 * CSS's own containing-block rule is the crux of the FU-1 popover, so it is
 * reimplemented here rather than assumed: an out-of-flow box is clipped by an
 * ancestor scroller only when that scroller IS its containing block or an
 * ancestor of it. A scroller sitting BELOW the containing block — such as
 * `.hexdev-truco-action-bar`, whose `overflow-x`/`overflow-y` are both `auto`
 * — never clips it at all. That asymmetry is exactly why the popover can
 * escape the fixed action band while still honouring the felt's own
 * `overflow: hidden` edge, and this helper is what proves it happened rather
 * than merely being intended.
 *
 * Uses each clipper's BORDER box (`getBoundingClientRect`) where CSS clips to
 * the padding box. Every clipping ancestor on this table is borderless, so
 * the two coincide today; where they ever diverge this helper is the more
 * PERMISSIVE of the two, so it can only ever miss a real clip, never invent
 * one.
 */
function paintedClipRect(el: Element): Edges {
  let clip: Edges = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
  let escaping = isOutOfFlow(getComputedStyle(el).position);
  for (let ancestor = el.parentElement; ancestor !== null; ancestor = ancestor.parentElement) {
    const style = getComputedStyle(ancestor);
    // The containing block for an out-of-flow box: the nearest ancestor that
    // is itself positioned, or that paints into its own coordinate space
    // (transform/filter). Reaching it ENDS the escape — that same element,
    // and everything above it, clips normally again.
    if (escaping && (style.position !== "static" || style.transform !== "none" || style.filter !== "none")) escaping = false;
    if (!escaping && (style.overflowX !== "visible" || style.overflowY !== "visible")) {
      const box = ancestor.getBoundingClientRect();
      clip = {
        left: Math.max(clip.left, box.left),
        top: Math.max(clip.top, box.top),
        right: Math.min(clip.right, box.right),
        bottom: Math.min(clip.bottom, box.bottom),
      };
    }
    // An out-of-flow ancestor starts its OWN escape for everything above it.
    if (isOutOfFlow(style.position)) escaping = true;
  }
  return clip;
}

/** The picker-open state, reached the same way a player reaches it: by
 * clicking the real toggle `renderSenaPicker` mounts. Never hand-authored —
 * open/closed is closed-over per-mount state inside `senas.ts` with no other
 * door into it, the same discipline `table-height-stability.browser.test.ts`'s
 * own señas case already uses. */
function openSenaPicker(el: HTMLElement): HTMLElement {
  const toggle = el.querySelector<HTMLButtonElement>('button[data-action="senas-toggle"]');
  if (toggle === null) throw new Error("test setup: señas toggle not rendered — is send-sena really legal for this 2v2 fixture?");
  toggle.click();
  const row = el.querySelector<HTMLElement>(".hexdev-truco-senas-row");
  if (row === null) throw new Error("test setup: señas row not rendered");
  return row;
}

/** The reachable state this whole suite mounts: a PENDING call still
 * awaiting a response (the banner is on screen), a played pile on every
 * seat (trick 1 already resolved), and a HAND that still has cards left to
 * play (2 of the dealt 3, not emptied) — the tallest simultaneous
 * combination of colliding surfaces this table can show BEFORE the action
 * bar/call-log rail exist as their own reserved regions (PR4/PR5).
 * "Full hand" in the task's own wording is read here as "not yet emptied",
 * not literally all 3 original cards: a played pile is definitionally
 * impossible without at least one card having left the hand already, so a
 * literal 3-card hand and a non-empty pile can never coexist in this engine
 * — reported here explicitly, not silently reinterpreted. TRUCO (not
 * envido) is the pending call: in this engine's own rules, envido is only
 * legal before trick 1 resolves, so it cannot still be PENDING once a pile
 * already exists; truco has no such restriction and is legal again right
 * after trick 1, which is exactly the state this fixture needs. */
function pendingTrucoAfterTrick1Headshot1v1(): MatchState {
  let state = startHand(createHeadToHeadMatch({ playerAId: SELF, playerBId: OPPONENT, pointsToWin: 30, dealerSeat: 1 }), DEAL_1V1_MAXIMAL);
  // Trick 1: SELF (mano) leads and wins with 1-espada over 4-espada.
  state = dispatch(state, { type: "play-card", playerId: SELF, card: DEAL_1V1_MAXIMAL[0]![0]! });
  state = dispatch(state, { type: "play-card", playerId: OPPONENT, card: DEAL_1V1_MAXIMAL[1]![0]! });
  // SELF (won trick 1, leads trick 2) opens truco instead of leading a card —
  // left PENDING, deliberately never responded to, so the banner stays on screen.
  state = dispatch(state, { type: "call-truco", playerId: SELF, level: "truco" });
  return state;
}

/** 2v2 counterpart of `pendingTrucoAfterTrick1Headshot1v1` — see that
 * function's own docblock for the full rationale (identical here). */
function pendingTrucoAfterTrick1Headshot2v2(): MatchState {
  const seatOrder: readonly [PlayerId, PlayerId, PlayerId, PlayerId] = [SELF, OPPONENT, TEAMMATE, OPPONENT_2];
  let state = startHand(createTeamMatch({ seatOrder, pointsToWin: 30, dealerSeat: 3 }), DEAL_2V2_MAXIMAL);
  // Trick 1: SELF leads (mano), turn order 0 -> 1 -> 2 -> 3; team A's 1-espada (SELF) wins.
  state = dispatch(state, { type: "play-card", playerId: SELF, card: DEAL_2V2_MAXIMAL[0]![0]! });
  state = dispatch(state, { type: "play-card", playerId: OPPONENT, card: DEAL_2V2_MAXIMAL[1]![0]! });
  state = dispatch(state, { type: "play-card", playerId: TEAMMATE, card: DEAL_2V2_MAXIMAL[2]![0]! });
  state = dispatch(state, { type: "play-card", playerId: OPPONENT_2, card: DEAL_2V2_MAXIMAL[3]![0]! });
  // SELF (won trick 1, leads trick 2) opens truco instead — left PENDING.
  state = dispatch(state, { type: "call-truco", playerId: SELF, level: "truco" });
  return state;
}

/** PR5-T7's own addition: a state with a played pile on every seat, a
 * still-non-empty hand, and — the piece the two pending-call fixtures above
 * cannot produce — the turn badge on SELF's OWN anchor (`bottom`), the exact
 * axis-conflict geometry tasks §2.2/design §7.1 is actually about: the badge
 * sits at `top: -11px` of the bottom anchor, and the action bar is a sibling
 * grid row below that SAME anchor. In both `pendingTruco...` fixtures above,
 * SELF is always the CALLER, so the badge always lands on the RESPONDING
 * team's anchor instead (never `bottom`) — a real, honest gap for this one
 * assertion specifically, closed here rather than silently accepted. This
 * reuses the exact same trick-1 opening (SELF, mano, wins with the same
 * cards) as the two fixtures above, just WITHOUT the trailing call — SELF
 * simply keeps the lead into trick 2, so `turnSeat === view.self.seat` and
 * the badge renders on `bottom`. */
function selfTurnActiveAfterTrick1Win1v1(): MatchState {
  let state = startHand(createHeadToHeadMatch({ playerAId: SELF, playerBId: OPPONENT, pointsToWin: 30, dealerSeat: 1 }), DEAL_1V1_MAXIMAL);
  state = dispatch(state, { type: "play-card", playerId: SELF, card: DEAL_1V1_MAXIMAL[0]![0]! });
  state = dispatch(state, { type: "play-card", playerId: OPPONENT, card: DEAL_1V1_MAXIMAL[1]![0]! });
  return state;
}

/** 2v2 counterpart of `selfTurnActiveAfterTrick1Win1v1` — see that
 * function's own docblock for the full rationale (identical here). */
function selfTurnActiveAfterTrick1Win2v2(): MatchState {
  const seatOrder: readonly [PlayerId, PlayerId, PlayerId, PlayerId] = [SELF, OPPONENT, TEAMMATE, OPPONENT_2];
  let state = startHand(createTeamMatch({ seatOrder, pointsToWin: 30, dealerSeat: 3 }), DEAL_2V2_MAXIMAL);
  state = dispatch(state, { type: "play-card", playerId: SELF, card: DEAL_2V2_MAXIMAL[0]![0]! });
  state = dispatch(state, { type: "play-card", playerId: OPPONENT, card: DEAL_2V2_MAXIMAL[1]![0]! });
  state = dispatch(state, { type: "play-card", playerId: TEAMMATE, card: DEAL_2V2_MAXIMAL[2]![0]! });
  state = dispatch(state, { type: "play-card", playerId: OPPONENT_2, card: DEAL_2V2_MAXIMAL[3]![0]! });
  return state;
}

/** Tasks §7's own width list for this file — the SAME four container tiers
 * `table-height-stability.browser.test.ts` uses (unextended: the two extra
 * boundary widths, 640/900, are this PR's own addition to the BUDGET file
 * only, per that file's docblock — this suite's own scope is unaffected). */
const WIDTHS = [375, 700, 960, 1280] as const;

/** A FRESHLY DEALT 2v2 hand — every seat still holds all three cards, which
 * is the only state in which the partner's top anchor renders three card
 * backs at once (every other fixture in this file has already played trick 1,
 * so the top hand is down to two and the three-across worst case never
 * appears). */
function freshlyDealt2v2(): MatchState {
  const seatOrder: readonly [PlayerId, PlayerId, PlayerId, PlayerId] = [SELF, OPPONENT, TEAMMATE, OPPONENT_2];
  return startHand(createTeamMatch({ seatOrder, pointsToWin: 30, dealerSeat: 3 }), DEAL_2V2_MAXIMAL);
}

/**
 * The partner's three card backs all sit on ONE row (debt: the repo owner's
 * own screenshot — at 375px the third back had dropped below the other two,
 * 2 + 1, at the top of the felt).
 *
 * Asserts a shared horizontal BAND, not merely "they do not overlap": a
 * wrapped third card does not overlap its siblings either (the sibling-card
 * fence above stayed green through the whole defect), so non-overlap can
 * never tell a broken row apart from an intact one. Same 0.5px epsilon as
 * `overlaps`/`contains`.
 *
 * No longer parametrized by a standing seña. The original defect was the
 * partner's seña CHIP stealing the anchor's width from the hand, so this
 * fence used to run twice — once bare, once with the widest label the closed
 * vocabulary can produce. That chip is gone (a seña is transient now and
 * lives in the banner lane), which means a standing seña puts exactly nothing
 * on this anchor and the second case had become a byte-identical rerun of the
 * first, asserting nothing extra. The bare case is kept: the three-across row
 * is still the anchor's own worst case, chip or no chip.
 */
async function expectPartnerBacksOnOneRow(width: number): Promise<void> {
  const el = mountedContainer(width);
  const render = createMatchTableRenderer();
  const state = freshlyDealt2v2();
  render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
  settleDeal(el);
  await waitForArt(el);

  const topHand = el.querySelector('[data-position="top"] .hexdev-truco-opponent-hand');
  if (topHand === null) throw new Error("fence setup: the partner's top hand is not rendered");

  const backs = [...topHand.querySelectorAll(".hexdev-truco-card")];
  expect(backs.length, "sanity: a freshly dealt partner holds exactly three cards").toBe(3);

  const rects = backs.map((back) => back.getBoundingClientRect());
  const first = rects[0]!;
  for (const rect of rects.slice(1)) {
    expect(Math.abs(rect.top - first.top), `card backs must share one top edge: ${JSON.stringify(rects)}`).toBeLessThan(0.5);
    expect(Math.abs(rect.bottom - first.bottom), `card backs must share one bottom edge: ${JSON.stringify(rects)}`).toBeLessThan(0.5);
  }
  // The row's own box must not be taller than the single card row it draws
  // either — the direct proof that `.hexdev-truco-opponent-hand`'s own
  // one-card-row `min-height` reservation still describes its real height.
  const handHeight = topHand.getBoundingClientRect().height;
  expect(handHeight, `the partner's hand box is ${handHeight}px, one card row is ${first.height}px`).toBeLessThan(first.height + 0.5);
}

/** The two container widths this suite's shared `WIDTHS` list does not carry,
 * both of which the debt measurement found genuinely broken: 320px (the
 * narrowest supported width) and 640px (the medium tier's own lower boundary,
 * where the felt is at its NARROWEST relative to its card size — the
 * scoreboard has just become a 168px side column while the cards have just
 * grown 60px -> 84px). Kept as their own block rather than widening `WIDTHS`,
 * which every other pairing in this file shares and has its own scope note. */
const PARTNER_ROW_EXTRA_WIDTHS = [320, 640] as const;

describe.each(WIDTHS)("zero-overlap: reserved zones never collide (tasks §7/§9, TRZ-2/3/4/5/6 — THE MANDATE) — %ipx", (width) => {
  // Action-bar-related pairings (tasks §7/§9, PR5-T7 — THE MANDATE): the
  // action bar is now a genuine reserved grid row (PR5-T1/T8), so these can
  // finally be asserted for real. Uses `selfTurnActiveAfterTrick1Win*`, NOT
  // the pending-call fixture above: only that state puts the turn badge on
  // SELF's OWN anchor (`bottom`), directly above the action bar — the exact
  // axis-conflict geometry tasks §2.2/design §7.1 is about (in the
  // pending-call fixtures, SELF is always the caller, so the badge always
  // lands on the RESPONDING team's anchor instead, never `bottom`). This
  // state still has a played pile on every seat and a non-empty hand (trick
  // 1 resolved, 2 of 3 cards remain), satisfying the rest of tasks §7's own
  // fixture description.
  const actionBarVsSurfaces = async (mode: "1v1" | "2v2"): Promise<void> => {
    const el = mountedContainer(width);
    const render = createMatchTableRenderer();
    const state = mode === "1v1" ? selfTurnActiveAfterTrick1Win1v1() : selfTurnActiveAfterTrick1Win2v2();
    render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
    settleDeal(el);
    await waitForArt(el);

    const actionBar = el.querySelector(".hexdev-truco-action-bar");
    if (actionBar === null) throw new Error("test setup: action bar not rendered");
    const actionBarRect = actionBar.getBoundingClientRect();

    const cards = [...el.querySelectorAll(".hexdev-truco-hand .hexdev-truco-card")];
    expect(cards.length, "sanity: the hand should still have cards left to play").toBeGreaterThan(0);
    for (const card of cards) {
      const cardRect = card.getBoundingClientRect();
      expect(overlaps(actionBarRect, cardRect), `action bar ${JSON.stringify(actionBarRect)} vs hand card ${JSON.stringify(cardRect)}`).toBe(false);
    }

    const piles = [...el.querySelectorAll(".hexdev-truco-played")];
    expect(piles.length, "sanity: trick 1 resolved, every seat should have a pile card").toBeGreaterThan(0);
    for (const pile of piles) {
      const pileRect = pile.getBoundingClientRect();
      expect(overlaps(actionBarRect, pileRect), `action bar ${JSON.stringify(actionBarRect)} vs played pile ${JSON.stringify(pileRect)}`).toBe(false);
    }

    const badge = el.querySelector(".hexdev-truco-turn-badge");
    if (badge === null) throw new Error("test setup: turn badge not rendered — is it really SELF's own turn?");
    const badgeRect = badge.getBoundingClientRect();
    expect(overlaps(actionBarRect, badgeRect), `action bar ${JSON.stringify(actionBarRect)} vs turn badge ${JSON.stringify(badgeRect)}`).toBe(false);
  };
  it.each(["1v1", "2v2"] as const)("%s: .hexdev-truco-action-bar never overlaps a hand card, a played pile, or the (unmoved) turn badge", actionBarVsSurfaces);

  // Call-log vs. action-bar pairing (PR8, verify report WARNING-4/TRZ-5
  // scenario C: "the call log's bounding rectangle stops short of the tray's
  // worst-case footprint" — the height half was already proven by
  // table-height-stability.browser.test.ts, but no test compared the two
  // RECTANGLES directly). Unlike the call-log-vs-pile pairing below, this one
  // is NOT scoped to wide+ultra: PR4-T8's documented narrow exception is
  // specifically about the compact 2v2 --left pile, never about the action
  // bar. At compact/medium the log is grid-area: center, absolutely
  // positioned relative to that grid AREA's own box (design D-4 — "a child
  // with a definite grid position is positioned relative to its grid area");
  // the action bar occupies a separate actions row, below bottom, in the
  // same grid. At wide/ultra the log is its own log column, spanning every
  // row including actions, but the action bar sits in its own play-column
  // cell within that row — still a distinct box. Structurally disjoint at
  // every tier, so this pairing is asserted at all four widths x both seat
  // counts, not gated by width. Reuses the pending-call fixture — the same
  // call chain that gives the log real entries also drives a non-empty hand
  // and a rendered action bar.
  it.each(["1v1", "2v2"] as const)("%s: .hexdev-truco-call-log never overlaps .hexdev-truco-action-bar", async (mode) => {
    const el = mountedContainer(width);
    const render = createMatchTableRenderer();
    const state = mode === "1v1" ? pendingTrucoAfterTrick1Headshot1v1() : pendingTrucoAfterTrick1Headshot2v2();
    render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
    settleDeal(el);
    await waitForArt(el);

    const callLog = el.querySelector(".hexdev-truco-call-log");
    const actionBar = el.querySelector(".hexdev-truco-action-bar");
    if (callLog === null || actionBar === null) throw new Error("test setup: call log or action bar not rendered — is there really a call chain?");
    const callLogRect = callLog.getBoundingClientRect();
    const actionBarRect = actionBar.getBoundingClientRect();

    expect(overlaps(callLogRect, actionBarRect), `call log ${JSON.stringify(callLogRect)} vs action bar ${JSON.stringify(actionBarRect)}`).toBe(false);
  });

  // Call-log pairing (tasks §7/PR4-T8, completed PR5-T7): the log rail only
  // becomes its own grid column (`grid-area: log`, `position: static`) at
  // wide/ultra (PR4-T4/T5) — compact/medium keep the pre-existing, documented
  // narrow 2v2 log/`--left`-pile collision (PR4-T8), so this pairing stays
  // scoped to wide + ultra only, exactly as PR4-T8/PR5-T7's own scope note
  // requires. Reuses the pending-call fixture (a full call chain gives the
  // log real entries to render, alongside piles and a non-empty hand).
  if (width >= 900) {
    it.each(["1v1", "2v2"] as const)("%s: .hexdev-truco-call-log never overlaps a played pile or hand card (wide + ultra only)", async (mode) => {
      const el = mountedContainer(width);
      const render = createMatchTableRenderer();
      const state = mode === "1v1" ? pendingTrucoAfterTrick1Headshot1v1() : pendingTrucoAfterTrick1Headshot2v2();
      render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
      settleDeal(el);
      await waitForArt(el);

      const callLog = el.querySelector(".hexdev-truco-call-log");
      if (callLog === null) throw new Error("test setup: call log not rendered — is there really a call chain?");
      const callLogRect = callLog.getBoundingClientRect();

      const surfaces = [...el.querySelectorAll(".hexdev-truco-played"), ...el.querySelectorAll(".hexdev-truco-hand .hexdev-truco-card")];
      expect(surfaces.length, "sanity: piles and hand cards should both be on screen").toBeGreaterThan(0);
      for (const surface of surfaces) {
        const surfaceRect = surface.getBoundingClientRect();
        expect(overlaps(callLogRect, surfaceRect), `call log ${JSON.stringify(callLogRect)} vs ${surface.className} ${JSON.stringify(surfaceRect)}`).toBe(false);
      }
    });
  } else {
    // PR4-T8 (documented, out of scope): at compact/medium the log rail is
    // still the pre-existing absolutely-positioned `.hexdev-truco-center`
    // overlay, which can meet a 2v2 `--left` pile — neither fixed nor
    // worsened by this change. `it.todo` here (rather than a passing `it`)
    // keeps the suite's own test count honest about what is NOT asserted at
    // these two tiers, matching the skeleton's original scope note.
    it.todo(`${width}px: .hexdev-truco-call-log never overlaps a played pile or hand card (compact/medium — PR4-T8 documented exception, not asserted)`);
  }

  // PR8 (user eye-review observation): cards WITHIN one hand never overlap
  // each other. This was already guaranteed by construction — every hand row
  // (.hexdev-truco-hand and .hexdev-truco-opponent-hand alike) lays its cards
  // out with flex + gap: 4px + wrap, and no rule anywhere applies a negative
  // margin or absolute offset to a hand card — but "guaranteed by
  // construction" is exactly the kind of claim this suite exists to turn
  // into a measured assertion: a future fanned-hand styling change or a
  // negative-margin space-saver would land silently otherwise. Pairwise
  // check per hand group, both seat modes, every width tier.
  it.each(["1v1", "2v2"] as const)("%s: no two sibling cards inside any hand ever overlap each other", async (mode) => {
    const el = mountedContainer(width);
    const render = createMatchTableRenderer();
    const state = mode === "1v1" ? pendingTrucoAfterTrick1Headshot1v1() : pendingTrucoAfterTrick1Headshot2v2();
    render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
    settleDeal(el);
    await waitForArt(el);

    const hands = [...el.querySelectorAll(".hexdev-truco-hand, .hexdev-truco-opponent-hand")];
    expect(hands.length, "sanity: every seat should render a hand row").toBeGreaterThan(0);
    let cardPairsChecked = 0;
    for (const hand of hands) {
      const cards = [...hand.querySelectorAll(".hexdev-truco-card")];
      for (let a = 0; a < cards.length; a += 1) {
        for (let b = a + 1; b < cards.length; b += 1) {
          const rectA = cards[a]!.getBoundingClientRect();
          const rectB = cards[b]!.getBoundingClientRect();
          expect(overlaps(rectA, rectB), `sibling cards in ${hand.className}: ${JSON.stringify(rectA)} vs ${JSON.stringify(rectB)}`).toBe(false);
          cardPairsChecked += 1;
        }
      }
    }
    expect(cardPairsChecked, "sanity: at least one sibling pair must have been compared, or this test proves nothing").toBeGreaterThan(0);
  });

  // Debt (repo owner's own screenshot, 2v2 at 375px): the partner's three
  // card backs had wrapped to 2 + 1 at the top of the felt. The sibling-card
  // pairing directly above could never have caught it — a wrapped card sits
  // BELOW its siblings, so it overlaps nothing — which is exactly why this
  // fence asserts a shared top/bottom BAND instead. See
  // `expectPartnerBacksOnOneRow` for the full rationale. 2v2 only,
  // structurally: the top anchor carries a relation label alongside the hand
  // ONLY when there is a partner to label; a 1v1 top anchor holds nothing but
  // the opponent's hand, so a 1v1 case would be vacuous.
  it("2v2: all three of the partner's card backs sit on one row", async () => {
    await expectPartnerBacksOnOneRow(width);
  });

  /*
   * ─── THE MANDATE'S ONE DELIBERATE EXCEPTION: the OPEN señas picker (FU-1) ──
   *
   * `.hexdev-truco-senas-row` is the one felt-mounted surface this suite
   * deliberately does NOT pair against a hand card, a played pile, the turn
   * badge, or the call log. That omission is a decision, not an oversight,
   * and this comment exists so a future reader cannot read it as one.
   *
   * WHAT IS EXCLUDED, EXACTLY. Every structural assertion above measures the
   * table with the picker CLOSED — no fixture in this file clicks
   * `button[data-action="senas-toggle"]`, so the row is empty (and
   * `display: none`) in all of them. Concretely, the open picker is excluded
   * from the four zero-overlap pairings this suite asserts:
   *   - "the pending-call banner never overlaps a played pile"
   *   - ".hexdev-truco-action-bar never overlaps a hand card, a played pile,
   *     or the (unmoved) turn badge"
   *   - ".hexdev-truco-call-log never overlaps .hexdev-truco-action-bar"
   *   - ".hexdev-truco-call-log never overlaps a played pile or hand card"
   * and no fifth pairing naming the row itself was added. While it is open,
   * the popover genuinely DOES cover part of the felt beneath it — hand cards
   * and played piles included — and adding such a pairing would fail on
   * purpose.
   *
   * WHY THAT IS NOT A WEAKENED MANDATE. The mandate governs STRUCTURAL
   * surfaces: the reserved zones this table always shows, that a player never
   * asked for and cannot dismiss. The open picker is neither. It is
   * user-invoked and ephemeral, dismissed by the very same tap that opened it
   * — exactly the category `.hexdev-truco-match-over` already occupies (a
   * full-felt solid overlay this suite has likewise never asserted against).
   *
   * WHY IT HAD TO LEAVE THE BAND, on measurement rather than taste. The
   * action band is a FIXED grid track (--hx-band-action-total) whose contract
   * is "the band NEVER grows: contents scroll, the track is fixed", because a
   * growing band would shift the felt mid-hand and invalidate every fence in
   * table-height-stability/table-height-budget. Kept inside that track, the
   * six-signal row measured 0px of its 49px of content actually painted at
   * 375px (the row's own box collapsed to height 0 inside a 25px client area)
   * and 12px of 34px at 700px, with all six buttons landing past the felt's
   * own `overflow: hidden` edge — unusable, which is the FU-1 defect the
   * popover fixes.
   *
   * WHAT THE MANDATE STILL OWES IT, asserted by the three tests below
   * instead: (1) every one of the six señas is fully PAINTED —
   * non-degenerate, inside the popover's own rect, and inside every clip its
   * real ancestor chain imposes; (2) the action bar's own height is identical
   * open vs. closed, the fixed-band contract that made the popover necessary
   * in the first place; and (3) at wide/ultra, where the felt grows a
   * call-log rail COLUMN, the popover's own left edge really clears that rail
   * instead of stretching across it.
   *
   * 2v2 ONLY, structurally: `table.ts` mounts `renderSenaPicker` only when
   * `view.teammates.length > 0`, so there is no 1v1 picker to assert about —
   * a vacuous 1v1 case would prove nothing, so none is written.
   */

  it("2v2: every one of the six señas is fully painted once the picker is open (FU-1 popover, not clipped by the fixed action band)", async () => {
    const el = mountedContainer(width);
    const render = createMatchTableRenderer();
    const state = selfTurnActiveAfterTrick1Win2v2();
    render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
    settleDeal(el);
    await waitForArt(el);

    const popover = openSenaPicker(el);
    const popoverRect = popover.getBoundingClientRect();
    const popoverClip = paintedClipRect(popover);
    expect(contains(popoverClip, popoverRect), `popover ${JSON.stringify(popoverRect)} vs its own painted clip ${JSON.stringify(popoverClip)}`).toBe(true);

    const buttons = [...el.querySelectorAll<HTMLElement>(".hexdev-truco-sena")];
    expect(buttons.length, "sanity: the closed señas vocabulary is six signals — all six must be on screen at once").toBe(6);

    for (const button of buttons) {
      const rect = button.getBoundingClientRect();
      const label = button.textContent ?? "";
      // Non-degenerate: a zero-height/zero-width button is "present" to
      // querySelector and invisible to a player.
      expect(rect.width, `seña "${label}" width`).toBeGreaterThan(0);
      expect(rect.height, `seña "${label}" height`).toBeGreaterThan(0);
      // Inside the popover's own painted surface — the popover must SIZE to
      // its six children, never scroll them out of sight.
      expect(contains(popoverRect, rect), `seña "${label}" ${JSON.stringify(rect)} vs popover ${JSON.stringify(popoverRect)}`).toBe(true);
      // And inside every clip its real ancestor chain imposes — the direct
      // proof that the popover escaped the fixed band instead of being
      // painted through it.
      const clip = paintedClipRect(button);
      expect(contains(clip, rect), `seña "${label}" ${JSON.stringify(rect)} vs painted clip ${JSON.stringify(clip)}`).toBe(true);
    }
  });

  it("2v2: opening the señas picker never changes the action bar's own height (the fixed-band contract that made the popover necessary)", async () => {
    const el = mountedContainer(width);
    const render = createMatchTableRenderer();
    const state = selfTurnActiveAfterTrick1Win2v2();
    render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
    settleDeal(el);
    await waitForArt(el);

    const bar = el.querySelector(".hexdev-truco-action-bar");
    const felt = el.querySelector(".hexdev-truco-table");
    if (bar === null || felt === null) throw new Error("test setup: action bar or felt not rendered");
    const closedBar = bar.getBoundingClientRect().height;
    const closedFelt = felt.getBoundingClientRect().height;

    openSenaPicker(el);

    const openBar = bar.getBoundingClientRect().height;
    const openFelt = felt.getBoundingClientRect().height;
    expect(Math.abs(openBar - closedBar), `action bar open ${openBar}px vs closed ${closedBar}px`).toBeLessThan(0.5);
    expect(Math.abs(openFelt - closedFelt), `felt open ${openFelt}px vs closed ${closedFelt}px`).toBeLessThan(0.5);
  });

  // The popover's HORIZONTAL POSITION (native review of the FU-1 popover PR:
  // no test asserted it at all). From wide up the felt grows a call-log rail
  // COLUMN, and the popover's containing block is the whole felt — so the
  // compact/medium inset (`left: var(--hx-felt-pad)`) would stretch the
  // popover across the rail and centre its six signals well to the left of
  // the toggle they belong to. Neither popover fence above can see that: the
  // rail is an in-flow sibling grid COLUMN, not a clipping ancestor, so all
  // six señas stay fully painted and the action band's height is untouched
  // whichever inset wins. The wide-tier rule ALREADY failed silently once
  // during development — written as a bare-class selector, it lost on source
  // order to the base rule declared later in the same stylesheet — which is
  // exactly why it earns a positional fence of its own.
  //
  // WHERE THE EXPECTATION COMES FROM: real rendered geometry, never the
  // stylesheet's own calc() restated in TypeScript (an assertion that merely
  // copies `calc(--hx-felt-pad + --hx-log-rail + --hx-felt-gap)` proves only
  // that arithmetic can be transcribed, and would keep passing against a
  // stylesheet that had stopped applying the rule at all). Two independent
  // sources, both measured off the DOM:
  //   - `.hexdev-truco-action-bar` IS the "actions" grid area at this tier
  //     (`grid-area: actions`, spanning every column except the log one), so
  //     its own border-box left edge is literally "where the actions area
  //     starts". Its `padding-inline` cannot skew this — a rect is the BORDER
  //     box.
  //   - `.hexdev-truco-call-log` is the rail's real occupant at this tier
  //     (`grid-area: log`, `position: static` — an in-flow column child), so
  //     its right edge is a directly-observed floor the popover must clear.
  // Both were confirmed to fail INDEPENDENTLY (each run first, so neither
  // hid behind the other) against a stylesheet with this one rule locally
  // neutralised back to `left: var(--hx-felt-pad)`. MEASURED at 960px: the
  // popover started at 24px — the felt's own padding, i.e. the log's own LEFT
  // edge — against an actions area starting at 240px and a log right edge of
  // 140px, so the two assertions missed by 216px and 116px respectively.
  //
  // Uses the PENDING-CALL 2v2 fixture rather than the
  // `selfTurnActiveAfterTrick1Win2v2` the two fences above use: only a state
  // with a real call chain gives `.hexdev-truco-call-log` entries to render,
  // and an EMPTY log is `display: none` (a 0x0 rect at the viewport origin),
  // which would make the clearance assertion vacuously true. Señas stay legal
  // throughout — truco-engine's `getLegalSenaActions` gates only on "hand in
  // progress and the sender has a teammate", never on a pending call.
  //
  // Wide + ultra ONLY, structurally: `--hx-log-rail` and this inset override
  // exist solely inside `@container hexdev-truco-shell (min-width: 900px)`.
  // At compact/medium the log is an absolutely-positioned overlay with no
  // column track at all, so the base inset is the CORRECT answer there and a
  // 375/700px case would assert the opposite of the rule under test.
  if (width >= 900) {
    it("2v2: the open señas popover starts where the actions area starts, and stops before the rail (wide + ultra only)", async () => {
      const el = mountedContainer(width);
      const render = createMatchTableRenderer();
      const state = pendingTrucoAfterTrick1Headshot2v2();
      render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
      settleDeal(el);
      await waitForArt(el);

      const actionBar = el.querySelector(".hexdev-truco-action-bar");
      const callLog = el.querySelector(".hexdev-truco-call-log");
      if (actionBar === null || callLog === null) throw new Error("test setup: action bar or call log not rendered — is there really a call chain?");
      const callLogRect = callLog.getBoundingClientRect();
      expect(callLogRect.width, "sanity: an empty call log is display: none, which would make the clearance check below vacuous").toBeGreaterThan(0);

      const popoverRect = openSenaPicker(el).getBoundingClientRect();
      const actionBarRect = actionBar.getBoundingClientRect();

      // Same 0.5px epsilon as `overlaps`/`contains`.
      expect(
        Math.abs(popoverRect.left - actionBarRect.left),
        `popover left ${popoverRect.left}px vs the actions area's own left edge ${actionBarRect.left}px`,
      ).toBeLessThan(0.5);
      // The clearance flipped sides with the rail. This used to read
      // `popover.left >= callLog.right`, because the log was a column on the
      // LEFT and the popover had to start after it; the popover even carried
      // an inset of its own that copied the rail's width. The log lives in the
      // rail on the right now, the inset is gone, and the thing worth proving
      // is the same one it always was: these two never collide.
      expect(popoverRect.right, `popover right ${popoverRect.right}px vs call log left ${callLogRect.left}px`).toBeLessThanOrEqual(callLogRect.left + 0.5);
    });
  }
});

/**
 * ONE RAIL, NOT TWO. Desktop used to spend a vertical column on each side of
 * the play: the call-log rail on the left (`--hx-log-rail`, clamp(200px, 22%,
 * 280px)) and the scoreboard rail on the right (240px at ultra). Measured on
 * a 1580px shell that is 280 + 240 = 520px of chrome flanking 979px of table
 * — a third of the width — and BOTH rails were mostly empty: the scoreboard
 * held about 300px of content in 693px of column.
 *
 * They are one rail now, calls above and score below, and the column that
 * frees goes to the cards. These two fences own that: the first that the two
 * really share a band, the second that the play actually took the space
 * rather than the felt just growing padding.
 */
/** How far the active-turn ring paints OUTSIDE the hand it surrounds:
 * outline-offset, plus the outline itself, plus the halo's spread. Read off
 * the element rather than pinned here, so retuning the ring in the stylesheet
 * cannot leave this fence measuring a number nobody uses any more. */
function ringReachOf(hand: Element): number {
  const style = getComputedStyle(hand);
  const offset = Number.parseFloat(style.outlineOffset) || 0;
  const width = Number.parseFloat(style.outlineWidth) || 0;
  const spread = Number.parseFloat(style.boxShadow.match(/0px 0px 0px ([\d.]+)px/)?.[1] ?? "0");
  return Math.max(offset + width, spread);
}

describe.each(WIDTHS)("the turn ring does not paint onto the action bar — %ipx", (width) => {
  // Reported from a screenshot of live play: "el recuadro dorado de las
  // cartas del jugador se solapa con los botones". The ring is an OUTLINE
  // plus a halo, both of which paint outside the box and take no layout space
  // at all — deliberately, so the air around the cards costs no card size.
  // The cost of that is exactly this: nothing in the layout knows the ring is
  // there, so the row below can sit right under it.
  it("2v2: the ring around the player's own hand clears .hexdev-truco-action-bar", async () => {
    const el = mountedContainer(width);
    const render = createMatchTableRenderer();
    const state = selfTurnActiveAfterTrick1Win2v2();
    render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
    settleDeal(el);
    await waitForArt(el);

    const hand = el.querySelector(".hexdev-truco-anchor--active .hexdev-truco-hand");
    const actionBar = el.querySelector(".hexdev-truco-action-bar");
    if (hand === null || actionBar === null) throw new Error("test setup: no active own hand or no action bar — is it really the viewer's turn?");

    const reach = ringReachOf(hand);
    expect(reach, "fence setup: the ring paints nothing outside the hand, so this cannot detect anything").toBeGreaterThan(0);
    const painted = hand.getBoundingClientRect().bottom + reach;
    const bar = actionBar.getBoundingClientRect();

    expect(painted, `the ring reaches ${painted.toFixed(1)}px, the action bar starts at ${bar.top.toFixed(1)}px`).toBeLessThanOrEqual(bar.top + 0.5);
  });
});

describe.each([375, 700] as const)("the drawer handle sits beside the play, not on it — %ipx", (width) => {
  // Seen in a mobile screenshot: the vertical tab overlapped the right
  // rival's card backs. It is a small sliver of a handle, but a handle drawn
  // on top of a card is a handle that hides information — and the cards are
  // the one thing on this screen that may never be covered.
  //
  // Only the tiers where the rail IS a drawer: from 640 up the tab is
  // display: none and there is nothing to collide with.
  it("2v2: .hexdev-truco-rail-tab never overlaps a seat's cards", async () => {
    const el = mountedContainer(width);
    const render = createMatchTableRenderer();
    const state = pendingTrucoAfterTrick1Headshot2v2();
    render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
    settleDeal(el);
    await waitForArt(el);

    const tab = el.querySelector(".hexdev-truco-rail-tab");
    if (tab === null) throw new Error("test setup: the drawer handle did not render");
    const handle = tab.getBoundingClientRect();
    if (handle.width === 0) return; // no drawer at this tier: nothing to prove

    for (const hand of el.querySelectorAll(".hexdev-truco-opponent-hand, .hexdev-truco-hand")) {
      const cards = hand.getBoundingClientRect();
      if (cards.width === 0) continue;
      expect(overlaps(handle, cards), `handle ${JSON.stringify(handle)} vs cards ${JSON.stringify(cards)}`).toBe(false);
    }

    // The action bar too, and that is not thoroughness for its own sake: the
    // bar takes the handle's reserved lane BACK (table-styles.ts explains
    // why), and the only thing that makes that safe is these two never
    // meeting. Argued in a comment, proven here.
    const bar = el.querySelector(".hexdev-truco-action-bar");
    if (bar !== null) {
      expect(overlaps(handle, bar.getBoundingClientRect()), `handle ${JSON.stringify(handle)} vs action bar ${JSON.stringify(bar.getBoundingClientRect())}`).toBe(false);
    }
  });
});

describe.each(WIDTHS)("the rail never covers the way out — %ipx", (width) => {
  // Reported from live play at desktop: "el registro de cantos me tapa el
  // boton salir". True, and mine — the log used to float over the centre of
  // the cloth, and moving it into the rail put it exactly where the leave
  // control already sat. Every width this suite tests, because the report
  // came with the right question attached: "no se si ocurra tambien en alguna
  // otra resolucion y en mobile".
  it("2v2: .hexdev-truco-call-log never overlaps .hexdev-truco-leave", async () => {
    const el = mountedContainer(width);
    const render = createMatchTableRenderer();
    const state = pendingTrucoAfterTrick1Headshot2v2();
    // The SIXTH argument is what mounts .hexdev-truco-leave at all -- the
    // fifth is turnDeadline. Without an onLeaveMatch there is no way out on
    // the table and this fence would pass by measuring nothing, which is how
    // a first version of it "failed at every width" on setup rather than on
    // the overlap it is about.
    render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {}, undefined, null, () => {});
    settleDeal(el);
    await waitForArt(el);

    const rail = el.querySelector<HTMLElement>(".hexdev-truco-side-rail");
    if (rail !== null) rail.dataset.open = "true";
    const callLog = el.querySelector(".hexdev-truco-call-log");
    const leave = el.querySelector(".hexdev-truco-leave");
    if (callLog === null || leave === null) throw new Error(`test setup: callLog=${String(callLog !== null)} leave=${String(leave !== null)}`);

    const log = callLog.getBoundingClientRect();
    expect(log.width, "sanity: an empty call log is display: none, which would make this vacuous").toBeGreaterThan(0);
    expect(overlaps(log, leave.getBoundingClientRect()), `call log ${JSON.stringify(log)} vs leave ${JSON.stringify(leave.getBoundingClientRect())}`).toBe(false);
  });
});

describe.each([960, 1280] as const)("the calls and the score share one rail — %ipx", (width) => {
  it("2v2: the call log sits in the scoreboard's own column, not in a rail of its own", async () => {
    const el = mountedContainer(width);
    const render = createMatchTableRenderer();
    const state = pendingTrucoAfterTrick1Headshot2v2();
    render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
    settleDeal(el);
    await waitForArt(el);

    const callLog = el.querySelector(".hexdev-truco-call-log");
    const scoreboard = el.querySelector(".hexdev-truco-scoreboard-panel");
    if (callLog === null || scoreboard === null) throw new Error("test setup: call log or scoreboard not rendered — is there really a call chain?");
    const log = callLog.getBoundingClientRect();
    const score = scoreboard.getBoundingClientRect();

    expect(log.width, "sanity: an empty call log is display: none, which would make this vacuous").toBeGreaterThan(0);
    // Same 0.5px epsilon as `overlaps`/`contains`.
    expect(log.left, `call log left ${log.left}px vs the rail's own left edge ${score.left}px`).toBeGreaterThanOrEqual(score.left - 0.5);
    expect(log.right, `call log right ${log.right}px vs the rail's own right edge ${score.right}px`).toBeLessThanOrEqual(score.right + 0.5);
  });

  it("2v2: the play takes the width the freed rail gives back", async () => {
    const el = mountedContainer(width);
    const render = createMatchTableRenderer();
    const state = pendingTrucoAfterTrick1Headshot2v2();
    render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
    settleDeal(el);
    await waitForArt(el);

    const table = el.querySelector(".hexdev-truco-table");
    if (table === null) throw new Error("test setup: the felt did not render");
    const felt = table.getBoundingClientRect();
    // The widest anchor is the one spanning the full play width (the partner's
    // row at the top). Picked by measurement rather than by a selector,
    // because which seat that is depends on the seat count.
    const widest = [...el.querySelectorAll(".hexdev-truco-anchor")]
      .map((a) => a.getBoundingClientRect())
      .reduce((a, b) => (b.width > a.width ? b : a));

    // With the log rail still in place this was 979/1308 = 0.75.
    expect(
      widest.width / felt.width,
      `the play spans ${widest.width.toFixed(0)}px of a ${felt.width.toFixed(0)}px felt — a rail's worth of it is still going somewhere else`,
    ).toBeGreaterThan(0.9);
  });
});

/** The same partner-row fence as inside the loop above, at the two widths the
 * shared `WIDTHS` list does not carry — see `PARTNER_ROW_EXTRA_WIDTHS` for
 * why those two and not others. Its own top-level block rather than a wider
 * `WIDTHS`, so every other pairing in this file keeps the exact four-tier
 * scope its own notes describe. */
describe.each(PARTNER_ROW_EXTRA_WIDTHS)("the partner's hand stays one row at the widths outside this suite's shared list — %ipx", (width) => {
  it("2v2: all three of the partner's card backs sit on one row", async () => {
    await expectPartnerBacksOnOneRow(width);
  });
});
