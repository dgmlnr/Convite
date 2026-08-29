import { afterEach, describe, expect, it } from "vitest";
import type { OtherPlayerView, PlayerId, PlayerView, TeamId } from "@hexdev/escoba-engine";
import { describeStock, describeTurn, renderEscobaStatus, seatRole } from "./status.js";
import type { EscobaStatusElements } from "./status.js";

/**
 * The facts the table used to carry and never render: whose turn it is and
 * what every other seat holds (slice R3a), and what is left in the stock
 * (R3b). Every assertion below reads a value the ENGINE put on the view;
 * nothing here recomputes one, which is exactly the property these tests
 * exist to lock.
 */

const SELF = "self" as PlayerId;
const RIVAL_NEXT = "rival-next" as PlayerId;
const PARTNER = "partner" as PlayerId;
const RIVAL_PREV = "rival-prev" as PlayerId;

const OURS = "ours" as TeamId;
const THEIRS = "theirs" as TeamId;

function other(playerId: PlayerId, teamId: TeamId, seat: number, cardsRemaining: number): OtherPlayerView {
  return { playerId, teamId, seat, cardsRemaining };
}

/** Seat 0 is always ours here, so a 4-seat fixture reads offset 1/2/3 as the
 * right rival, the partner and the left rival — the shape `state.ts` really
 * produces (partners across). */
function viewWith(others: readonly OtherPlayerView[], hand: PlayerView["hand"]): PlayerView {
  return {
    self: { playerId: SELF, teamId: OURS, seat: 0, hand: [] },
    others,
    teams: [
      { id: OURS, score: 17 },
      { id: THEIRS, score: 12 },
    ],
    hand,
    dealerSeat: 0,
  };
}

function handWith(turn: PlayerId, stockCount: number): NonNullable<PlayerView["hand"]> {
  return { table: [], piles: {}, escobas: { [OURS]: 0, [THEIRS]: 0 }, turn, stockCount, outcome: null };
}

const HEAD_TO_HEAD: readonly OtherPlayerView[] = [other(RIVAL_NEXT, THEIRS, 1, 2)];
const FOUR_SEATS: readonly OtherPlayerView[] = [other(RIVAL_NEXT, THEIRS, 1, 2), other(PARTNER, OURS, 2, 3), other(RIVAL_PREV, THEIRS, 3, 1)];

/** Only the render tests below mount anything; the pure-function ones never
 * touch the DOM, so this stays undefined for them. */
let elements: EscobaStatusElements | undefined;

afterEach(() => {
  if (elements === undefined) return;
  for (const el of [elements.turnEl, elements.stockEl, elements.seatsEl]) el.remove();
  elements = undefined;
});

function freshElements(): EscobaStatusElements {
  const turnEl = document.createElement("p");
  const stockEl = document.createElement("p");
  const seatsEl = document.createElement("ul");
  for (const el of [turnEl, stockEl, seatsEl]) document.body.appendChild(el);
  elements = { turnEl, stockEl, seatsEl };
  return elements;
}

describe("seatRole — who another seat is, decided by teamId and turn order (never by re-derived geometry)", () => {
  it("calls the only other player a rival in the 2-seat game", () => {
    const view = viewWith(HEAD_TO_HEAD, handWith(SELF, 30));
    expect(seatRole(HEAD_TO_HEAD[0]!, view)).toBe("rival");
  });

  it("tells the partner from the two rivals in the 4-seat game", () => {
    const view = viewWith(FOUR_SEATS, handWith(SELF, 24));
    expect(seatRole(FOUR_SEATS[1]!, view)).toBe("partner");
    expect(seatRole(FOUR_SEATS[0]!, view)).toBe("rival-right");
    expect(seatRole(FOUR_SEATS[2]!, view)).toBe("rival-left");
  });

  it("reads the TEAM, not the seat offset — a partner seated anywhere is still the partner", () => {
    const shuffled: readonly OtherPlayerView[] = [other(PARTNER, OURS, 1, 3), other(RIVAL_NEXT, THEIRS, 2, 2), other(RIVAL_PREV, THEIRS, 3, 1)];
    expect(seatRole(shuffled[0]!, viewWith(shuffled, handWith(SELF, 24)))).toBe("partner");
  });
});

