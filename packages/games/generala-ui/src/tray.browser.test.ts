import { page, userEvent } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyPlayerAction, applyRoll, createMatch, getLegalActions, getViewFor } from "@hexdev/generala-engine";
import type { ApplyResult, CategoryId, DieFace, GeneralaAction, HoldAction, MatchState, PlayerId } from "@hexdev/generala-engine";

import { createGeneralaTray } from "./tray.js";
import type { GeneralaTrayElements } from "./tray.js";

/**
 * THE TRAY, AND THE ONE RULE `dice-ui` IS NEVER ALLOWED TO LEARN.
 *
 * A hold is a rule. `dice-ui` ships a cup whose `roll()` REPLACES THE WHOLE
 * TRAY — its own docstring says so — which is exactly right for five dice
 * nobody is keeping and exactly wrong the moment a player holds one: the held
 * die would be destroyed and rebuilt, and every partial re-roll would throw
 * away the element a human was looking at. So this package composes the tray
 * itself, one die per real `<button>`, and never calls
 * `createDiceCup(...).roll()`.
 *
 * THE STATE UNDER TEST IS THE ENGINE'S, NEVER A LITERAL. Every turn below is
 * produced by `createMatch` → `applyRoll` → `applyPlayerAction`, and every
 * legal-action list is `getLegalActions`' own output. A tray driven by
 * hand-built `Turn` objects could only read back what the test put there —
 * `board.test.ts:144-152`'s measured lesson — and, worse, a partial re-roll
 * would be a splice this file performed rather than one the engine did, so
 * the central claim would be a claim about the test.
 *
 * WHY THE OFFER OBJECT IS DISPATCHED AND NOT A `keep` THIS FILE BUILT. Since
 * PR #257 the room admits an action only when `sameAction`
 * (`match-room.ts:220-232`) matches one the game offered, and it walks arrays
 * BY INDEX: `keep: [1, 0]` is simply not the action `keep: [0, 1]` is. A tray
 * assembling its own array from the order a player happened to press in would
 * produce an unsubmittable action that a deep-equality assertion written the
 * same way would still pass. `toContain` against the engine's own list is the
 * assertion that cannot be satisfied that way.
 */

const SEAT = "seat-0" as PlayerId;
const RIVAL = "seat-1" as PlayerId;
const SEATS: readonly PlayerId[] = [SEAT, RIVAL];

/** The opening roll every test below starts from. Five distinct faces, so
 * "this die still shows what it showed" is a claim about ONE die rather than
 * about whichever die happens to share its number. */
const OPENING: readonly DieFace[] = [3, 5, 1, 2, 6];

const mounted: HTMLElement[] = [];

/**
 * THE SOUND PREFERENCE IS REAL `localStorage`, AND IT LEAKED BETWEEN TESTS —
 * found by two assertions below going red for a reason neither of them was
 * about. Every test in this file shares one browser iframe, so the moment one
 * of them pressed the mute control, every test after it built a tray that was
 * already muted and quietly took the "nothing to do" branch of everything.
 *
 * Worth saying plainly rather than just fixing: that leak is the persistence
 * WORKING. `sound-preference.ts` promises a mute survives a reload, and a
 * shared iframe is a stronger version of the same thing. What is wrong is the
 * fixture, not the behaviour, so the fixture is what resets.
 */
beforeEach(() => {
  window.localStorage.removeItem("convite:dice-muted");
});

afterEach(async () => {
  while (mounted.length > 0) mounted.pop()!.remove();
  window.localStorage.removeItem("convite:dice-muted");
  await page.viewport(414, 896);
});

function accept(result: ApplyResult): MatchState {
  if (!result.ok) throw new Error(`the engine refused a step this test depends on: ${result.violation.code}`);
  return result.state;
}

/** The face `dice-ui` posed this die at, read off the cube it renders —
 * `die.ts` writes `cube.dataset.face` from the already-decided face before
 * the element is ever appended, so this is the number a human sees on the die
 * and not a copy this package keeps beside it. */
function faceOf(node: HTMLElement): string {
  return node.querySelector<HTMLElement>(".hexdev-dice-cube")?.dataset.face ?? "no die";
}

interface Table {
  readonly elements: GeneralaTrayElements;
  readonly dispatched: readonly HoldAction[];
  readonly offers: () => readonly GeneralaAction[];
  readonly roll: (faces: readonly DieFace[]) => void;
  /** Apply the engine's OWN offer for this `keep`, exactly as the room does. */
  readonly hold: (keep: readonly number[]) => void;
  /** Apply the hold this tray last dispatched — the real path, end to end. */
  readonly commit: () => void;
  readonly roller: () => HTMLButtonElement | null;
  /** The cubilete standing beside the throw control, or `null` if this tray
   * never put one there. */
  readonly cup: () => HTMLElement | null;
  readonly nodes: () => readonly HTMLElement[];
  readonly dice: () => readonly HTMLButtonElement[];
  readonly redraw: () => void;
  readonly drawInto: (other: HTMLElement) => void;
  /** The row the dice are drawn into, which is the element the tray marks
   * with whose turn it is. */
  readonly diceEl: HTMLElement;
  /** Write the box named for whoever is on turn, which is the only move that
   * passes the turn to the next seat. */
  readonly score: (category: CategoryId) => void;
}

