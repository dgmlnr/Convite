import { afterEach, describe, expect, it, vi } from "vitest";
import type { Action, CallEvent, HandPlay, PlayerId, PlayerView, SenaView, TeamId } from "@hexdev/truco-engine";
import { MAX_SENAS_PER_HAND } from "@hexdev/truco-engine";
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
    self: { playerId: SELF, teamId: MY_TEAM, seat: 0, hand: [{ suit: "espada", rank: 1 }], lastSena: null, senasRemaining: MAX_SENAS_PER_HAND },
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
  it("says nothing about a card-play turn while a call is pending — play stops for a call", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();
    const view = baseView({ hand: { ...baseView().hand!, truco: { status: "pending", level: "truco", callingTeamId: OPPONENT_TEAM } } });

    render(el, view, [], () => {});

    // Whose turn it is is permanently hidden from sight (the per-anchor badge
    // is what a sighted player reads) and exists only as the live
    // announcement — so what matters is that it ANNOUNCES nothing that
    // contradicts the banner, not that it is display-hidden.
    expect(el.querySelector<HTMLElement>('[data-announces="turn"]')!.textContent).toBe("");
  });

  it("announces whose turn it is for screen readers even though the line is not painted", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();

    render(el, baseView(), [], () => {});

    const indicator = el.querySelector<HTMLElement>('[data-announces="turn"]')!;
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

  /**
   * The per-hand cap's wiring, at the level where it can actually break: the
   * picker reads the quota, but only the table can hand it the RIGHT one. A
   * hardcoded cap, or a stale/derived count, would pass every picker test in
   * senas.browser.test.ts and still show the wrong number in the product.
   */
  it("shows the viewer's own remaining allowance on the one control that spends it, straight from view.self.senasRemaining", () => {
    // The count used to live on the señas toggle. It moved to a counter
    // between the two controls that spend it — asking your partner and
    // signalling to them share one allowance, and a "(2)" on each button read
    // as two separate twos. Same source, same property (the cap is visible
    // BEFORE it bites), one place.
    const el = freshContainer();
    const render = createMatchTableRenderer();
    const legal: readonly Action[] = [{ type: "send-sena", playerId: SELF, signal: "asDeEspada" }];

    render(el, teamView({ self: { ...baseView().self, senasRemaining: 2 } }), legal, () => {});

    // ONE control carries it, and that is what makes the number readable: it
    // is unambiguously that button's own. Two buttons each showing "(2)" read
    // as two separate twos, and a lone chip between them read as a stray
    // digit — both were tried, both were reported.
    const toggles = [...el.querySelectorAll<HTMLElement>('button[data-action="senas-toggle"]')];
    expect(toggles.length, "one allowance, one control").toBe(1);
    expect(toggles[0]!.textContent).toBe("Seña/Consulta (2)");
  });

  it("keeps the Señas control on the action bar once the quota is spent — disabled, never removed mid-hand", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();

    // The engine's real state at the cap: send-sena is no longer legal, and
    // the viewer's own quota reads zero.
    render(el, teamView({ self: { ...baseView().self, senasRemaining: 0 } }), [], () => {});

    const toggle = el.querySelector<HTMLButtonElement>('button[data-action="senas-toggle"]');
    expect(toggle, "the control must not vanish when the cap bites").not.toBeNull();
    expect(toggle!.disabled).toBe(true);
    // The VISIBLE label alone: the visually-hidden reason span (WCAG 2.1.1,
    // senas.ts) also joins textContent but never the painted band.
    expect(toggle!.firstChild?.textContent).toBe("Sin señas");
  });

  /**
   * The picker's dismissal, at the level where it can actually break. The
   * mechanism itself is fenced in senas.browser.test.ts against a stand-in
   * surface; what only the table can get wrong is WHICH node it hands over,
   * and every wrong answer still passes every test in that file.
   */
  it("dismisses the open señas picker when the click lands anywhere else on the table", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();
    const legal: readonly Action[] = [{ type: "send-sena", playerId: SELF, signal: "asDeEspada" }];

    render(el, teamView(), legal, () => {});
    const toggle = el.querySelector<HTMLButtonElement>('button[data-action="senas-toggle"]')!;
    toggle.click();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    // The middle of the felt — not a stand-in, the real node a player's eyes
    // and thumb are on while a hand is in play.
    el.querySelector<HTMLElement>(".hexdev-truco-center")!.click();

    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(el.querySelectorAll('button[data-action="send-sena"]')).toHaveLength(0);
  });

  it("re-arms that dismissal on every broadcast, never only on the first render", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();
    const legal: readonly Action[] = [{ type: "send-sena", playerId: SELF, signal: "asDeEspada" }];

    render(el, teamView(), legal, () => {});
    render(el, teamView(), legal, () => {});
    render(el, teamView(), legal, () => {});

    const toggle = el.querySelector<HTMLButtonElement>('button[data-action="senas-toggle"]')!;
    toggle.click();
    el.querySelector<HTMLElement>(".hexdev-truco-center")!.click();

    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  /**
   * The anti-`container` fence, and the reason the surface is a parameter at
   * all. `container` is `main.ts`'s own `app` element: leaving a match calls
   * `replaceChildren()` on it, which EMPTIES it without removing it — so a
   * dismissal listener parked there (or on `document`) would outlive the match
   * with no render left to take it back, which is the exact leak the whole
   * mechanism exists to avoid. It looks like the obvious node to pass and is
   * the one node that must never be passed.
   */
  it("parks the picker's dismissal on none of the nodes that survive leaving a match — not the widget root, not the body, not the document", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();
    const legal: readonly Action[] = [{ type: "send-sena", playerId: SELF, signal: "asDeEspada" }];
    render(el, teamView(), legal, () => {});

    const survivors: readonly [string, EventTarget][] = [
      ["the widget root, which `replaceChildren` empties without removing", el],
      ["the body", document.body],
      ["the document", document],
    ];
    const spies = survivors.map(([reason, target]) => [reason, vi.spyOn(target, "addEventListener")] as const);
    try {
      el.querySelector<HTMLButtonElement>('button[data-action="senas-toggle"]')!.click();

      for (const [reason, spy] of spies) expect(spy, `nothing may still be listening on ${reason}`).not.toHaveBeenCalled();
    } finally {
      for (const [, spy] of spies) spy.mockRestore();
    }
  });

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

  // A seña is a MOMENT, not a badge someone wears for the rest of the hand
  // (product decision: "si no la viste, la perdiste"). A standing claim leaves
  // NOTHING on the partner's anchor — no chip, no label, no residue on any
  // anchor at all. The transient notice in the banner lane is the whole of the
  // partner-seña UI now; see the seña-notice describe block below.
  it("leaves no persistent seña chip on the partner's anchor — a standing claim is not table furniture", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();
    const view = teamView({ teammates: [{ playerId: TEAMMATE, seat: 2, cardsRemaining: 3, lastSena: { signal: "tres", seq: 1 } }] });

    render(el, view, [], () => {});

    expect(el.querySelector(".hexdev-truco-partner-sena")).toBeNull();
    for (const position of ["top", "left", "right", "bottom"]) {
      expect(el.querySelector(`[data-position="${position}"]`)!.textContent, `${position} anchor`).not.toContain("Tres");
    }
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

/**
 * A partner's seña is TRANSIENT, exactly like the real table: "si no la
 * viste, la perdiste". It is the one overlay on this table that is PUSHED by
 * someone else rather than opened by the person seeing it, which is why it
 * lives in the reserved banner lane and never over the trick area a player is
 * reading while they decide.
 *
 * Duration is injected the same way `handOutcomeBannerMs` already is, so
 * these tests never wait multiple seconds in real time.
 */
describe("createMatchTableRenderer — a partner's seña is a moment, announced then gone", () => {
  const TEAMMATE = "player-c" as PlayerId;
  const OPPONENT_2 = "player-d" as PlayerId;

  function teamView(lastSena: SenaView | null, overrides: Partial<PlayerView> = {}): PlayerView {
    return baseView({
      teammates: [{ playerId: TEAMMATE, seat: 2, cardsRemaining: 3, lastSena }],
      opponents: [
        { playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, cardsRemaining: 3 },
        { playerId: OPPONENT_2, teamId: OPPONENT_TEAM, seat: 3, cardsRemaining: 3 },
      ],
      ...overrides,
    });
  }

  it("announces nothing on the very first render, even when the partner already has a seña standing", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();

    render(el, teamView({ signal: "tres", seq: 1 }), [], () => {});

    expect(el.querySelector(".hexdev-truco-sena-notice")!.textContent).toBe("");
  });

  it("announces the partner's seña the moment it arrives between two snapshots, in authentic table vocabulary", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();
    render(el, teamView(null), [], () => {});

    render(el, teamView({ signal: "sieteDeOro", seq: 1 }), [], () => {});

    const notice = el.querySelector(".hexdev-truco-sena-notice")!;
    expect(notice.textContent).toContain("7 de oro");
    expect(notice.textContent).toContain("compañero");
  });

  it("announces a RE-SENT identical signal — the partner insisting is an event, not a no-op", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer({ senaNoticeMs: 20 });
    render(el, teamView(null), [], () => {});
    render(el, teamView({ signal: "tres", seq: 1 }), [], () => {});
    expect(el.querySelector(".hexdev-truco-sena-notice")!.textContent).toContain("Tres");

    render(el, teamView({ signal: "tres", seq: 2 }), [], () => {});

    expect(el.querySelector(".hexdev-truco-sena-notice")!.textContent).toContain("Tres");
  });

  it("clears itself after its own injected duration, never waiting on another broadcast to arrive", async () => {
    const el = freshContainer();
    const render = createMatchTableRenderer({ senaNoticeMs: 20 });
    render(el, teamView(null), [], () => {});
    render(el, teamView({ signal: "asDeBasto", seq: 1 }), [], () => {});
    expect(el.querySelector(".hexdev-truco-sena-notice")!.textContent).toContain("As de basto");

    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(el.querySelector(".hexdev-truco-sena-notice")!.textContent).toBe("");
  });

  it("survives an unrelated re-render while it is up, then still self-clears — the timer owns the clear, not the next broadcast", async () => {
    const el = freshContainer();
    const render = createMatchTableRenderer({ senaNoticeMs: 40 });
    const sena: SenaView = { signal: "dos", seq: 1 };
    render(el, teamView(null), [], () => {});
    render(el, teamView(sena), [], () => {});

    // A perfectly ordinary next broadcast: the seña is unchanged, something
    // else on the table moved.
    render(el, teamView(sena, { teams: [{ id: MY_TEAM, score: 3 }, { id: OPPONENT_TEAM, score: 1 }] }), [], () => {});
    expect(el.querySelector(".hexdev-truco-sena-notice")!.textContent).toContain("Dos");

    await new Promise((resolve) => setTimeout(resolve, 90));

    expect(el.querySelector(".hexdev-truco-sena-notice")!.textContent).toBe("");
  });

  it("does not RE-announce a stale seña once its notice has expired — a missed seña stays missed", async () => {
    const el = freshContainer();
    const render = createMatchTableRenderer({ senaNoticeMs: 20 });
    const sena: SenaView = { signal: "asDeEspada", seq: 1 };
    render(el, teamView(null), [], () => {});
    render(el, teamView(sena), [], () => {});

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(el.querySelector(".hexdev-truco-sena-notice")!.textContent).toBe("");

    // The same standing seña arrives again in every later broadcast of the
    // hand — it must stay silent, or the notice would strobe on every render.
    render(el, teamView(sena), [], () => {});

    expect(el.querySelector(".hexdev-truco-sena-notice")!.textContent).toBe("");
  });

  it("mounts the notice inside the reserved banner lane, alongside the pending-call and hand-outcome banners", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();
    render(el, teamView(null), [], () => {});
    render(el, teamView({ signal: "tres", seq: 1 }), [], () => {});

    expect(el.querySelector(".hexdev-truco-banner-slot > .hexdev-truco-sena-notice")).not.toBeNull();
  });
});

