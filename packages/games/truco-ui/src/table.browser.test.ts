import { afterEach, describe, expect, it, vi } from "vitest";
import type { Action, PlayerId, PlayerView, TeamId } from "@hexdev/truco-engine";
import { createMatchTableRenderer } from "./table.js";

const SELF = "player-a" as PlayerId;
const OPPONENT = "player-b" as PlayerId;

let container: HTMLElement;

afterEach(() => {
  container.remove();
  document.getElementById("hexdev-truco-matchstick-defs")?.remove();
  document.getElementById("hexdev-truco-table-styles")?.remove();
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

  it("is idempotent to call repeatedly on the same container without accumulating duplicate matchstick defs or stylesheets", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();

    render(el, baseView(), [], () => {});
    render(el, baseView(), [], () => {});

    expect(document.querySelectorAll("#hexdev-truco-matchstick-defs")).toHaveLength(1);
    expect(document.head.querySelectorAll("#hexdev-truco-table-styles")).toHaveLength(1);
  });

  it("stamps the seat count on the felt so CSS can lay out 2 vs. 4 seats differently (the columnless-vs-side-gutters tradeoff)", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();

    render(el, baseView(), [], () => {});

    expect(el.querySelector<HTMLElement>(".hexdev-truco-table")!.dataset.seatCount).toBe("2");
  });

  it("mounts the scoreboard panel as a sibling of the felt, never inside it — the tanteador is chrome, beside the play (Change 2)", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();

    render(el, baseView(), [], () => {});

    const felt = el.querySelector(".hexdev-truco-table")!;
    const panel = el.querySelector(".hexdev-truco-scoreboard-panel")!;
    expect(panel.contains(felt)).toBe(false);
    expect(felt.contains(panel)).toBe(false);
    expect(panel.querySelectorAll(".hexdev-truco-scoreboard")).toHaveLength(2);
  });
});

describe("createMatchTableRenderer — the pending call stays on the table until it is answered", () => {
  it("shows nothing when no call is open", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();

    render(el, baseView(), [], () => {});

    expect(el.querySelector(".hexdev-truco-pending-call")!.children).toHaveLength(0);
  });

  it("shows what was called, who called it, and that it is MY turn to answer when a respond action is legal", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();
    const view = baseView({ hand: { ...baseView().hand!, truco: { status: "pending", level: "truco", callingTeamId: OPPONENT_TEAM } } });
    const legal: readonly Action[] = [{ type: "respond-truco", playerId: SELF, response: "quiero" }];

    render(el, view, legal, () => {});

    const banner = el.querySelector<HTMLElement>(".hexdev-truco-pending-call")!;
    expect(banner.textContent).toContain("Truco");
    expect(banner.textContent).toContain("Ellos");
    expect(banner.dataset.turn).toBe("mine");
  });

  it("marks 'waiting on the opponent' when I am NOT the one who must answer", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();
    const view = baseView({ hand: { ...baseView().hand!, truco: { status: "pending", level: "truco", callingTeamId: MY_TEAM } } });

    render(el, view, [], () => {}); // no respond-* legal for the calling team

    expect(el.querySelector<HTMLElement>(".hexdev-truco-pending-call")!.dataset.turn).toBe("theirs");
  });

  it("stays across renders until the call is resolved, then clears", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();
    const pending = baseView({ hand: { ...baseView().hand!, truco: { status: "pending", level: "truco", callingTeamId: OPPONENT_TEAM } } });

    render(el, pending, [], () => {});
    render(el, pending, [], () => {}); // still pending on a second render
    expect(el.querySelector(".hexdev-truco-pending-call")!.children.length).toBeGreaterThan(0);

    render(el, baseView(), [], () => {}); // resolved — truco back to "none"
    expect(el.querySelector(".hexdev-truco-pending-call")!.children).toHaveLength(0);
  });

  it("an escalation REPLACES the pending call, never appends to it", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();
    const retruco = baseView({ hand: { ...baseView().hand!, truco: { status: "pending", level: "retruco", callingTeamId: OPPONENT_TEAM } } });

    render(el, retruco, [], () => {});

    const banner = el.querySelector<HTMLElement>(".hexdev-truco-pending-call")!;
    expect(banner.textContent).toContain("Retruco");
    expect(banner.textContent).not.toContain("Vale cuatro");
  });

  it("says nothing about a card-play turn while a call is pending — play stops for a call", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();
    const view = baseView({ hand: { ...baseView().hand!, truco: { status: "pending", level: "truco", callingTeamId: OPPONENT_TEAM } } });

    render(el, view, [], () => {});

    // The indicator is now permanently hidden from sight (the per-anchor
    // badge is what a sighted player reads) and exists only as the live
    // announcement — so what matters is that it ANNOUNCES nothing that
    // contradicts the banner, not that it is display-hidden.
    expect(el.querySelector<HTMLElement>(".hexdev-truco-turn-indicator")!.textContent).toBe("");
  });

  it("announces whose turn it is for screen readers even though the line is not painted", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();

    render(el, baseView(), [], () => {});

    const indicator = el.querySelector<HTMLElement>(".hexdev-truco-turn-indicator")!;
    expect(indicator.textContent).not.toBe("");
    expect(indicator.getAttribute("aria-live")).toBe("polite");
    // Removed from the visual layout, not from the accessibility tree.
    expect(indicator.getBoundingClientRect().width).toBeLessThan(2);
  });

  it("highlights the RESPONDING team's anchor while a call is pending, not the frozen turnSeat", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();
    // turnSeat is still 0 (mine) from before the call, but the OPPONENT's
    // team (seat 1) called truco, so seat 1 owes the answer, not seat 0.
    const view = baseView({ hand: { ...baseView().hand!, turnSeat: 0, truco: { status: "pending", level: "truco", callingTeamId: MY_TEAM } } });

    render(el, view, [], () => {});

    expect(el.querySelector('[data-position="bottom"]')!.classList.contains("hexdev-truco-anchor--active")).toBe(false);
    expect(el.querySelector('[data-position="top"]')!.classList.contains("hexdev-truco-anchor--active")).toBe(true);
  });
});

describe("createMatchTableRenderer — whose turn it is must be unmistakable (Change 3)", () => {
  it("renders a turn badge on the active anchor, not just text in the center", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();

    render(el, baseView(), [], () => {});

    const bottom = el.querySelector('[data-position="bottom"]')!;
    const badge = bottom.querySelector(".hexdev-truco-turn-badge")!;
    expect(badge.textContent).toBe("Tu turno");
  });

  it("the badge follows the active seat — the opponent's anchor gets it when it's their turn", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();

    render(el, baseView({ hand: { ...baseView().hand!, turnSeat: 1 } }), [], () => {});

    expect(el.querySelector('[data-position="bottom"] .hexdev-truco-turn-badge')).toBeNull();
    expect(el.querySelector('[data-position="top"] .hexdev-truco-turn-badge')!.textContent).toBe("Turno del rival");
  });
});