function seatTable(): Table {
  const root = document.createElement("div");
  const diceEl = document.createElement("div");
  const rollEl = document.createElement("div");
  root.append(diceEl, rollEl);
  document.body.appendChild(root);
  mounted.push(root);

  const elements: GeneralaTrayElements = { diceEl, rollEl };
  const render = createGeneralaTray();
  const dispatched: HoldAction[] = [];
  let state = createMatch(SEATS);
  let offers: readonly GeneralaAction[] = [];
  const draw = (): void => {
    offers = getLegalActions(state, SEAT);
    render(elements, getViewFor(state, SEAT), offers, (action) => dispatched.push(action));
  };
  draw();

  return {
    elements,
    dispatched,
    offers: () => offers,
    roll: (faces) => {
      state = accept(applyRoll(state, faces));
      draw();
    },
    hold: (keep) => {
      const offer = getLegalActions(state, SEAT).find((action) => action.type === "hold" && action.keep.length === keep.length && action.keep.every((index, at) => index === keep[at]));
      if (offer === undefined) throw new Error(`the engine offers no hold for [${keep.join(", ")}]`);
      state = accept(applyPlayerAction(state, offer));
      draw();
    },
    commit: () => {
      state = accept(applyPlayerAction(state, dispatched[dispatched.length - 1]!));
      draw();
    },
    // NAMED, NOT "THE FIRST BUTTON IN THE ROW". It was the first button until
    // the sound control moved in beside the cubilete, at which point a
    // positional query started answering "yes, there is a throw control" with
    // the mute toggle. The class is what this actually means.
    roller: () => rollEl.querySelector<HTMLButtonElement>(".hexdev-generala-roll"),
    cup: () => rollEl.querySelector<HTMLElement>(".hexdev-dice-cup-piece"),
    nodes: () => [...diceEl.children] as HTMLElement[],
    dice: () => [...diceEl.querySelectorAll<HTMLButtonElement>("button")],
    redraw: draw,
    drawInto: (other) => render({ diceEl: other, rollEl }, getViewFor(state, SEAT), offers, (action) => dispatched.push(action)),
    diceEl,
    score: (category) => {
      const turn = state.turn;
      if (turn.phase !== "deciding") throw new Error(`a score needs a deciding turn, and this one is ${turn.phase}`);
      const actor = state.players[turn.seat]!;
      const offer = getLegalActions(state, actor).find((action) => action.type === "score" && action.category === category);
      if (offer === undefined) throw new Error(`the engine did not offer ${category} to seat ${String(turn.seat)}`);
      state = accept(applyPlayerAction(state, offer));
      draw();
    },
  };
}

describe("13.1 — a held die survives a partial re-roll as the SAME element", () => {
  it("keeps the two held dice, their elements and their faces, and rebuilds only the three that were thrown again", () => {
    const table = seatTable();
    table.roll(OPENING);

    const before = table.dice();
    expect(before.map(faceOf), "the opening roll is drawn, one die per face, in slot order").toEqual(["3", "5", "1", "2", "6"]);

    table.hold([0, 1]);
    table.roll([4, 4, 4]);

    const after = table.dice();
    expect(after[0], "the die at index 0 was held: a tray rebuilt wholesale would replace it").toBe(before[0]);
    expect(after[1], "the die at index 1 was held: a tray rebuilt wholesale would replace it").toBe(before[1]);
    expect(faceOf(after[0]!), "a held die keeps the face it was held on").toBe("3");
    expect(faceOf(after[1]!)).toBe("5");

    expect(after[2], "the die at index 2 was thrown again, so it is a new die").not.toBe(before[2]);
    expect(after.map(faceOf), "the three thrown slots carry the new faces, positionally").toEqual(["3", "5", "4", "4", "4"]);
  });

  it("rebuilds all five when the whole roll changes, so the identity above is a property of the HOLD and not of a tray that refuses to redraw", () => {
    const table = seatTable();
    table.roll(OPENING);
    const before = table.dice();

    table.hold([]); // the rulebook's explicit re-roll of all five
    table.roll([4, 4, 4, 4, 4]);

    const after = table.dice();
    for (const [index, die] of after.entries()) {
      expect(die, `die ${String(index)} was thrown again, so it is a different element`).not.toBe(before[index]);
    }
    expect(after.map(faceOf)).toEqual(["4", "4", "4", "4", "4"]);
  });

  it("keeps the LAST two, which is where a rebuilt slot appended at the end stops being in its own position", () => {
    const table = seatTable();
    table.roll(OPENING);
    const before = table.dice();

    table.hold([3, 4]);
    table.roll([6, 6, 6]);

    const after = table.dice();
    expect(after[3], "index 3 was held").toBe(before[3]);
    expect(after[4], "index 4 was held").toBe(before[4]);
    // SLOT ORDER IS THE ADDRESSING, because a `hold` carries INDICES. Holding
    // the first two hides this: the three rebuilt dice belong at the end
    // either way, so a reconciler that appended them instead of replacing
    // them in place reads identically. Holding the last two does not: an
    // appending tray draws 2, 6, 6, 6, 6 and the player presses the die they
    // can see is not the one they meant.
    expect(after.map(faceOf)).toEqual(["6", "6", "6", "2", "6"]);
  });

  it("draws the gaps while the cup is shaking, so the two dice the player kept do not move", () => {
    const table = seatTable();
    table.roll(OPENING);
    const before = table.dice().map((die) => die.getBoundingClientRect().left);

    table.hold([0, 1]);

    const during = table.nodes();
    expect(during, "five slots either way: two dice and three gaps").toHaveLength(5);
    expect(table.dice(), "only the two that were held are still controls").toHaveLength(2);
    expect(during[0]!.getBoundingClientRect().left, "and they have not moved").toBeCloseTo(before[0]!, 1);
    expect(during[1]!.getBoundingClientRect().left).toBeCloseTo(before[1]!, 1);
  });
});

