import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlayerId, TeamId } from "@hexdev/truco-engine";
import { describeMatchOutcome, renderMatchOverOverlay } from "./match-outcome.js";

const SELF = "self-player" as PlayerId;
const OPPONENT = "opponent-player" as PlayerId;
const TEAM_A = "team-a" as TeamId;
const TEAM_B = "team-b" as TeamId;

let container: HTMLElement;

afterEach(() => {
  container.remove();
});

function freshContainer(): HTMLElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  return container;
}

describe("renderMatchOverOverlay (spec: 'a real ending — who won, the final score, and a way to play again')", () => {
  it("renders nothing while the match is still in progress", () => {
    const el = freshContainer();

    renderMatchOverOverlay(el, null);

    expect(el.textContent).toBe("");
  });

  it("announces a win when the local player's id is among the winners", () => {
    const el = freshContainer();

    renderMatchOverOverlay(el, {
      outcome: { winnerIds: [SELF] },
      selfPlayerId: SELF,
      teams: [
        { id: TEAM_A, score: 15 },
        { id: TEAM_B, score: 8 },
      ],
      selfTeamId: TEAM_A,
      onPlayAgain: () => {},
    });

    expect(el.textContent).toContain("¡Ganaste la partida!");
    expect(el.dataset.result).toBe("won");
  });

  it("announces a loss when the local player's id is not among the winners — reads as a loss, not an error", () => {
    const el = freshContainer();

    renderMatchOverOverlay(el, {
      outcome: { winnerIds: [OPPONENT] },
      selfPlayerId: SELF,
      teams: [
        { id: TEAM_A, score: 8 },
        { id: TEAM_B, score: 15 },
      ],
      selfTeamId: TEAM_A,
      onPlayAgain: () => {},
    });

    expect(el.textContent).toContain("Perdiste la partida");
    expect(el.dataset.result).toBe("lost");
  });

  it("shows the final score for both teams, read straight from the view's own teams — never re-derived", () => {
    const el = freshContainer();

    renderMatchOverOverlay(el, {
      outcome: { winnerIds: [SELF] },
      selfPlayerId: SELF,
      teams: [
        { id: TEAM_A, score: 15 },
        { id: TEAM_B, score: 9 },
      ],
      selfTeamId: TEAM_A,
      onPlayAgain: () => {},
    });

    expect(el.textContent).toContain("15");
    expect(el.textContent).toContain("9");
  });

  it("offers a play-again button that invokes the given callback", () => {
    const el = freshContainer();
    const onPlayAgain = vi.fn();

    renderMatchOverOverlay(el, {
      outcome: { winnerIds: [SELF] },
      selfPlayerId: SELF,
      teams: [
        { id: TEAM_A, score: 15 },
        { id: TEAM_B, score: 8 },
      ],
      selfTeamId: TEAM_A,
      onPlayAgain,
    });
    el.querySelector<HTMLButtonElement>('button[data-action="play-again"]')?.click();

    expect(onPlayAgain).toHaveBeenCalledOnce();
  });

  it("clears back to empty on a subsequent null render", () => {
    const el = freshContainer();
    renderMatchOverOverlay(el, {
      outcome: { winnerIds: [SELF] },
      selfPlayerId: SELF,
      teams: [{ id: TEAM_A, score: 15 }],
      selfTeamId: TEAM_A,
      onPlayAgain: () => {},
    });

    renderMatchOverOverlay(el, null);

    expect(el.textContent).toBe("");
  });
});

/**
 * GREEN FROM BIRTH — a coverage pin, not a fix. `describeMatchOutcome` had no
 * test of its own at all (Tanda 1 SUGGESTION), and its draw branch was the
 * uncovered half of an uncovered function: `winnerIds: []` is structurally
 * allowed by platform-contract's own `MatchOutcome`, and `includes(self)` is
 * false there exactly as it is for a loss — so a future edit that dropped the
 * `isDraw` check would announce "Perdiste la partida" to BOTH sides of a match
 * nobody lost, silently, in the one place a screen-reader user cannot check
 * against the screen.
 *
 * The visible overlay's own draw branch is already fenced above; this is the
 * SPOKEN half, which the overlay cannot cover — the overlay is rebuilt per
 * render and therefore silent by construction (announcer.ts).
 */
describe("describeMatchOutcome — the ending as one spoken sentence", () => {
  const TEAMS = [
    { id: TEAM_A, score: 15 },
    { id: TEAM_B, score: 12 },
  ] as const;

  function outcomeFor(winnerIds: readonly PlayerId[]): string {
    return describeMatchOutcome({ outcome: { winnerIds }, selfPlayerId: SELF, teams: TEAMS, selfTeamId: TEAM_A, onPlayAgain: () => {} });
  }

  it("says nobody won when winnerIds is empty, never the loss wording an empty list also satisfies", () => {
    expect(outcomeFor([])).toBe("Partida finalizada, Resultado final: Nosotros 15 — Ellos 12");
  });

  it("still distinguishes a real win from a real loss, so the draw branch is not swallowing them", () => {
    expect(outcomeFor([SELF])).toContain("¡Ganaste la partida!");
    expect(outcomeFor([OPPONENT])).toContain("Perdiste la partida");
  });

  it("speaks the SAME score line the overlay paints — one source, so the two can never disagree", () => {
    const el = freshContainer();

    renderMatchOverOverlay(el, { outcome: { winnerIds: [] }, selfPlayerId: SELF, teams: TEAMS, selfTeamId: TEAM_A, onPlayAgain: () => {} });

    const painted = el.querySelector<HTMLElement>(".hexdev-truco-match-over-score")!.textContent!;
    expect(outcomeFor([])).toContain(painted);
  });
});
