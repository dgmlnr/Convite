import { afterEach, describe, expect, it } from "vitest";

import { CATEGORY_IDS, applyPlayerAction, applyRoll, createMatch, getLegalActions, getViewFor } from "@hexdev/generala-engine";
import type { ApplyResult, DieFace, MatchState, PlayerId, PlayerView } from "@hexdev/generala-engine";

import { renderGeneralaMatchOver } from "./match-over.js";
import { MATCH_OVER_STYLE_ID } from "./match-over-styles.js";

/**
 * WHO WON, WHEN MORE THAN ONE SEAT DID.
 *
 * `getOutcome` returns the FULL argmax set — every seat holding the highest
 * total, in seat order — and it does so because two seats really can finish
 * level (open input O-2, closed). `escoba-ui`'s overlay reads an empty
 * `winnerIds` as a draw and paints a neutral "Partida finalizada"; that is
 * right for an engine that can produce an empty list and wrong here, where a
 * tie arrives as a list of TWO. Both of those seats won, and this file's
 * whole subject is that both of them are told so.
 *
 * THE MATCHES BELOW ARE PLAYED, NOT BUILT. Every card is filled by driving
 * `createMatch` → `applyRoll` → `applyPlayerAction` through all twenty-two
 * turns, so "these two totals are equal" is a fact about the game rather than
 * about a `PlayerView` literal this file typed. A hand-built outcome could
 * only ever read back what the test put in it.
 */

const SEAT = "seat-0" as PlayerId;
const RIVAL = "seat-1" as PlayerId;
const SEATS: readonly PlayerId[] = [SEAT, RIVAL];

/** Never five of a kind: a generala on the opening throw of a turn wins the
 * match outright and would end these matches on turn one. */
const LEVEL_ROLL: readonly DieFace[] = [1, 2, 3, 4, 5];
/** Four sixes — worth 24 in the Seises box, and still not a generala. */
const BOOST_ROLL: readonly DieFace[] = [6, 6, 6, 6, 1];

const mounted: HTMLElement[] = [];
afterEach(() => {
  while (mounted.length > 0) mounted.pop()!.remove();
  document.getElementById(MATCH_OVER_STYLE_ID)?.remove();
});

function accept(result: ApplyResult): MatchState {
  if (!result.ok) throw new Error(`the engine refused a step this test depends on: ${result.violation.code}`);
  return result.state;
}

/**
 * Twenty-two turns, both seats playing the same faces into the same box.
 *
 * `boostSeat` gets four sixes into its Seises instead of the level roll,
 * which is the whole difference between a tie and a win — one box, 24 against
 * 0, decided by the engine's own scoring rather than by a number here.
 */
function playToTheEnd(boostSeat: number | null): MatchState {
  let state = createMatch(SEATS);
  for (const category of CATEGORY_IDS) {
    for (let round = 0; round < SEATS.length; round++) {
      const turn = state.turn;
      if (turn.phase !== "deciding" && turn.phase !== "awaiting-roll") throw new Error(`the match ended early, at ${turn.phase}`);
      const rolling = turn.seat;
      const faces = category === "sixes" && rolling === boostSeat ? BOOST_ROLL : LEVEL_ROLL;
      state = accept(applyRoll(state, faces));
      const actor = state.players[rolling]!;
      const offer = getLegalActions(state, actor).find((action) => action.type === "score" && action.category === category);
      if (offer === undefined) throw new Error(`the engine did not offer ${category} to seat ${String(rolling)}`);
      state = accept(applyPlayerAction(state, offer));
    }
  }
  return state;
}

interface Overlay {
  readonly container: HTMLElement;
  readonly headline: () => string;
  readonly winners: () => string;
}

function overlayFor(view: PlayerView): Overlay {
  const container = document.createElement("div");
  document.body.appendChild(container);
  mounted.push(container);
  renderGeneralaMatchOver(container, view);

  const textOf = (selector: string): string => container.querySelector(selector)?.textContent ?? "";
  return {
    container,
    headline: () => textOf(".hexdev-generala-match-over-headline"),
    winners: () => textOf(".hexdev-generala-match-over-winners"),
  };
}

describe("generala match over: two seats level at the top BOTH won", () => {
  it("tells the seat that tied it won, and names everybody who did", () => {
    const view = getViewFor(playToTheEnd(null), SEAT);
    // The premise, read off the engine rather than assumed: this really is a
    // two-winner outcome, and the totals really are level.
    expect(view.outcome?.winnerIds).toEqual([SEAT, RIVAL]);
    expect(view.totals[0]).toBe(view.totals[1]);

    const overlay = overlayFor(view);

    // Pinned once, so the playthrough above is the match this file thinks it
    // is: 1+2+3+4+5 in the numbers, a crossed Seises, and an escalera servida
    // at 25 — every one of them the engine's own arithmetic.
    expect(view.totals[0]).toBe(40);

    expect(overlay.headline()).toBe("¡Ganaste la partida!");
    expect(overlay.winners()).toBe("Empataron Vos y Rival con 40 puntos.");
    expect(overlay.container.dataset.result).toBe("won");
    expect(overlay.container.dataset.winners).toBe("2");
  });

  it("tells the OTHER tied seat it won too, and lists the names in the planilla's own column order", () => {
    // Winning is the case a `winnerIds[0]`-shaped implementation gets wrong
    // while looking right from the first seat, and the one escoba's neutral
    // "Partida finalizada" would flatten for both of them.
    //
    // THE ORDER OF THE NAMES IS NOT THE READER'S, and this is the assertion
    // that says so: from seat 1 the list reads "Rival y Vos", because it is
    // seat order — the same order the planilla's columns are in, so a player
    // can read the sentence left to right off the card. Putting the reader
    // first would make a position mean two different things depending on who
    // is looking, which is exactly what `scorecard.ts` refuses for columns.
    const overlay = overlayFor(getViewFor(playToTheEnd(null), RIVAL));

    expect(overlay.headline()).toBe("¡Ganaste la partida!");
    expect(overlay.winners()).toBe("Empataron Rival y Vos con 40 puntos.");
    expect(overlay.container.dataset.result).toBe("won");
  });
});

