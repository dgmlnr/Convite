import { page } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";

import { applyPlayerAction, applyRoll, createMatch, getLegalActions } from "@hexdev/generala-engine";
import type { ApplyResult, DieFace, GeneralaAction, HoldAction, MatchState, PlayerId } from "@hexdev/generala-engine";

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
afterEach(async () => {
  while (mounted.length > 0) mounted.pop()!.remove();
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
  readonly nodes: () => readonly HTMLElement[];
  readonly dice: () => readonly HTMLButtonElement[];
  readonly redraw: () => void;
  readonly drawInto: (other: HTMLElement) => void;
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
    render(elements, state.turn, offers, (action) => dispatched.push(action));
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
    roller: () => rollEl.querySelector<HTMLButtonElement>("button"),
    nodes: () => [...diceEl.children] as HTMLElement[],
    dice: () => [...diceEl.querySelectorAll<HTMLButtonElement>("button")],
    redraw: draw,
    drawInto: (other) => render({ diceEl: other, rollEl }, state.turn, offers, (action) => dispatched.push(action)),
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
