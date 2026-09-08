import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";

import { applyPlayerAction, applyRoll, createMatch, getLegalActions, getViewFor } from "@hexdev/generala-engine";
import type { ApplyResult, CategoryId, DieFace, GeneralaAction, MatchState, PlayerId, PlayerView } from "@hexdev/generala-engine";
import type { GameId } from "@hexdev/platform-contract";

import { createGameUiRegistry, matchRenderContextFor } from "./game-ui-registry.js";

/**
 * THE BOARD — the one screen in this game that exists nowhere else.
 *
 * `generala-ui` ships five pieces and no table: the tray, the planilla, the
 * announcer, the servida callout and the match-over overlay are each fenced
 * in their own package, and its barrel says in so many words that what is
 * left is "a board that mounts them". That board is `createGeneralaRenderer`
 * in `game-ui-registry.ts`, and this file is the only place a whole Generala
 * screen is assembled the way a player gets it.
 *
 * RENDERED THROUGH THE REGISTRY, never by calling the pieces directly — the
 * same argument `escoba-table.scene.test.ts` records for escoba. The exact
 * entry point under test is the one `main.ts`'s `enterMatch` calls, so a
 * board that is perfect and unreachable fails here.
 *
 * WHAT THIS FILE IS FOR, AND WHAT IT IS NOT. Every piece's own behaviour is
 * already fenced next door: the tray's held-die identity, the planilla's
 * previews, the announcer's silence when there is no news. Re-asserting any
 * of that here would be a second copy of a fence, and the second copy is the
 * one that rots. What only this tier can get wrong is COMPOSITION — whether
 * all five regions are on screen at once, whether a press reaches the
 * widget's own `dispatch`, whether a re-render duplicates the table, and
 * whether the overlay has the positioned ancestor it needs. Those, and
 * nothing else.
 *
 * THE STATE IS THE ENGINE'S, NEVER A LITERAL. Every view below comes from
 * `createMatch` → `applyRoll` → `applyPlayerAction`, and every action
 * dispatched is one `getLegalActions` offered, so an unreachable board cannot
 * be asserted about by accident.
 */

const SEAT = "board-seat-0" as PlayerId;
const RIVAL = "board-seat-1" as PlayerId;
const SEATS: readonly PlayerId[] = [SEAT, RIVAL];
const GENERALA = "generala" as GameId;

const mounted: HTMLElement[] = [];
afterEach(async () => {
  while (mounted.length > 0) mounted.pop()!.remove();
  document.documentElement.removeAttribute("data-hexdev-layout");
  await page.viewport(414, 896);
});

function accept(result: ApplyResult): MatchState {
  if (!result.ok) throw new Error(`the engine refused a step this test depends on: ${result.violation.code}`);
  return result.state;
}

interface Board {
  readonly container: HTMLElement;
  readonly dispatched: readonly unknown[];
  readonly view: () => PlayerView;
  readonly draw: () => void;
  readonly roll: (faces: readonly DieFace[]) => void;
  /** Apply the engine's OWN hold offer for this `keep`, exactly as the room
   * would, so the next roll lands at a higher `rollsUsed`. */
  readonly hold: (keep: readonly number[]) => void;
  readonly write: (category: CategoryId) => void;
  readonly dice: () => readonly HTMLButtonElement[];
  readonly table: () => HTMLTableElement | null;
  readonly rollButton: () => HTMLButtonElement | null;
  readonly scoreButton: (category: CategoryId, seat: number) => HTMLButtonElement | null;
}

/** A real board on a real mount, driven by the real engine and rendered by
 * the real registry entry. `onPlayAgain`/`onLeaveMatch` are recorded rather
 * than ignored so the overlay's two exits are reachable. */
