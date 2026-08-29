import { afterEach, describe, expect, it } from "vitest";
import type { Card, MatchState, Player, PlayerId, Team, TeamId } from "@hexdev/escoba-engine";
import { getViewFor } from "@hexdev/escoba-engine";
import { renderEscobaPiles } from "./piles.js";
import { PILES_STYLE_ID } from "./piles-styles.js";

let container: HTMLElement;

afterEach(() => {
  container.remove();
  document.getElementById(PILES_STYLE_ID)?.remove();
});

function freshContainer(): HTMLElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  return container;
}

// escoba/decisiones-de-producto: piles belong to the TEAM, never the
// player. Mirrors escoba-engine's own view.test.ts fixtureMatch shape —
// seatCount 2 gives each team a single player, seatCount 4 pairs seats 0+2
// against 1+3, exactly like escoba-module's real buildMatch2v2.
function fixtureMatch(seatCount: 2 | 4, piles: Readonly<Record<TeamId, readonly Card[]>>): MatchState {
  const teamAId = "team-a" as TeamId;
  const teamBId = "team-b" as TeamId;
  const playerIds = Array.from({ length: seatCount }, (_, seat) => `player-${seat}` as PlayerId);
  const teams: readonly [Team, Team] =
    seatCount === 2
      ? [
          { id: teamAId, playerIds: [playerIds[0]!], score: 0 },
          { id: teamBId, playerIds: [playerIds[1]!], score: 0 },
        ]
      : [
          { id: teamAId, playerIds: [playerIds[0]!, playerIds[2]!], score: 0 },
          { id: teamBId, playerIds: [playerIds[1]!, playerIds[3]!], score: 0 },
        ];
  const players: readonly Player[] = playerIds.map((id, seat) => ({ id, teamId: seat % 2 === 0 ? teamAId : teamBId, seat, hand: [] }));
  return {
    teams,
    players,
    dealerSeat: 0,
    hand: { table: [], stock: [], piles, escobas: { [teamAId]: 0, [teamBId]: 0 }, turn: playerIds[0]!, lastCapturer: null, outcome: null },
    pointsToWin: 30,
  };
}

describe("renderEscobaPiles (spec: escoba-table-ui, team piles — never player piles)", () => {
  it("renders nothing when no team has captured anything", () => {
    const el = freshContainer();
    const state = fixtureMatch(2, { ["team-a" as TeamId]: [], ["team-b" as TeamId]: [] });
    const view = getViewFor(state, state.players[0]!.id);

    renderEscobaPiles(el, view.teams, view.hand!.piles);

    const piles = [...el.querySelectorAll<HTMLElement>("[data-team]")];
    expect(piles).toHaveLength(2);
    expect(piles.every((p) => p.dataset.count === "0")).toBe(true);
  });

  it("renders one pile per team, in team order, with real card art per captured card", () => {
    const el = freshContainer();
    const teamAId = "team-a" as TeamId;
    const teamBId = "team-b" as TeamId;
    const state = fixtureMatch(2, {
      [teamAId]: [
        { suit: "oro", rank: 5 },
        { suit: "espada", rank: 3 },
      ],
      [teamBId]: [{ suit: "copa", rank: 7 }],
    });
    const view = getViewFor(state, state.players[0]!.id);

    renderEscobaPiles(el, view.teams, view.hand!.piles);

    const piles = [...el.querySelectorAll<HTMLElement>("[data-team]")];
    expect(piles.map((p) => p.dataset.team)).toEqual([teamAId, teamBId]);
    expect(piles[0]!.querySelectorAll("[data-card]")).toHaveLength(2);
    expect(piles[0]!.querySelector("[data-card]")?.querySelector("img")?.src).toContain("5-oro.webp");
    expect(piles[1]!.querySelectorAll("[data-card]")).toHaveLength(1);
  });

  it("in the 4-seat game a pair shows exactly ONE combined pile — never one per player — for BOTH teammates' own view", () => {
    const el = freshContainer();
    const teamAId = "team-a" as TeamId;
    const teamBId = "team-b" as TeamId;
    // Neither card can be attributed to a single teammate by the data
    // itself — that IS the proof: the model has no per-player pile at all,
    // only a per-team one, so seat 0's capture and seat 2's capture already
    // landed in the same array before this component ever runs.
    const combinedPile: readonly Card[] = [
      { suit: "oro", rank: 5 }, // captured while seat 0 was on turn
      { suit: "basto", rank: 6 }, // captured while seat 2 (the teammate) was on turn
    ];
    const state = fixtureMatch(4, { [teamAId]: combinedPile, [teamBId]: [] });

    for (const viewerSeat of [0, 2]) {
      const view = getViewFor(state, state.players[viewerSeat]!.id);
      expect(view.teams, "the 4-seat game still reports exactly two teams, not four players").toHaveLength(2);

      renderEscobaPiles(el, view.teams, view.hand!.piles);

      const piles = [...el.querySelectorAll<HTMLElement>("[data-team]")];
      expect(piles, "art. 5.1 — a pair is a team of two, rendered as ONE pile").toHaveLength(2);
      const teamAPile = piles.find((p) => p.dataset.team === teamAId)!;
      expect(teamAPile.dataset.count).toBe("2");
      expect(teamAPile.querySelectorAll("[data-card]")).toHaveLength(2);
    }
  });
});
