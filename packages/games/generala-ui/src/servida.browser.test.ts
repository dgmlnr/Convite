import { afterEach, describe, expect, it } from "vitest";

import { applyPlayerAction, applyRoll, createMatch, getLegalActions, getViewFor, scoreFor } from "@hexdev/generala-engine";
import type { ApplyResult, CategoryId, DieFace, GeneralaAction, MatchState, PlayerId, PlayerView } from "@hexdev/generala-engine";

import { createGeneralaAnnouncer } from "./announcer.js";
import { renderServidaCallout } from "./servida.js";
import { SERVIDA_STYLE_ID } from "./servida-styles.js";

/**
 * SERVIDA IS A RULE, AND THE NUMBERS ONLY IMPLY IT.
 *
 * The planilla already previews 25 for an escalera on the first throw and 20
 * on the second, so the CONSEQUENCE is on screen. What is not on screen is
 * that they are two different numbers for the same box, or why — and a player
 * who does not know the rule reads the 25 as what an escalera is worth and is
 * surprised twice: once when it is 20, and once when a rival takes a throw
 * they would not have taken. Naming it is the whole job of this surface.
 *
 * THE STATE UNDER TEST IS THE ENGINE'S, NEVER A LITERAL. `scoreFor` is asked
 * for both numbers below rather than 25 and 20 being typed here, so the claim
 * is "the callout appears exactly when the boxes are worth more" and not "the
 * callout appears when `rollsUsed` is 1", which is the same sentence with the
 * rule copied into the test.
 */

const SEAT = "seat-0" as PlayerId;
const RIVAL = "seat-1" as PlayerId;
const SEATS: readonly PlayerId[] = [SEAT, RIVAL];

const mounted: HTMLElement[] = [];
afterEach(() => {
  while (mounted.length > 0) mounted.pop()!.remove();
  document.getElementById(SERVIDA_STYLE_ID)?.remove();
});

function accept(result: ApplyResult): MatchState {
  if (!result.ok) throw new Error(`the engine refused a step this test depends on: ${result.violation.code}`);
  return result.state;
}

interface Board {
  readonly container: HTMLElement;
  readonly view: () => PlayerView;
  readonly callout: () => HTMLElement | null;
  readonly said: () => string;
  readonly roll: (faces: readonly DieFace[]) => void;
  readonly hold: (keep: readonly number[]) => void;
  readonly score: (category: CategoryId) => void;
  /** Draw the CURRENT view again — the shape a board takes on every broadcast
   * that changed nothing either surface cares about. */
  readonly redraw: () => void;
}

function seatBoard(seatId: PlayerId = SEAT): Board {
  let state = createMatch(SEATS);
  const container = document.createElement("div");
  const announcer = createGeneralaAnnouncer(document);
  document.body.append(container, announcer.announcerEl);
  mounted.push(container, announcer.announcerEl);

  const draw = (): void => {
    const view = getViewFor(state, seatId);
    renderServidaCallout(container, view);
    announcer.announce(view);
  };
  draw();

  /** Every step below applies the engine's OWN offer, so a step this test
   * asks for that the game would refuse fails loudly here instead of
   * producing a position nobody could have reached. */
  const offers = (): readonly GeneralaAction[] => {
    const turn = state.turn;
    if (turn.phase !== "deciding") throw new Error(`this step needs a deciding turn, and this one is ${turn.phase}`);
    return getLegalActions(state, state.players[turn.seat]!);
  };

  return {
    container,
    view: () => getViewFor(state, seatId),
    callout: () => container.querySelector<HTMLElement>(".hexdev-generala-servida"),
    said: () => announcer.announcerEl.textContent ?? "",
    roll: (faces) => {
      state = accept(applyRoll(state, faces));
      draw();
    },
    hold: (keep) => {
      const offer = offers().find((action) => action.type === "hold" && action.keep.length === keep.length && action.keep.every((index, at) => index === keep[at]));
      if (offer === undefined) throw new Error(`the engine did not offer a hold of [${keep.join(", ")}]`);
      state = accept(applyPlayerAction(state, offer));
      draw();
    },
    score: (category) => {
      const offer = offers().find((action) => action.type === "score" && action.category === category);
      if (offer === undefined) throw new Error(`the engine did not offer ${category}`);
      state = accept(applyPlayerAction(state, offer));
      draw();
    },
    redraw: draw,
  };
}

