/**
 * The table's remaining SILENT moments, fenced shut (WCAG audit, tanda 1).
 *
 * Four things a sighted player reads off this table reached a screen reader
 * as nothing at all: a pending Truco/Envido (the turn announcer deliberately
 * yields to the banner — and the banner is a rebuilt node, which announces
 * nothing), the matchstick score (SVG-only), an opponent's card count
 * (decorative backs only), and the trick/match endings (a rebuilt <p> and a
 * silent overlay). Every fix keeps the two house rules the existing four
 * announcers already live by: a live region is created once per mount and
 * never rebuilt (announcer.ts), and hidden text is clip-rect hidden — never
 * display: none — so it costs the height fences nothing and the visual
 * baselines not one byte.
 */
import { afterEach, describe, expect, it } from "vitest";
import type { Action, PlayerId, PlayerView, TeamId } from "@hexdev/truco-engine";
import { MAX_SENAS_PER_HAND } from "@hexdev/truco-engine";
import { createMatchTableRenderer } from "./table.js";

const SELF = "player-a" as PlayerId;
const OPPONENT = "player-b" as PlayerId;
const MY_TEAM = "player-a:team" as TeamId;
const OPPONENT_TEAM = "player-b:team" as TeamId;

let container: HTMLElement;

afterEach(() => {
  container.remove();
  document.getElementById("hexdev-truco-matchstick-defs")?.remove();
  document.getElementById("hexdev-truco-table-styles")?.remove();
});

function freshContainer(): HTMLElement {
  container = document.createElement("div");
  container.style.width = "700px";
  document.body.appendChild(container);
  return container;
}

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

const regionOf = (el: HTMLElement, name: string): HTMLElement => el.querySelector<HTMLElement>(`[data-announces="${name}"]`)!;

/** The house clip-rect treatment: out of flow and clipped, never display:
 * none (which would drop the node from the accessibility tree and silence
 * it), never a painted box (which would move a height fence or a visual
 * baseline). Same assertions the turn-clock announcement suite pins. */
function expectClipRectHidden(el: HTMLElement): void {
  const style = getComputedStyle(el);
  expect(style.display).not.toBe("none");
  expect(style.visibility).not.toBe("hidden");
  expect(style.position).toBe("absolute");
  expect(style.clipPath).toBe("inset(50%)");
  expect(el.getBoundingClientRect().width).toBeLessThanOrEqual(1);
}

describe("pending-call announcements — the banner is a rebuilt node, so a fifth region must say what it shows (B1, 4.1.3)", () => {
  it("announces the level, the caller, and that I owe the answer — the exact vocabulary the banner renders", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();
    const view = baseView({ hand: { ...baseView().hand!, truco: { status: "pending", level: "truco", callingTeamId: OPPONENT_TEAM } } });
    const legal: readonly Action[] = [{ type: "respond-truco", playerId: SELF, response: "quiero" }];

    render(el, view, legal, () => {});

    expect(regionOf(el, "pending-call").textContent).toBe("Truco, Cantó: Ellos, Tu turno de responder");
  });

  it("announces an envido call by my own team as waiting on the rival — nothing for me to answer", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();
    const view = baseView({
      hand: { ...baseView().hand!, envido: { status: "pending", calls: ["faltaEnvido"], callingTeamId: MY_TEAM } },
    });

    render(el, view, [], () => {});

    expect(regionOf(el, "pending-call").textContent).toBe("Falta envido, Cantó: Nosotros, Esperando al rival");
  });

  it("does not re-announce the same standing call on a re-broadcast — the region's text node survives untouched", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();
    const pending = baseView({ hand: { ...baseView().hand!, truco: { status: "pending", level: "truco", callingTeamId: OPPONENT_TEAM } } });
    const legal: readonly Action[] = [{ type: "respond-truco", playerId: SELF, response: "quiero" }];

    render(el, pending, legal, () => {});
    const region = regionOf(el, "pending-call");
    const textNode = region.firstChild;

    render(el, pending, legal, () => {});

    expect(region.textContent).toBe("Truco, Cantó: Ellos, Tu turno de responder");
    expect(region.firstChild, "an unchanged announcement must not have its text node replaced").toBe(textNode);
  });

  it("an escalation REPLACES the pending call, and the replacement is announced — retruco is news, truco was already said", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();
    const truco = baseView({ hand: { ...baseView().hand!, truco: { status: "pending", level: "truco", callingTeamId: OPPONENT_TEAM } } });
    const retruco = baseView({ hand: { ...baseView().hand!, truco: { status: "pending", level: "retruco", callingTeamId: MY_TEAM } } });

    render(el, truco, [], () => {});
    render(el, retruco, [], () => {});

    expect(regionOf(el, "pending-call").textContent).toBe("Retruco, Cantó: Nosotros, Esperando al rival");
  });

  it("hands back to the turn announcer on resolution: the call region empties as a silent removal, the turn is said exactly once", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();
    const pending = baseView({ hand: { ...baseView().hand!, truco: { status: "pending", level: "truco", callingTeamId: OPPONENT_TEAM } } });

    render(el, baseView(), [], () => {}); // mount: my turn, announced
    render(el, pending, [], () => {}); // call opens: turn region yields to the call region
    const turnRegion = regionOf(el, "turn");
    expect(turnRegion.textContent).toBe("");

    // Every write from here on is a mutation record — exactly ONE may land on
    // the turn region when the call resolves: the resumed turn. A second
    // record would be the double-announcement this handover must not produce.
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((batch) => records.push(...batch));
    observer.observe(turnRegion, { childList: true, characterData: true, subtree: true });

    render(el, baseView(), [], () => {}); // quiero — the call clears, play resumes

    records.push(...observer.takeRecords());
    observer.disconnect();
    expect(regionOf(el, "pending-call").textContent).toBe("");
    expect(turnRegion.textContent).toBe("Tu turno");
    expect(records, "resolution must produce exactly one turn announcement, never a double").toHaveLength(1);
  });
});

