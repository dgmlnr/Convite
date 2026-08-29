import { describe, expect, it, vi } from "vitest";
import type { GameId } from "@hexdev/platform-contract";
import { applyAction, buildDeck, cardId, deal, getLegalActions, getViewFor, scoreHand, settleLeftovers } from "@hexdev/escoba-engine";
import type { Card, MatchState, PlayCardAction, Player, PlayerId, Team, TeamId } from "@hexdev/escoba-engine";
import { createGameUiRegistry } from "./game-ui-registry.js";

/**
 * Slice Q.4 — the LIVE CHECKPOINT re-checked through the interface that now
 * exists. Slice L.6 (`apps/server/src/escoba-full-hand.test.ts`) proved the
 * engine/module/registry path with no escoba-ui code in the tree at all;
 * this drives the SAME kind of scenario — a real deal, a real capture, a
 * real hand-end score — through `createGameUiRegistry().get("escoba-de-
 * 15")!.createRenderer()`, the EXACT entry point `main.ts`'s `enterMatch`
 * calls, clicking real `<button>`s and reading the real `dispatch` calls
 * back into the real engine reducer.
 *
 * `@hexdev/escoba-engine` only, deliberately NOT `@hexdev/escoba-module`:
 * widget-app's own `package.json` never depends on any `*-module` package
 * (a server-only layer — bot creation, system-action dealing), so this file
 * stays on the real seam a live client actually crosses: view in, action
 * out. No manual `pnpm dev` session substitutes for this — the same
 * reasoning `game-ui-registry.browser.test.ts`'s own Unit O/P evidence
 * already gives for why this environment has no live server.
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

  /**
   * Same hand-end fixture shape as L.6's own "the hand ends, leftovers go to
   * the last capturer" test — a real siete de oro pile, so scoring resolves
   * to a nonzero total — driven through the real reducer's final play, then
   * `settleLeftovers`/`scoreHand` (both `escoba-engine`'s own, the exact
   * primitives `escoba-module`'s server-only orchestration calls). The
   * DECIDED state is then rendered through the real renderer one more time.
   *
   * WHAT THIS CANNOT SHOW, and is not asked to fix (maintainer-scope, per
   * this slice's own briefing): `createEscobaRenderer` (`game-ui-registry.
   * ts`) never reads `payload.outcome` and drops `onPlayAgain`/
   * `onLeaveMatch` on the floor, so a finished escoba match has no visible
   * score, no "you won", and no way back to the lobby from the table itself
   * — unlike truco's own match-over overlay. `teams[...].score` below is
   * asserted directly against the engine's own state because there is
   * currently nowhere on screen it would otherwise be read from.
   */
  it("a decided hand scores for real, and the renderer survives rendering it", () => {
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
      hand: { table: [leftover], stock: [], piles: { [TEAM_A]: teamAPile, [TEAM_B]: [] }, escobas: { [TEAM_A]: 0, [TEAM_B]: 0 }, turn: PLAYER_B, lastCapturer: TEAM_A, outcome: null },
    };

    const result = applyAction(almostDone, { type: "play-card", playerId: PLAYER_B, card: lastCard, captured: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const settled = settleLeftovers(result.state);
    const gained = scoreHand(settled.hand!, [TEAM_A, TEAM_B]);
    const decided: MatchState = {
      ...settled,
      teams: [{ ...settled.teams[0], score: settled.teams[0].score + gained[TEAM_A] }, { ...settled.teams[1], score: settled.teams[1].score + gained[TEAM_B] }],
      hand: { ...settled.hand!, outcome: { decided: true } },
    };

    expect(decided.teams[0].score, "cartas + oros + setenta + siete de oro must all resolve for team A's stacked pile").toBeGreaterThan(0);

    const render = createGameUiRegistry().get("escoba-de-15" as GameId)!.createRenderer();
    const container = mount();
    expect(() => {
      render(container, { view: getViewFor(decided, PLAYER_A), legalActions: [], outcome: null }, () => {});
    }, "the renderer must not throw on a decided hand's own view, even with no match-over UI to show").not.toThrow();
    expect(container.querySelector(".hexdev-escoba-table"), "the table still renders, empty or not").not.toBeNull();
  });
});
