import { page } from "vitest/browser";
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
afterEach(async () => {
  while (mounted.length > 0) mounted.pop()!.remove();
  document.getElementById(MATCH_OVER_STYLE_ID)?.remove();
  await page.viewport(414, 896);
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
  // The verdict cases below say nothing about the way out, so they hand over
  // the one action the overlay requires and read none of it back.
  renderGeneralaMatchOver(container, view, { onPlayAgain: () => {} });

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

    renderGeneralaMatchOver(container, getViewFor(playToTheEnd(0), SEAT), { onPlayAgain: () => {} });
    expect(container.children.length).toBeGreaterThan(0);

    const running = getViewFor(createMatch(SEATS), SEAT);
    expect(running.outcome).toBeNull();
    renderGeneralaMatchOver(container, running, { onPlayAgain: () => {} });

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

    renderGeneralaMatchOver(container, getViewFor(playToTheEnd(0), SEAT), { onPlayAgain: () => {} });

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

describe("generala match over: the two ways out, and the numbers you decide with", () => {
  interface Exits {
    readonly container: HTMLElement;
    readonly played: readonly string[];
    readonly left: readonly string[];
  }

  function overlayWithExits(view: PlayerView, options: { readonly onLeaveMatch?: boolean; readonly focusOnOpen?: boolean } = {}): Exits {
    const container = document.createElement("div");
    document.body.appendChild(container);
    mounted.push(container);

    const played: string[] = [];
    const left: string[] = [];
    renderGeneralaMatchOver(container, view, {
      onPlayAgain: () => played.push("again"),
      onLeaveMatch: options.onLeaveMatch === true ? () => left.push("lobby") : undefined,
      focusOnOpen: options.focusOnOpen,
    });
    return { container, played, left };
  }

  it("shows every seat's final total, in seat order, the way the planilla's columns are", () => {
    // The planilla underneath already carries a totals row, so this is not the
    // only place the numbers exist — it is the place they are while the
    // player decides whether to play again, which is a different moment.
    const view = getViewFor(playToTheEnd(0), SEAT);
    const exits = overlayWithExits(view);

    expect(exits.container.querySelector(".hexdev-generala-match-over-score")?.textContent).toBe(`Resultado final: Vos ${String(view.totals[0])} — Rival ${String(view.totals[1])}`);
  });

  it("carries real modal semantics, because it is the most disruptive thing this UI does", () => {
    const exits = overlayWithExits(getViewFor(playToTheEnd(0), SEAT));

    expect(exits.container.getAttribute("role")).toBe("dialog");
    expect(exits.container.getAttribute("aria-modal")).toBe("true");
    expect(exits.container.tabIndex).toBe(-1);
  });

  it("drops the dialog semantics again when the overlay is cleared, so a running match is not a dialog", () => {
    // The attributes outlive the children unless somebody removes them, and a
    // `role="dialog"` sitting on an emptied container is a dialog assistive
    // tech can be told about while nothing is on screen at all.
    const container = document.createElement("div");
    document.body.appendChild(container);
    mounted.push(container);

    renderGeneralaMatchOver(container, getViewFor(playToTheEnd(0), SEAT), { onPlayAgain: () => {} });
    renderGeneralaMatchOver(container, getViewFor(createMatch(SEATS), SEAT), { onPlayAgain: () => {} });

    expect(container.getAttribute("role")).toBeNull();
    expect(container.getAttribute("aria-modal")).toBeNull();
    expect(container.hasAttribute("tabindex")).toBe(false);
  });

  it("takes focus only on the render that OPENS it, never on the ones after", () => {
    const view = getViewFor(playToTheEnd(0), SEAT);
    const opened = overlayWithExits(view, { focusOnOpen: true });
    expect(document.activeElement).toBe(opened.container);

    const redrawn = overlayWithExits(view);
    expect(document.activeElement).toBe(opened.container);
    expect(document.activeElement).not.toBe(redrawn.container);
  });

  it("offers a rematch, and calls back exactly once per press", () => {
    const exits = overlayWithExits(getViewFor(playToTheEnd(0), SEAT));
    const again = exits.container.querySelector<HTMLButtonElement>('button[data-action="play-again"]');

    // `type="button"`, stated. A `<button>` with no type is a SUBMIT button,
    // and it does nothing here only because there is no form above it — a
    // board that later wraps this overlay in one would find the rematch
    // reloading the page instead of starting a match.
    expect([again?.tagName, again?.type]).toEqual(["BUTTON", "button"]);
    expect(again?.textContent).toBe("Jugar de nuevo");
    again?.click();

    expect(exits.played).toEqual(["again"]);
  });

  it("offers the lobby only when there is one to go back to, and Escape is the same way out", () => {
    const withLobby = overlayWithExits(getViewFor(playToTheEnd(0), SEAT), { onLeaveMatch: true });
    expect(withLobby.container.querySelector<HTMLButtonElement>('button[data-action="leave-match"]')?.textContent).toBe("Volver al lobby");
    withLobby.container.querySelector<HTMLButtonElement>('button[data-action="leave-match"]')?.click();
    withLobby.container.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(withLobby.left).toEqual(["lobby", "lobby"]);

    // A rematch is not a way OUT, so with no lobby target there is nothing for
    // Escape to cancel back to and it stays inert rather than closing an
    // overlay the next broadcast would immediately redraw.
    const withoutLobby = overlayWithExits(getViewFor(playToTheEnd(0), SEAT));
    expect(withoutLobby.container.querySelector('button[data-action="leave-match"]')).toBeNull();
    withoutLobby.container.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(withoutLobby.left).toEqual([]);
  });

  it("forgets the previous match's Escape handler when the overlay is cleared", () => {
    // A handler left on the container fires for a match that is running
    // again, so a player pressing Escape mid-turn would be thrown back to the
    // lobby by the PREVIOUS match's overlay.
    const container = document.createElement("div");
    document.body.appendChild(container);
    mounted.push(container);
    const left: string[] = [];

    renderGeneralaMatchOver(container, getViewFor(playToTheEnd(0), SEAT), { onPlayAgain: () => {}, onLeaveMatch: () => left.push("lobby") });
    renderGeneralaMatchOver(container, getViewFor(createMatch(SEATS), SEAT), { onPlayAgain: () => {} });
    container.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(left).toEqual([]);
  });

  it("stacks the two controls on a NARROW BOARD inside a WIDE viewport, which is what a container query is for", async () => {
    // THE VIEWPORT IS DELIBERATELY WIDE, and that is the whole point of the
    // case: at 900px no width `@media` can match, so anything that changes
    // here changed because of the BOARD's box. A desktop window with the
    // overlay over one panel is exactly the shape this game takes from the
    // slice that mounts a tray beside a planilla, and it is exactly the shape
    // a viewport ladder reads as "plenty of room".
    await page.viewport(900, 700);

    const board = document.createElement("div");
    board.style.position = "relative";
    board.style.width = "320px";
    board.style.height = "300px";
    const container = document.createElement("div");
    board.appendChild(container);
    document.body.appendChild(board);
    mounted.push(board);

    renderGeneralaMatchOver(container, getViewFor(playToTheEnd(0), SEAT), { onPlayAgain: () => {}, onLeaveMatch: () => {} });

    const buttons = [...container.querySelectorAll<HTMLElement>(".hexdev-generala-match-over-actions button")];
    expect(buttons).toHaveLength(2);
    const row = container.querySelector<HTMLElement>(".hexdev-generala-match-over-actions");
    expect(row).not.toBeNull();

    // STACKED IS NOT THE SAME CLAIM AS WRAPPED, and the first draft of this
    // measured the wrong one: the row is `flex-wrap: wrap`, so two controls
    // that do not fit go onto two lines with or without any query at all and
    // the assertion passed against a stylesheet with the query deleted. What
    // the query actually does is STRETCH — the row spans the board and both
    // controls take its full width — and equal, full-width buttons are
    // something only the query produces.
    const narrow = buttons.map((button) => button.getBoundingClientRect());
    expect(narrow[1]!.top).toBeGreaterThanOrEqual(narrow[0]!.bottom);
    expect(narrow[0]!.width).toBeCloseTo(narrow[1]!.width, 1);
    expect(narrow[0]!.width).toBeCloseTo(row!.getBoundingClientRect().width, 1);

    board.style.width = "640px";
    const wide = buttons.map((button) => button.getBoundingClientRect());
    expect(wide[1]!.top).toBeCloseTo(wide[0]!.top, 1);
    // Their own widths again, which differ because the two labels do.
    expect(wide[0]!.width).not.toBeCloseTo(wide[1]!.width, 1);
  });
});