describe("trick and match endings — a rebuilt <p> and a silent overlay, routed through real regions (B6, 4.1.3)", () => {
  const trickWon = (): PlayerView =>
    baseView({
      hand: { ...baseView().hand!, turnSeat: 1, trickOutcomes: [{ winnerTeamId: MY_TEAM }] },
    });

  it("announces the trick outcome the moment a trick resolves — the same sentence the visible feedback line shows", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();

    render(el, baseView(), [], () => {}); // mount: no trick decided yet
    render(el, trickWon(), [], () => {});

    expect(regionOf(el, "trick").textContent).toBe("Ganaste la baza");
  });

  it("does not re-announce a standing trick outcome on a re-broadcast — the region's text node survives untouched", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();

    render(el, baseView(), [], () => {});
    render(el, trickWon(), [], () => {});
    const region = regionOf(el, "trick");
    const textNode = region.firstChild;

    render(el, trickWon(), [], () => {});

    expect(region.textContent).toBe("Ganaste la baza");
    expect(region.firstChild, "an unchanged announcement must not have its text node replaced").toBe(textNode);
  });

  it("a trick resolving and the hand ending in the SAME broadcast speak from separate regions — neither clobbers the other", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();

    render(el, baseView(), [], () => {});
    render(
      el,
      baseView({
        hand: {
          ...baseView().hand!,
          trickOutcomes: [{ winnerTeamId: MY_TEAM }, { winnerTeamId: MY_TEAM }],
          outcome: { decided: true, winnerTeamId: MY_TEAM },
        },
        teams: [
          { id: MY_TEAM, score: 6 },
          { id: OPPONENT_TEAM, score: 2 },
        ],
      }),
      [],
      () => {},
    );

    expect(regionOf(el, "trick").textContent).toBe("Ganaste la baza");
    expect(regionOf(el, "hand-outcome").textContent).toBe("Ganaste la mano, +2 tantos");
  });

  it("announces the match ending as ONE statement — the result and the final score together", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();

    render(el, baseView(), [], () => {}, { outcome: { winnerIds: [SELF] } });

    expect(regionOf(el, "match-over").textContent).toBe("¡Ganaste la partida!, Resultado final: Nosotros 4 — Ellos 2");
  });

  it("does not re-announce the match ending on a re-broadcast — the region's text node survives untouched", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();

    render(el, baseView(), [], () => {}, { outcome: { winnerIds: [OPPONENT] } });
    const region = regionOf(el, "match-over");
    expect(region.textContent).toBe("Perdiste la partida, Resultado final: Nosotros 4 — Ellos 2");
    const textNode = region.firstChild;

    render(el, baseView(), [], () => {}, { outcome: { winnerIds: [OPPONENT] } });

    expect(region.firstChild, "an unchanged announcement must not have its text node replaced").toBe(textNode);
  });
});

