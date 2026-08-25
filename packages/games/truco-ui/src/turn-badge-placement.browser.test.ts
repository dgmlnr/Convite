import { afterEach, describe, expect, it } from "vitest";
import { applyAction, createTeamMatch, getLegalActions, getViewFor, startHand } from "@hexdev/truco-engine";
import type { Action, DealInput, MatchState, PlayerId } from "@hexdev/truco-engine";
import { createMatchTableRenderer } from "./table.js";

/**
 * The turn badge is readable, and inside the table, at EVERY seat.
 *
 * WHAT WENT WRONG, and it was a regression this stylesheet caused itself.
 * The badge used to be placed by a top of -11px, and the two side seats
 * overrode that with a top of 50% plus a right of -6px to pin it half-outside
 * their column. Then the base rule changed to hang the badge by a bottom of
 * 100% — so it could never again cover the rank index in a card's corner —
 * and the side override was left as it was.
 *
 * Setting top no longer DISPLACES a bottom; it joins it. An auto-height
 * absolutely-positioned box with both set takes its height from the
 * containing block instead of from its content: 325 - 162.5 - 325 here, which
 * is negative and clamps. MEASURED at a 1553px shell: 125x6, six pixels of
 * pill around 11.2px of text, hanging 68px past the felt's right edge.
 * Reported from real play as a black line of text on a yellow bar.
 *
 * WHY NO FENCE CAUGHT IT. Everything that measures this table measures
 * HEIGHT, and this badge is deliberately out of flow precisely so it can
 * never move a height fence — the property that makes it safe is the same one
 * that made it invisible. `turn-clock.browser.test.ts` owns what the badge
 * SAYS and when, never where it lands or how big it comes out.
 *
 * So this fence measures the box, at all four seats, and it deliberately
 * avoids naming a placement: a badge may hang wherever a seat wants it, as
 * long as a player can read it and it stays on the table.
 */

const SELF = "badge-self" as PlayerId;
const OPPONENT = "badge-opponent" as PlayerId;
const TEAMMATE = "badge-teammate" as PlayerId;
const OPPONENT_2 = "badge-opponent-2" as PlayerId;

