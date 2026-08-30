import { afterEach, describe, expect, it } from "vitest";
import type { Card, MatchState, Player, PlayerId, Team, TeamId } from "@hexdev/escoba-engine";
import { buildDeck, getViewFor } from "@hexdev/escoba-engine";
import { renderEscobaPiles } from "./piles.js";
import { ensurePilesStyles, PILES_STYLE_ID } from "./piles-styles.js";

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

/**
 * BOTH PILES ON ONE ROW, AT EVERY COUNT AND EVERY WIDTH — the fence for the
 * defect the height cap was paying for.
 *
 * WHAT WAS BROKEN. The fan's step was a constant 40% of a pile card, so a
 * pile's width was a function of its CARD COUNT alone and took no notice of
 * the room it had. Two twenty-card piles ask for 344px each; the felt's piles
 * line on a 844x390 fullscreen phone is 660px wide (the 168px rail column is
 * the rest), so 344 + 16 of gap + 344 = 704 overflowed and the two wrapped
 * onto a second row. `table-styles.ts` then had to reserve 160px for a band
 * that only ever needs 80, and a rotated phone paid the other 80 out of card
 * size — 41.44px of card, against 66.73px once this is true.
 *
 * MEASURED, NEVER PHOTOGRAPHED, for the same reason the viewport fence is:
 * a wrapped second row and a tight single row are the same colours in a
 * different order, and `pixelmatch` reads colour distance. Two boxes sharing
 * a top edge is a rectangle question.
 */
describe("the two capture piles never wrap onto a second row", () => {
  const teamAId = "team-a" as TeamId;
  const teamBId = "team-b" as TeamId;

  /** A real 40-card deck sliced in two, which is exactly where a hand ends:
   * every card captured, twenty to a side. Nothing this component renders can
   * ever be wider than that. */
  function fullPiles(each: number): Readonly<Record<TeamId, readonly Card[]>> {
    const deck = buildDeck();
    return { [teamAId]: deck.slice(0, each), [teamBId]: deck.slice(20, 20 + each) };
  }

  /** The three lines a real escoba felt hands this component: a rotated phone
   * beside its rail, the same phone in a wider window, and the narrow tier
   * where the pile card itself drops to 28px. */
  it.each([660, 572, 349])("%ipx of line: both piles share one top edge with all forty cards down", (width) => {
    ensurePilesStyles(document);
    const el = freshContainer();
    el.style.width = `${String(width)}px`;
    const state = fixtureMatch(2, fullPiles(20));
    const view = getViewFor(state, state.players[0]!.id);

    renderEscobaPiles(el, view.teams, view.hand!.piles);

    const boxes = [...el.querySelectorAll<HTMLElement>(".hexdev-escoba-pile")].map((pile) => pile.getBoundingClientRect());
    expect(boxes, "fixture setup: exactly two piles, one per team").toHaveLength(2);
    expect(boxes[1]!.top, `two piles wrapped inside ${String(width)}px`).toBe(boxes[0]!.top);
    // And the band is therefore ONE pile card tall, which is the number
    // `--escoba-fit-piles` reserves.
    expect(el.getBoundingClientRect().height).toBeLessThan(boxes[0]!.height * 2);
  });

  /** The other half of the same rule: a pile small enough to fit is left
   * exactly as it was, so the fix is a CEILING and never a redesign of the
   * fan. Four cards at 40px on a 40% step is 40 + 3 x 16. */
  it("leaves a short pile's fan untouched — the cap only ever bites when the row is full", () => {
    ensurePilesStyles(document);
    const el = freshContainer();
    el.style.width = "660px";
    const state = fixtureMatch(2, fullPiles(4));
    const view = getViewFor(state, state.players[0]!.id);

    renderEscobaPiles(el, view.teams, view.hand!.piles);

    expect(el.querySelector<HTMLElement>(".hexdev-escoba-pile")!.getBoundingClientRect().width).toBe(88);
  });
});