/**
 * Announcements a screen reader can ACTUALLY hear.
 *
 * `render` rebuilds this whole table from scratch on every broadcast
 * (`container.replaceChildren()`, then a fresh `createElement` for every node
 * beneath it). A live region built that way is a NEW region each time, and a
 * brand-new region carrying text is not a CHANGE to an existing one — so an
 * `aria-live` attribute sitting on a rebuilt node announces nothing at all.
 * Both announcers must therefore be created ONCE per mount and survive the
 * rebuild, which is the property these tests pin: node IDENTITY across
 * renders, not the mere presence of an attribute.
 */
describe("createMatchTableRenderer — the announcers are real live regions, not attributes on a rebuilt node", () => {
  const TEAMMATE = "player-c" as PlayerId;
  const OPPONENT_2 = "player-d" as PlayerId;

  const handOutcomeAnnouncerOf = (el: HTMLElement): HTMLElement | null => el.querySelector('[data-announces="hand-outcome"]');
  const senaAnnouncerOf = (el: HTMLElement): HTMLElement | null => el.querySelector('[data-announces="partner-sena"]');
  const turnAnnouncerOf = (el: HTMLElement): HTMLElement | null => el.querySelector('[data-announces="turn"]');
  const turnClockAnnouncerOf = (el: HTMLElement): HTMLElement | null => el.querySelector('[data-announces="turn-clock"]');
  const pendingCallAnnouncerOf = (el: HTMLElement): HTMLElement | null => el.querySelector('[data-announces="pending-call"]');
  const trickAnnouncerOf = (el: HTMLElement): HTMLElement | null => el.querySelector('[data-announces="trick"]');
  const matchOverAnnouncerOf = (el: HTMLElement): HTMLElement | null => el.querySelector('[data-announces="match-over"]');

  function teamView(lastSena: SenaView | null, overrides: Partial<PlayerView> = {}): PlayerView {
    return baseView({
      teammates: [{ playerId: TEAMMATE, seat: 2, cardsRemaining: 3, lastSena }],
      opponents: [
        { playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, cardsRemaining: 3 },
        { playerId: OPPONENT_2, teamId: OPPONENT_TEAM, seat: 3, cardsRemaining: 3 },
      ],
      ...overrides,
    });
  }

  const decidedView = (): PlayerView =>
    baseView({
      hand: { ...baseView().hand!, outcome: { decided: true, winnerTeamId: MY_TEAM } },
      teams: [
        { id: MY_TEAM, score: 6 },
        { id: OPPONENT_TEAM, score: 2 },
      ],
    });

  it.each([
    ["hand-outcome", handOutcomeAnnouncerOf],
    ["partner-sena", senaAnnouncerOf],
    ["turn", turnAnnouncerOf],
    ["turn-clock", turnClockAnnouncerOf],
    ["pending-call", pendingCallAnnouncerOf],
    ["trick", trickAnnouncerOf],
    ["match-over", matchOverAnnouncerOf],
  ] as const)("%s: the SAME node survives a re-render — a live region rebuilt per render can never announce", (_name, announcerOf) => {
    const el = freshContainer();
    const render = createMatchTableRenderer();

    render(el, teamView(null), [], () => {});
    const first = announcerOf(el);
    expect(first, "the announcer must exist from the very first render").not.toBeNull();

    // A completely different view — the render path below this rebuilds every
    // other node on the table, which is exactly what the announcer must NOT do.
    render(el, teamView({ signal: "tres", seq: 1 }), [], () => {});
    render(el, decidedView(), [], () => {});

    expect(announcerOf(el), "the announcer node's identity must be preserved across renders").toBe(first);
    expect(first!.isConnected, "the announcer must stay attached, never detached and re-added").toBe(true);
  });

  it.each([
    ["hand-outcome", handOutcomeAnnouncerOf],
    ["partner-sena", senaAnnouncerOf],
    ["turn", turnAnnouncerOf],
    ["turn-clock", turnClockAnnouncerOf],
    ["pending-call", pendingCallAnnouncerOf],
    ["trick", trickAnnouncerOf],
    ["match-over", matchOverAnnouncerOf],
  ] as const)("%s: is a polite, atomic live region — never assertive, never a half-read fragment", (_name, announcerOf) => {
    const el = freshContainer();
    const render = createMatchTableRenderer();
    render(el, teamView(null), [], () => {});
    const announcer = announcerOf(el)!;

    expect(announcer.getAttribute("aria-live")).toBe("polite");
    expect(announcer.getAttribute("aria-atomic")).toBe("true");
  });

  it("says nothing at all until something has happened — an empty region on mount is a silent one", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();

    render(el, teamView(null), [], () => {});

    expect(handOutcomeAnnouncerOf(el)!.textContent).toBe("");
    expect(senaAnnouncerOf(el)!.textContent).toBe("");
  });

  it("announces a partner's seña as ONE statement, source and signal together", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();
    render(el, teamView(null), [], () => {});

    render(el, teamView({ signal: "sieteDeOro", seq: 1 }), [], () => {});

    expect(senaAnnouncerOf(el)!.textContent).toBe("Seña del compañero, 7 de oro");
  });

  it("announces the hand's outcome as ONE statement, result and points together", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();
    render(el, baseView(), [], () => {});

    render(el, decidedView(), [], () => {});

    expect(handOutcomeAnnouncerOf(el)!.textContent).toBe("Ganaste la mano, +2 tantos");
  });

  it("does not repeat itself on an unrelated re-render — the same text rewritten is a second announcement in some readers", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();
    render(el, teamView(null), [], () => {});
    render(el, teamView({ signal: "dos", seq: 1 }), [], () => {});
    const announcer = senaAnnouncerOf(el)!;
    const spoken = announcer.textContent;

    // Something else on the table moved; the seña is unchanged.
    const sameSena = teamView({ signal: "dos", seq: 1 }, { teams: [{ id: MY_TEAM, score: 3 }, { id: OPPONENT_TEAM, score: 1 }] });
    const textNodeBefore = announcer.firstChild;
    render(el, sameSena, [], () => {});

    expect(announcer.textContent).toBe(spoken);
    expect(announcer.firstChild, "an untouched region must not have its text node replaced").toBe(textNodeBefore);
  });

  it("falls silent when the seña expires, and does so as a REMOVAL — the default aria-relevant never speaks a removal", async () => {
    const el = freshContainer();
    const render = createMatchTableRenderer({ senaNoticeMs: 20 });
    render(el, teamView(null), [], () => {});
    render(el, teamView({ signal: "asDeBasto", seq: 1 }), [], () => {});
    const announcer = senaAnnouncerOf(el)!;
    expect(announcer.textContent).toBe("Seña del compañero, As de basto");

    await new Promise((resolve) => setTimeout(resolve, 60));

    // Emptied by the SAME timer that clears the visible chip, without waiting
    // for another broadcast — and `aria-relevant` stays at its default
    // ("additions text"), so emptying it is not itself an announcement.
    expect(announcer.textContent).toBe("");
    expect(announcer.getAttribute("aria-relevant")).toBe("additions text");
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
  it("mounts renderCallLog inside the side rail, never on the cloth — fed from view.hand.callEvents and labelled by the same seat geometry the piles use", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();
    const events: readonly CallEvent[] = [{ kind: "truco-call", playerId: SELF, teamId: MY_TEAM, seat: 0, level: "truco" }];

    render(el, baseView({ hand: { ...baseView().hand!, callEvents: events } }), [], () => {});

    const felt = el.querySelector(".hexdev-truco-table")!;
    const rail = el.querySelector(".hexdev-truco-side-rail")!;
    const body = rail.querySelector(".hexdev-truco-rail-body")!;
    const panel = body.querySelector(":scope > .hexdev-truco-call-log");
    expect(panel, "renderCallLog must mount inside the side rail's body").not.toBeNull();
    expect(panel!.parentElement).toBe(body);
    // The replaced contract, asserted explicitly so a regression back to the
    // old mount point is caught here, not just by the positive assertion
    // above. The log was a felt child, laid over the centre of the cloth; the
    // calls share a rail with the tantos now, and the column that frees is
    // play area.
    expect(felt.querySelector(".hexdev-truco-call-log"), "the log must NOT be mounted on the cloth anymore").toBeNull();

    // What replaced "positioned into the center grid area at compact". The log
    // used to be pinned to the bottom-left of .hexdev-truco-center through the
    // grid-area containing-block mechanism, laid over the play. It is behind
    // the rail's tab now, and the contract worth asserting is the one that
    // mattered all along: it takes nothing from the felt.
    expect(rail.getAttribute("data-open"), "a fresh table opens with the drawer shut").toBe("false");

    const entries = panel!.querySelectorAll(".hexdev-truco-call-log-entry");
    expect(entries).toHaveLength(1);
    // Same geometry the piles use (resolveSeatPositions): seat 0 is the local player, "bottom".
    expect(entries[0]!.getAttribute("data-position")).toBe("bottom");
  });

  it("keeps piles through outcome.decided, clears them on the next deal — and KEEPS the calls, closed off", () => {
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

    // The piles are of the HAND and go with it.
    expect(el.querySelectorAll("[data-played-by-seat]")).toHaveLength(0);
    // The calls are of the MATCH and stay, which is the half of this that
    // changed. Emptying the panel every deal is what made the rail jump and
    // the record unreadable; it keeps the finished hand and marks where it
    // ended. See call-history.ts for how a new hand is recognised at all,
    // given that nothing in the view numbers them.
    expect(el.querySelectorAll(".hexdev-truco-call-log-entry"), "the finished hand's calls were thrown away on the next deal").toHaveLength(1);
    expect(el.querySelector(".hexdev-truco-call-log-round-end"), "nothing marks where the finished hand ended").not.toBeNull();
  });

  // PR4 correction (native review, deterministic CRITICAL): the wide/ultra
  // override (table-styles.ts's own @container (min-width: 900px) block)
  // used to sit BEFORE the base .hexdev-truco-call-log rule in source order —
  // same specificity, later rule wins regardless of @container nesting — so
  // the base rule always won and the log stayed position: absolute /
  // grid-area: center even at >=900px, never entering flow. This closes that
  // gap directly: a real container-query width (per this suite's own
  // established mountedContainer pattern elsewhere), a computed-style check,
  // and a real geometry check against .hexdev-truco-center.
  it("at wide (960px) the log panel is really in flow — position: static, and its rect never overlaps .hexdev-truco-center's rect", () => {
    const el = freshContainer();
    el.style.width = "960px";
    const render = createMatchTableRenderer();
    const events: readonly CallEvent[] = [{ kind: "truco-call", playerId: SELF, teamId: MY_TEAM, seat: 0, level: "truco" }];

    render(el, baseView({ hand: { ...baseView().hand!, callEvents: events } }), [], () => {});

    const felt = el.querySelector(".hexdev-truco-table")!;
    const center = felt.querySelector(".hexdev-truco-center")!;
    const panel = el.querySelector(".hexdev-truco-rail-body > .hexdev-truco-call-log")!;

    expect(getComputedStyle(panel).position, "the panel must be a real in-flow box at wide, not floating over the felt").toBe("static");

    const centerRect = center.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const overlaps =
      panelRect.left < centerRect.right - 0.5 &&
      centerRect.left < panelRect.right - 0.5 &&
      panelRect.top < centerRect.bottom - 0.5 &&
      centerRect.top < panelRect.bottom - 0.5;
    expect(overlaps, `panel ${JSON.stringify(panelRect)} vs center ${JSON.stringify(centerRect)}`).toBe(false);
  });

});