const DEAL: DealInput = [
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

/**
 * Mano is the seat after the dealer, and `resolveSeatPositions` maps seats to
 * anchors clockwise from the local player — so the dealer is what decides
 * which anchor is on the clock at deal time. Derived here rather than
 * hard-coded per case so the mapping stays honest if either rule changes.
 */
const DEALER_FOR_ANCHOR = { bottom: 3, right: 0, top: 1, left: 2 } as const;

let container: HTMLElement;

afterEach(() => {
  container.remove();
  document.getElementById("hexdev-truco-matchstick-defs")?.remove();
  document.getElementById("hexdev-truco-table-styles")?.remove();
});

async function withTurnAt(anchor: keyof typeof DEALER_FOR_ANCHOR, width: number): Promise<{ badge: HTMLElement; felt: DOMRect }> {
  container = document.createElement("div");
  container.style.width = `${String(width)}px`;
  document.body.appendChild(container);

  const state = startHand(
    createTeamMatch({ seatOrder: [SELF, OPPONENT, TEAMMATE, OPPONENT_2], pointsToWin: 30, dealerSeat: DEALER_FOR_ANCHOR[anchor] }),
    DEAL,
  );
  createMatchTableRenderer()(container, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
  await Promise.all([...container.querySelectorAll("img")].map((img) => img.decode()));

  const badge = container.querySelector<HTMLElement>(".hexdev-truco-turn-badge");
  const felt = container.querySelector<HTMLElement>(".hexdev-truco-table");
  if (badge === null || felt === null) throw new Error(`fence setup: a badge renders with the turn at ${anchor}`);

  const onTheClock = badge.closest<HTMLElement>(".hexdev-truco-anchor")?.dataset.position;
  expect(onTheClock, "fence setup: the badge really is on the seat this case means to test").toBe(anchor);

  return { badge, felt: felt.getBoundingClientRect() };
}

const ANCHORS = ["bottom", "right", "top", "left"] as const;
const WIDTHS = [700, 900, 1280, 1553] as const;

describe.each(WIDTHS)("the turn badge at %ipx", (width) => {
  it.each(ANCHORS)("%s: the pill is as tall as the words inside it", async (anchor) => {
    const { badge } = await withTurnAt(anchor, width);
    const box = badge.getBoundingClientRect();

    // No magic minimum: a crushed box is one whose content does not fit it,
    // which is exactly what over-constraining top AND bottom produces.
    expect(box.height, `the ${anchor} badge is ${String(Math.round(box.height))}px tall around content that needs ${String(badge.scrollHeight)}px`).toBeGreaterThanOrEqual(badge.scrollHeight - 1);
    expect(box.height, "and a pill with no height at all is not a pill").toBeGreaterThan(Number.parseFloat(getComputedStyle(badge).fontSize));
  });

  it.each(ANCHORS)("%s: it hangs on the table, not off it", async (anchor) => {
    const { badge, felt } = await withTurnAt(anchor, width);
    const box = badge.getBoundingClientRect();

    expect(box.left, `the ${anchor} badge starts ${String(Math.round(felt.left - box.left))}px left of the felt`).toBeGreaterThanOrEqual(felt.left - 1);
    expect(box.right, `the ${anchor} badge runs ${String(Math.round(box.right - felt.right))}px past the felt's right edge`).toBeLessThanOrEqual(felt.right + 1);
    expect(box.top, "and never above its top edge").toBeGreaterThanOrEqual(felt.top - 1);
    expect(box.bottom, "or below its bottom one").toBeLessThanOrEqual(felt.bottom + 1);
  });
});

/**
 * EXACTLY ONE SEAT WEARS THE CLOCK.
 *
 * `isAnchorActive` answers "may this seat act", and with a call open that is
 * the whole answering TEAM — one player in 1v1, two in 2v2. Marking both was
 * written when only the first could happen. In 2v2 it produced two rings and
 * two badges at once, and because the badge carries the countdown while the
 * renderer tracks a SINGLE mounted clock node, only the last one appended
 * ever ticked.
 *
 * Reported from two screenshots taken minutes apart: a partner's badge frozen
 * at 0:50 in both while the player's own counted down — and reading
 * "Esperando al rival" on a TEAMMATE's seat, while it was in fact the
 * player's own turn to answer.
 *
 * The local player comes first, and that is not arbitrary: the server now
 * stands its bots down from any decision a human teammate is offered
 * (platform-core's HumanPriorityActionClassifier), so when the viewer is on
 * the answering side the answer really is theirs.
 */
describe("with a call open, the clock lands on ONE seat", () => {
  function pendingTruco(): MatchState {
    const dealt = startHand(
      // dealerSeat 0 seats OPPONENT (seat 1) as the mano, and OPPONENT is who
      // calls: opening is taking the floor, and the floor starts with the
      // mano (truco-chain.ts). A call WAITING ON the local player needs the
      // caller to be the one holding it.
      createTeamMatch({ seatOrder: [SELF, OPPONENT, TEAMMATE, OPPONENT_2], pointsToWin: 30, dealerSeat: 0 }),
      DEAL,
    );
    const called: Action = { type: "call-truco", playerId: OPPONENT, level: "truco" };
    const result = applyAction(dealt, called);
    if (!result.ok) throw new Error(`fence setup: engine rejected the call — ${result.violation}`);
    return result.state;
  }

  async function render2v2(): Promise<HTMLElement> {
    container = document.createElement("div");
    container.style.width = "1280px";
    document.body.appendChild(container);
    const state = pendingTruco();
    createMatchTableRenderer()(container, getViewFor(state, SELF), getLegalActions(state, SELF), () => {});
    await Promise.all([...container.querySelectorAll("img")].map((img) => img.decode()));
    return container;
  }

  it("one badge, not one per seat that happens to be allowed to answer", async () => {
    const el = await render2v2();
    const badges = [...el.querySelectorAll<HTMLElement>(".hexdev-truco-turn-badge")];
    const where = badges.map((badge) => badge.closest<HTMLElement>(".hexdev-truco-anchor")?.dataset.position);

    expect(badges.length, `badges rendered on: ${where.join(", ")}`).toBe(1);
    expect(where[0], "and it is the viewer's, because the answer is theirs to give").toBe("bottom");
  });

  it("so there is at most one countdown for the tick to keep — the other cannot freeze", async () => {
    const el = await render2v2();
    expect(el.querySelectorAll(".hexdev-truco-turn-clock").length, "a second clock is a clock nothing updates").toBeLessThanOrEqual(1);
  });

  it("and the teammate's seat is not lit as though it owed the move", async () => {
    const el = await render2v2();
    const partner = el.querySelector<HTMLElement>('.hexdev-truco-anchor[data-position="top"]');
    expect(partner, "fence setup: 2v2 seats a partner opposite").not.toBeNull();
    expect(partner!.classList.contains("hexdev-truco-anchor--active"), "two lit seats is two answers being asked for").toBe(false);
  });
});
