import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlayerId, TeamId } from "@hexdev/escoba-engine";
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

describe("renderMatchOverOverlay (slice R2: 'a finished match must name the winner and offer a way out')", () => {
  it("renders nothing while the match is still in progress, and clears back to empty afterwards", () => {
    const el = freshContainer();
    renderMatchOverOverlay(el, null);
    expect(el.textContent).toBe("");

    renderMatchOverOverlay(el, { outcome: { winnerIds: [SELF] }, selfPlayerId: SELF, teams: [{ id: TEAM_A, score: 30 }], selfTeamId: TEAM_A, onPlayAgain: () => {} });
    renderMatchOverOverlay(el, null);
    expect(el.textContent).toBe("");
  });

  it("states the win/loss in text, marks data-result, and moves focus onto the overlay only when it just opened", () => {
    const el = freshContainer();
    const props = {
      outcome: { winnerIds: [SELF] },
      selfPlayerId: SELF,
      teams: [
        { id: TEAM_A, score: 30 },
        { id: TEAM_B, score: 18 },
      ],
      selfTeamId: TEAM_A,
      onPlayAgain: () => {},
    };
    renderMatchOverOverlay(el, { ...props, focusOnOpen: true });
    expect(el.textContent).toContain("¡Ganaste la partida!");
    expect(el.textContent).toContain("30");
    expect(el.textContent).toContain("18");
    expect(el.dataset.result).toBe("won");
    expect(document.activeElement, "the most disruptive thing this UI does must not leave focus behind").toBe(el);

    (document.activeElement as HTMLElement | null)?.blur();
    renderMatchOverOverlay(el, { ...props, outcome: { winnerIds: [OPPONENT] }, focusOnOpen: false });
    expect(el.textContent).toContain("Perdiste la partida");
    expect(el.dataset.result).toBe("lost");
    expect(document.activeElement, "a re-render must not steal focus back").not.toBe(el);
  });

  it("offers a way out of the table: a leave button and Escape both call it; play-again calls its own callback", () => {
    const el = freshContainer();
    const onPlayAgain = vi.fn();
    const onLeaveMatch = vi.fn();
    renderMatchOverOverlay(el, { outcome: { winnerIds: [SELF] }, selfPlayerId: SELF, teams: [{ id: TEAM_A, score: 30 }], selfTeamId: TEAM_A, onPlayAgain, onLeaveMatch });

    el.querySelector<HTMLButtonElement>('button[data-action="play-again"]')!.click();
    expect(onPlayAgain).toHaveBeenCalledOnce();

    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(onLeaveMatch).toHaveBeenCalledOnce();
    el.querySelector<HTMLButtonElement>('button[data-action="leave-match"]')!.click();
    expect(onLeaveMatch).toHaveBeenCalledTimes(2);
  });

  it("renders no leave button and no Escape handler when the caller has nowhere to send the player", () => {
    const el = freshContainer();
    renderMatchOverOverlay(el, { outcome: { winnerIds: [SELF] }, selfPlayerId: SELF, teams: [{ id: TEAM_A, score: 30 }], selfTeamId: TEAM_A, onPlayAgain: () => {} });

    expect(el.querySelector('button[data-action="leave-match"]')).toBeNull();
    expect(() => el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))).not.toThrow();
  });
});

describe("describeMatchOutcome — the ending as one spoken sentence, same content the overlay paints", () => {
  it("speaks the SAME score line the overlay paints, and a draw reads as neither a win nor a loss", () => {
    const el = freshContainer();
    const props = {
      outcome: { winnerIds: [] as readonly PlayerId[] },
      selfPlayerId: SELF,
      teams: [
        { id: TEAM_A, score: 30 },
        { id: TEAM_B, score: 24 },
      ],
      selfTeamId: TEAM_A,
      onPlayAgain: () => {},
    };
    renderMatchOverOverlay(el, props);

    const painted = el.querySelector<HTMLElement>(".hexdev-escoba-match-over-score")!.textContent!;
    expect(describeMatchOutcome(props)).toContain(painted);
    expect(describeMatchOutcome(props)).toContain("Partida finalizada");
  });
});
