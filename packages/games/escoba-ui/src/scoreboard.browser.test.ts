import { afterEach, describe, expect, it } from "vitest";
import type { HandOutcome, HandScoreBreakdown, TeamId } from "@hexdev/escoba-engine";
import { describeHandBreakdown, renderEscobaHandBreakdown, renderEscobaScoreboard } from "./scoreboard.js";

let container: HTMLElement;

afterEach(() => {
  container.remove();
});

function freshContainer(): HTMLElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  return container;
}

const TEAM_A = "team-a" as TeamId;
const TEAM_B = "team-b" as TeamId;

function breakdown(overrides: Partial<HandScoreBreakdown> = {}): HandScoreBreakdown {
  return {
    cartas: { winner: TEAM_A },
    oros: { winner: null },
    setenta: { winner: null },
    sieteDeOro: { winner: null },
    escobas: { [TEAM_A]: 1, [TEAM_B]: 0 },
    points: { [TEAM_A]: 2, [TEAM_B]: 0 },
    ...overrides,
  };
}

describe("renderEscobaScoreboard (slice R1, part 1 — the running score, TEAM-keyed, never player-keyed)", () => {
  it("renders each team's score as real text content, against the fixed target of 30", () => {
    const el = freshContainer();
    renderEscobaScoreboard(el, [{ id: TEAM_A, score: 12 }, { id: TEAM_B, score: 8 }], TEAM_A);

    const groups = [...el.querySelectorAll<HTMLElement>("[data-team]")];
    expect(groups).toHaveLength(2);
    expect(groups[0]!.querySelector(".hexdev-escoba-scoreboard-score")?.textContent).toBe("12 / 30");
    expect(groups[1]!.querySelector(".hexdev-escoba-scoreboard-score")?.textContent).toBe("8 / 30");
  });

  it("renders exactly two team groups regardless of seat count — a 1v1 team of one uses the SAME component as a 2v2 pair", () => {
    const el = freshContainer();
    renderEscobaScoreboard(el, [{ id: TEAM_A, score: 0 }, { id: TEAM_B, score: 0 }], TEAM_B);
    expect(el.querySelectorAll("[data-team]")).toHaveLength(2);
  });
});

describe("renderEscobaHandBreakdown (slice R1, part 2 — the five categories, including the ones nobody won)", () => {
  it("renders nothing, and clears data-decided, while the hand is still in progress", () => {
    const el = freshContainer();
    renderEscobaHandBreakdown(el, null, TEAM_A);
    expect(el.dataset.decided).toBeUndefined();
    expect(el.children).toHaveLength(0);
  });

  it("renders all five categories once decided — a tied category reads 'nadie', not absent", () => {
    const el = freshContainer();
    const outcome: HandOutcome = { decided: true, breakdown: breakdown() };
    renderEscobaHandBreakdown(el, outcome, TEAM_A);

    expect(el.dataset.decided).toBe("true");
    const rows = [...el.querySelectorAll<HTMLElement>("[data-category]")];
    // cartas, oros, setenta, sieteDeOro, escobas x2 (one row per team) = 6
    expect(rows).toHaveLength(6);
    expect(el.querySelector("[data-category='cartas']")?.textContent).toContain("Nosotros");
    expect(el.querySelector("[data-category='oros']")?.textContent).toBe("Oros: nadie");
    expect(el.querySelector("[data-category='setenta']")?.textContent).toBe("La setenta: nadie");
  });

  it("puntaje menor (19.1): a real board where every category but siete de oro tied still renders sensibly", () => {
    const el = freshContainer();
    const outcome: HandOutcome = {
      decided: true,
      breakdown: {
        cartas: { winner: null },
        oros: { winner: null },
        setenta: { winner: null },
        sieteDeOro: { winner: TEAM_A },
        escobas: { [TEAM_A]: 0, [TEAM_B]: 0 },
        points: { [TEAM_A]: 1, [TEAM_B]: 0 },
      },
    };
    renderEscobaHandBreakdown(el, outcome, TEAM_A);

    expect(el.querySelector("[data-category='cartas']")?.textContent).toBe("Cartas: nadie");
    expect(el.querySelector("[data-category='oros']")?.textContent).toBe("Oros: nadie");
    expect(el.querySelector("[data-category='setenta']")?.textContent).toBe("La setenta: nadie");
    expect(el.querySelector("[data-category='sieteDeOro']")?.textContent).toContain("Nosotros");
    expect(el.querySelector(".hexdev-escoba-hand-breakdown-total")?.textContent).toContain("1 tanto");
  });

  it("clears back to empty once the next hand starts (outcome resets to null)", () => {
    const el = freshContainer();
    renderEscobaHandBreakdown(el, { decided: true, breakdown: breakdown() }, TEAM_A);
    renderEscobaHandBreakdown(el, null, TEAM_A);
    expect(el.dataset.decided).toBeUndefined();
    expect(el.children).toHaveLength(0);
  });
});

describe("describeHandBreakdown — the same breakdown as one spoken sentence, for the aria-live region", () => {
  it("mentions every category and the hand's point total, in one string the caller writes to a live region", () => {
    const outcome: HandOutcome = { decided: true, breakdown: breakdown() };
    if (!outcome.decided) throw new Error("unreachable");
    const spoken = describeHandBreakdown(outcome, TEAM_A);
    expect(spoken).toContain("Cartas");
    expect(spoken).toContain("Oros: nadie");
    expect(spoken).toContain("2 tantos");
  });
});
