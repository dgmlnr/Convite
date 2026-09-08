import { afterEach, describe, expect, it } from "vitest";

import { applyPlayerAction, applyRoll, createMatch, getLegalActions, getViewFor } from "@hexdev/generala-engine";
import type { ApplyResult, DieFace, MatchState, PlayerId } from "@hexdev/generala-engine";

import { createGeneralaAnnouncer } from "./announcer.js";

/**
 * WHAT THE TABLE SAYS OUT LOUD, ASSERTED BY PLAIN STRING EQUALITY.
 *
 * The shape is `mark-then-play.browser.test.ts`'s: a live region is read by
 * somebody who cannot see the dice, so the assertion is the whole sentence
 * they hear and never a `toContain` that would pass on half of it. A region
 * saying "Tirada" with the faces missing is exactly the defect this file
 * exists to catch, and `toContain("Tirada")` would let it through.
 *
 * THE STATE UNDER TEST IS THE ENGINE'S, NEVER A LITERAL — the same discipline
 * `scorecard.browser.test.ts` states for the planilla. Every roll below goes
 * through `applyRoll` and every hold through the engine's own offer, so the
 * throw counter advances the way a real turn advances it rather than the way
 * this file would like it to.
 */

const SEAT = "seat-0" as PlayerId;
const RIVAL = "seat-1" as PlayerId;
const SEATS: readonly PlayerId[] = [SEAT, RIVAL];

const mounted: HTMLElement[] = [];
afterEach(() => {
  while (mounted.length > 0) mounted.pop()!.remove();
});

function accept(result: ApplyResult): MatchState {
  if (!result.ok) throw new Error(`the engine refused a step this test depends on: ${result.violation.code}`);
  return result.state;
}

interface Table {
  readonly announcerEl: HTMLElement;
  readonly said: () => string;
  /** Roll the empty slots and STOP. `faces` is as long as the number of dice
   * actually in the cup, which is five on a first throw and fewer after a
   * hold — the reducer refuses any other count. */
  readonly roll: (faces: readonly DieFace[]) => void;
  /** Apply the engine's OWN hold offer for this `keep`, exactly as the room
   * would, so the throw counter advances the way a real turn advances it. */
  readonly hold: (keep: readonly number[]) => void;
  /** The same hold, with the view it produces NEVER handed to the region — a
   * board that received two broadcasts close together and drew only the
   * later one. */
  readonly holdUnseen: (keep: readonly number[]) => void;
  /** Re-announce the CURRENT view — the shape a board takes on every
   * broadcast that changed nothing this region cares about. */
  readonly reannounce: () => void;
}

function seatTable(seatId: PlayerId = SEAT): Table {
  let state = createMatch(SEATS);
  const announcer = createGeneralaAnnouncer(document);
  document.body.appendChild(announcer.announcerEl);
  mounted.push(announcer.announcerEl);

  const tell = (): void => {
    announcer.announce(getViewFor(state, seatId));
  };
  tell();

  const applyHold = (keep: readonly number[]): void => {
    const turn = state.turn;
    if (turn.phase !== "deciding") throw new Error(`a hold needs a deciding turn, and this one is ${turn.phase}`);
    const actor = state.players[turn.seat]!;
    const offer = getLegalActions(state, actor).find((action) => action.type === "hold" && action.keep.length === keep.length && action.keep.every((index, at) => index === keep[at]));
    if (offer === undefined) throw new Error(`the engine did not offer a hold of [${keep.join(", ")}]`);
    state = accept(applyPlayerAction(state, offer));
  };

  return {
    announcerEl: announcer.announcerEl,
    said: () => announcer.announcerEl.textContent ?? "",
    roll: (faces) => {
      state = accept(applyRoll(state, faces));
      tell();
    },
    hold: (keep) => {
      applyHold(keep);
      tell();
    },
    holdUnseen: applyHold,
    reannounce: tell,
  };
}