describe("generala match over: one seat higher than the other", () => {
  it("congratulates the seat that won and names it as the only winner", () => {
    const view = getViewFor(playToTheEnd(0), SEAT);
    expect(view.outcome?.winnerIds).toEqual([SEAT]);

    const overlay = overlayFor(view);

    expect(overlay.headline()).toBe("¡Ganaste la partida!");
    // Second person, not a column name. "Ganó Vos" is the sentence a single
    // shape for both cases would produce, and it is not Spanish.
    expect(overlay.winners()).toBe("Ganaste con 64 puntos.");
    expect(overlay.container.dataset.winners).toBe("1");
  });

  it("congratulates the winning seat when the winner is NOT seat zero", () => {
    // The case a `seat === 0` reading of "did I win" gets wrong while looking
    // right everywhere else: in a two-seat match the reading seat and seat 0
    // coincide in every other scenario this file plays, so the two questions
    // are indistinguishable until the winner is the seat reading AND is not
    // the first column.
    const overlay = overlayFor(getViewFor(playToTheEnd(1), RIVAL));

    expect(overlay.headline()).toBe("¡Ganaste la partida!");
    expect(overlay.container.dataset.result).toBe("won");
  });

  it("tells the seat that lost that it lost, and WHO beat it", () => {
    // "Perdiste" without a name is half a sentence at a table of more than
    // two, and the loser is exactly the seat that has to look up who to play
    // differently against.
    const overlay = overlayFor(getViewFor(playToTheEnd(1), SEAT));

    expect(overlay.headline()).toBe("Perdiste la partida");
    expect(overlay.winners()).toBe("Ganó Rival con 64 puntos.");
    expect(overlay.container.dataset.result).toBe("lost");
  });
});

describe("generala match over: it is an overlay, not a screen that replaces the table", () => {
  it("goes back to nothing when a match that HAD finished is replaced by one that has not", () => {
    // A rematch reuses the container the previous match's overlay was drawn
    // in, so this is the render that matters: a renderer that only ever
    // appended would leave the last result sitting on top of the new board
    // for the whole of the next game, and a fresh container cannot see it
    // because there is nothing there to fail to clear.
    //
    // `:empty { display: none }` is the show/hide mechanism, so an overlay
    // that is over must leave the container with NO CHILDREN rather than with
    // a hidden wrapper inside it.
    const container = document.createElement("div");
    document.body.appendChild(container);
    mounted.push(container);

    renderGeneralaMatchOver(container, getViewFor(playToTheEnd(0), SEAT));
    expect(container.children.length).toBeGreaterThan(0);

    const running = getViewFor(createMatch(SEATS), SEAT);
    expect(running.outcome).toBeNull();
    renderGeneralaMatchOver(container, running);

    expect(container.children).toHaveLength(0);
    expect(container.dataset.result).toBeUndefined();
    expect(container.dataset.winners).toBeUndefined();
    // AND IT IS NOT PAINTED, which is a separate claim from being empty and
    // the more serious of the two. This element is `position: absolute;
    // inset: 0` with a veil behind it, so an empty one that still painted
    // would lay a dark sheet over the whole board for the entire match — and
    // an assertion about `children` cannot see that at all.
    expect(getComputedStyle(container).display).toBe("none");
  });

  it("covers the box the board positioned it over, corner for corner", () => {
    // THE FENCE FOR A DEFECT NO OTHER ASSERTION HERE COULD SEE. The first
    // draft set `position: relative` on the container from the renderer —
    // which is the element the sheet makes `position: absolute; inset: 0` —
    // so the overlay stopped overlaying anything and laid itself out in flow,
    // pushing the board down the page. Every text assertion above passed.
    const board = document.createElement("div");
    board.style.position = "relative";
    board.style.width = "320px";
    board.style.height = "240px";
    const container = document.createElement("div");
    board.appendChild(container);
    document.body.appendChild(board);
    mounted.push(board);

    renderGeneralaMatchOver(container, getViewFor(playToTheEnd(0), SEAT));

    const boardBox = board.getBoundingClientRect();
    const overlayBox = container.getBoundingClientRect();
    expect(overlayBox.left).toBeCloseTo(boardBox.left, 1);
    expect(overlayBox.top).toBeCloseTo(boardBox.top, 1);
    expect(overlayBox.width).toBeCloseTo(boardBox.width, 1);
    expect(overlayBox.height).toBeCloseTo(boardBox.height, 1);
  });

  it("injects its stylesheet at most once per document", () => {
    const view = getViewFor(playToTheEnd(0), SEAT);
    overlayFor(view);
    overlayFor(view);
    expect(document.querySelectorAll(`#${MATCH_OVER_STYLE_ID}`)).toHaveLength(1);
  });
});
