import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlayerId, PlayerView, TeamId } from "@hexdev/truco-engine";
import { createGameUiRegistry } from "./game-ui-registry.js";

let container: HTMLElement;

afterEach(() => {
  container.remove();
  document.getElementById("hexdev-truco-matchstick-defs")?.remove();
  document.getElementById("hexdev-truco-table-styles")?.remove();
});

const SELF = "player-a" as PlayerId;
const view: PlayerView = {
  self: { playerId: SELF, teamId: "player-a:team" as TeamId, seat: 0, hand: [] },
  teammates: [],
  opponents: [],
  teams: [{ id: "player-a:team" as TeamId, score: 0 }],
  hand: null,
  config: { pointsToWin: 15 },
  dealerSeat: 0,
};

describe("truco's registered renderer — the real wiring boundary from a generic { view, legalActions } payload to the typed table", () => {
  it("renders the real game table into the container from an opaque payload", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const registry = createGameUiRegistry();
    const render = registry.get("truco-argentino" as never)!.createRenderer();

    render(container, { view, legalActions: [] }, () => {});

    expect(container.className).toBe("hexdev-truco-table-shell");
    expect(container.querySelector('[data-position="bottom"]')).not.toBeNull();
  });

  it("forwards a dispatched action to the given dispatch callback unchanged", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const registry = createGameUiRegistry();
    const render = registry.get("truco-argentino" as never)!.createRenderer();
    const dispatch = vi.fn();
    const legalActions = [{ type: "call-truco" as const, playerId: SELF, level: "truco" as const }];

    render(container, { view, legalActions }, dispatch);
    container.querySelector<HTMLButtonElement>(".hexdev-truco-call")!.click();

    expect(dispatch).toHaveBeenCalledExactlyOnceWith(legalActions[0]);
  });
});