describe("generala announcer: one region, mounted once and mutated afterwards", () => {
  it("is a polite, atomic live region and hands back the SAME node on every update", () => {
    const table = seatTable();
    const first = table.announcerEl;

    expect(first.getAttribute("aria-live")).toBe("polite");
    expect(first.getAttribute("aria-atomic")).toBe("true");

    table.roll([6, 6, 6, 2, 1]);
    // A live region is announced because its CONTENT changed while it sat in
    // the accessibility tree. A region rebuilt alongside the dice would be a
    // NEW region containing text, which announces nothing however correct the
    // attribute looks — `truco-ui/announcer.ts` and `dice-announcer.ts` both
    // exist for this one fact, and node identity is the only way to assert it.
    expect(table.announcerEl).toBe(first);
    expect(first.isConnected).toBe(true);
  });

  it("says nothing at all before anything has happened", () => {
    // The opening view is a SNAPSHOT, not an event: nobody has thrown and
    // nobody has written a box. A region that greeted the player on mount
    // would announce a sentence over whatever they were already listening to.
    expect(seatTable().said()).toBe("");
  });

  it("says nothing when it is mounted onto a match already in progress", () => {
    // A reconnect, a replay, a spectator arriving: the FIRST view a region is
    // ever handed is a position, not something that just happened, and
    // announcing it talks over whatever the player was already listening to.
    // The opening position cannot catch this — nothing has been thrown there
    // for the region to get wrong — so the mount has to happen mid-throw.
    const state = accept(applyRoll(createMatch(SEATS), [6, 6, 6, 2, 1]));
    const announcer = createGeneralaAnnouncer(document);
    document.body.appendChild(announcer.announcerEl);
    mounted.push(announcer.announcerEl);

    announcer.announce(getViewFor(state, SEAT));

    expect(announcer.announcerEl.textContent).toBe("");
  });

  it("stays silent when a re-render carries no news, so a broadcast storm is not a stream of repeated sentences", () => {
    const table = seatTable();
    table.roll([6, 6, 6, 2, 1]);

    // Overwritten rather than merely re-read: a guard that skipped the write
    // and one that rewrote the identical string are indistinguishable by
    // reading the text back, and only the first of them is silent to a reader
    // that treats every write as a change.
    table.announcerEl.textContent = "sentinela";
    table.reannounce();
    expect(table.announcerEl.textContent).toBe("sentinela");
  });
});

describe("generala announcer: the throw, numbered", () => {
  it("announces the five faces and WHICH throw of the turn they are", () => {
    const table = seatTable();
    table.roll([6, 6, 6, 2, 1]);

    expect(table.said()).toBe("Tirada 1: 6, 6, 6, 2, 1");
  });

  it("announces a re-roll that lands on the same five faces, because it is a different throw", () => {
    const table = seatTable();
    table.roll([6, 6, 6, 2, 1]);
    // Keep the three sixes and throw the other two, which come back 2 and 1.
    // The five faces on the table are now IDENTICAL to the ones announced a
    // moment ago, and a player who cannot see them has been told nothing
    // about the throw that just happened. `dice-ui`'s `announceRoll` names
    // the faces alone and guards on equality — correct for a cup that
    // replaces all five, and silent here, which is why this package says the
    // throw number instead of borrowing that sentence.
    table.hold([0, 1, 2]);
    table.roll([2, 1]);

    expect(table.said()).toBe("Tirada 2: 6, 6, 6, 2, 1");
  });

  it("announces the second throw even when the board never drew the moment between the two", () => {
    const table = seatTable();
    table.roll([6, 6, 6, 2, 1]);
    // TWO `deciding` VIEWS IN A ROW, which is what a board that received the
    // hold and the throw close together and rendered only the later one hands
    // this region. Nothing about the phase changed between them, so the throw
    // COUNTER is the only thing left that says a second throw happened —
    // measured by deleting it, which left every other case in this file green.
    table.holdUnseen([0, 1, 2]);
    table.roll([3, 3]);

    expect(table.said()).toBe("Tirada 2: 6, 6, 6, 3, 3");
  });

  it("announces the rival's throw to the seat watching it, because both seats see the same dice", () => {
    const table = seatTable(RIVAL);
    table.roll([6, 6, 6, 2, 1]);

    expect(table.said()).toBe("Tirada 1: 6, 6, 6, 2, 1");
  });
});