describe("13.2 — aria-pressed reports the state the die is actually in", () => {
  it("holds the die that was pressed and only that one, and lets it go when it is pressed again", () => {
    const table = seatTable();
    table.roll(OPENING);
    const dice = table.dice();

    for (const die of dice) expect(die.getAttribute("aria-pressed"), "a die starts in the cup's own state: not held").toBe("false");

    dice[2]!.click();
    expect(dice[2]!.getAttribute("aria-pressed"), "pressing a die holds it").toBe("true");
    expect(dice[0]!.getAttribute("aria-pressed"), "and holds only that one").toBe("false");

    dice[2]!.click();
    expect(dice[2]!.getAttribute("aria-pressed"), "pressing it again lets it go").toBe("false");
  });

  it("forgets the selection the moment the faces change, so a new throw is decided from scratch", () => {
    const table = seatTable();
    table.roll(OPENING);
    table.dice()[0]!.click();

    table.hold([0]);
    table.roll([4, 4, 4, 4]);

    for (const die of table.dice()) {
      expect(die.getAttribute("aria-pressed"), "a mark left over from the previous throw would be a hold nobody chose").toBe("false");
    }
  });

  it("stops answering once the engine offers no hold at all — the third throw, told by the offer list and not by counting", () => {
    const table = seatTable();
    table.roll(OPENING);
    for (const die of table.dice()) expect(die.disabled, "two throws still to come").toBe(false);

    table.hold([]);
    table.roll([4, 4, 4, 4, 4]);
    table.hold([]);
    table.roll([1, 1, 1, 1, 1]);

    const dice = table.dice();
    expect(dice, "the dice are still on the table — they are what the player scores").toHaveLength(5);
    for (const die of dice) expect(die.disabled, "but holding one would mean nothing now").toBe(true);
  });
});

describe("13.3 — the hold the engine refuses is never offered", () => {
  it("disables the roll control once all five dice are held, and re-enables it the moment one is let go", () => {
    const table = seatTable();
    table.roll(OPENING);
    const dice = table.dice();

    for (const index of [0, 1, 2, 3]) dice[index]!.click();
    expect(table.roller()!.disabled, "four held still leaves one die to throw").toBe(false);

    dice[4]!.click();
    const roller = table.roller();
    expect(roller, "the control is still there — this is a refusal, not a disappearance").not.toBeNull();
    expect(roller!.disabled, "keeping all five asks to re-roll nothing, which is not a move").toBe(true);
    expect(roller!.textContent, "and it says why, rather than offering 'Tirar 0 dados'").toBe("Guardar los cinco no es una tirada");
    roller!.click();
    expect(table.dispatched, "a refused control dispatches nothing when it is pressed").toHaveLength(0);

    dice[4]!.click();
    expect(table.roller()!.disabled, "letting the fifth go makes it a move again").toBe(false);
    expect(table.roller()!.textContent).toBe("Tirar 1 dado");
  });
});

