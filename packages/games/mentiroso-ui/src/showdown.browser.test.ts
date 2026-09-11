import { afterEach, describe, expect, it } from "vitest";

import { getViewFor } from "@hexdev/mentiroso-engine";
import type { MatchState, PlayerId } from "@hexdev/mentiroso-engine";

import type { ShowdownPhase } from "./showdown.js";
import { describeShowdown, renderMentirosoShowdown, wasForcedDoubt } from "./showdown.js";

/**
 * `showdown.ts`'s own tests (SDD `mentiroso`, work unit E4/task 5.4, design
 * D4/D6, spec `mentiroso-hidden-dice`'s own "showdown declares no secrets"
 * requirement). Every `PlayerView` below is the REAL `getViewFor`'s own
 * output over a hand-built `MatchState` — the same discipline
 * `bid-picker.browser.test.ts` and `cups.browser.test.ts` already
 * established for this package: a fixture may hand-build the STATE (the same
 * convention `mentiroso-engine/src/fixtures.ts`'s own `showdownState` already
 * uses for a `Phase.showdown` literal), but never the thing under test's own
 * INPUT view.
 *
 * TWO NAMED TRAPS (launch prompt, `AGENTS.md`'s own "family of traps"):
 *
 * 1. A fixture where the bid quantity coincides with the real tally does not
 *    distinguish "the bidder won" from "the bidder lost" — closed below by
 *    `EXACT_TIE_STATE`, where `matched === bid.quantity` EXACTLY, proving the
 *    ruleset's own "AL MENOS esa cantidad" (>=, never >) decides the winner.
 * 2. A fixture where the seat that surrenders a die is also the seat that
 *    gets eliminated does not distinguish "entregó un dado" from "quedó
 *    eliminado" — closed by pairing one state where the loser keeps playing
 *    (`EXACT_TIE_STATE`) with one where the loser's surrendered die was
 *    their last (`FORCED_CEILING_STATE`, `DOUBTER_ELIMINATES_BIDDER_STATE`).
 *
 * No two seats in any one state below share a dice count or a dice array
 * (`AGENTS.md`'s own "fixtures donde las lecturas discrepen"), so an
 * attribution bug (seat 0's data rendered at seat 1's label) cannot hide
 * behind a coincidence.
 */

const P0 = "seat-0-player" as PlayerId;
const P1 = "seat-1-player" as PlayerId;
const P2 = "seat-2-player" as PlayerId;

/** Three seats. Seat 0 is the bidder, seat 1 is the doubter, seat 2 is an
 * uninvolved bystander. Bid (3, 5): the table shows EXACTLY three 5s (two on
 * seat 0, one on seat 1) — an EXACT TIE against the bid's own quantity, the
 * trap named above. `matched >= bid.quantity` must hold for the bidder to
 * win here; a naive strict `>` would flip this fixture's own winner.
 *
 * Not the ceiling (`bid.face` is 5, never 6), so `wasForcedDoubt` must read
 * `false` here regardless of how the quantity compares to the table total —
 * the doubter chose to challenge, nothing forced it.
 *
 * The doubter (seat 1, the loser) holds 3 dice AFTER surrendering one — still
 * playing, never eliminated. Dice arrays already reflect the POST-surrender
 * state, the same convention `mentiroso-engine/src/fixtures.ts`'s own
 * `showdownState` fixture documents.
 */
const EXACT_TIE_STATE: MatchState = {
  players: [
    { id: P0, seat: 0, dice: [5, 5, 2] },
    { id: P1, seat: 1, dice: [5, 1, 3] },
    { id: P2, seat: 2, dice: [2, 6] },
  ],
  phase: { kind: "showdown", bid: { quantity: 3, face: 5 }, doubterSeat: 1, matched: 3, loserSeat: 1, winnerSeat: 0 },
};

/** Two seats, one die each before the challenge — mentiroso-rules' own
 * ceiling worked example (`convite/mentiroso/reglas-decididas`: "con dos
 * jugadores de un dado cada uno el tope es «dos seises»"). Bid (2, 6) IS the
 * ceiling: `raisesFrom` returns nothing there (`bids.ts`), so the doubter
 * (seat 1) had no other legal move. `wasForcedDoubt` must read `true`.
 *
 * The bidder (seat 0) loses the challenge (only one 6 on the table against a
 * bid of two) and surrenders their ONLY die — eliminated, dice now `[]`.
 */
const FORCED_CEILING_STATE: MatchState = {
  players: [
    { id: P0, seat: 0, dice: [] },
    { id: P1, seat: 1, dice: [2] },
  ],
  phase: { kind: "showdown", bid: { quantity: 2, face: 6 }, doubterSeat: 1, matched: 1, loserSeat: 0, winnerSeat: 1 },
};

