import { afterEach, describe, expect, it, vi } from "vitest";
import type { Action, CallEvent, HandPlay, PlayerId, PlayerView, TeamId } from "@hexdev/truco-engine";
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
    self: { playerId: SELF, teamId: MY_TEAM, seat: 0, hand: [{ suit: "espada", rank: 1 }], lastSena: null },
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
      resolvedTrickPlays: [],
      callEvents: [],
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
          resolvedTrickPlays: [],
          callEvents: [],
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

describe("createMatchTableRenderer — end of a hand gets a clear acknowledgement (spec: 'who won it and how many points')", () => {
  it("announces nothing on the very first render", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();

    render(el, baseView(), [], () => {});

    expect(el.querySelector(".hexdev-truco-hand-outcome")!.textContent).toBe("");
  });

  it("announces a hand won by card play, with the point delta read from the view's own score change", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();
    render(el, baseView(), [], () => {}); // mount: hand still undecided

    render(
      el,
      baseView({
        hand: { ...baseView().hand!, outcome: { decided: true, winnerTeamId: MY_TEAM } },
        teams: [
          { id: MY_TEAM, score: 6 },
          { id: OPPONENT_TEAM, score: 2 },
        ],
      }),
      [],
      () => {},
    );

    const banner = el.querySelector(".hexdev-truco-hand-outcome")!;
    expect(banner.textContent).toContain("Ganaste la mano");
    expect(banner.textContent).toContain("+2 tantos");
  });

  it("announces a hand lost by the opponent's card play, reading as a loss not an error", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();
    render(el, baseView(), [], () => {});

    render(
      el,
      baseView({
        hand: { ...baseView().hand!, outcome: { decided: true, winnerTeamId: OPPONENT_TEAM } },
        teams: [
          { id: MY_TEAM, score: 4 },
          { id: OPPONENT_TEAM, score: 3 },
        ],
      }),
      [],
      () => {},
    );

    const banner = el.querySelector(".hexdev-truco-hand-outcome")!;
    expect(banner.textContent).toContain("Perdiste la mano");
    expect(banner.getAttribute("data-result")).toBe("lost");
  });

  it("stays visible across an immediate next-hand render, then self-clears after its own duration — never relies on another broadcast arriving", async () => {
    const el = freshContainer();
    const render = createMatchTableRenderer({ handOutcomeBannerMs: 20 });
    render(el, baseView(), [], () => {});

    render(
      el,
      baseView({
        hand: { ...baseView().hand!, outcome: { decided: true, winnerTeamId: MY_TEAM } },
        teams: [
          { id: MY_TEAM, score: 6 },
          { id: OPPONENT_TEAM, score: 2 },
        ],
      }),
      [],
      () => {},
    );
    // The very next broadcast is usually the freshly-dealt next hand
    // (dealerSeat rotated) — the banner must survive it rather than vanish
    // the instant play moves on.
    render(el, baseView({ dealerSeat: 0, teams: [{ id: MY_TEAM, score: 6 }, { id: OPPONENT_TEAM, score: 2 }] }), [], () => {});
    expect(el.querySelector(".hexdev-truco-hand-outcome")!.textContent).toContain("Ganaste la mano");

    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(el.querySelector(".hexdev-truco-hand-outcome")!.textContent).toBe("");
  });
});