describe("13.4 — presses accumulate locally and exactly ONE action is dispatched", () => {
  it("dispatches nothing while the player is choosing, then one hold whose keep is the engine's own ascending array", () => {
    const table = seatTable();
    table.roll(OPENING);
    const dice = table.dice();

    // Pressed OUT of order on purpose: a tray building `keep` from the press
    // order would produce [3, 0, 2], which `sameAction` walks by index and
    // refuses — and every test that built its expectation the same way would
    // still pass.
    dice[3]!.click();
    dice[0]!.click();
    dice[2]!.click();
    expect(table.dispatched, "three presses, and the engine has heard nothing yet").toHaveLength(0);
    expect(table.roller()!.textContent).toBe("Tirar 2 dados");

    table.roller()!.click();
    expect(table.dispatched, "one control, one action").toHaveLength(1);

    const action = table.dispatched[0]!;
    expect(action.type).toBe("hold");
    expect(action.keep, "strictly ascending, whatever order the player pressed in").toEqual([0, 2, 3]);
    expect(table.offers(), "the object dispatched IS one the engine offered, so sameAction matches it by construction").toContain(action);
  });

  it("dispatches the empty keep as its own offer when nothing is held — the rulebook's explicit re-roll of all five", () => {
    const table = seatTable();
    table.roll(OPENING);

    expect(table.roller()!.textContent).toBe("Tirar los 5 dados");
    table.roller()!.click();
    expect(table.dispatched).toHaveLength(1);
    expect(table.dispatched[0]!.keep).toEqual([]);
    expect(table.offers()).toContain(table.dispatched[0]);
  });

  it("lets the marks go the instant the control is pressed, without waiting for the server to say so", () => {
    const table = seatTable();
    table.roll(OPENING);
    table.dice()[0]!.click();

    table.roller()!.click();
    for (const die of table.dice()) {
      expect(die.getAttribute("aria-pressed"), "the dice just given up must not keep looking held for a round trip").toBe("false");
    }

    table.commit();
    table.roll([4, 4, 4, 4]);
    expect(table.dice().map(faceOf), "and the hold it dispatched is the one the engine applied").toEqual(["3", "4", "4", "4", "4"]);
  });

  it("keeps focus on the control while the player goes on choosing (WCAG 2.1.1/2.4.3)", () => {
    const table = seatTable();
    table.roll(OPENING);

    const roller = table.roller()!;
    roller.focus();
    // A press re-renders, and the label really does have to change with it.
    // Rebuilding the control to change its text drops a keyboard player back
    // onto the body mid-decision, which is the defect `truco-ui`'s own table
    // renderer fences for by name.
    table.dice()[0]!.click();

    expect(table.roller(), "the same element, updated rather than replaced").toBe(roller);
    expect(document.activeElement, "and the player is still on it").toBe(roller);
    expect(roller.textContent, "with the label the new selection needs").toBe("Tirar 4 dados");
  });
});

describe("13.5 — the third throw takes the control away", () => {
  it("removes the roll control entirely once no throw remains, rather than greying it", () => {
    const table = seatTable();
    table.roll(OPENING);

    table.roller()!.click();
    table.commit();
    table.roll([4, 4, 4, 4, 4]);
    expect(table.roller(), "two throws used, one left: the control is still there").not.toBeNull();

    table.roller()!.click();
    table.commit();
    table.roll([1, 1, 1, 1, 1]);

    // ABSENT, not disabled, and the asymmetry with 13.3 is the point: there
    // the player is one press away from making it a move again, so a greyed
    // control is the truth. Here there is no throw left to ask for at all.
    expect(table.roller(), "the third throw is the last one: nothing left to press").toBeNull();
    expect(table.elements.rollEl.textContent, "and nothing left over where it used to be").toBe("");
  });
});

describe("the tray redraws from scratch when its own elements are no longer in the tree", () => {
  it("rebuilds after the container is emptied under it, and again after it is mounted somewhere else", () => {
    const table = seatTable();
    table.roll(OPENING);
    const faces = table.dice().map(faceOf);
    expect(faces, "the roll is on the table before anything is taken away from it").toEqual(["3", "5", "1", "2", "6"]);

    // The case a remembered container reference cannot see: same element,
    // different children. Every `replaceWith` the reconciler would do lands
    // on a detached node, so a tray that only compared containers draws
    // nothing at all here and reports no error doing it.
    table.elements.diceEl.replaceChildren();
    table.redraw();
    expect(table.dice().map(faceOf)).toEqual(faces);

    const elsewhere = document.createElement("div");
    document.body.appendChild(elsewhere);
    mounted.push(elsewhere);
    table.drawInto(elsewhere);
    expect([...elsewhere.querySelectorAll<HTMLElement>("button")].map(faceOf), "one renderer, mounted somewhere else, draws there").toEqual(faces);
  });
});

