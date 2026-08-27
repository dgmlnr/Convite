import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlayerId, PlayerView, TeamId } from "@hexdev/truco-engine";
import { MAX_SENAS_PER_HAND } from "@hexdev/truco-engine";
import { createGameUiRegistry } from "./game-ui-registry.js";

let container: HTMLElement;

afterEach(() => {
  container.remove();
  document.getElementById("hexdev-truco-matchstick-defs")?.remove();
  document.getElementById("hexdev-truco-table-styles")?.remove();
});

const SELF = "player-a" as PlayerId;
const view: PlayerView = {
  self: { playerId: SELF, teamId: "player-a:team" as TeamId, seat: 0, hand: [], lastSena: null, senasRemaining: MAX_SENAS_PER_HAND },
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

  it("forwards the payload's outcome and the given onPlayAgain callback into the real match-over overlay", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const registry = createGameUiRegistry();
    const render = registry.get("truco-argentino" as never)!.createRenderer();
    const onPlayAgain = vi.fn();

    render(container, { view, legalActions: [], outcome: { winnerIds: [SELF] } }, () => {}, onPlayAgain);
    container.querySelector<HTMLButtonElement>('button[data-action="play-again"]')!.click();

    expect(container.querySelector(".hexdev-truco-match-over")?.textContent).toContain("¡Ganaste la partida!");
    expect(onPlayAgain).toHaveBeenCalledOnce();
  });

  /**
   * Slice 4b — closing a gap Slice 4a left open: the renderer's own
   * signature grew `pendingConsult`/`consultAsk` params, but nothing in
   * THIS wiring forwarded the payload's own fields into them — so the badge
   * takeover and the ask block could never reach a real match, even though
   * every browser test that called the renderer directly kept passing. This
   * fences the WIRING itself, not the renderer's own handling of a value
   * it was handed directly.
   */
  it("forwards the payload's pendingConsult into the renderer — the badge takeover reaches a real match", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const registry = createGameUiRegistry();
    const render = registry.get("truco-argentino" as never)!.createRenderer();

    render(container, { view, legalActions: [], pendingConsult: { askerSeat: 0, deadline: Date.now() + 30_000 } }, () => {});

    const badge = container.querySelector(".hexdev-truco-turn-badge");
    expect(badge, "the badge takeover reaches a real match, not just a directly-handed fixture").not.toBeNull();
    expect(badge!.textContent).toContain("Consultando");
  });

  it("forwards the payload's consultAsk into the renderer, and routes an answer back through dispatch as a consult-answer message", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const registry = createGameUiRegistry();
    const render = registry.get("truco-argentino" as never)!.createRenderer();
    const dispatch = vi.fn();

    render(container, { view, legalActions: [], consultAsk: { about: "pending-call", options: ["quiero", "no-quiero"], deadline: Date.now() + 30_000 } }, dispatch);

    expect(container.querySelector('[data-role="consult-ask"]'), "the ask reaches the real table, not just a directly-handed fixture").not.toBeNull();
    container.querySelector<HTMLButtonElement>('[data-answer="quiero"]')!.click();

    expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: "consult-answer", about: "pending-call", answer: "quiero" });
  });
});
