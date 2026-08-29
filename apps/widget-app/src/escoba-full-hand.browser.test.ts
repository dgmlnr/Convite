import { describe, expect, it, vi } from "vitest";
import type { GameId } from "@hexdev/platform-contract";
import { applyAction, buildDeck, cardId, deal, getLegalActions, getViewFor, scoreHandBreakdown, settleLeftovers } from "@hexdev/escoba-engine";
import type { Card, MatchState, PlayCardAction, Player, PlayerId, Team, TeamId } from "@hexdev/escoba-engine";
import { createGameUiRegistry } from "./game-ui-registry.js";

/**
 * Slice Q.4 — the LIVE CHECKPOINT through the interface that now exists.
 * Drives a real deal/capture/hand-end score through
 * `createGameUiRegistry().get("escoba-de-15")!.createRenderer()`, the EXACT
 * entry point `main.ts`'s `enterMatch` calls — clicking real `<button>`s,
 * dispatching back into the real engine reducer.
 *
 * `@hexdev/escoba-engine` only, deliberately NOT `@hexdev/escoba-module`:
 * widget-app never depends on a `*-module` package (server-only — bot
 * creation, system-action dealing), so this file stays on the real seam a
 * live client crosses: view in, action out. No manual `pnpm dev` session
 * substitutes for this (no live server in this environment).
 */
const PLAYER_A = "widget-hand-a" as PlayerId;
const PLAYER_B = "widget-hand-b" as PlayerId;
const TEAM_A = "widget-hand-a:team" as TeamId;
const TEAM_B = "widget-hand-b:team" as TeamId;

function freshMatch(): MatchState {
  const teams: readonly [Team, Team] = [
    { id: TEAM_A, playerIds: [PLAYER_A], score: 0 },
    { id: TEAM_B, playerIds: [PLAYER_B], score: 0 },
  ];
  const players: readonly Player[] = [
    { id: PLAYER_A, teamId: TEAM_A, seat: 0, hand: [] },
    { id: PLAYER_B, teamId: TEAM_B, seat: 1, hand: [] },
  ];
  return { teams, players, dealerSeat: 0, hand: null, pointsToWin: 30 };
}

function mount(): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return container;
}

describe("Slice Q.4 checkpoint — a full escoba hand played end to end through the REAL escoba-ui renderer", () => {
  it("marks table cards and plays a hand card in one gesture; the real reducer's capture lands in the DOM piles, not a fixture's", () => {
    const state = deal(freshMatch(), buildDeck()); // deterministic: the deck's own declared order
    const acting = state.hand!.turn;
    const actingPlayer = state.players.find((player) => player.id === acting)!;
    const legal = getLegalActions(state, acting);
    const captureAction = legal.find((action) => action.captured.length > 0);
    expect(captureAction, "fixture setup: this deterministic deal must offer a real capture").toBeDefined();

    const render = createGameUiRegistry().get("escoba-de-15" as GameId)!.createRenderer();
    const container = mount();
    const dispatch = vi.fn();
    render(container, { view: getViewFor(state, acting), legalActions: legal }, dispatch);

    for (const captured of captureAction!.captured) {
      container.querySelector<HTMLButtonElement>(`.hexdev-escoba-table [data-card="${cardId(captured)}"]`)!.click();
    }
    container.querySelector<HTMLButtonElement>(`.hexdev-escoba-hand [data-card="${cardId(captureAction!.card)}"]`)!.click();

    expect(dispatch).toHaveBeenCalledExactlyOnceWith(captureAction);
    const result = applyAction(state, dispatch.mock.calls[0]![0] as PlayCardAction);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    render(container, { view: getViewFor(result.state, acting), legalActions: [] }, dispatch);
    for (const captured of captureAction!.captured) {
      expect(container.querySelector(`.hexdev-escoba-table [data-card="${cardId(captured)}"]`), "a captured card must leave the table").toBeNull();
    }
    const pile = container.querySelector<HTMLElement>(`.hexdev-escoba-pile[data-team="${actingPlayer.teamId}"]`);
    expect(pile?.querySelector(`[data-card="${cardId(captureAction!.card)}"]`), "the played card must reach the acting player's TEAM pile").not.toBeNull();
    for (const captured of captureAction!.captured) {
      expect(pile?.querySelector(`[data-card="${cardId(captured)}"]`), "every captured card must reach the pile too").not.toBeNull();
    }
  });

  /** Slice R2a — same hand-end fixture shape as L.6's own "leftovers go to
   * the last capturer" test — a real siete de oro pile, so scoring resolves
   * to a nonzero total — driven through the REAL renderer, asserting the
   * score and the breakdown behind it are actually ON SCREEN, never just
   * against `decided.teams[...].score` (the gap Slice Q's own sweep found).
   * `scoreHandBreakdown` is `escoba-engine`'s own single source of truth for
   * WHY the score moved — never re-derived here. */
  it("a decided hand shows the score and explains why it moved, through the REAL renderer", () => {
    const teamAPile: readonly Card[] = [
      { suit: "oro", rank: 1 },
      { suit: "oro", rank: 2 },
      { suit: "oro", rank: 3 },
      { suit: "oro", rank: 4 },
      { suit: "oro", rank: 5 },
      { suit: "oro", rank: 6 },
      { suit: "oro", rank: 7 }, // siete de oro — always resolves
    ];
    const leftover: Card = { suit: "espada", rank: 4 };
    const lastCard: Card = { suit: "copa", rank: 2 }; // 4+2=6, no forming 15 — a legal, non-forming play
    const created = freshMatch();
    const almostDone: MatchState = {
      ...created,
      players: created.players.map((player) => (player.id === PLAYER_B ? { ...player, hand: [lastCard] } : player)),
      hand: { table: [leftover], stock: [], piles: { [TEAM_A]: teamAPile, [TEAM_B]: [] }, escobas: { [TEAM_A]: 0, [TEAM_B]: 0 }, turn: PLAYER_B, lastCapturer: TEAM_A, outcome: { decided: false } },
    };

    const result = applyAction(almostDone, { type: "play-card", playerId: PLAYER_B, card: lastCard, captured: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const settled = settleLeftovers(result.state);
    const breakdown = scoreHandBreakdown(settled.hand!, [TEAM_A, TEAM_B]);
    const decided: MatchState = {
      ...settled,
      teams: [{ ...settled.teams[0], score: settled.teams[0].score + breakdown.points[TEAM_A]! }, { ...settled.teams[1], score: settled.teams[1].score + breakdown.points[TEAM_B]! }],
      hand: { ...settled.hand!, outcome: { decided: true, breakdown } },
    };
    expect(decided.teams[0].score, "fixture setup: cartas+oros+siete de oro must all resolve").toBe(3);

    const render = createGameUiRegistry().get("escoba-de-15" as GameId)!.createRenderer();
    const container = mount();
    render(container, { view: getViewFor(decided, PLAYER_A), legalActions: [] }, () => {});

    const scoreboard = container.querySelector(".hexdev-escoba-scoreboard");
    expect(scoreboard?.textContent, "the score must be visible, not asserted only against engine state").toContain("3");

    const breakdownPanel = container.querySelector<HTMLElement>(".hexdev-escoba-hand-breakdown");
    expect(breakdownPanel?.dataset.decided, "why the score moved must be visible too, not just the total").toBe("true");
    expect(breakdownPanel?.textContent).toContain("Oros");
  });
});
