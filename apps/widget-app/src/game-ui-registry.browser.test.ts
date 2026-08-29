import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameId } from "@hexdev/platform-contract";
import type { PlayerId, PlayerView, TeamId } from "@hexdev/truco-engine";
import { MAX_SENAS_PER_HAND } from "@hexdev/truco-engine";
import type { PlayCardAction as EscobaPlayCardAction, PlayerId as EscobaPlayerId, PlayerView as EscobaPlayerView, TeamId as EscobaTeamId } from "@hexdev/escoba-engine";
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

/** Unit O — closes the deviation note Slice M left on ESCOBA_FAMILY: escoba
 * now has a real GameUiEntry, and enterMatch resolves it instead of
 * falling back to renderUnsupportedGame. Proves the wiring boundary Unit
 * N's static table and this unit's own piles component are reachable from
 * the exact registry path enterMatch calls. Unit P's own interaction fence
 * follows immediately below, inside this same describe block. */
describe("escoba's registered renderer — the real wiring boundary from a generic { view } payload to the table and piles (Unit O)", () => {
  const ESCOBA_SELF = "player-a" as EscobaPlayerId;
  const ESCOBA_TEAM_A = "team-a" as EscobaTeamId;
  const ESCOBA_TEAM_B = "team-b" as EscobaTeamId;
  const escobaView: EscobaPlayerView = {
    self: { playerId: ESCOBA_SELF, teamId: ESCOBA_TEAM_A, seat: 0, hand: [] },
    others: [],
    teams: [
      { id: ESCOBA_TEAM_A, score: 0 },
      { id: ESCOBA_TEAM_B, score: 0 },
    ],
    hand: {
      table: [{ suit: "oro", rank: 5 }],
      piles: { [ESCOBA_TEAM_A]: [{ suit: "espada", rank: 3 }], [ESCOBA_TEAM_B]: [] },
      escobas: { [ESCOBA_TEAM_A]: 0, [ESCOBA_TEAM_B]: 0 },
      turn: ESCOBA_SELF,
      stockCount: 20,
      outcome: { decided: false },
    },
    dealerSeat: 0,
  };

  it("has entries for BOTH escoba GameIds, sharing the one family", () => {
    const registry = createGameUiRegistry();

    expect(registry.get("escoba-de-15" as GameId)).not.toBeUndefined();
    expect(registry.get("escoba-de-15-2v2" as GameId)).not.toBeUndefined();
    expect(registry.family("escoba-de-15" as GameId)).toBe(registry.family("escoba-de-15-2v2" as GameId));
  });

  it("renders the real table and piles into the container from an opaque payload", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const registry = createGameUiRegistry();
    const render = registry.get("escoba-de-15" as GameId)!.createRenderer();

    render(container, { view: escobaView, legalActions: [] }, () => {});

    expect(container.className).toBe("hexdev-escoba-match");
    expect(container.querySelector('.hexdev-escoba-table [data-card="5-oro"]'), "the table renders the payload's own view").not.toBeNull();
    const pile = container.querySelector<HTMLElement>('.hexdev-escoba-pile[data-team="team-a"]');
    expect(pile?.dataset.count, "the piles render the payload's own view too, not a placeholder").toBe("1");
  });

  /** Unit P — the real wiring boundary `enterMatch` now exercises: mark the
   * table's own 5-oro, then play a hand card, in ONE gesture, through the
   * EXACT `createRenderer()` entry-point live matches use. */
  it("marking the table's forming card then playing the hand card dispatches ONE real PlayCardAction, no intermediate dialog", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const registry = createGameUiRegistry();
    const render = registry.get("escoba-de-15" as GameId)!.createRenderer();
    const dispatch = vi.fn();
    const REY_ESPADA = { suit: "espada", rank: 12 } as const; // value 10, target 15-10=5 -> the table's own 5-oro
    const view: EscobaPlayerView = { ...escobaView, self: { ...escobaView.self, hand: [REY_ESPADA] } };
    const legalActions: readonly EscobaPlayCardAction[] = [{ type: "play-card", playerId: ESCOBA_SELF, card: REY_ESPADA, captured: [{ suit: "oro", rank: 5 }] }];

    render(container, { view, legalActions }, dispatch);
    container.querySelector<HTMLButtonElement>('.hexdev-escoba-table [data-card="5-oro"]')!.click();
    container.querySelector<HTMLButtonElement>('.hexdev-escoba-hand [data-card="12-espada"]')!.click();

    expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: "play-card", playerId: ESCOBA_SELF, card: REY_ESPADA, captured: [{ suit: "oro", rank: 5 }] });
  });
});
