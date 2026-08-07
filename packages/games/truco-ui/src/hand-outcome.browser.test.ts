import { afterEach, describe, expect, it } from "vitest";
import type { TeamId } from "@hexdev/truco-engine";
import { renderHandOutcomeBanner } from "./hand-outcome.js";

const TEAM_A = "team-a" as TeamId;

let container: HTMLElement;

afterEach(() => {
  container.remove();
});

function freshContainer(): HTMLElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  return container;
}

describe("renderHandOutcomeBanner", () => {
  it("shows nothing when there is no event", () => {
    const el = freshContainer();

    renderHandOutcomeBanner(el, null);

    expect(el.textContent).toBe("");
    expect(el.dataset.result).toBeUndefined();
  });

  it("announces a win with the point delta, marked as 'won'", () => {
    const el = freshContainer();

    renderHandOutcomeBanner(el, { event: { winnerTeamId: TEAM_A, pointsDelta: 2 }, wonBySelf: true });

    expect(el.textContent).toContain("Ganaste la mano");
    expect(el.textContent).toContain("+2 tantos");
    expect(el.dataset.result).toBe("won");
  });

  it("announces a loss, marked as 'lost' — losing reads as a loss, not an error", () => {
    const el = freshContainer();

    renderHandOutcomeBanner(el, { event: { winnerTeamId: TEAM_A, pointsDelta: 1 }, wonBySelf: false });

    expect(el.textContent).toContain("Perdiste la mano");
    expect(el.textContent).toContain("+1 tanto");
    expect(el.dataset.result).toBe("lost");
  });

  it("clears back to empty on a subsequent null render", () => {
    const el = freshContainer();
    renderHandOutcomeBanner(el, { event: { winnerTeamId: TEAM_A, pointsDelta: 2 }, wonBySelf: true });

    renderHandOutcomeBanner(el, null);

    expect(el.textContent).toBe("");
    expect(el.dataset.result).toBeUndefined();
  });
});
