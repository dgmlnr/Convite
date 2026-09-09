import { afterEach, describe, expect, it, vi } from "vitest";

import { applyRoll, createMatch, getViewFor } from "@hexdev/generala-engine";
import type { ApplyResult, CategoryId, DieFace, MatchState, PlayerId, PlayerView } from "@hexdev/generala-engine";
import { applyPlayerAction, getLegalActions } from "@hexdev/generala-engine";

import { createGeneralaTurnClock, formatCountdown, remainingWholeSeconds, TURN_CLOCK_WARNING_SECONDS } from "./turn-clock.js";

/**
 * THE TURN CLOCK, AND THE THREE WAYS A COUNTDOWN GOES WRONG.
 *
 * A clock is the only thing on this board that changes without a broadcast, so
 * it is the only piece here that can be wrong while every other assertion in
 * the package stays green. Three failure modes, each with its own fence below:
 *
 * 1. IT OUTLIVES THE SCREEN. A `setInterval` holds its callback whether or not
 *    the node it writes into is still in a document, and a board that was
 *    unmounted leaves one running for the life of the page.
 * 2. IT KEEPS RUNNING IN A FINISHED MATCH. `applyScore` hands the turn to the
 *    next seat whether or not any card still has room, so the last box of a
 *    match leaves `turn.seat` pointing at somebody who will never play — and a
 *    clock reading that alone counts down under the verdict overlay.
 * 3. IT DRIFTS FROM THE SERVER. A local decrement is right for exactly as long
 *    as nothing throttles it. The authority is the absolute deadline the
 *    server puts on every "view" message, and the fence for that is a clock
 *    that JUMPS: hand it a `now` that has moved forty seconds since the last
 *    tick and the number must be forty seconds lower, not one.
 *
 * BOTH TIMING INPUTS ARE INJECTED, the same discipline `truco-ui`'s own clock
 * takes: `now` makes the rendered string deterministic, and `tickMs` means
 * these tests watch the number move without waiting real seconds for it.
 */

const SEAT = "clock-self" as PlayerId;
const RIVAL = "clock-rival" as PlayerId;
const SEATS: readonly PlayerId[] = [SEAT, RIVAL];

/** A fixed instant, so every expectation below is about arithmetic this file
 * fully controls rather than about wall-clock time. */
const T0 = 1_700_000_000_000;

const mounted: HTMLElement[] = [];
afterEach(() => {
  while (mounted.length > 0) mounted.pop()!.remove();
});

function accept(result: ApplyResult): MatchState {
  if (!result.ok) throw new Error(`the engine refused a step this test depends on: ${result.violation.code}`);
  return result.state;
}

/** Roll these five faces for whoever is on turn and write the box named,
 * through the engine's OWN offer — a category it would refuse fails loudly
 * here rather than producing a position nobody could have reached. */
function playTurn(state: MatchState, faces: readonly DieFace[], category: CategoryId): MatchState {
  const rolled = accept(applyRoll(state, faces));
  const turn = rolled.turn;
  if (turn.phase !== "deciding") throw new Error(`expected to be deciding after a roll, and the turn is ${turn.phase}`);
  const actor = rolled.players[turn.seat]!;
  const offer = getLegalActions(rolled, actor).find((action) => action.type === "score" && action.category === category);
  if (offer === undefined) throw new Error(`the engine did not offer ${category} to seat ${String(turn.seat)}`);
  return accept(applyPlayerAction(rolled, offer));
}

interface Mounted {
  readonly container: HTMLElement;
  readonly render: (view: PlayerView, deadline: number | null) => void;
  readonly stop: () => void;
  readonly cell: (seat: number) => HTMLElement;
  readonly time: (seat: number) => string;
  readonly said: () => string;
  readonly detach: () => void;
}

function mount(now: () => number, tickMs = 5): Mounted {
  const container = document.createElement("div");
  document.body.appendChild(container);
  mounted.push(container);
  const clock = createGeneralaTurnClock(document, { now, tickMs });
  container.appendChild(clock.clockEl);
  const cell = (seat: number): HTMLElement => {
    const found = clock.clockEl.querySelector<HTMLElement>(`.hexdev-generala-turn-clock-seat[data-seat="${String(seat)}"]`);
    if (found === null) throw new Error(`no clock cell for seat ${String(seat)}`);
    return found;
  };
  return {
    container,
    render: clock.render,
    stop: clock.stop,
    cell,
    time: (seat) => cell(seat).querySelector<HTMLElement>(".hexdev-generala-turn-clock-time")?.textContent ?? "",
    said: () => clock.clockEl.querySelector<HTMLElement>(".hexdev-dice-announcer")?.textContent ?? "",
    detach: () => {
      clock.clockEl.remove();
    },
  };
}