describe("describeTurn — whose turn it is, in words rather than only implied by a disabled button", () => {
  it("says 'Tu turno' when the hand's turn is the local player", () => {
    expect(describeTurn(viewWith(HEAD_TO_HEAD, handWith(SELF, 30)))).toBe("Tu turno");
  });

  it("names the rival in the 2-seat game and each of the two rivals in the 4-seat one", () => {
    expect(describeTurn(viewWith(HEAD_TO_HEAD, handWith(RIVAL_NEXT, 30)))).toBe("Turno del rival");
    expect(describeTurn(viewWith(FOUR_SEATS, handWith(RIVAL_NEXT, 24)))).toBe("Turno del rival de la derecha");
    expect(describeTurn(viewWith(FOUR_SEATS, handWith(RIVAL_PREV, 24)))).toBe("Turno del rival de la izquierda");
  });

  it("never calls the partner a rival", () => {
    expect(describeTurn(viewWith(FOUR_SEATS, handWith(PARTNER, 24)))).toBe("Turno de tu compañero");
  });

  it("says nothing between hands, when the view carries no hand at all", () => {
    expect(describeTurn(viewWith(FOUR_SEATS, null))).toBe("");
  });
});

describe("describeStock — what is left to deal", () => {
  it("pluralizes, and names an empty stock as a state rather than as a zero", () => {
    expect(describeStock(24)).toBe("Mazo: 24 cartas");
    expect(describeStock(1)).toBe("Mazo: 1 carta");
    expect(describeStock(0)).toBe("Mazo vacío");
  });
});

describe("renderEscobaStatus — the row a player actually reads", () => {
  it("renders one seat per other player, each with an accessible name that carries its count", () => {
    const els = freshElements();
    renderEscobaStatus(els, viewWith(FOUR_SEATS, handWith(SELF, 24)));

    const seats = [...els.seatsEl.querySelectorAll<HTMLElement>(".hexdev-escoba-seat")];
    expect(seats).toHaveLength(3);
    // Laid out in table order: left rival, partner, right rival.
    expect(seats.map((seat) => seat.dataset.role)).toEqual(["rival-left", "partner", "rival-right"]);
    expect(seats.map((seat) => seat.getAttribute("aria-label"))).toEqual([
      "El rival de la izquierda: 1 carta",
      "Tu compañero: 3 cartas",
      "El rival de la derecha: 2 cartas",
    ]);
    expect(seats[1]?.querySelector(".hexdev-escoba-seat-count")?.textContent).toBe("3 cartas");
  });

  it("marks the seat on turn with an attribute AND names it in the turn line — never colour alone", () => {
    const els = freshElements();
    renderEscobaStatus(els, viewWith(FOUR_SEATS, handWith(PARTNER, 24)));

    const marked = [...els.seatsEl.querySelectorAll<HTMLElement>('[data-turn="true"]')];
    expect(marked).toHaveLength(1);
    expect(marked[0]?.dataset.role).toBe("partner");
    expect(els.turnEl.textContent).toBe("Turno de tu compañero");
  });

  it("MUTATES the turn node instead of replacing it — an aria-live region must already be in the tree to announce", () => {
    const els = freshElements();
    renderEscobaStatus(els, viewWith(HEAD_TO_HEAD, handWith(SELF, 30)));
    const announced = els.turnEl.firstChild;

    renderEscobaStatus(els, viewWith(HEAD_TO_HEAD, handWith(SELF, 30)));
    expect(els.turnEl.firstChild, "an unchanged turn must not rewrite the live region").toBe(announced);

    renderEscobaStatus(els, viewWith(HEAD_TO_HEAD, handWith(RIVAL_NEXT, 30)));
    expect(els.turnEl.textContent).toBe("Turno del rival");
    expect(els.turnEl.isConnected, "the region itself is never remounted").toBe(true);
  });

  it("reports the stock straight off the view, and empties both lines between hands", () => {
    const els = freshElements();
    renderEscobaStatus(els, viewWith(HEAD_TO_HEAD, handWith(SELF, 30)));
    expect(els.stockEl.textContent).toBe("Mazo: 30 cartas");
    expect(els.turnEl.dataset.self).toBe("true");

    renderEscobaStatus(els, viewWith(HEAD_TO_HEAD, null));
    expect(els.stockEl.textContent).toBe("");
    expect(els.turnEl.textContent).toBe("");
    expect(els.turnEl.dataset.self).toBe("false");
  });
});