/**
 * `view.hand === null` is not an edge case this renderer merely tolerates: it
 * is the FIRST view of every match. `MatchRoom.onJoin` builds the match and
 * broadcasts it before `advance()` deals (transport-colyseus's own
 * `match-room.ts`), so the opening render of every table — 1v1 and 2v2 alike —
 * goes through the `view.hand?.… ?? …` fallbacks below rather than through a
 * hand. `HandView | null` is what makes that expressible, and optional
 * chaining short-circuits on `null` exactly as it does on `undefined`.
 */
describe("createMatchTableRenderer — the opening view of a match, broadcast before the deal (view.hand === null)", () => {
  it("comes up as a real, empty table: seats and scoreboard, no call log, no piles, nobody on the clock", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();
    // Undealt means no cards either, on the local seat as much as anywhere —
    // the shape the room actually broadcasts, not a hand with its cards kept.
    const view = baseView({ hand: null, self: { ...baseView().self, hand: [] } });

    render(el, view, [], () => {});

    // The table itself is up: whatever is permanently true of a match — its
    // seats and its score — never depended on a hand being in progress.
    expect([...el.querySelectorAll<HTMLElement>(".hexdev-truco-anchor")].map((a) => a.dataset.position).sort()).toEqual([
      "bottom",
      "left",
      "right",
      "top",
    ]);
    expect(el.querySelectorAll(".hexdev-truco-scoreboard")).toHaveLength(2);

    // And everything a hand would have supplied reads as genuinely empty
    // rather than as leftovers: nothing said yet, no cards on the felt. The
    // panel is DRAWN — it is a fixed box in the rail now, and hiding itself
    // when empty is exactly what made the rail move — but it holds no entries
    // and says as much.
    expect(el.querySelectorAll(".hexdev-truco-call-log-entry")).toHaveLength(0);
    expect(el.querySelector(".hexdev-truco-call-log-empty"), "an empty panel says nothing about being empty").not.toBeNull();
    expect(el.querySelectorAll("[data-played-by-seat]")).toHaveLength(0);
    // Nobody owes a move between hands, so no seat is highlighted and no badge
    // (nor its countdown) claims one is late.
    expect(el.querySelectorAll(".hexdev-truco-anchor--active")).toHaveLength(0);
    expect(el.querySelectorAll(".hexdev-truco-turn-badge")).toHaveLength(0);
  });
});

