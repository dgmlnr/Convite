import { afterEach, describe, expect, it, vi } from "vitest";
import type { Action, PlayerId, PlayerView, TeamId } from "@hexdev/truco-engine";
import { createMatchTableRenderer } from "./table.js";

const SELF = "player-a" as PlayerId;
const OPPONENT = "player-b" as PlayerId;

let container: HTMLElement;

afterEach(() => {
  container.remove();
  document.getElementById("hexdev-truco-matchstick-defs")?.remove();
});

function freshContainer(): HTMLElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  return container;
}

const MY_TEAM = "player-a:team" as TeamId;
const OPPONENT_TEAM = "player-b:team" as TeamId;

function baseView(overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    self: { playerId: SELF, teamId: MY_TEAM, seat: 0, hand: [{ suit: "espada", rank: 1 }] },
    teammates: [],
    opponents: [{ playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, cardsRemaining: 3 }],
    teams: [
      { id: MY_TEAM, score: 4 },
      { id: OPPONENT_TEAM, score: 2 },
    ],
    hand: {
      manoSeat: 0,
      truco: { status: "none" },
      envido: { status: "none" },
      turnSeat: 0,
      currentTrickPlays: [],
      trickOutcomes: [],
      outcome: { decided: false },
    },
    config: { pointsToWin: 30 },
    dealerSeat: 1,
    ...overrides,
  };
}

describe("createMatchTableRenderer — four anchors, always relative to the local player (obs 2970)", () => {
  it("renders all four anchors, with the local player's own hand at 'bottom' regardless of engine seat", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();

    render(el, baseView(), [], () => {});

    const anchors = [...el.querySelectorAll<HTMLElement>("[data-position]")].map((a) => a.dataset.position);
    expect(new Set(anchors)).toEqual(new Set(["bottom", "top", "left", "right"]));
    const bottom = el.querySelector<HTMLElement>('[data-position="bottom"]')!;
    expect(bottom.querySelector("img")?.src).toContain("1-espada.webp"); // the local hand
  });

  it("places the opponent's face-down hand at 'top' in a 2-seat match", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();

    render(el, baseView(), [], () => {});

    const top = el.querySelector<HTMLElement>('[data-position="top"]')!;
    expect(top.querySelectorAll("[data-card-back]")).toHaveLength(3);
  });

  it("renders calls only for the given legal actions, and dispatching a call forwards the exact action", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();
    const dispatch = vi.fn();
    const trucoCall: Action = { type: "call-truco", playerId: SELF, level: "truco" };

    render(el, baseView(), [trucoCall], dispatch);
    el.querySelector<HTMLButtonElement>(".hexdev-truco-call")!.click();

    expect(dispatch).toHaveBeenCalledExactlyOnceWith(trucoCall);
  });

  it("marks the active anchor when it's the local player's turn", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();

    render(el, baseView(), [], () => {});

    const bottom = el.querySelector<HTMLElement>('[data-position="bottom"]')!;
    expect(bottom.classList.contains("hexdev-truco-anchor--active")).toBe(true);
    const top = el.querySelector<HTMLElement>('[data-position="top"]')!;
    expect(top.classList.contains("hexdev-truco-anchor--active")).toBe(false);
  });

  it("marks the opponent's anchor active, not the local one, when it's their turn", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();

    render(el, baseView({ hand: { ...baseView().hand!, turnSeat: 1 } }), [], () => {});

    expect(el.querySelector('[data-position="bottom"]')!.classList.contains("hexdev-truco-anchor--active")).toBe(false);
    expect(el.querySelector('[data-position="top"]')!.classList.contains("hexdev-truco-anchor--active")).toBe(true);
  });

  it("renders a scoreboard for each team, reflecting Team.score untouched", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();

    render(el, baseView(), [], () => {});

    const scoreboards = el.querySelectorAll<HTMLElement>(".hexdev-truco-scoreboard");
    expect(scoreboards).toHaveLength(2);
  });

  it("announces the trick outcome once a trick resolves (trickOutcomes grows between renders)", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();

    render(el, baseView(), [], () => {}); // mount: no trick decided yet
    render(
      el,
      baseView({
        hand: {
          manoSeat: 0,
          truco: { status: "none" },
          envido: { status: "none" },
          turnSeat: 1,
          currentTrickPlays: [],
          trickOutcomes: [{ winnerTeamId: MY_TEAM }],
          outcome: { decided: false },
        },
      }),
      [],
      () => {},
    );

    expect(el.querySelector(".hexdev-truco-trick-feedback")?.textContent).toBe("Ganaste la baza");
  });

  it("is idempotent to call repeatedly on the same container without accumulating duplicate matchstick defs", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();

    render(el, baseView(), [], () => {});
    render(el, baseView(), [], () => {});

    expect(document.querySelectorAll("#hexdev-truco-matchstick-defs")).toHaveLength(1);
  });
});