/**
 * SLICE 12 HANDED THESE COUNTS OVER BY NAME, AND THEY MOVED FOR TWO REASONS.
 *
 * `dice-ui` measured five bare `.hexdev-dice-scene-box` elements landing
 * 2+2+1 at 320px, 3+2 at 375px and 2+2+1 at 700px. Both halves of that
 * comparison changed here, so the counts are re-measured rather than
 * inherited:
 *
 * 1. EACH DIE IS NOW A `<button>`, and this package's stylesheet reserves a
 *    2px border on every one of them — 4px per flex item, at every width.
 * 2. THERE IS NO CUP IN THIS ROW. `dice-ui`'s counts were taken inside
 *    `.hexdev-dice-root`, an `inline-flex` box holding the cup AND the tray,
 *    so the cup was spending width the dice could not. A Generala board
 *    composes its own tray — `roll()` is the one call this package refuses —
 *    and five dice get the whole row.
 *
 * The arithmetic is checkable rather than magic: at 320px the ladder's 0.45
 * scale draws a 94.5px box, 98.5px with the border and 102.5px with the gap,
 * so three fit inside 320 and a fourth would need 406.
 *
 * The widths are the six this repository already standardizes on for a
 * geometry fence (`dice.browser.test.ts`'s own `BREAKPOINTS`).
 */
function rowsOf(nodes: readonly HTMLElement[]): readonly number[] {
  const rows: number[] = [];
  let previous: number | null = null;
  for (const node of nodes) {
    const top = Math.round(node.getBoundingClientRect().top);
    if (top === previous) rows[rows.length - 1] += 1;
    else rows.push(1);
    previous = top;
  }
  return rows;
}

describe("the tray still fits the narrow phones now that each die is a button", () => {
  it.each([
    { width: 320, rows: [3, 2] },
    { width: 375, rows: [3, 2] },
    { width: 700, rows: [5] },
    { width: 960, rows: [4, 1] },
    { width: 1280, rows: [5] },
    { width: 1550, rows: [5] },
  ])("at $width px the five dice land $rows, inside the tray and inside the page", async ({ width, rows }) => {
    await page.viewport(width, 900);
    const table = seatTable();
    table.roll(OPENING);

    const dice = table.dice();
    expect(rowsOf(dice)).toEqual(rows);

    const tray = table.elements.diceEl.getBoundingClientRect();
    for (const die of dice) {
      const box = die.getBoundingClientRect();
      expect(box.left).toBeGreaterThanOrEqual(tray.left - 0.5);
      expect(box.right).toBeLessThanOrEqual(tray.right + 0.5);
    }
    expect(document.documentElement.scrollWidth, "a tray that clipped instead of wrapping pushes the page sideways").toBeLessThanOrEqual(width);
  });
});

/**
 * THE OTHER HALF OF "WHOSE TURN IS IT", AND WHY THERE ARE TWO HALVES.
 *
 * The planilla says WHO — one column shaded, its heading in the accent. This
 * says NOT NOW, and neither of them is enough alone. A shaded column is
 * discreet by design and can be missed at the exact moment it matters; a
 * dimmed tray on its own is ambiguous, because "off" is also what a control
 * disabled for some other reason looks like. Together one names the seat and
 * the other says the table is not waiting on you.
 *
 * IT IS THE TABLE THAT DECIDES, NEVER `dice-ui`. A turn is a rule, and the
 * package that draws a die has no idea what one is — this tray reads
 * `view.turn.seat` against `view.self.seat`, both of them facts the engine's
 * own projection states, and hands `dice-ui` a die exactly as before.
 *
 * WHICH IS WHY THE RENDER TAKES THE VIEW AND NOT THE TURN. `Turn` carries the
 * seat that is playing and nothing about who is reading, so the two cannot be
 * compared from it; `PlayerView` is the one object that holds both, and it is
 * what the planilla and the announcer beside this tray were already given.
 */
describe("the tray goes quiet when the table is not waiting on this seat", () => {
  it("marks itself with whose turn it is, and the mark follows the SEAT rather than the reader", () => {
    const table = seatTable();
    table.roll(OPENING);
    expect(table.diceEl.dataset.turn, "seat 0 opens, and seat 0 is reading").toBe("self");

    // One box written is the only move that passes the turn.
    table.score("ones");
    expect(table.diceEl.dataset.turn, "the turn passed to the rival, and this seat is still reading").toBe("rival");
  });

  it("dims the rival's dice while they are on the table, and leaves this seat's own at full strength", () => {
    const table = seatTable();
    table.roll(OPENING);
    const mine = getComputedStyle(table.dice()[0]!).opacity;

    table.score("ones");
    table.roll(OPENING);
    const theirs = getComputedStyle(table.dice()[0]!).opacity;

    // MEASURED THROUGH THE CASCADE, not read back off the declaration: a
    // selector that never matches leaves the same "1" a rule that was never
    // written does, and only the computed value tells the two apart.
    expect(mine, "my own dice are never dimmed").toBe("1");
    expect(Number(theirs), "the rival's dice are dimmed").toBeLessThan(1);
    expect(Number(theirs), "and never so far that the faces stop being readable").toBeGreaterThanOrEqual(0.5);
  });

  it("leaves the waiting slots at full strength even on the rival's turn, because they are the only thing saying the cup is shaking", () => {
    // The dimming is scoped to dice that are SHOWING. `tray-styles.ts` records
    // why the empty slot is drawn at all: five blank boxes over a card of
    // dashes is the state every turn passes through, and it said nothing at
    // all until the outline was added. Dimming that outline would trade the
    // cue this change is adding for the cue that one added.
    const table = seatTable();
    table.roll(OPENING);
    table.score("ones");

    expect(table.diceEl.dataset.turn).toBe("rival");
    // AND THE OTHER HALF OF THE SKETCH HAS NOTHING TO ACT ON, measured here
    // rather than argued: "dimmed and without its border" needs a border, and
    // on the rival's turn the throw control — the only element in this tray
    // that carries one — is not rendered at all.
    expect(table.roller(), "no hold is offered, so there is no throw control to take a border away from").toBeNull();
    const slots = [...table.diceEl.querySelectorAll<HTMLElement>(".hexdev-generala-die--empty")];
    expect(slots, "the rival has not thrown yet, so all five slots are waiting").toHaveLength(5);
    for (const slot of slots) expect(getComputedStyle(slot).opacity, "a waiting slot is never dimmed").toBe("1");
  });
});