function board(seatId: PlayerId = SEAT): Board {
  const container = document.createElement("div");
  document.body.appendChild(container);
  mounted.push(container);

  let state = createMatch(SEATS);
  const dispatched: unknown[] = [];
  const render = createGameUiRegistry().get(GENERALA)!.createRenderer(matchRenderContextFor("joined", () => 0));

  const draw = (): void => {
    render(
      container,
      { view: getViewFor(state, seatId), legalActions: getLegalActions(state, seatId) },
      (action) => dispatched.push(action),
      () => dispatched.push({ type: "play-again" }),
      () => dispatched.push({ type: "leave-match" }),
    );
  };
  draw();

  return {
    container,
    dispatched,
    draw,
    view: () => getViewFor(state, seatId),
    dice: () => [...container.querySelectorAll<HTMLButtonElement>("button.hexdev-generala-die")],
    table: () => container.querySelector<HTMLTableElement>("table.hexdev-generala-scorecard-table"),
    rollButton: () => container.querySelector<HTMLButtonElement>("button.hexdev-generala-roll"),
    scoreButton: (category, seat) => container.querySelector<HTMLButtonElement>(`tbody tr[data-category="${category}"] td[data-seat="${String(seat)}"] button`),
    roll: (faces) => {
      state = accept(applyRoll(state, faces));
      draw();
    },
    hold: (keep) => {
      const turn = state.turn;
      if (turn.phase !== "deciding") throw new Error(`a hold needs a deciding turn, and this one is ${turn.phase}`);
      const actor = state.players[turn.seat]!;
      const offer = getLegalActions(state, actor).find((action) => action.type === "hold" && action.keep.length === keep.length && action.keep.every((index, at) => index === keep[at]));
      if (offer === undefined) throw new Error(`the engine did not offer a hold of [${keep.join(", ")}]`);
      state = accept(applyPlayerAction(state, offer));
      draw();
    },
    write: (category) => {
      const turn = state.turn;
      if (turn.phase !== "deciding") throw new Error(`a score needs a deciding turn, and this one is ${turn.phase}`);
      const actor = state.players[turn.seat]!;
      const offer = getLegalActions(state, actor).find((action) => action.type === "score" && action.category === category);
      if (offer === undefined) throw new Error(`the engine did not offer ${category}`);
      state = accept(applyPlayerAction(state, offer));
      draw();
    },
  };
}

describe("the board mounts every region a Generala screen is made of", () => {
  it("shows the tray, the planilla, the roll control and the announcer at once", () => {
    const el = board();
    el.roll([3, 3, 5, 2, 6]);

    expect(el.dice(), "five dice, or the tray is not on the table").toHaveLength(5);
    expect(el.table(), "no planilla: the game is unplayable and unreadable at once").not.toBeNull();
    expect(el.rollButton(), "no control to throw with while holds are still offered").not.toBeNull();
    expect(el.container.querySelector("[aria-live]"), "nothing announces what was thrown").not.toBeNull();
  });

  /* PLANTED AND MEASURED: deleting the `renderServidaCallout` call from the
   * board left this whole suite GREEN. Five regions are composed here and
   * only three of them were being asserted, which is the shape a composition
   * test fails in — every piece is fenced next door, so nothing next door
   * notices when the board simply stops calling one. */
  it("shows the servida callout on the throw it belongs to, and only on that throw", () => {
    const el = board();
    el.roll([6, 6, 6, 6, 2]);

    const callout = () => el.container.querySelector<HTMLElement>("p.hexdev-generala-servida");
    expect(callout(), "a servida throw said nothing about being worth more").not.toBeNull();
    expect(callout()!.textContent ?? "", "the callout rendered empty").not.toBe("");

    // The engine's own offer, so the second throw is a state it really
    // reaches: keep the four sixes and re-roll the fifth.
    el.hold([0, 1, 2, 3]);
    el.roll([5]);
    expect(callout(), "the callout outlived the throw it was about").toBeNull();
  });

  /* PLANTED AND MEASURED TOO: deleting the `renderGeneralaMatchOver` call was
   * also green. Reached through a generala servida rather than by playing
   * twenty-two turns — five of a kind off the cup wins the match outright
   * (spec Domain C), which is one roll and a real terminal state. */
  it("raises the match-over overlay when the view carries an outcome", () => {
    const el = board();
    expect(el.container.querySelector(".hexdev-generala-match-over-panel"), "an overlay before the match is over").toBeNull();

    el.roll([4, 4, 4, 4, 4]);

    expect(el.view().outcome, "fence setup: this roll must actually end the match").not.toBeNull();
    const panel = el.container.querySelector<HTMLElement>(".hexdev-generala-match-over-panel");
    expect(panel, "the match ended and nothing said so").not.toBeNull();
    expect(panel!.textContent ?? "", "the overlay rendered empty").toContain("partida");
  });

  /* THE OVERLAY NEEDS A POSITIONED ANCESTOR AND ITS OWN SHEET REFUSES TO
   * DECLARE ONE. `match-over-styles.ts` says so in as many words — it is
   * `position: absolute; inset: 0` and deliberately does NOT reach out to
   * declare `position: relative` on somebody else's element, "because a board
   * may want the overlay over the whole table or over one panel of it and
   * only the board knows which". This is the board, so this is the answer.
   *
   * Asserted as COMPUTED style rather than as a class name: what matters is
   * that the containing block resolves here, and a rule that stopped applying
   * would keep the class. A static ancestor makes the overlay cover the
   * nearest positioned thing above it — the whole page — which is a full-page
   * veil over a match still in progress. */
  it("is the positioned ancestor the match-over overlay hangs off", () => {
    const el = board();
    expect(getComputedStyle(el.container).position, "the overlay would escape this box and veil the whole page").not.toBe("static");
  });
});

