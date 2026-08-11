import { afterEach, describe, expect, it } from "vitest";
import { applyAction, createHeadToHeadMatch, createTeamMatch, getLegalActions, getViewFor, startHand } from "@hexdev/truco-engine";
import type { Action, DealInput, MatchState, PlayerId } from "@hexdev/truco-engine";
import { createMatchTableRenderer } from "./table.js";

/**
 * PR3-T4 (tasks §7, skeleton): the ZERO-OVERLAP suite that will eventually
 * prove TRZ-2/TRZ-3/TRZ-4/TRZ-5/TRZ-6 (the design's Q2 hard mandate) once
 * the action bar exists as its own reserved grid row (PR5) and the call-log
 * rail exists as its own grid column at wide/ultra (PR4). This PR only
 * builds the harness (the `overlaps` helper, the width x seat-count loop,
 * and the fixture that puts every colliding surface on screen at once) and
 * fills in the two assertions that are already meaningful pre-PR4/PR5: the
 * pending-call banner against every played pile, and the pending-call
 * banner against its own current rect. Every action-bar-related pairing
 * (the action bar does not exist as a reserved element until PR5-T8's DOM
 * move) and the wide/ultra call-log pairing (the log rail does not move
 * into its own grid column until PR4-T4/T5) are left as `it.todo` — PR5-T7
 * is the task that fills them in and un-skips them, per its own "RED-first,
 * completes the PR3 skeleton" framing.
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

/** Tasks §7's own width list for this file — the SAME four container tiers
 * `table-height-stability.browser.test.ts` uses (unextended: the two extra
 * boundary widths, 640/900, are this PR's own addition to the BUDGET file
 * only, per that file's docblock — this suite's own scope is unaffected). */
const WIDTHS = [375, 700, 960, 1280] as const;

/**
 * KNOWN, DESIGN-ACKNOWLEDGED collision (measured empirically while writing
 * this file, RED-first, exactly as the tasks artifact instructs): the
 * pending-call banner (`.hexdev-truco-banner-slot`: `position: absolute;
 * top: 0`, floating over the felt) and the top-seat's played pile DO
 * currently intersect at every one of these (width, mode) pairs — this is
 * the exact TRZ-2 requirement ("Zero Overlap — Banner vs. Played Card") and
 * the exact collision PR5-T4's D-5 mechanism (`.hexdev-truco-center {
 * padding-top: var(--hx-band-banner) }`, removing the banner's lane from
 * the trick area's own layout calculation) is scheduled to fix. NOT every
 * (width, mode) pair collides today: 2v2 at 960px/1280px already renders
 * clean (the wider felt's own extra horizontal room happens to keep the
 * banner and the top pile apart at those two combinations) — that is
 * reported, not hidden, via the separate clean-today loop right below this
 * one; PR5 must not regress those two back into collision.
 */
const KNOWN_BANNER_PILE_COLLISIONS: ReadonlyArray<{ readonly width: (typeof WIDTHS)[number]; readonly mode: "1v1" | "2v2" }> = [
  { width: 375, mode: "1v1" },
  { width: 375, mode: "2v2" },
  { width: 700, mode: "1v1" },
  { width: 700, mode: "2v2" },
  { width: 960, mode: "1v1" },
  { width: 1280, mode: "1v1" },
];