/**
 * THE CUBILETE, AND THE THREE THINGS THIS TRAY IS ACTUALLY RESPONSIBLE FOR.
 *
 * `dice-ui` owns what a cup LOOKS like doing each of the three gestures and
 * fences that for itself. What lives here is the only part that is a rule:
 * which gesture a phase means, that the object outlives the control beside
 * it, and that it is the same element across a throw rather than a new one
 * per render.
 */
describe("generala tray: the cubilete on the table", () => {
  const gestureOf = (table: Table): string | null => table.cup()?.getAttribute("data-cup-gesture") ?? null;

  it("is standing there before anybody has thrown anything", () => {
    const table = seatTable();
    expect(table.cup(), "expected a cubilete from the very first render").not.toBeNull();
  });

  /**
   * THE BEAT THIS WHOLE CHANGE EXISTS FOR. `tray-styles.ts` records that a
   * fresh match is "roughly 170px of blank surface above a card of dashes",
   * on every turn's `systemActionPauseMs` plus the whole of a rival's
   * thinking time, with five dashed outlines as the only thing reporting that
   * anything is happening. This is the second thing.
   */
  it("shakes while the table is waiting for a roll", () => {
    expect(gestureOf(seatTable())).toBe("shaking");
  });

  it("tips the instant the dice arrive", () => {
    const table = seatTable();
    table.roll([3, 5, 5, 2, 6]);
    expect(gestureOf(table)).toBe("tipping");
  });

  /**
   * WHOEVER'S TURN IT IS, and the asymmetry with the dice beside it is
   * deliberate — see `gestureFor`'s own comment. The dice go quiet on the
   * rival's go so nobody reaches for a control that will not answer; the
   * cubilete is `aria-hidden` scenery that cannot be reached for at all, and
   * on this beat it is the only thing on the board saying the rival is
   * throwing.
   */
  it("shakes on the rival's turn too, and the row beside it is still marked as theirs", () => {
    const table = seatTable();
    table.roll(OPENING);
    table.score("ones");
    expect(table.diceEl.dataset.turn, "expected the turn to have passed").toBe("rival");
    expect(gestureOf(table)).toBe("shaking");
  });

  /**
   * FIVE OF A KIND OFF THE CUP. The engine ends the match as they land and
   * `facesOf` returns no dice at all, so this is the one throw where the row
   * stays empty — and `gestureFor` still answers "the cup poured", because
   * that is what happened. See its own comment for what the match-over
   * overlay does to the view of it.
   */
  it("tips on a servida even though the engine leaves no dice to show", () => {
    const table = seatTable();
    table.roll([6, 6, 6, 6, 6]);
    expect(table.nodes().length, "a servida-win turn carries no dice").toBe(0);
    expect(gestureOf(table)).toBe("tipping");
  });

  /**
   * THE ONE STRUCTURAL FENCE. The throw control is ABSENT rather than
   * disabled whenever the engine offers no hold — which is exactly the beat
   * the cubilete is shaking on. A cup mounted inside that button would vanish
   * on the only beat it exists for, and this is the assertion that says so:
   * one object, across a whole throw, while the control comes and goes.
   */
  it("is the same element across a full throw, while the control beside it disappears and comes back", () => {
    const table = seatTable();
    const first = table.cup();
    expect(table.roller(), "no throw is on offer while the cup is shaking").toBeNull();

    table.roll([3, 5, 5, 2, 6]);
    expect(table.roller(), "the throw control is back once there is a hold to offer").not.toBeNull();
    expect(table.cup()).toBe(first);

    table.hold([0]);
    expect(table.roller(), "and gone again while the next roll is in the air").toBeNull();
    expect(table.cup()).toBe(first);

    table.roll([1, 1, 1, 1]);
    expect(table.cup()).toBe(first);
  });

  /** The cubilete is scenery, so the row it sits in must still contain
   * exactly one thing a keyboard can land on. */
  it("adds nothing to the tab order — the row's only stops are the throw and the sound control", () => {
    const table = seatTable();
    table.roll([3, 5, 5, 2, 6]);
    const focusable = [...table.elements.rollEl.querySelectorAll("button, a, input, [tabindex]")];
    expect(focusable).toEqual([table.roller(), table.elements.rollEl.querySelector(".hexdev-generala-mute")]);
  });
});

