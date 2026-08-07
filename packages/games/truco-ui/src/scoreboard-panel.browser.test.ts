import { afterEach, describe, expect, it } from "vitest";
import type { TeamId } from "@hexdev/truco-engine";
import { renderScoreboardPanel } from "./scoreboard-panel.js";

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

const SELF_TEAM = "player-a:team" as TeamId;
const OPPONENT_TEAM = "player-b:team" as TeamId;

describe("renderScoreboardPanel — the tanteador's own home, beside the play, not inside it", () => {
  it("renders one scoreboard per team, each labeled 'Nosotros'/'Ellos' relative to the local player", () => {
    const el = freshContainer();

    renderScoreboardPanel(el, {
      teams: [
        { id: SELF_TEAM, score: 4 },
        { id: OPPONENT_TEAM, score: 2 },
      ],
      selfTeamId: SELF_TEAM,
      target: 30,
    });

    const labels = [...el.querySelectorAll<HTMLElement>(".hexdev-truco-team-label")].map((l) => l.textContent);
    expect(labels).toEqual(["Nosotros", "Ellos"]);
    expect(el.querySelectorAll(".hexdev-truco-scoreboard")).toHaveLength(2);
  });

  it("stamps its own chrome class, distinct from the felt table — the scoreboard is chrome, never the cloth", () => {
    const el = freshContainer();

    renderScoreboardPanel(el, { teams: [{ id: SELF_TEAM, score: 0 }], selfTeamId: SELF_TEAM, target: 15 });

    expect(el.className).toBe("hexdev-truco-scoreboard-panel");
  });

  it("is idempotent — repeated renders never accumulate duplicate scoreboards", () => {
    const el = freshContainer();
    const options = { teams: [{ id: SELF_TEAM, score: 1 }], selfTeamId: SELF_TEAM, target: 15 as const };

    renderScoreboardPanel(el, options);
    renderScoreboardPanel(el, options);

    expect(el.querySelectorAll(".hexdev-truco-scoreboard")).toHaveLength(1);
  });
});