describe("score text alternative — the matchsticks are a picture of a number, the number itself must be text (B2, 1.1.1)", () => {
  it("carries a clip-rect-hidden numeric total per team that tracks the score, while the casita SVGs go decorative", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();

    render(el, baseView(), [], () => {});

    const totals = [...el.querySelectorAll<HTMLElement>("[data-score-total]")];
    expect(totals.map((t) => t.textContent)).toEqual(["4 tantos", "2 tantos"]);
    for (const total of totals) expectClipRectHidden(total);
    for (const sticks of el.querySelectorAll(".hexdev-truco-score-sticks")) {
      expect(sticks.getAttribute("aria-hidden"), "the casitas are a decorative rendering of the number beside them").toBe("true");
    }

    render(el, baseView({ teams: [{ id: MY_TEAM, score: 12 }, { id: OPPONENT_TEAM, score: 9 }] }), [], () => {});

    expect([...el.querySelectorAll<HTMLElement>("[data-score-total]")].map((t) => t.textContent)).toEqual(["12 tantos", "9 tantos"]);
  });
});

describe("hidden-hand text alternative — N decorative backs must also be the number N in text (B7, 1.1.1)", () => {
  it("carries a clip-rect-hidden card count on the opponent's hand, while the backs go decorative", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();

    render(el, baseView(), [], () => {});

    const count = el.querySelector<HTMLElement>('[data-position="top"] [data-card-count]')!;
    expect(count.textContent).toBe("3 cartas");
    expectClipRectHidden(count);
    const backs = el.querySelectorAll<HTMLElement>('[data-position="top"] [data-card-back]');
    expect(backs).toHaveLength(3);
    for (const back of backs) {
      expect(back.getAttribute("aria-hidden"), "a back carries no information the count text does not already say").toBe("true");
    }
  });
});

/** GREEN-FROM-BIRTH PIN: nothing below fails today — it fences the redaction
 * property the new regions must never erode. An opponent's view structurally
 * carries no seña (the engine redacts before the wire; OpponentView has no
 * lastSena field at all), so the only way a seña could reach their ears is a
 * UI announcer inventing one. Drive an opponent-perspective view through
 * every announcing state this table has and record every word every region
 * ever speaks: seña vocabulary must never appear. */
describe("redaction fence — a seña never reaches an opponent's ears in any announcement", () => {
  const SENA_WORDS = ["As de espada", "As de basto", "7 de espada", "7 de oro", "Seña", "seña"];

  it("announces pending calls, tricks, hand and match endings to an opponent without ever voicing seña vocabulary", () => {
    const el = freshContainer();
    const render = createMatchTableRenderer();
    // The OPPONENT's own perspective: self on the other team, the original
    // players now on the far side of the redaction fence.
    const opponentPerspective = (overrides: Partial<PlayerView> = {}): PlayerView =>
      baseView({
        self: { playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, hand: [{ suit: "basto", rank: 3 }], lastSena: null, senasRemaining: MAX_SENAS_PER_HAND },
        teammates: [],
        opponents: [{ playerId: SELF, teamId: MY_TEAM, seat: 0, cardsRemaining: 3 }],
        ...overrides,
      });

    render(el, opponentPerspective(), [], () => {});
    const spoken: string[] = [];
    const observer = new MutationObserver(() => {
      for (const region of el.querySelectorAll<HTMLElement>("[data-announces]")) {
        if (region.textContent !== "") spoken.push(region.textContent!);
      }
    });
    for (const region of el.querySelectorAll<HTMLElement>("[data-announces]")) {
      observer.observe(region, { childList: true, characterData: true, subtree: true });
      if (region.textContent !== "") spoken.push(region.textContent!);
    }

    render(el, opponentPerspective({ hand: { ...baseView().hand!, truco: { status: "pending", level: "truco", callingTeamId: MY_TEAM } } }), [], () => {});
    render(el, opponentPerspective({ hand: { ...baseView().hand!, turnSeat: 0, trickOutcomes: [{ winnerTeamId: MY_TEAM }] } }), [], () => {});
    render(
      el,
      opponentPerspective({
        hand: { ...baseView().hand!, trickOutcomes: [{ winnerTeamId: MY_TEAM }, { winnerTeamId: MY_TEAM }], outcome: { decided: true, winnerTeamId: MY_TEAM } },
        teams: [
          { id: MY_TEAM, score: 6 },
          { id: OPPONENT_TEAM, score: 2 },
        ],
      }),
      [],
      () => {},
    );
    render(el, opponentPerspective(), [], () => {}, { outcome: { winnerIds: [SELF] } });
    observer.disconnect();

    expect(spoken.length, "the drive above must actually announce — a silent run would fence nothing").toBeGreaterThan(0);
    for (const sentence of spoken) {
      for (const word of SENA_WORDS) {
        expect(sentence, "an announcement must never carry seña vocabulary into an opponent's view").not.toContain(word);
      }
    }
  });
});
