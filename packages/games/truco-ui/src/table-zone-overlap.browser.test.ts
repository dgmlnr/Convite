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

/**
 * PR5-T4/T7 RESOLUTION (tasks §9): every ONE of the 7 collisions
 * PR3b/PR4 found and honestly reported (`{375,700,960}px x {1v1,2v2}` plus
 * `1280px x 1v1` — `1280px x 2v2` was already clean pre-PR5) is now GONE,
 * exactly as D-5's banner-lane mechanism predicted: `.hexdev-truco-center`'s
 * new `padding-top: var(--hx-band-banner)` removes the banner's rectangle
 * from the trick area's own centering calculation entirely, at every
 * container height, not just tall ones. Verified directly, not assumed: re-
 * running this suite with every one of the 7 `it.fails` entries still in
 * place produced 7 "Expect test to fail" errors (an `it.fails` whose wrapped
 * assertion no longer throws is itself a failure) — the literal RED signal
 * that the predicted fix landed. All 7 are restored to plain `it()` below;
 * `KNOWN_BANNER_PILE_COLLISIONS` is now empty (kept, not deleted, as the
 * anchor for this resolution note and so a FUTURE regression has an obvious
 * place to be re-added, per this suite's own established "report a real
 * collision, do not hide it" discipline). One genuinely new data point this
 * resolution surfaced: at 375px/1v1, the fix did NOT hold with the design's
 * originally-assumed `--hx-band-banner: 40px` — the compact one-line pill's
 * own REAL rendered height (PR5-T3 measurement, see the token's own comment
 * in table-styles.ts) is up to 58px for its worst-case realistic text, so a
 * 40px lane still let the pill's own overflow spill into the trick area.
 * Raising the token to 60px (T3) is what actually cleared this last pair —
 * confirmed by this suite, not merely by the token comment's own arithmetic.
 */
const KNOWN_BANNER_PILE_COLLISIONS: ReadonlyArray<{ readonly width: (typeof WIDTHS)[number]; readonly mode: "1v1" | "2v2" }> = [];

describe.each(WIDTHS)("zero-overlap: reserved zones never collide (tasks §7/§9, TRZ-2/3/4/5/6 — THE MANDATE) — %ipx", (width) => {
  const bannerVsAnyPile = async (mode: "1v1" | "2v2"): Promise<void> => {
    const el = mountedContainer(width);
    const render = createMatchTableRenderer();
    const state = mode === "1v1" ? pendingTrucoAfterTrick1Headshot1v1() : pendingTrucoAfterTrick1Headshot2v2();
    render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
    await waitForArt(el);

    const banner = el.querySelector(".hexdev-truco-pending-call");
    if (banner === null) throw new Error("test setup: pending-call banner not rendered — is the truco call really still pending?");
    const bannerRect = banner.getBoundingClientRect();

    const piles = [...el.querySelectorAll(".hexdev-truco-played")];
    expect(piles.length, "sanity: trick 1 resolved, every seat should have a pile card").toBeGreaterThan(0);
    for (const pile of piles) {
      const pileRect = pile.getBoundingClientRect();
      expect(overlaps(bannerRect, pileRect), `banner ${JSON.stringify(bannerRect)} vs pile ${JSON.stringify(pileRect)}`).toBe(false);
    }
  };

  // `it`/`it.fails` chosen explicitly per (width, mode) pair below, driven by
  // `KNOWN_BANNER_PILE_COLLISIONS` (now empty — see the resolution note
  // above) — not `it.each`, because `it.fails` only accepts a wrapped test
  // that genuinely fails every time it runs; mixing currently-clean and
  // currently-colliding pairs under one `it.each` would make the clean pairs
  // report as unexpected `it.fails` passes. Kept as the same explicit-loop
  // shape (rather than collapsed back to a bare `it.each`) so a FUTURE
  // regression can be reintroduced into `KNOWN_BANNER_PILE_COLLISIONS`
  // without restructuring this loop again.
  for (const mode of ["1v1", "2v2"] as const) {
    const isKnownCollision = KNOWN_BANNER_PILE_COLLISIONS.some((c) => c.width === width && c.mode === mode);
    if (isKnownCollision) {
      it.fails(`${mode}: the pending-call banner overlaps a played pile — KNOWN (TRZ-2, resolved by PR5-T4's banner lane)`, () => bannerVsAnyPile(mode));
    } else {
      it(`${mode}: the pending-call banner never overlaps a played pile`, () => bannerVsAnyPile(mode));
    }
  }

  // "Own lane" (tasks §7/PR5-T7/T10): the STRICTER check the pre-PR5
  // stand-in ("stays inside the felt") always intended to become once the
  // D-5 reservation was real — the banner's own rendered height must never
  // exceed its own reserved lane (`--hx-band-banner`), the direct proof that
  // the lane genuinely CONTAINS the banner rather than merely not spilling
  // past the felt's outer edge (a much weaker property the old stand-in
  // could not tell apart from "the lane happens to be big enough today").
  it.each(["1v1", "2v2"] as const)("%s: the pending-call banner's own rendered height never exceeds its reserved lane (--hx-band-banner)", async (mode) => {
    const el = mountedContainer(width);
    const render = createMatchTableRenderer();
    const state = mode === "1v1" ? pendingTrucoAfterTrick1Headshot1v1() : pendingTrucoAfterTrick1Headshot2v2();
    render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
    await waitForArt(el);

    const felt = el.querySelector(".hexdev-truco-table");
    const banner = el.querySelector(".hexdev-truco-pending-call");
    if (felt === null || banner === null) throw new Error("test setup: felt or pending-call banner not rendered");
    const bandBanner = parseFloat(getComputedStyle(felt).getPropertyValue("--hx-band-banner"));
    expect(bandBanner, "sanity: --hx-band-banner must resolve to a real pixel number on the felt").toBeGreaterThan(0);
    const bannerRect = banner.getBoundingClientRect();

    expect(bannerRect.height, `banner height ${bannerRect.height}px vs its own lane ${bandBanner}px`).toBeLessThanOrEqual(bandBanner + 0.5);
  });

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
});