describe.each(WIDTHS)("zero-overlap: reserved zones never collide (tasks §7 skeleton, TRZ-2/3/4/5/6) — %ipx", (width) => {
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
  // `KNOWN_BANNER_PILE_COLLISIONS` — not `it.each`, because `it.fails` only
  // accepts a wrapped test that genuinely fails every time it runs; mixing
  // currently-clean and currently-colliding pairs under one `it.each` would
  // make the clean pairs report as unexpected `it.fails` passes.
  for (const mode of ["1v1", "2v2"] as const) {
    const isKnownCollision = KNOWN_BANNER_PILE_COLLISIONS.some((c) => c.width === width && c.mode === mode);
    if (isKnownCollision) {
      it.fails(`${mode}: the pending-call banner overlaps a played pile — KNOWN (TRZ-2, resolved by PR5-T4's banner lane)`, () => bannerVsAnyPile(mode));
    } else {
      it(`${mode}: the pending-call banner never overlaps a played pile`, () => bannerVsAnyPile(mode));
    }
  }

  // "Own lane" (tasks §7): the D-5 padding-top banner lane (`--hx-band-banner`
  // consumed by `.hexdev-truco-center`/`.hexdev-truco-banner-slot`) is PR5
  // scope — the token is not even declared yet, let alone read. Pre-PR5, the
  // banner's own current mechanism (`.hexdev-truco-banner-slot`: `position:
  // absolute; top: 0`) floats it over the felt's own top edge, so its
  // "lane" IS the felt itself: the one real, currently-checkable invariant
  // is that the banner's rect never spills outside the felt's own bounds.
  // PR5-T10 replaces this with the stricter `height <= --hx-band-banner`
  // check once that reservation is real.
  it.each(["1v1", "2v2"] as const)("%s: the pending-call banner's own rect stays inside the felt (pre-PR5 stand-in for its future reserved lane)", async (mode) => {
    const el = mountedContainer(width);
    const render = createMatchTableRenderer();
    const state = mode === "1v1" ? pendingTrucoAfterTrick1Headshot1v1() : pendingTrucoAfterTrick1Headshot2v2();
    render(el, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
    await waitForArt(el);

    const felt = el.querySelector(".hexdev-truco-table");
    const banner = el.querySelector(".hexdev-truco-pending-call");
    if (felt === null || banner === null) throw new Error("test setup: felt or pending-call banner not rendered");
    const feltRect = felt.getBoundingClientRect();
    const bannerRect = banner.getBoundingClientRect();

    expect(bannerRect.left, "banner left edge").toBeGreaterThanOrEqual(feltRect.left - 0.5);
    expect(bannerRect.right, "banner right edge").toBeLessThanOrEqual(feltRect.right + 0.5);
    expect(bannerRect.top, "banner top edge").toBeGreaterThanOrEqual(feltRect.top - 0.5);
    expect(bannerRect.bottom, "banner bottom edge").toBeLessThanOrEqual(feltRect.bottom + 0.5);
  });

  // Action-bar-related pairings (tasks §7): `.hexdev-truco-action-bar` does
  // not exist as a reserved DOM element until PR5-T8's DOM move — today's
  // `.hexdev-truco-action-tray` is still a floating, absolutely-positioned
  // overlay (bottom: 100% of the anchor), so asserting non-overlap against
  // it now would test a mechanism PR5 is about to delete, not the mandate
  // TRZ-6 actually cares about. PR5-T7 fills these in and un-skips them.
  it.todo(`${width}px: .hexdev-truco-action-bar never overlaps a hand card (all tiers)`);
  it.todo(`${width}px: .hexdev-truco-action-bar never overlaps a played pile (all tiers)`);
  it.todo(`${width}px: .hexdev-truco-action-bar never overlaps .hexdev-truco-turn-badge (all tiers)`);

  // Call-log pairing (tasks §7/PR4-T8): the log rail only becomes its own
  // grid column (`grid-area: log`, `position: static`) at wide/ultra in
  // PR4-T4/T5 — before that it is still the same absolutely-positioned
  // `.hexdev-truco-center` overlay it is today, at every tier including
  // this one. PR4-T8 also documents a known, out-of-scope, pre-existing
  // narrow (2v2 compact) collision with the `--left` pile that this pairing
  // must NOT be asserted against — hence "wide + ultra only", inherited
  // verbatim from PR5-T7's own scope note.
  it.todo(`${width}px: .hexdev-truco-call-log never overlaps a played pile or hand card (wide + ultra only)`);
});