/**
 * THE SOUND CONTROL, AND THE THREE CLAIMS THE PRODUCT DECISION RESTS ON.
 *
 * `dice-ui` owns what a rattle is made of and fences that for itself;
 * `sound-preference.ts` owns what survives a reload and fences that. What is
 * here is the part that is neither: the control exists, it is a real toggle
 * rather than a swapping label, and — the load-bearing one — nothing on this
 * board can make a noise until a player has pressed something on it.
 */
describe("generala tray: the control that stops the noise", () => {
  const mute = (table: Table): HTMLButtonElement => {
    const button = table.elements.rollEl.querySelector<HTMLButtonElement>(".hexdev-generala-mute");
    if (button === null) throw new Error("expected a sound control in the roll row");
    return button;
  };

  it("is on the board from the first render, beside the cubilete making the noise", () => {
    const table = seatTable();
    expect(mute(table).parentElement).toBe(table.elements.rollEl);
  });

  /**
   * A STABLE NAME PLUS `aria-pressed`, never a label that swaps between
   * "Silenciar" and "Activar". Both spellings get announced; the swapping one
   * is the one that lies, because a screen reader reading the new label after
   * a press says the OPPOSITE of what just happened.
   */
  it("is a real toggle: one name, and the state on aria-pressed", () => {
    const table = seatTable();
    const button = mute(table);
    const name = button.getAttribute("aria-label");
    expect(name).not.toBeNull();
    expect(button.getAttribute("aria-pressed")).toBe("false");

    button.click();
    expect(button.getAttribute("aria-pressed"), "pressed means muted").toBe("true");
    expect(button.getAttribute("aria-label"), "and the name does not move under it").toBe(name);

    button.click();
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  /** An icon-only control gives a sighted player nothing to read, so the
   * `title` is the one place the phrasing is an ACTION rather than a state —
   * it is read before the press, where `aria-pressed` is read after it. */
  it("says what pressing it will do, and changes that when the state changes", () => {
    const table = seatTable();
    const button = mute(table);
    const before = button.title;
    expect(before.length).toBeGreaterThan(0);
    button.click();
    expect(button.title).not.toBe(before);
  });

  it("draws a different glyph for each state rather than only a different colour (WCAG 1.4.1)", () => {
    const table = seatTable();
    const button = mute(table);
    const shape = (): string | null => button.querySelectorAll("path")[1]?.getAttribute("d") ?? null;
    const sounding = shape();
    expect(sounding).not.toBeNull();
    button.click();
    expect(shape()).not.toBe(sounding);
  });

  it("survives a throw, exactly as the cubilete beside it does", () => {
    const table = seatTable();
    const button = mute(table);
    button.click();
    table.roll([3, 5, 5, 2, 6]);
    expect(mute(table)).toBe(button);
    expect(button.getAttribute("aria-pressed"), "and the choice is not redrawn away").toBe("true");
  });

  /**
   * THE CLAIM THE WHOLE «DEFAULT ON» DECISION RESTS ON, and the only place it
   * can be measured: this widget is embedded in somebody else's page, and a
   * page that makes a noise at a visitor who merely loaded it is the most
   * disliked thing on the web.
   *
   * It cannot happen here, and not because a preference says so — because
   * `dice-sound.ts` builds an `AudioContext` ONLY inside `unlock()`, and this
   * tray calls `unlock()` from exactly two places, both of them handlers for
   * a real press on this widget's own surface. So a board can render a whole
   * rival turn, with the cup shaking and the dice landing, and still never
   * have constructed the object a sound would have to travel through.
   *
   * MEASURED THROUGH `AudioContext` ITSELF rather than through a spy on this
   * package: what has to be true is that no audio context comes into
   * existence, and counting constructions is the only assertion that says
   * that rather than restating the code.
   */
  it("constructs no audio context at all until a player presses something", () => {
    const RealAudioContext = window.AudioContext;
    let built = 0;
    class Counting extends RealAudioContext {
      constructor() {
        super();
        built++;
      }
    }
    (window as unknown as { AudioContext: typeof AudioContext }).AudioContext = Counting;
    try {
      const table = seatTable();
      // A whole throw's worth of renders, with nobody touching anything.
      table.roll([3, 5, 5, 2, 6]);
      table.redraw();
      expect(built, "a board nobody has pressed has nothing to sound through").toBe(0);

      // And the moment a player does touch it, there is one.
      table.dice()[0]!.click();
      expect(built).toBe(1);

      // Still one: the context is built once and kept, never per press.
      table.dice()[1]!.click();
      table.roller()?.click();
      expect(built).toBe(1);
    } finally {
      (window as unknown as { AudioContext: typeof AudioContext }).AudioContext = RealAudioContext;
    }
  });

  /**
   * THE THROW CONTROL IS THE OTHER GESTURE, and it needed its own case. The
   * one above presses a die first, so it stayed green with `throwThem`'s own
   * `unlock()` deleted — a player who holds nothing and simply throws is the
   * commonest path of all, and it was the one nothing covered.
   */
  it("takes the throw press as a gesture too, for a player who holds no dice at all", () => {
    const RealAudioContext = window.AudioContext;
    let built = 0;
    class Counting extends RealAudioContext {
      constructor() {
        super();
        built++;
      }
    }
    (window as unknown as { AudioContext: typeof AudioContext }).AudioContext = Counting;
    try {
      const table = seatTable();
      table.roll([3, 5, 5, 2, 6]);
      expect(built).toBe(0);
      table.roller()!.click();
      expect(built, "throwing without holding anything is still a press").toBe(1);
    } finally {
      (window as unknown as { AudioContext: typeof AudioContext }).AudioContext = RealAudioContext;
    }
  });

  /**
   * ON THE TRANSITION, NEVER ON THE RENDER — and this is the assertion that
   * says so. A board redraws on every broadcast AND on every die a player
   * presses, so a rattle keyed on "the phase is awaiting-roll" would restart
   * several times a throw: each restart cuts the burst before it and starts a
   * new one, which is audibly a stutter rather than a cup being shaken.
   *
   * MEASURED THROUGH `createBufferSource`, because there is nothing else to
   * measure: every voice this schedules goes through that one call, so
   * counting it is the difference between "the sound played once" and "the
   * sound played once per render" — which no assertion on this package's own
   * surface could tell apart.
   */
  it("plays a throw's sounds once, however many times the board redraws around it", async () => {
    const RealAudioContext = window.AudioContext;
    let voices = 0;
    class Counting extends RealAudioContext {
      override createBufferSource(): AudioBufferSourceNode {
        voices++;
        return super.createBufferSource();
      }
    }
    (window as unknown as { AudioContext: typeof AudioContext }).AudioContext = Counting;
    try {
      const table = seatTable();
      table.roll([3, 5, 5, 2, 6]);
      // A real, trusted press is the only thing that starts a context in this
      // browser — `dice-sound.browser.test.ts` measures that directly.
      await userEvent.click(table.dice()[0]!);
      const afterFirstPress = voices;
      // Four more renders of the same phase: three die presses and a plain
      // redraw. Not one of them is a new throw.
      table.dice()[1]!.click();
      table.dice()[2]!.click();
      table.dice()[1]!.click();
      table.redraw();
      expect(voices, "the same phase must not re-trigger a sound").toBe(afterFirstPress);
    } finally {
      (window as unknown as { AudioContext: typeof AudioContext }).AudioContext = RealAudioContext;
    }
  });

  /**
   * THE WIRING, WHICH IS A DIFFERENT CLAIM FROM THE MODULE.
   * `sound-preference.test.ts` proves the reader and the writer agree with
   * each other; neither of them proves this tray ever calls them. Both halves
   * stayed green with the write deleted and with the read replaced by a
   * literal `false` — so this is the case that says a mute survives the
   * player closing the tab.
   */
  it("remembers a mute across a whole new board, not just across a re-render", () => {
    const first = seatTable();
    first.elements.rollEl.querySelector<HTMLButtonElement>(".hexdev-generala-mute")!.click();
    expect(window.localStorage.getItem("convite:dice-muted"), "the choice must reach storage").toBe("1");

    // A second tray, built from nothing — the shape of a reload.
    const second = seatTable();
    expect(second.elements.rollEl.querySelector(".hexdev-generala-mute")!.getAttribute("aria-pressed"), "a fresh board must come back muted").toBe("true");
  });

  /** A player who mutes before ever throwing must not have an audio context
   * built for them either — muting is a request for less, not a reason to go
   * and construct the machinery. */
  it("constructs none when the first thing a player presses is the mute", () => {
    const RealAudioContext = window.AudioContext;
    let built = 0;
    class Counting extends RealAudioContext {
      constructor() {
        super();
        built++;
      }
    }
    (window as unknown as { AudioContext: typeof AudioContext }).AudioContext = Counting;
    try {
      const table = seatTable();
      mute(table).click();
      expect(mute(table).getAttribute("aria-pressed")).toBe("true");
      table.roll([3, 5, 5, 2, 6]);
      table.dice()[0]!.click();
      expect(built, "muted, so nothing to build").toBe(0);
    } finally {
      (window as unknown as { AudioContext: typeof AudioContext }).AudioContext = RealAudioContext;
    }
  });
});