describe("createMatchTableRenderer — 2v2: partner vs opponent must be obvious at a glance (obs 33's engine work made this reachable)", () => {
  const TEAMMATE = "player-c" as PlayerId;
  const OPPONENT_2 = "player-d" as PlayerId;

  function teamView(overrides: Partial<PlayerView> = {}): PlayerView {
    return baseView({
      teammates: [{ playerId: TEAMMATE, seat: 2, cardsRemaining: 3, lastSena: null }],
      opponents: [
        { playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, cardsRemaining: 3 },
        { playerId: OPPONENT_2, teamId: OPPONENT_TEAM, seat: 3, cardsRemaining: 3 },
      ],
      ...overrides,
    });
  }

  it("marks the partner's anchor data-relation=partner and both opponents' anchors data-relation=opponent", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();

    render(el, teamView(), [], () => {});

    // Partner sits opposite (mySeat 0 -> partner seat 2 -> anchor 'top').
    expect(el.querySelector<HTMLElement>('[data-position="top"]')!.dataset.relation).toBe("partner");
    expect(el.querySelector<HTMLElement>('[data-position="left"]')!.dataset.relation).toBe("opponent");
    expect(el.querySelector<HTMLElement>('[data-position="right"]')!.dataset.relation).toBe("opponent");
  });

  it("labels the partner's anchor 'Compañero' and each opponent's anchor 'Rival' — a real text label, not color alone (spec: 'obvious at a glance')", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();

    render(el, teamView(), [], () => {});

    expect(el.querySelector('[data-position="top"] .hexdev-truco-relation-label')?.textContent).toBe("Compañero");
    expect(el.querySelector('[data-position="left"] .hexdev-truco-relation-label')?.textContent).toBe("Rival");
    expect(el.querySelector('[data-position="right"] .hexdev-truco-relation-label')?.textContent).toBe("Rival");
  });

  it("never renders a relation label in a 2-seat (1v1) match — nothing to distinguish, one opponent only", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();

    render(el, baseView(), [], () => {});

    expect(el.querySelector(".hexdev-truco-relation-label")).toBeNull();
  });

  it("shows the partner's most recent seña on their own anchor, never on an opponent's", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();
    const view = teamView({ teammates: [{ playerId: TEAMMATE, seat: 2, cardsRemaining: 3, lastSena: "tres" }] });

    render(el, view, [], () => {});

    expect(el.querySelector('[data-position="top"]')!.textContent).toContain("Tres");
    expect(el.querySelector('[data-position="left"]')!.textContent).not.toContain("Tres");
    expect(el.querySelector('[data-position="right"]')!.textContent).not.toContain("Tres");
  });

  it("renders the señas toggle when send-sena is legal, absent when it is not (1v1 stays untouched)", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();
    const legal: readonly Action[] = [{ type: "send-sena", playerId: SELF, signal: "dos" }];

    render(el, teamView(), legal, () => {});
    expect(el.querySelector('button[data-action="senas-toggle"]')).not.toBeNull();

    render(el, baseView(), [], () => {}); // back to a plain 1v1-shaped view, no legal señas
    expect(el.querySelector('button[data-action="senas-toggle"]')).toBeNull();
  });
});

describe("createMatchTableRenderer — a real ending, once the match is over (spec: 'a way to play again without hunting')", () => {
  it("renders nothing extra while the match is still in progress", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();

    render(el, baseView(), [], () => {}, { outcome: null });

    expect(el.querySelector(".hexdev-truco-match-over")!.textContent).toBe("");
  });

  it("shows the winner, the final score, and a working play-again button once outcome is present", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();
    const onPlayAgain = vi.fn();

    render(
      el,
      baseView({ teams: [{ id: MY_TEAM, score: 30 }, { id: OPPONENT_TEAM, score: 18 }] }),
      [],
      () => {},
      { outcome: { winnerIds: [SELF] }, onPlayAgain },
    );

    const overlay = el.querySelector(".hexdev-truco-match-over")!;
    expect(overlay.textContent).toContain("¡Ganaste la partida!");
    expect(overlay.textContent).toContain("30");
    expect(overlay.textContent).toContain("18");
    overlay.querySelector<HTMLButtonElement>('button[data-action="play-again"]')!.click();
    expect(onPlayAgain).toHaveBeenCalledOnce();
  });
});