describe("createMatchTableRenderer — action bar overflow: 1v1's two-simultaneous-call-groups edge case (PR5 correction, native review CRITICAL)", () => {
  // PR5 correction (native review, deterministic CRITICAL): table-styles.ts's
  // own .hexdev-truco-action-bar rule declared overflow: hidden ahead of
  // overflow-x: auto, on the claim that the UA's "one axis non-visible forces
  // the other to auto" coercion gives a free vertical scroller. FALSE: the
  // overflow: hidden SHORTHAND sets overflow-y: hidden (not "visible"), so
  // the coercion never fires and vertical overflow is clipped. Real reachable
  // state, per envido-chain.ts's own canOpenEnvido: 1v1, opponent called
  // truco before trick 1 resolved, so SELF's legal actions carry BOTH
  // respond-truco AND call-envido at once — two calls-row groups stacked in
  // the one fixed-height strip.
  it("gives the action bar an explicit overflow-y: auto so a stacked response+envido pair is scrollable, not clipped", () => {
    const el = freshContainer();
    el.style.width = "375px";
    const render = createMatchTableRenderer();
    const view = baseView({ hand: { ...baseView().hand!, truco: { status: "pending", level: "truco", callingTeamId: OPPONENT_TEAM } } });
    const legal: readonly Action[] = [
      { type: "respond-truco", playerId: SELF, response: "quiero" },
      { type: "respond-truco", playerId: SELF, response: "no-quiero" },
      { type: "call-envido", playerId: SELF, level: "envido" },
    ];

    render(el, view, legal, () => {});

    const groups = el.querySelectorAll(".hexdev-truco-calls-group");
    expect(groups, "sanity: both the response and opening groups must actually render").toHaveLength(2);

    const actionBar = el.querySelector<HTMLElement>(".hexdev-truco-action-bar")!;
    // Primary, definitive assertion: RED on its own against the unfixed rule.
    expect(getComputedStyle(actionBar).overflowY).toBe("auto");

    // Secondary, informational only: overflow: hidden still accepts a
    // programmatic scrollTop write without visually scrolling, so this alone
    // cannot distinguish "clipped" from "scrollable" — kept only to prove the
    // stacked groups genuinely overflow the fixed-height strip at this width.
    if (actionBar.scrollHeight > actionBar.clientHeight) {
      actionBar.scrollTop = actionBar.scrollHeight;
      expect(actionBar.scrollTop).toBeGreaterThan(0);
    }
  });
});