/** Three seats. Bid (4, 6) — face 6, matching the ceiling's own face, but
 * the quantity (4) does NOT match the table's real total at the moment of
 * the challenge (5, derived below) — proving `wasForcedDoubt` checks BOTH
 * the quantity and the face, not the face alone. The bidder (seat 0) had
 * only one die and loses it, becoming eliminated; the doubter (seat 2) wins.
 */
const DOUBTER_ELIMINATES_BIDDER_STATE: MatchState = {
  players: [
    { id: P0, seat: 0, dice: [] },
    { id: P1, seat: 1, dice: [6, 2] },
    { id: P2, seat: 2, dice: [6, 4, 3] },
  ],
  phase: { kind: "showdown", bid: { quantity: 4, face: 6 }, doubterSeat: 2, matched: 2, loserSeat: 0, winnerSeat: 2 },
};

/** Two seats, matching the SAME quantity total dice would be at the
 * challenge (2), but at face 3 — NOT the ceiling, because a same-quantity
 * raise to face 4, 5, or 6 would still have been legal (`raisesFrom`). This
 * is the fixture the quantity-only check cannot pass: a mutation that drops
 * the face comparison from `wasForcedDoubt` would call this forced when it
 * was a real, voluntary challenge. The loser (seat 0) had one die and is now
 * eliminated. */
const SAME_QUANTITY_WRONG_FACE_STATE: MatchState = {
  players: [
    { id: P0, seat: 0, dice: [] },
    { id: P1, seat: 1, dice: [4] },
  ],
  phase: { kind: "showdown", bid: { quantity: 2, face: 3 }, doubterSeat: 1, matched: 1, loserSeat: 0, winnerSeat: 1 },
};

/** An ordinary bidding-phase state — `showdown.ts` must render nothing here;
 * the reveal is not this file's to invent outside its own phase. */
const BIDDING_STATE: MatchState = {
  players: [
    { id: P0, seat: 0, dice: [3, 4] },
    { id: P1, seat: 1, dice: [5, 6, 2] },
  ],
  phase: { kind: "bidding", turnSeat: 0, bid: null },
};

const mounted: HTMLElement[] = [];
afterEach(() => {
  while (mounted.length > 0) mounted.pop()!.remove();
});

function mountContainer(): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  mounted.push(container);
  return container;
}

function textOf(container: HTMLElement, className: string): string | null {
  return container.querySelector(`.${className}`)?.textContent ?? null;
}

describe("describeShowdown: pure derivation, no DOM", () => {
  it("returns null outside the showdown phase", () => {
    expect(describeShowdown(getViewFor(BIDDING_STATE, P0))).toBeNull();
  });

  it("the bidder wins an exact tie — matched >= bid.quantity, never a strict >", () => {
    const facts = describeShowdown(getViewFor(EXACT_TIE_STATE, P2))!;
    expect(facts.bidderHeld).toBe(true);
    expect(facts.winnerLabel).toBe("el asiento 1");
    expect(facts.loserLabel).toBe("el asiento 2");
  });

  it("states the bid and the real tally together, in the ruleset's own spoken form", () => {
    const facts = describeShowdown(getViewFor(EXACT_TIE_STATE, P2))!;
    expect(facts.bidText).toBe("Se apostó 3 cincos, había 3.");
  });

  it("the loser keeps playing when their surrendered die was not their last", () => {
    const facts = describeShowdown(getViewFor(EXACT_TIE_STATE, P2))!;
    expect(facts.loserEliminated).toBe(false);
  });

  it("a doubt at the ceiling is reported as forced", () => {
    const facts = describeShowdown(getViewFor(FORCED_CEILING_STATE, P1))!;
    expect(facts.wasForced).toBe(true);
    expect(facts.doubterLabel).toBe("vos");
  });

  it("a doubt below the ceiling is never reported as forced, even at the ceiling's own face", () => {
    const facts = describeShowdown(getViewFor(DOUBTER_ELIMINATES_BIDDER_STATE, P2))!;
    expect(facts.wasForced).toBe(false);
  });

  it("the loser is reported eliminated once their surrendered die was their last", () => {
    const facts = describeShowdown(getViewFor(FORCED_CEILING_STATE, P1))!;
    expect(facts.loserEliminated).toBe(true);
    expect(facts.loserLabel).toBe("el asiento 1");
  });

  it("labels the viewer's own seat 'vos' when the viewer is the winner, never a seat number", () => {
    const facts = describeShowdown(getViewFor(EXACT_TIE_STATE, P0))!;
    expect(facts.winnerLabel).toBe("vos");
  });

  it("labels the viewer's own seat 'vos' when the viewer is the loser, never a seat number", () => {
    const facts = describeShowdown(getViewFor(EXACT_TIE_STATE, P1))!;
    expect(facts.loserLabel).toBe("vos");
  });
});