/** A view where seat 0 is deciding, which is the ordinary state a clock is
 * armed in. */
function selfDeciding(): PlayerView {
  return getViewFor(accept(applyRoll(createMatch(SEATS), [6, 6, 3, 2, 1])), SEAT);
}

/** The same table one turn later: seat 1 is the one being timed, and seat 0 is
 * the one reading. */
function rivalDeciding(): PlayerView {
  let state = playTurn(createMatch(SEATS), [6, 6, 6, 2, 1], "sixes");
  state = accept(applyRoll(state, [5, 5, 4, 3, 1]));
  return getViewFor(state, SEAT);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("generala turn clock: the arithmetic, which every face of it shares", () => {
  it.each([
    [60_000, "1:00"],
    [59_500, "1:00"],
    [59_000, "0:59"],
    [10_000, "0:10"],
    [1, "0:01"],
    [0, "0:00"],
  ])("reads %i ms as %s", (remaining, text) => {
    expect(formatCountdown(remaining)).toBe(text);
  });

  it("never goes negative, because a deadline really does pass before the server's bot answers", () => {
    // The window is real: the deadline fires server-side, the bot's decision is
    // in flight, and this client still holds the deadline that just expired.
    // "-0:03" reads as a bug; "0:00" reads as a turn being taken over.
    expect(remainingWholeSeconds(-3_000)).toBe(0);
    expect(formatCountdown(-3_000)).toBe("0:00");
  });

  it("rounds UP, so a clock armed for exactly a minute reads 1:00 on its first frame", () => {
    // `Math.floor` would show 0:59 before the player had looked at it, and
    // would spend the last whole second showing 0:00 on a turn still live.
    expect(remainingWholeSeconds(60_000)).toBe(60);
    expect(remainingWholeSeconds(59_001)).toBe(60);
  });
});

describe("generala turn clock: both seats, and only one of them counting", () => {
  it("shows the countdown on the seat that is being timed", () => {
    const table = mount(() => T0);
    table.render(selfDeciding(), T0 + 60_000);

    expect(table.time(0)).toBe("1:00");
    expect(table.cell(0).dataset.turn).toBe("active");
  });

  it("shows the RIVAL's countdown when the turn is theirs — their time running is information about the game", () => {
    const table = mount(() => T0);
    table.render(rivalDeciding(), T0 + 45_000);

    expect(table.time(1)).toBe("0:45");
    expect(table.cell(1).dataset.turn).toBe("active");
    // And nothing on the seat that is not being timed: there is one deadline on
    // the wire and it belongs to one seat.
    expect(table.time(0)).toBe("");
    expect(table.cell(0).dataset.turn).toBeUndefined();
  });

  it("gives both seats a cell whether or not they are counting, so nothing moves as the turn passes", () => {
    const table = mount(() => T0);
    const nameOf = (seat: number): DOMRect => table.cell(seat).querySelector<HTMLElement>(".hexdev-generala-turn-clock-name")!.getBoundingClientRect();

    table.render(selfDeciding(), T0 + 60_000);
    const mine = { cell: table.cell(0).getBoundingClientRect(), name: nameOf(0) };
    const theirs = { cell: table.cell(1).getBoundingClientRect(), name: nameOf(1) };
    // The premise: the two renders below really are opposite states, so this
    // is a comparison and not one measurement taken twice.
    expect(table.time(0)).toBe("1:00");
    expect(table.time(1)).toBe("");

    table.render(rivalDeciding(), T0 + 60_000);
    expect(table.time(0)).toBe("");
    expect(table.time(1)).toBe("1:00");

    // THE CELLS ARE FREE — two flex children of one row split it evenly
    // whatever is in them — SO THEY ARE NOT WHAT THIS FENCE IS FOR. It was,
    // and it was measuring the wrong mechanism: deleting the rule that keeps
    // the strip still moved neither cell by a pixel, because `flex: 1 1 0`
    // had already decided both widths.
    //
    // WHAT ACTUALLY SLIDES IS THE NAME. A time that collapses to nothing when
    // it holds nothing lets the pair beside it re-centre, so the seat's name
    // steps sideways at the start of every turn and back at the end of it.
    // The time reserving its width is what stops that, and this is the
    // measurement that can see it.
    expect(nameOf(0).left, "the name of the seat whose clock just stopped").toBe(mine.name.left);
    expect(nameOf(1).left, "and of the seat whose clock just started").toBe(theirs.name.left);
    expect(table.cell(0).getBoundingClientRect().width).toBe(mine.cell.width);
    expect(table.cell(0).getBoundingClientRect().height).toBe(mine.cell.height);
  });

  it("names each seat what the planilla's own column calls it", () => {
    const table = mount(() => T0);
    table.render(selfDeciding(), T0 + 60_000);

    expect(table.cell(0).textContent).toContain("Vos");
    expect(table.cell(1).textContent).toContain("Rival");
  });
});

describe("generala turn clock: the server's deadline is the only authority", () => {
  it("counts down between broadcasts — no new view message is needed to move the number", async () => {
    let now = T0;
    const table = mount(() => now);
    table.render(selfDeciding(), T0 + 60_000);
    expect(table.time(0)).toBe("1:00");

    now = T0 + 13_000;
    await sleep(40);
    expect(table.time(0)).toBe("0:47");
  });

  it("RECOMPUTES rather than decrements, so a throttled tab catches up in one tick instead of drifting", async () => {
    let now = T0;
    const table = mount(() => now);
    table.render(selfDeciding(), T0 + 60_000);

    // A backgrounded tab is exactly this: the interval did not fire for forty
    // seconds. A clock that subtracted one second per tick would now read
    // 0:59. This one reads what the server's own deadline says.
    now = T0 + 40_000;
    await sleep(40);
    expect(table.time(0)).toBe("0:20");
  });

  it("shows 0:00 rather than a negative number once the deadline has passed", async () => {
    let now = T0;
    const table = mount(() => now);
    table.render(selfDeciding(), T0 + 2_000);

    now = T0 + 9_000;
    await sleep(40);
    expect(table.time(0)).toBe("0:00");
  });
});

describe("generala turn clock: the three ways it must stop", () => {
  it("draws no countdown and arms no timer on an untimed table", async () => {
    let now = T0;
    const table = mount(() => now);
    // A game whose module ships no bot arms no clock at all
    // (`MatchRoom.armTurnTimer`'s own derivation), and an older payload with
    // no field at all means the same thing.
    table.render(selfDeciding(), null);

    expect(table.time(0)).toBe("");
    now = T0 + 30_000;
    await sleep(40);
    expect(table.time(0), "nothing resurrected it").toBe("");
  });

  it("stops when a later broadcast carries no deadline", async () => {
    let now = T0;
    const table = mount(() => now);
    table.render(selfDeciding(), T0 + 60_000);
    expect(table.time(0)).toBe("1:00");

    table.render(selfDeciding(), null);
    expect(table.time(0)).toBe("");
    now = T0 + 30_000;
    await sleep(40);
    expect(table.time(0), "the interval that was driving it is gone, not merely pointing at a cleared node").toBe("");
  });

  it("refuses to count in a FINISHED match, even holding a live deadline and a turn that still names a seat", async () => {
    let now = T0;
    const table = mount(() => now);
    const over = finishedMatch();
    // The premise, and it is the whole trap: the engine really has ended this
    // match AND `turn.seat` really does still name a seat, because `applyScore`
    // passes the turn on whether or not a card has room left.
    expect(over.outcome).not.toBeNull();
    expect(typeof over.turn.seat).toBe("number");

    table.render(over, T0 + 60_000);

    expect(table.time(0), "no countdown under a verdict overlay").toBe("");
    expect(table.time(1)).toBe("");
    expect(table.cell(0).dataset.turn).toBeUndefined();
    now = T0 + 30_000;
    await sleep(40);
    expect(table.time(0)).toBe("");
  });

  it("stops itself when the board it was drawing for leaves the document", async () => {
    let now = T0;
    const table = mount(() => now);
    table.render(selfDeciding(), T0 + 60_000);
    const node = table.cell(0).querySelector<HTMLElement>(".hexdev-generala-turn-clock-time")!;
    expect(node.textContent).toBe("1:00");

    // A match left, a container emptied underneath, a widget torn down: the
    // node the timer writes into is no longer connected to anything.
    table.detach();
    now = T0 + 20_000;
    await sleep(40);
    // The detached node is frozen at what it last said, which is the observable
    // form of "the interval is not running any more". A clock that kept ticking
    // would have written 0:40 into a screen nobody can see, forever.
    expect(node.textContent).toBe("1:00");

    // And it stays frozen: this is the second tick that would have fired.
    now = T0 + 50_000;
    await sleep(40);
    expect(node.textContent).toBe("1:00");
  });

  it("stops outright when the board says so, without waiting for a tick to discover it", async () => {
    let now = T0;
    const table = mount(() => now);
    table.render(selfDeciding(), T0 + 60_000);

    table.stop();
    now = T0 + 20_000;
    await sleep(40);
    expect(table.time(0)).toBe("1:00");
  });

  it("leaves ONE timer behind however many broadcasts arrive", () => {
    // COUNTED, NOT INFERRED, and the first version of this fence was vacuous
    // for a reason worth keeping: it re-rendered ten times, detached, and
    // checked the number had stopped moving — which ten uncleared timers ALSO
    // produce, because each of them independently notices the node has left.
    // The claim is about how many are alive at once, so that is what is
    // measured.
    const armed = vi.spyOn(globalThis, "setInterval");
    const cleared = vi.spyOn(globalThis, "clearInterval");
    try {
      const table = mount(() => T0);
      // Ten packets for one turn is an ordinary storm — a hold, a throw, a
      // rival's move — and every one of them re-renders.
      for (let packet = 0; packet < 10; packet += 1) table.render(selfDeciding(), T0 + 60_000);
      expect(armed.mock.calls.length, "one per render").toBe(10);
      expect(armed.mock.calls.length - cleared.mock.calls.length, "and exactly one of them still alive").toBe(1);

      table.stop();
      expect(armed.mock.calls.length - cleared.mock.calls.length).toBe(0);
    } finally {
      armed.mockRestore();
      cleared.mockRestore();
    }
  });
});

describe("generala turn clock: what a screen reader gets, which is never the seconds", () => {
  it("keeps the ticking number out of the accessibility tree and out of every live region", () => {
    const table = mount(() => T0);
    table.render(selfDeciding(), T0 + 60_000);

    const node = table.cell(0).querySelector<HTMLElement>(".hexdev-generala-turn-clock-time")!;
    // The row carries the attribute, not the mounted element: `aria-hidden` on
    // an ancestor takes the whole subtree with it, and the region lives in that
    // subtree.
    expect(table.cell(0).closest("[aria-hidden]")?.className).toBe("hexdev-generala-turn-clock-row");
    for (const region of table.container.querySelectorAll("[aria-live]")) {
      expect(region.contains(node), "a per-second number inside a live region is read out sixty times a minute").toBe(false);
    }
  });

  it("says the total once, when the turn starts, and never repeats it on a re-render of the same turn", () => {
    const table = mount(() => T0);
    table.render(selfDeciding(), T0 + 60_000);
    expect(table.said()).toBe("Tenés 60 segundos para jugar");

    // A hold, a re-render, another packet: same turn, same deadline, nothing
    // new to say.
    const said = table.said();
    table.render(selfDeciding(), T0 + 60_000);
    expect(table.said()).toBe(said);
  });

  it("says nothing at all about the RIVAL's clock — theirs is drawn, not announced", () => {
    const table = mount(() => T0);
    table.render(rivalDeciding(), T0 + 45_000);

    // Visible for everyone, spoken for nobody: a rival's countdown announced
    // every single turn is spam rather than access.
    expect(table.time(1)).toBe("0:45");
    expect(table.said()).toBe("");
  });

  it("warns once, at the threshold, with the threshold and never the live number", async () => {
    let now = T0;
    const table = mount(() => now);
    table.render(selfDeciding(), T0 + 60_000);
    expect(table.said()).toBe("Tenés 60 segundos para jugar");

    now = T0 + 44_000;
    await sleep(40);
    expect(table.said(), "nothing said while there is still time").toBe("Tenés 60 segundos para jugar");
    // The visible number really is moving, which is what keeps the assertion
    // above from passing on a clock that never ticked.
    expect(table.time(0)).toBe("0:16");

    now = T0 + 51_000;
    await sleep(40);
    expect(table.said()).toBe(`Quedan ${String(TURN_CLOCK_WARNING_SECONDS)} segundos`);

    // ONCE. A polite region repeating a warning every second is worse than no
    // warning at all.
    now = T0 + 55_000;
    await sleep(40);
    expect(table.said()).toBe(`Quedan ${String(TURN_CLOCK_WARNING_SECONDS)} segundos`);
  });
});

/** A whole match, played through the engine, so "the match is over" is the
 * engine's own answer rather than a flag this file set. */
function finishedMatch(): PlayerView {
  let state = createMatch(SEATS);
  const script: readonly (readonly [readonly DieFace[], CategoryId])[] = [
    [[1, 1, 1, 4, 5], "ones"],
    [[2, 2, 6, 6, 3], "twos"],
    [[3, 3, 3, 1, 5], "threes"],
    [[4, 4, 4, 2, 1], "fours"],
    [[5, 5, 5, 3, 2], "fives"],
    [[6, 6, 6, 1, 2], "sixes"],
    [[1, 2, 3, 4, 5], "escalera"],
    [[2, 2, 2, 5, 5], "full"],
    [[3, 3, 3, 3, 6], "poker"],
    // The doble before the generala: both are written at zero here, and a zero
    // goes in the highest-paying open box, so the ladder reaches the doble
    // first.
    [[5, 5, 1, 2, 3], "generala-doble"],
    [[4, 4, 4, 1, 2], "generala"],
  ];
  for (const [faces, category] of script) {
    state = playTurn(state, faces, category);
    state = playTurn(state, faces, category);
  }
  return getViewFor(state, SEAT);
}
