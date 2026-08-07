import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlayerId, TeamId } from "@hexdev/truco-engine";
import { renderMatchOverOverlay } from "./match-outcome.js";

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