describe("the turn badge names the seat it is sitting on", () => {
  // Reported from a screenshot of a live 2v2: the badge hanging over the
  // PARTNER's own seat read "Turno del rival". The text only ever knew
  // self/not-self, so every seat that was not the viewer's was a rival —
  // including the one player at the table who is on their side, on a screen
  // whose whole design exists to make that pairing obvious at a glance.
  /** A 2v2 view whose turn belongs to the partner (seat 2) or to a rival
   * (seat 1). Its own fixture rather than the `teamView` further up, which
   * lives inside another describe's scope. */
  const PARTNER_ID = "player-c" as PlayerId;
  const RIVAL_2_ID = "player-d" as PlayerId;

  function teamViewWithActive(relation: "partner" | "opponent"): PlayerView {
    const base = baseView();
    return baseView({
      teammates: [{ playerId: PARTNER_ID, seat: 2, cardsRemaining: 3, lastSena: null }],
      opponents: [
        { playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, cardsRemaining: 3 },
        { playerId: RIVAL_2_ID, teamId: OPPONENT_TEAM, seat: 3, cardsRemaining: 3 },
      ],
      hand: { ...base.hand!, turnSeat: relation === "partner" ? 2 : 1 },
    });
  }

  it("2v2: says the partner's turn over the partner's seat, never the rival's", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();

    render(el, teamViewWithActive("partner"), [], () => {});

    const badge = el.querySelector(".hexdev-truco-turn-badge");
    expect(badge, "fence setup: no turn badge was mounted at all").not.toBeNull();
    expect(badge!.textContent, "the partner is being called a rival on their own seat").toContain("compañero");
  });

  it("2v2: still says the rival's turn over a rival's seat", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();

    render(el, teamViewWithActive("opponent"), [], () => {});

    const badge = el.querySelector(".hexdev-truco-turn-badge");
    expect(badge, "fence setup: no turn badge was mounted at all").not.toBeNull();
    expect(badge!.textContent, "a rival stopped being called a rival").toContain("rival");
  });
});

