import { afterEach, describe, expect, it, vi } from "vitest";
import type { Card, MatchState, Player, PlayerId, Rank, Suit, Team, TeamId } from "@hexdev/escoba-engine";
import { getLegalActions, getViewFor } from "@hexdev/escoba-engine";
import { createMarkThenPlay } from "./mark-then-play.js";

let container: HTMLElement;
let elements: { tableEl: HTMLElement; handEl: HTMLElement; sumEl: HTMLElement };

afterEach(() => {
  container.remove();
});

function mount(): void {
  container = document.createElement("div");
  const tableEl = document.createElement("div");
  const handEl = document.createElement("div");
  const sumEl = document.createElement("div");
  sumEl.setAttribute("aria-live", "polite");
  container.append(tableEl, handEl, sumEl);
  document.body.appendChild(container);
  elements = { tableEl, handEl, sumEl };
}

const TEAM_A = "team-a" as TeamId;
const TEAM_B = "team-b" as TeamId;
const PLAYER_A = "player-a" as PlayerId;
const PLAYER_B = "player-b" as PlayerId;

// design §D4: capture and stay-on-table are MUTUALLY EXCLUSIVE per played
// card. {7-oro, 1-espada} sums to 8, so 7-copa (target 15-7=8) forms 15 with
// EXACTLY that pair — a card that must be marked before it can be played.
// 2-espada (target 13) forms no subset against {7,1,4} — no marking needed.
const TABLE: readonly Card[] = [
  { rank: 7 as Rank, suit: "oro" as Suit },
  { rank: 1 as Rank, suit: "espada" as Suit },
  { rank: 4 as Rank, suit: "basto" as Suit },
];
const CARD_7_COPA: Card = { rank: 7, suit: "copa" };
const CARD_2_ESPADA: Card = { rank: 2, suit: "espada" };

function fixtureMatch(hand: readonly Card[], table: readonly Card[]): MatchState {
  const players: readonly Player[] = [
    { id: PLAYER_A, teamId: TEAM_A, seat: 0, hand },
    { id: PLAYER_B, teamId: TEAM_B, seat: 1, hand: [] },
  ];
  const teams: readonly [Team, Team] = [
    { id: TEAM_A, playerIds: [PLAYER_A], score: 0 },
    { id: TEAM_B, playerIds: [PLAYER_B], score: 0 },
  ];
  return { teams, players, dealerSeat: 0, hand: { table, stock: [], piles: { [TEAM_A]: [], [TEAM_B]: [] }, escobas: { [TEAM_A]: 0, [TEAM_B]: 0 }, turn: PLAYER_A, lastCapturer: null, outcome: null }, pointsToWin: 30 };
}

describe("mark-then-play (spec: escoba-capture-interaction)", () => {
  it("marks with real keyboard-reachable buttons (aria-pressed, not colour, carries the state), completes a capture in ONE gesture, and lets a non-forming card play with no marking at all", () => {
    mount();
    const state = fixtureMatch([CARD_7_COPA, CARD_2_ESPADA], TABLE);
    const view = getViewFor(state, PLAYER_A);
    const legalActions = getLegalActions(state, PLAYER_A);
    const onPlayCard = vi.fn();
    const render = createMarkThenPlay();
    render(elements, view.hand!.table, view.self.hand, legalActions, onPlayCard);

    const markable = elements.tableEl.querySelector<HTMLButtonElement>('[data-card="7-oro"]')!;
    expect(markable.tagName, "a real <button> is keyboard-reachable and Enter/Space-activated for free").toBe("BUTTON");
    expect(markable.getAttribute("aria-pressed")).toBe("false");
    expect(elements.handEl.querySelector<HTMLButtonElement>('[data-card="7-copa"]')!.disabled, "no marks yet — 7-copa only has capturing moves, none of them []").toBe(true);

    markable.click();
    expect(elements.tableEl.querySelector('[data-card="7-oro"]')!.getAttribute("aria-pressed"), "marked state is programmatic, not only a CSS colour").toBe("true");
    expect(elements.handEl.querySelector<HTMLButtonElement>('[data-card="7-copa"]')!.disabled, "a partial marking must not enable the play — it matches no legal action").toBe(true);

    elements.tableEl.querySelector<HTMLButtonElement>('[data-card="1-espada"]')!.click();
    elements.handEl.querySelector<HTMLButtonElement>('[data-card="7-copa"]')!.click();

    expect(onPlayCard).toHaveBeenCalledExactlyOnceWith(CARD_7_COPA, expect.arrayContaining([TABLE[0], TABLE[1]]));
    expect(onPlayCard.mock.calls[0]![1]).toHaveLength(2);

    // A card forming no 15 (2-espada, target 13, no subset of {7,1,4}
    // reaches it) needs no marking at all and plays directly — captured:[].
    elements.handEl.querySelector<HTMLButtonElement>('[data-card="2-espada"]')!.click();
    expect(onPlayCard).toHaveBeenCalledTimes(2);
    expect(onPlayCard).toHaveBeenNthCalledWith(2, CARD_2_ESPADA, []);
  });

  it("uses getLegalActions ONLY to decide which table cards are markable — never renders the action list itself (worst case 942, design §M4)", () => {
    mount();
    const suits = ["espada", "basto", "oro", "copa"] as const;
    const worstCaseTable: readonly Card[] = [
      ...([2, 4, 6, 10] as const satisfies readonly Rank[]).flatMap((rank) => suits.map((suit) => ({ rank, suit }) as Card)),
      ...suits.slice(0, 3).map((suit) => ({ rank: 12 as Rank, suit })),
    ];
    const threeAces: readonly Card[] = suits.slice(0, 3).map((suit) => ({ rank: 1 as Rank, suit }));
    const state = fixtureMatch(threeAces, worstCaseTable);
    const view = getViewFor(state, PLAYER_A);
    const legalActions = getLegalActions(state, PLAYER_A);
    expect(legalActions.length).toBeGreaterThan(900);

    createMarkThenPlay()(elements, view.hand!.table, view.self.hand, legalActions, vi.fn());

    expect(elements.tableEl.children).toHaveLength(19);
    expect(elements.handEl.children).toHaveLength(3);
    expect(container.querySelector("ul, ol, select, [role='listbox']"), "never a rendered action list").toBeNull();
  });

  it("announces the running sum on an aria-live region, including the exact moment some hand card is ready to complete fifteen", () => {
    mount();
    const state = fixtureMatch([CARD_7_COPA, CARD_2_ESPADA], TABLE);
    const view = getViewFor(state, PLAYER_A);
    createMarkThenPlay()(elements, view.hand!.table, view.self.hand, getLegalActions(state, PLAYER_A), vi.fn());

    expect(elements.sumEl.textContent).toBe("Sin cartas marcadas.");
    elements.tableEl.querySelector<HTMLButtonElement>('[data-card="7-oro"]')!.click();
    expect(elements.sumEl.textContent).toBe("Suma 7.");
    elements.tableEl.querySelector<HTMLButtonElement>('[data-card="1-espada"]')!.click();
    expect(elements.sumEl.textContent).toBe("Suma 8: lista para completar quince.");
  });
});