describe("the board routes a press to the action the engine offered", () => {
  /* NOT five of a kind, and the first draft of this test was. `[4, 4, 4, 4, 4]`
   * off the cup is a generala SERVIDA: it wins the match outright and is not a
   * scoring event at all (spec Domain C), so the turn goes to `servida-win`,
   * the engine offers nothing, and the planilla correctly renders no control.
   * The fixture was wrong and the engine said so — which is the whole reason
   * every state in this file is played rather than declared. */
  it("dispatches the engine's own score offer when a box is pressed", () => {
    const el = board();
    el.roll([4, 4, 4, 2, 1]);

    const box = el.scoreButton("fours", el.view().self.seat);
    expect(box, "the acting seat's own open box carries no control").not.toBeNull();
    expect(box!.textContent, "the preview is the highest-value affordance on the screen").toBe("12");
    box!.click();

    expect(el.dispatched, "one press, one action").toHaveLength(1);
    expect(el.dispatched[0]).toEqual({ type: "score", playerId: SEAT, category: "fours" });
  });

  /* The tray commits the engine's OFFER OBJECT rather than a `keep` array the
   * board assembled — `tray.ts`'s own argument, and the reason it matters
   * here is that `match-room.ts` admits an action only if `sameAction` matches
   * one the game offered, walking arrays BY INDEX. What this tier adds is that
   * the object survives the trip to the widget's `dispatch` unaltered. */
  it("dispatches the engine's own hold offer when the throw control is pressed", () => {
    const el = board();
    el.roll([1, 2, 3, 4, 5]);

    el.dice()[0]!.click();
    el.dice()[2]!.click();
    el.rollButton()!.click();

    expect(el.dispatched).toHaveLength(1);
    expect(el.dispatched[0]).toEqual({ type: "hold", playerId: SEAT, keep: [0, 2] });
    const offered = getLegalActions(createMatch(SEATS), SEAT) as readonly GeneralaAction[];
    expect(offered, "fence setup: a fresh match offers the seat nothing, so the offer above came from the rolled state").toEqual([]);
  });
});