describe("createMatchTableRenderer — keyboard focus survives every server broadcast (WCAG 2.1.1/2.4.3: the render wipe used to dump focus on <body>)", () => {
  const PENDING_VIEW = (): PlayerView =>
    baseView({ hand: { ...baseView().hand!, truco: { status: "pending", level: "truco", callingTeamId: OPPONENT_TEAM } } });
  const RESPOND_LEGAL: readonly Action[] = [
    { type: "respond-truco", playerId: SELF, response: "quiero" },
    { type: "respond-truco", playerId: SELF, response: "no-quiero" },
  ];

  it("keeps focus on the exact respond button — No quiero, never its Quiero sibling — across a same-view re-render", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();
    render(el, PENDING_VIEW(), RESPOND_LEGAL, () => {});
    const noQuiero = [...el.querySelectorAll<HTMLButtonElement>(".hexdev-truco-call")].find((b) => b.textContent === "No quiero")!;
    noQuiero.focus();

    render(el, PENDING_VIEW(), RESPOND_LEGAL, () => {});

    const focused = document.activeElement as HTMLElement;
    expect(el.contains(focused)).toBe(true);
    expect(focused.textContent).toBe("No quiero");
  });

  it("falls back to the nearest surviving hand card when the focused card was played and is gone", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();
    const twoCards = baseView({
      self: { ...baseView().self, hand: [{ suit: "espada", rank: 1 }, { suit: "espada", rank: 2 }] },
    });
    const playBoth: readonly Action[] = [
      { type: "play-card", playerId: SELF, card: { suit: "espada", rank: 1 } },
      { type: "play-card", playerId: SELF, card: { suit: "espada", rank: 2 } },
    ];
    render(el, twoCards, playBoth, () => {});
    el.querySelector<HTMLButtonElement>('button[data-card="2-espada"]')!.focus();

    const oneCard = baseView({ self: { ...baseView().self, hand: [{ suit: "espada", rank: 1 }] } });
    render(el, oneCard, [{ type: "play-card", playerId: SELF, card: { suit: "espada", rank: 1 } }], () => {});

    const focused = document.activeElement as HTMLElement;
    expect(focused.dataset.card).toBe("1-espada");
  });

  it("falls back to the shell container — never <body> — when the focused action is no longer legal and nothing equivalent survives", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();
    render(el, PENDING_VIEW(), RESPOND_LEGAL, () => {});
    [...el.querySelectorAll<HTMLButtonElement>(".hexdev-truco-call")].find((b) => b.textContent === "Quiero")!.focus();

    // The call was answered: no pending call, opponent's turn, nothing legal.
    render(el, baseView({ hand: { ...baseView().hand!, turnSeat: 1 } }), [], () => {});

    expect(document.activeElement).toBe(el);
    expect(el.getAttribute("tabindex")).toBe("-1");
  });

  it("falls back to a surviving control with a DIFFERENT action (the region rung) when the equivalent control comes back unfocusable", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();
    // 2v2 so the señas node renders at all (view.teammates.length > 0).
    const view2v2 = (senasRemaining: number): PlayerView =>
      baseView({
        self: { ...baseView().self, senasRemaining },
        teammates: [{ playerId: "player-c" as PlayerId, seat: 2, cardsRemaining: 3, lastSena: null }],
        opponents: [
          { playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, cardsRemaining: 3 },
          { playerId: "player-d" as PlayerId, teamId: OPPONENT_TEAM, seat: 3, cardsRemaining: 3 },
        ],
      });
    const trucoCall: Action = { type: "call-truco", playerId: SELF, level: "truco" };
    render(el, view2v2(3), [{ type: "send-sena", playerId: SELF, signal: "asDeEspada" }, trucoCall], () => {});
    el.querySelector<HTMLButtonElement>('button[data-action="senas-toggle"]')!.focus();

    // The quota is spent: the toggle SURVIVES with its exact identity but
    // comes back disabled, so rung 1 finds it and is refused (focus() on a
    // disabled button does not take); rung 2's group selector is the same
    // string for an action-primary leaf and is deduped — only the region
    // rung (any [data-action] control in the same scope) is left, and it
    // lands on the surviving call button rather than <body>.
    render(el, view2v2(0), [trucoCall], () => {});

    const focused = document.activeElement as HTMLElement;
    expect(focused.dataset.action).toBe("call-truco");
  });

  it("restores focus to the rebuilt call-log list when it was the focused scroller", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();
    const withEvents = (): PlayerView =>
      baseView({
        hand: {
          ...baseView().hand!,
          callEvents: [{ kind: "truco-call", playerId: SELF, teamId: MY_TEAM, seat: 0, level: "truco" }] as readonly CallEvent[],
        },
      });
    render(el, withEvents(), [], () => {});
    // This harness renders at a phone width, where the rail is a drawer that
    // opens shut — so the log is display: none until someone opens it, and a
    // display: none list cannot take focus at all. Opened the way a player
    // would: by pressing the tab. That is also the only honest way to reach
    // the state this fence is about, since scrolling a log you cannot see is
    // not a thing anyone does.
    el.querySelector<HTMLElement>(".hexdev-truco-rail-tab")!.click();
    el.querySelector<HTMLElement>(".hexdev-truco-call-log-list")!.focus();

    render(el, withEvents(), [], () => {});

    // The drawer itself must survive the broadcast for the focus restore to
    // have anywhere to land — a drawer that slammed shut every few seconds
    // would take the focused scroller down with it, which is the same defect
    // this describe block exists for, one level up.
    expect(el.querySelector(".hexdev-truco-side-rail")?.getAttribute("data-open"), "the broadcast shut the drawer the player had opened").toBe("true");

    const focused = document.activeElement as HTMLElement;
    expect(focused.className).toBe("hexdev-truco-call-log-list");
    expect(el.contains(focused)).toBe(true);
  });
});

describe("the felt owns its focus indicator (2.4.7: a host CSS reset must not leave keyboard users with no ring at all)", () => {
  it("paints a 2px solid gold outline on a focused call button", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();
    const trucoCall: Action = { type: "call-truco", playerId: SELF, level: "truco" };
    render(el, baseView(), [trucoCall], () => {});

    const button = el.querySelector<HTMLButtonElement>(".hexdev-truco-call")!;
    button.focus();

    const style = getComputedStyle(button);
    expect(style.outlineWidth).toBe("2px");
    expect(style.outlineStyle).toBe("solid");
    // --hx-gold (#e8c877): a PRIVATE token, never part of the tenant theme
    // vocabulary, so no tenant value can drag this ring below 3:1 on the felt.
    expect(style.outlineColor).toBe("rgb(232, 200, 119)");
  });
});
