import { afterEach, describe, expect, it } from "vitest";

import { applyPlayerAction, applyRoll, createMatch, getLegalActions, getViewFor } from "@hexdev/generala-engine";
import type { ApplyResult, CategoryId, DieFace, MatchState, PlayerId } from "@hexdev/generala-engine";

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
  /** Roll these five faces for whoever is on turn and write the box named,
   * using the engine's own offer. A category the engine would not accept
   * fails loudly here rather than producing a card nobody could reach. */
  readonly playTurn: (faces: readonly DieFace[], category: CategoryId) => void;
  /** Write the box for the seat already deciding, with the view it produces
   * NEVER handed to the region — a board that drew only the render after it. */
  readonly scoreUnseen: (category: CategoryId) => void;
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

  const applyScore = (category: CategoryId): void => {
    const turn = state.turn;
    if (turn.phase !== "deciding") throw new Error(`a score needs a deciding turn, and this one is ${turn.phase}`);
    const actor = state.players[turn.seat]!;
    const offer = getLegalActions(state, actor).find((action) => action.type === "score" && action.category === category);
    if (offer === undefined) throw new Error(`the engine did not offer ${category} to seat ${String(turn.seat)}`);
    state = accept(applyPlayerAction(state, offer));
  };

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
    playTurn: (faces, category) => {
      state = accept(applyRoll(state, faces));
      applyScore(category);
      tell();
    },
    scoreUnseen: applyScore,
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

describe("generala announcer: the box that was written, with the number in it", () => {
  it("says what THIS seat just wrote and what it was worth", () => {
    const table = seatTable();
    table.playTurn([6, 6, 6, 2, 1], "sixes");

    expect(table.said()).toBe("Anotaste 18 en 6. Juega Rival.");
  });

  it("names the rival who wrote a box, and says the zero out loud when they crossed one out", () => {
    const table = seatTable();
    table.playTurn([6, 6, 6, 2, 1], "sixes");
    // A crossed box and an open one both hold no number a player can use, and
    // only one of them can still be played for. The planilla draws that
    // difference with a strike; the region has to say it, because "el rival
    // no anotó nada" would be true of a turn that never happened.
    table.playTurn([1, 1, 2, 3, 4], "generala-doble");

    expect(table.said()).toBe("Rival anotó 0 en Generala doble. Es tu turno.");
  });

  it("reads the same event from the rival's own seat, with the roles the other way round", () => {
    // The label follows WHO IS READING, not who wrote. Keyed on a literal seat
    // index instead, this sentence would tell the seat that did not play that
    // it had just written a box.
    const table = seatTable(RIVAL);
    table.playTurn([6, 6, 6, 2, 1], "sixes");

    expect(table.said()).toBe("Rival anotó 18 en 6. Es tu turno.");
  });

  it("calls the box exactly what the planilla's own row header calls it, accent and all", () => {
    // Shared rather than re-typed. The engine's id for this box is `poker`;
    // the planilla heads its row "Póker". A region announcing the identifier
    // would be a second name for one box, and a player who went to check the
    // card would not find the row they were told about.
    const table = seatTable();
    table.playTurn([3, 3, 3, 3, 1], "poker");

    expect(table.said()).toBe("Anotaste 45 en Póker. Juega Rival.");
  });

  it("announces the box and not the throw when a board draws only the render that follows a score", () => {
    // Both facts changed between these two views: a box was written AND the
    // next seat's dice are on the table. `aria-atomic` reads the region whole,
    // so the two joined would be one sentence nobody can follow — the box is
    // the consequential half, and the dice are on screen either way.
    //
    // THE SCORE HAPPENS AT THE SECOND THROW ON PURPOSE, and the first draft of
    // this test did it at the first. Both seats' opening throws are `rollsUsed
    // === 1`, so the counter did not move across the seat change and the two
    // orderings were indistinguishable — the case passed while asserting
    // nothing. Scoring at throw 2 makes the counter go 2 → 1, which is the
    // only shape in which the order of these two questions is observable.
    const table = seatTable();
    table.roll([6, 6, 6, 2, 1]);
    table.hold([0, 1, 2]);
    table.roll([2, 1]);
    table.scoreUnseen("sixes");
    table.roll([1, 1, 2, 3, 4]);

    expect(table.said()).toBe("Anotaste 18 en 6. Juega Rival.");
  });
});

/**
 * WHOSE TURN IT IS, FOR THE PLAYER WHO CANNOT SEE THE COLUMN THAT SAYS SO.
 *
 * The board grew two cues for this in the same change — the planilla's shaded
 * column and the tray going quiet — and both of them are light. A live region
 * is the whole of that information for anybody not reading the screen, and it
 * had none of it: "Rival anotó 0 en Cincos." reports what happened and leaves
 * the actionable half unsaid.
 *
 * IT IS APPENDED TO THE SCORE AND IS NOT AN EVENT OF ITS OWN, which is the
 * decision this block is really about. This file already argues that two
 * events joined into one string is a sentence nobody can follow, and that is
 * why a throw is dropped in favour of the box beside it. A turn passing is
 * not a second event: `applyScore` is the ONLY transition that moves the seat,
 * so the box and the pass arrive in one broadcast, caused by one action. They
 * are a fact and its consequence, and the consequence is the half a player has
 * to act on. Announcing it separately is not even available — it would land in
 * the same render and overwrite the box.
 */
describe("generala announcer: the turn the written box just passed", () => {
  it("says the match is now waiting on THIS seat when the rival's box is what passed it", () => {
    const table = seatTable();
    table.playTurn([6, 6, 6, 2, 1], "sixes");
    table.playTurn([1, 1, 2, 3, 4], "generala-doble");

    expect(table.said()).toBe("Rival anotó 0 en Generala doble. Es tu turno.");
  });

  it("names the seat it passed TO when that seat is not the one reading", () => {
    const table = seatTable();
    table.playTurn([6, 6, 6, 2, 1], "sixes");

    // The planilla's own column name, not a third word for the same seat.
    expect(table.said()).toBe("Anotaste 18 en 6. Juega Rival.");
  });

  it("says nothing about a turn once the last box is written, because there is not another one", () => {
    // THE ENGINE ADVANCES THE SEAT PAST THE END OF THE MATCH: `applyScore`
    // hands `awaiting-roll` to the next seat whether or not any card still
    // has room. A region reading the turn alone would end twenty-two turns of
    // play by telling somebody it was their go, over a verdict overlay that
    // has already taken the board away from them.
    const table = seatTable();
    // The order is one the rules allow, and it is not `CATEGORY_IDS`:
    // `[1,2,3,4,5]` pays in six boxes, and a zero goes only in the
    // highest-paying open box (ruleset §Orden obligatorio de tachado), so the
    // five that pay nothing come last and in ladder order.
    const categories: readonly CategoryId[] = ["ones", "twos", "threes", "fours", "fives", "escalera", "generala-doble", "generala", "poker", "full", "sixes"];
    for (const category of categories) {
      table.playTurn([1, 2, 3, 4, 5], category);
      table.playTurn([1, 2, 3, 4, 5], category);
    }

    expect(table.said()).toBe("Rival anotó 0 en 6.");
  });
});