describe("createMatchTableRenderer — call-log panel (spec: 'Call-Log Panel With Bounded Footprint', 'History Persists Through the Outcome Banner')", () => {
  // PR4-T1 (tasks §8, RED-first, D-4/blessed refinement 2 — tasks §1 item 2/
  // §2.1): rewritten, not preserved as a fallback. The OLD assertion ("mounts
  // renderCallLog inside .hexdev-truco-center") was the contract PR4 exists to
  // replace — the log now mounts as a direct child of the felt itself
  // (.hexdev-truco-table), positioned into the center grid area at compact via
  // CSS Grid's own "absolutely-positioned grid item with a definite grid-area
  // gets that area as its containing block" rule (table-styles.ts's own
  // .hexdev-truco-call-log rule: grid-area: center; position: absolute; left:
  // 0; bottom: 0), not by DOM nesting under .hexdev-truco-center anymore.
  it("mounts renderCallLog as a direct child of the felt (.hexdev-truco-table), positioned into the center grid area at compact — fed from view.hand.callEvents and the SAME positions map the piles use", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();
    const events: readonly CallEvent[] = [{ kind: "truco-call", playerId: SELF, teamId: MY_TEAM, seat: 0, level: "truco" }];

    render(el, baseView({ hand: { ...baseView().hand!, callEvents: events } }), [], () => {});

    const felt = el.querySelector(".hexdev-truco-table")!;
    const center = felt.querySelector(".hexdev-truco-center")!;
    const panel = felt.querySelector(":scope > .hexdev-truco-call-log");
    expect(panel, "renderCallLog must mount as a DIRECT child of .hexdev-truco-table").not.toBeNull();
    expect(panel!.parentElement).toBe(felt);
    // The replaced contract, asserted explicitly so a regression back to the
    // old mount point is caught here, not just by the positive assertion above.
    expect(center.querySelector(".hexdev-truco-call-log"), "the log must NOT be nested inside .hexdev-truco-center anymore").toBeNull();

    // "Positioned into the center grid area at compact": the panel's own
    // absolutely-positioned rect must coincide with .hexdev-truco-center's own
    // rect at the edges its CSS anchors to (left/bottom) — the same rect the
    // log occupied when it was still a DOM child of .hexdev-truco-center,
    // reproduced now purely through the grid-area containing-block mechanism.
    const centerRect = center.getBoundingClientRect();
    const panelRect = panel!.getBoundingClientRect();
    expect(Math.abs(panelRect.left - centerRect.left), `panel left ${panelRect.left} vs center left ${centerRect.left}`).toBeLessThan(0.5);
    expect(Math.abs(panelRect.bottom - centerRect.bottom), `panel bottom ${panelRect.bottom} vs center bottom ${centerRect.bottom}`).toBeLessThan(0.5);

    const entries = panel!.querySelectorAll(".hexdev-truco-call-log-entry");
    expect(entries).toHaveLength(1);
    // Same geometry the piles use (resolveSeatPositions): seat 0 is the local player, "bottom".
    expect(entries[0]!.getAttribute("data-position")).toBe("bottom");
  });

  it("keeps piles and the call log visible through outcome.decided, then clears both once the next hand is dealt (Q5/D-9: no new UI state needed)", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();
    const events: readonly CallEvent[] = [{ kind: "truco-call", playerId: SELF, teamId: MY_TEAM, seat: 0, level: "truco" }];
    const plays: readonly (readonly HandPlay[])[] = [[{ playerId: SELF, teamId: MY_TEAM, seat: 0, card: { suit: "espada", rank: 1 } }]];

    render(
      el,
      baseView({
        hand: { ...baseView().hand!, resolvedTrickPlays: plays, callEvents: events, outcome: { decided: true, winnerTeamId: MY_TEAM } },
      }),
      [],
      () => {},
    );

    expect(el.querySelectorAll("[data-played-by-seat]")).toHaveLength(1);
    expect(el.querySelectorAll(".hexdev-truco-call-log-entry")).toHaveLength(1);

    // The next startHand() resets both fields to [] (design §2.3's own
    // reset-on-deal guarantee) — the same shape a real re-deal broadcasts.
    render(el, baseView(), [], () => {});

    expect(el.querySelectorAll("[data-played-by-seat]")).toHaveLength(0);
    expect(el.querySelector(".hexdev-truco-call-log")!.children).toHaveLength(0);
  });
});