describe("wasForcedDoubt: the ceiling check in isolation", () => {
  it("is true only when the bid equals total-dice-at-challenge AND the highest face", () => {
    const showdownPhase = FORCED_CEILING_STATE.phase as ShowdownPhase;
    expect(wasForcedDoubt(showdownPhase, 1)).toBe(true); // 1 die left now + the 1 just surrendered = 2, the ceiling
  });

  it("is false when the quantity is short of total-dice-at-challenge, even at face 6", () => {
    const showdownPhase = DOUBTER_ELIMINATES_BIDDER_STATE.phase as ShowdownPhase;
    expect(wasForcedDoubt(showdownPhase, 5)).toBe(false); // 5 dice now + 1 surrendered = 6, but bid.quantity is 4
  });

  it("is false when the quantity matches total-dice-at-challenge but the face is not the highest", () => {
    const showdownPhase = SAME_QUANTITY_WRONG_FACE_STATE.phase as ShowdownPhase;
    expect(wasForcedDoubt(showdownPhase, 1)).toBe(false); // 1 die now + 1 surrendered = 2 = bid.quantity, but face is 3
  });
});

describe("renderMentirosoShowdown: the destape, on screen", () => {
  it("renders nothing outside the showdown phase", () => {
    const container = mountContainer();
    renderMentirosoShowdown(container, getViewFor(BIDDING_STATE, P0));
    expect(container.childElementCount).toBe(0);
  });

  it("renders the bid and tally, the challenge winner, and who surrendered a die", () => {
    const container = mountContainer();
    renderMentirosoShowdown(container, getViewFor(EXACT_TIE_STATE, P2));

    expect(textOf(container, "hexdev-mentiroso-showdown-bid")).toBe("Se apostó 3 cincos, había 3.");
    expect(textOf(container, "hexdev-mentiroso-showdown-result")).toBe("Resultado: la apuesta se cumplió.");
    expect(textOf(container, "hexdev-mentiroso-showdown-winner")).toBe("Ganó el desafío: el asiento 1.");
    expect(textOf(container, "hexdev-mentiroso-showdown-loser")).toBe("Entregó un dado: el asiento 2.");
  });

  it("does not render an elimination line when the loser keeps playing", () => {
    const container = mountContainer();
    renderMentirosoShowdown(container, getViewFor(EXACT_TIE_STATE, P2));
    expect(container.querySelector(".hexdev-mentiroso-showdown-eliminated")).toBeNull();
  });

  it("does not render a forced-doubt notice for a voluntary challenge", () => {
    const container = mountContainer();
    renderMentirosoShowdown(container, getViewFor(EXACT_TIE_STATE, P2));
    expect(container.querySelector(".hexdev-mentiroso-showdown-forced")).toBeNull();
  });

  it("renders the elimination line for the seat whose surrendered die was their last", () => {
    const container = mountContainer();
    renderMentirosoShowdown(container, getViewFor(FORCED_CEILING_STATE, P1));
    expect(textOf(container, "hexdev-mentiroso-showdown-eliminated")).toBe("Quedó eliminado: el asiento 1.");
  });

  it("renders the forced-doubt notice when the ceiling left no other legal move", () => {
    const container = mountContainer();
    renderMentirosoShowdown(container, getViewFor(FORCED_CEILING_STATE, P1));
    expect(textOf(container, "hexdev-mentiroso-showdown-forced")).toBe("Dudó sin otra jugada legal: vos.");
  });

  it("reports a lost bet, and renders a bystander's own view with both rivals named by seat", () => {
    const container = mountContainer();
    renderMentirosoShowdown(container, getViewFor(DOUBTER_ELIMINATES_BIDDER_STATE, P1));
    expect(textOf(container, "hexdev-mentiroso-showdown-result")).toBe("Resultado: la apuesta no se cumplió.");
    expect(textOf(container, "hexdev-mentiroso-showdown-winner")).toBe("Ganó el desafío: el asiento 3.");
    expect(textOf(container, "hexdev-mentiroso-showdown-loser")).toBe("Entregó un dado: el asiento 1.");
  });

  it("re-renders cleanly: a later bidding-phase view clears a previous showdown's lines", () => {
    const container = mountContainer();
    renderMentirosoShowdown(container, getViewFor(FORCED_CEILING_STATE, P1));
    expect(container.childElementCount).toBeGreaterThan(0);

    renderMentirosoShowdown(container, getViewFor(BIDDING_STATE, P0));
    expect(container.childElementCount).toBe(0);
  });
});