describe("servida callout: it appears exactly while the juegos mayores are worth more", () => {
  it("is absent before anything has been thrown, because no throw is worth anything yet", () => {
    expect(seatBoard().callout()).toBeNull();
  });

  it("names the rule on the first throw, and the engine agrees the boxes really are worth more there", () => {
    const board = seatBoard();
    board.roll([1, 2, 3, 4, 5]);

    const view = board.view();
    const turn = view.turn;
    if (turn.phase !== "deciding") throw new Error("expected to be deciding after the first throw");
    // The premise, asked of the engine rather than typed: THIS is the throw on
    // which an escalera is worth more than it will be on the next one.
    expect(scoreFor("escalera", turn.dice, turn.rollsUsed, view.cards[0]!)).toBe(25);
    expect(scoreFor("escalera", turn.dice, turn.rollsUsed + 1, view.cards[0]!)).toBe(20);

    expect(board.callout()?.textContent).toBe("Servida: en esta tirada la escalera, el full y el póker valen más.");
  });

  it("is gone on the second throw, where those same boxes are worth their armada value", () => {
    const board = seatBoard();
    board.roll([1, 2, 3, 4, 5]);
    board.hold([0, 1, 2, 3]);
    board.roll([5]);

    const view = board.view();
    const turn = view.turn;
    if (turn.phase !== "deciding") throw new Error("expected to be deciding after the second throw");
    expect(scoreFor("escalera", turn.dice, turn.rollsUsed, view.cards[0]!)).toBe(20);

    expect(board.callout()).toBeNull();
  });

  it("is gone while the cup is still shaking, because a throw that has not landed is not servida", () => {
    const board = seatBoard();
    board.roll([1, 2, 3, 4, 5]);
    board.hold([0, 1, 2, 3]);

    expect(board.view().turn.phase).toBe("awaiting-roll");
    expect(board.callout()).toBeNull();
  });

  it("shows the rival's servida throw too, because it is a fact about the table and not about who is reading", () => {
    // A rival on a servida throw is about to be able to take 45 for a póker,
    // and that changes what a seat leaves open for them. Hiding it would make
    // the surface a private hint rather than the table's own state.
    const board = seatBoard(RIVAL);
    board.roll([1, 2, 3, 4, 5]);

    expect(board.callout()?.textContent).toBe("Servida: en esta tirada la escalera, el full y el póker valen más.");
  });

  it("draws ONE callout however many times the same servida throw is re-rendered", () => {
    // A board redraws on every broadcast, and plenty of them change nothing
    // about the turn — a seat reconnecting, a clock tick, another table's
    // packet. Two renders of one servida throw appending twice is a second
    // copy of the same note stacked under the first, and the ordinary
    // sequence below cannot see it: every non-servida render clears the
    // container on the way past, so the count is back to zero before the next
    // one draws.
    const board = seatBoard();
    board.roll([1, 2, 3, 4, 5]);
    board.redraw();
    board.redraw();

    expect(board.container.querySelectorAll(".hexdev-generala-servida")).toHaveLength(1);
  });

  it("puts the callout back for the next seat's servida throw after having cleared it", () => {
    const board = seatBoard();
    board.roll([1, 2, 3, 4, 5]);
    board.hold([0, 1, 2, 3]);
    board.roll([5]);
    board.score("escalera");
    board.roll([3, 3, 3, 2, 1]);

    expect(board.container.querySelectorAll(".hexdev-generala-servida")).toHaveLength(1);
  });

  it("injects its stylesheet at most once per document", () => {
    seatBoard();
    seatBoard();
    expect(document.querySelectorAll(`#${SERVIDA_STYLE_ID}`)).toHaveLength(1);
  });
});

describe("generala announcer: a generala servida ends the match, and is not a score", () => {
  it("announces the win as the end of the match when this seat is the one who threw it", () => {
    const board = seatBoard();
    board.roll([4, 4, 4, 4, 4]);

    expect(board.said()).toBe("Generala servida: ganaste la partida.");
  });

  it("announces the same throw from the losing seat as the rival's win", () => {
    const board = seatBoard(RIVAL);
    board.roll([4, 4, 4, 4, 4]);

    expect(board.said()).toBe("Generala servida: Rival ganó la partida.");
  });

  it("never announces it in the shape of a written box, because no box was written", () => {
    // The ruleset's `§Generala servida` wins "en el acto" with every card
    // still empty — the generala box holds no number afterwards. A sentence
    // shaped like a score would send a player looking for a box that was
    // never filled, and the planilla beside it would contradict what they
    // just heard.
    const board = seatBoard();
    board.roll([4, 4, 4, 4, 4]);

    expect(board.said()).not.toMatch(/anot/i);
    expect(board.view().cards[0]?.generala).toBeNull();
  });

  it("says it once and does not repeat it on every later render", () => {
    const board = seatBoard();
    board.roll([4, 4, 4, 4, 4]);

    // Overwritten rather than merely re-read: a guard that skipped the write
    // and one that rewrote the identical string are indistinguishable by
    // reading the text back, and only the first of them is silent to a reader
    // that treats every write as a change.
    const region = document.querySelector<HTMLElement>(".hexdev-dice-announcer");
    expect(region).not.toBeNull();
    region!.textContent = "sentinela";
    board.redraw();
    expect(region!.textContent).toBe("sentinela");
  });

  it("shows no servida callout on the throw that won outright, because there is nothing left to score", () => {
    const board = seatBoard();
    board.roll([4, 4, 4, 4, 4]);

    expect(board.callout()).toBeNull();
  });
});