describe("the board survives being rendered again, which is every message the match sends", () => {
  it("keeps one planilla and one tray across a re-render rather than stacking a second", () => {
    const el = board();
    el.roll([2, 2, 4, 5, 6]);
    el.draw();
    el.draw();

    expect(el.container.querySelectorAll("table.hexdev-generala-scorecard-table"), "a second planilla under the first").toHaveLength(1);
    expect(el.dice(), "a second tray under the first").toHaveLength(5);
    expect(el.container.querySelectorAll("[aria-live]"), "two live regions read every sentence twice").toHaveLength(1);
  });

  /* A container somebody emptied under the renderer is the case `tray.ts`'s
   * own remount check exists for, and the board has to answer it too: after
   * `replaceChildren` every remembered element is detached, so a board that
   * trusted its memory would draw into nodes nobody can see. */
  it("rebuilds after its container is emptied under it", () => {
    const el = board();
    el.roll([6, 6, 6, 1, 1]);
    el.container.replaceChildren();
    el.draw();

    expect(el.table(), "the board drew into detached nodes and the screen stayed blank").not.toBeNull();
    expect(el.dice()).toHaveLength(5);
  });
});

/**
 * THE DEFECT A PICTURE CANNOT SHOW, so it is measured instead.
 *
 * Rendered at 375×812 and looked at, the board's last category and its totals
 * row were off the bottom of the screen — and clipped, not scrolled: there was
 * no gesture that reached them. Every fence passed, because the rows were in
 * the DOM and the table measured correctly, and no test in this repository
 * asks whether a player can reach the bottom of a board.
 *
 * SCROLLABILITY IS GEOMETRY, which is the half `pnpm visual:review` is
 * structurally bad at (`vitest.scenes.config.ts` says so at length: a
 * screenshot reads colour distance, and a row 40px below the fold and a row
 * clipped forever look identical). So the picture found it and this is what
 * keeps it found.
 */
describe("the board can be read to the bottom on a phone", () => {
  /** The frame `enterMatch` leaves: fullscreen, pinned to the viewport, and
   * the layout attribute set — which is what the height cap is scoped to, so
   * a test that forgot it would measure the uncapped inline case and pass
   * while the shipped one clipped. */
  async function fullscreenBoard(): Promise<Board> {
    await page.viewport(375, 812);
    document.documentElement.setAttribute("data-hexdev-layout", "fullscreen");
    const el = board();
    el.container.style.position = "fixed";
    el.container.style.inset = "0";
    el.draw();
    return el;
  }

  it("keeps the totals row reachable at 375x812, where the card does not fit", async () => {
    const el = await fullscreenBoard();
    el.roll([4, 4, 1, 6, 3]);

    const column = el.container.querySelector<HTMLElement>(".hexdev-generala-board-column")!;
    // Fence setup: if the card FITS there is nothing to scroll and every
    // assertion below would pass on a board that clips.
    expect(column.scrollHeight, "fence setup: the card must overflow, or this proves nothing").toBeGreaterThan(column.clientHeight);

    const totals = el.table()!.querySelector("tfoot")!;
    column.scrollTop = column.scrollHeight;
    expect(totals.getBoundingClientRect().bottom, "the totals row cannot be brought on screen by any gesture").toBeLessThanOrEqual(window.innerHeight + 0.5);
  });

  /* The overlay is `position: absolute; inset: 0` on the board, so the board
   * must NOT be the scroller: on a scrolling container that resolves against
   * the whole scrollable content and the veil's panel centres itself in the
   * card rather than on the screen. */
  it("scrolls the column and not the board, so the overlay still covers the screen", async () => {
    const el = await fullscreenBoard();
    el.roll([4, 4, 1, 6, 3]);

    expect(el.container.scrollHeight, "the board itself grew a scrollbar and the overlay would follow it").toBeLessThanOrEqual(el.container.clientHeight + 0.5);
  });
});

describe("the board says what happened", () => {
  it("announces the throw, and then the box that was written", () => {
    const el = board();
    const live = (): string => el.container.querySelector("[aria-live]")!.textContent ?? "";

    el.roll([5, 5, 5, 2, 1]);
    expect(live(), "the region said nothing about a throw the player just watched").not.toBe("");

    const afterRoll = live();
    el.write("fives");
    expect(live(), "the region still reads the previous sentence after a box was written").not.toBe(afterRoll);
    expect(live()).toContain("15");
  });
});
