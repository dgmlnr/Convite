import { afterEach, describe, expect, it } from "vitest";

import { getViewFor } from "@hexdev/mentiroso-engine";
import type { MatchState, PlayerId } from "@hexdev/mentiroso-engine";

import { createMentirosoCups } from "./cups.js";

/**
 * `cups.ts`'s own tests (SDD `mentiroso`, work unit E2/task 5.2, design D5).
 *
 * STATES ARE HAND-BUILT LITERALS, NOT DRIVEN THROUGH 25 ROUNDS OF REDUCERS —
 * the same precedent `mentiroso-engine/src/fixtures.ts` already sets for its
 * own `midMatchEliminatedState` (a mid-match, interleaved-elimination state
 * built directly, never produced by replaying showdowns one die at a time).
 * That is a DIFFERENT thing from the anti-pattern `generala-ui/src/tray.
 * browser.test.ts` warns against: THIS file never hand-builds a `PlayerView`
 * — every view below is the REAL `getViewFor`'s output over a hand-built
 * `MatchState`, so the one thing under test (redaction, seat/dice
 * attribution) is always the engine's own, never a literal this file wrote
 * hoping the renderer reads it back.
 *
 * SIX SEATS, mySeat = 3, TWO OF THEM ELIMINATED (2 and 4, interleaved among
 * the living) — the exact fixture shape the launch prompt names as the one
 * that already caught a leak two seats could not (`C4`, task 3.4), reused
 * here to catch the analogous UI-side risk: two seats sharing a dice COUNT
 * (self and seat 5 both hold non-trivial arrays; several rivals coincide in
 * length with each other), and `mySeat !== 0` specifically so that
 * `view.rivals`' order (ascending seat number, self excluded) and
 * `tableLayout`'s own order (a rotation STARTING at `mySeat`) disagree —
 * zipping the two arrays by INDEX instead of by `.seat` would misattribute
 * dice the moment this file's own code did that, and every seat below
 * carries a distinct dice signature so a misattribution is not just
 * detectable, it names exactly which seat's dice ended up in whose cup.
 */
const SEAT_IDS: readonly PlayerId[] = [0, 1, 2, 3, 4, 5].map((seat) => `seat-${String(seat)}` as PlayerId);
const [P0, P1, P2, P3, P4, P5] = SEAT_IDS as readonly [PlayerId, PlayerId, PlayerId, PlayerId, PlayerId, PlayerId];
const MY_SEAT = 3;
const MY_PLAYER_ID = P3;

function biddingState(): MatchState {
  return {
    players: [
      { id: P0, seat: 0, dice: [1, 1, 1] },
      { id: P1, seat: 1, dice: [2, 2] },
      { id: P2, seat: 2, dice: [] }, // eliminated
      { id: P3, seat: 3, dice: [3, 3, 3, 3, 3] }, // self
      { id: P4, seat: 4, dice: [] }, // eliminated
      { id: P5, seat: 5, dice: [6, 6, 6, 6] },
    ],
    phase: { kind: "bidding", turnSeat: MY_SEAT, bid: null },
  };
}

function showdownState(): MatchState {
  return { ...biddingState(), phase: { kind: "showdown", bid: { quantity: 1, face: 1 }, doubterSeat: 5, matched: 3, loserSeat: 5, winnerSeat: MY_SEAT } };
}

function awaitingRollState(): MatchState {
  // Same seats, but the round has not rolled yet — every `dice` value below
  // is a PLACEHOLDER (state.ts's own `createMatch`: "nothing reads a seat's
  // dice VALUES until the bidding phase"), which is exactly why this fixture
  // reuses `biddingState`'s dice arrays unchanged: what matters here is the
  // phase, not the (irrelevant, stale) numbers sitting in them.
  return { ...biddingState(), phase: { kind: "awaiting-roll", openerSeat: MY_SEAT } };
}

const mounted: HTMLElement[] = [];
afterEach(() => {
  while (mounted.length > 0) mounted.pop()!.remove();
});

function mountContainer(): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  mounted.push(container);
  return container;
}

function cupsBySeat(container: HTMLElement): ReadonlyMap<number, HTMLButtonElement> {
  const result = new Map<number, HTMLButtonElement>();
  for (const wrapper of container.querySelectorAll<HTMLElement>("[data-seat]")) {
    const seat = Number(wrapper.dataset.seat);
    const cup = wrapper.querySelector<HTMLButtonElement>(".hexdev-dice-cup");
    if (cup !== null) result.set(seat, cup);
  }
  return result;
}

function diceScenesIn(cup: HTMLButtonElement): number {
  return cup.parentElement!.querySelectorAll(".hexdev-dice-scene").length;
}

describe("cups: one DiceCupHandle per registered seat, addressable by seat number", () => {
  it("mounts exactly one cup per seat, each under its own [data-seat]", () => {
    const container = mountContainer();
    const render = createMentirosoCups();
    render(container, getViewFor(biddingState(), MY_PLAYER_ID));

    const bySeat = cupsBySeat(container);
    expect(bySeat.size).toBe(6);
    expect([...bySeat.keys()].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe("cups: own cup stays interactive; every rival's cup is disabled with a distinct seat-named label", () => {
  it("disables all five rivals and relabels each one distinctly, leaving the viewer's own enabled", () => {
    const container = mountContainer();
    const render = createMentirosoCups();
    render(container, getViewFor(biddingState(), MY_PLAYER_ID));

    const bySeat = cupsBySeat(container);
    const own = bySeat.get(MY_SEAT)!;
    expect(own.disabled).toBe(false);

    const rivalSeats = [0, 1, 2, 4, 5];
    const rivalLabels = rivalSeats.map((seat) => {
      const cup = bySeat.get(seat)!;
      expect(cup.disabled).toBe(true);
      return cup.getAttribute("aria-label");
    });
    expect(new Set(rivalLabels).size).toBe(rivalSeats.length);
    for (const label of rivalLabels) expect(label).not.toBe("Tirar los dados");
  });
});

describe("cups: a rival's dice are never drawn before showdown — the redaction this file exists to enforce", () => {
  it("rolls the viewer's own dice once the round is real, but draws nothing for any rival, eliminated or not", () => {
    const container = mountContainer();
    const render = createMentirosoCups();
    render(container, getViewFor(biddingState(), MY_PLAYER_ID));

    const bySeat = cupsBySeat(container);
    expect(diceScenesIn(bySeat.get(MY_SEAT)!)).toBe(5); // self: 5 real dice, drawn

    for (const seat of [0, 1, 2, 4, 5]) {
      expect(diceScenesIn(bySeat.get(seat)!)).toBe(0);
    }
  });

  it("does not roll the viewer's own placeholder dice either, before the round has actually rolled", () => {
    const container = mountContainer();
    const render = createMentirosoCups();
    render(container, getViewFor(awaitingRollState(), MY_PLAYER_ID));

    const bySeat = cupsBySeat(container);
    for (const seat of [0, 1, 2, 3, 4, 5]) {
      expect(diceScenesIn(bySeat.get(seat)!)).toBe(0);
    }
  });
});

describe("cups: at showdown, every seat's revealed dice land in THAT seat's own cup, never shifted by one", () => {
  it("attributes each living seat's distinct dice signature correctly despite rivals/positions ordering differently", () => {
    const container = mountContainer();
    const render = createMentirosoCups();
    render(container, getViewFor(showdownState(), MY_PLAYER_ID));

    const bySeat = cupsBySeat(container);
    // Every living seat's dice count is distinct, so a shifted attribution
    // would show the WRONG COUNT at some seat, not just the wrong values.
    expect(diceScenesIn(bySeat.get(0)!)).toBe(3);
    expect(diceScenesIn(bySeat.get(1)!)).toBe(2);
    expect(diceScenesIn(bySeat.get(3)!)).toBe(5);
    expect(diceScenesIn(bySeat.get(5)!)).toBe(4);
  });

  it("keeps an eliminated seat's cup empty even once its (empty) dice array is revealed", () => {
    const container = mountContainer();
    const render = createMentirosoCups();
    render(container, getViewFor(showdownState(), MY_PLAYER_ID));

    const bySeat = cupsBySeat(container);
    expect(diceScenesIn(bySeat.get(2)!)).toBe(0);
    expect(diceScenesIn(bySeat.get(4)!)).toBe(0);
  });
});

describe("cups: a rival's dice count is public — a status mark says so without ever showing a face", () => {
  it("shows a dice-count mark for a living rival, and a distinct 'no dice' mark for an eliminated one", () => {
    const container = mountContainer();
    const render = createMentirosoCups();
    render(container, getViewFor(biddingState(), MY_PLAYER_ID));

    const wrapper = (seat: number) => container.querySelector<HTMLElement>(`[data-seat="${String(seat)}"]`)!;
    expect(wrapper(5).querySelector(".hexdev-mentiroso-cup-status")?.textContent).toBe("4 dados");
    expect(wrapper(1).querySelector(".hexdev-mentiroso-cup-status")?.textContent).toBe("2 dados");
    expect(wrapper(2).querySelector(".hexdev-mentiroso-cup-status")?.textContent).toBe("Sin dados");
    expect(wrapper(4).querySelector(".hexdev-mentiroso-cup-status")?.textContent).toBe("Sin dados");
    // The viewer's own seat carries no such mark — its dice are simply shown.
    expect(wrapper(MY_SEAT).querySelector(".hexdev-mentiroso-cup-status")).toBeNull();
  });

  it("uses the singular for exactly one die", () => {
    const container = mountContainer();
    const render = createMentirosoCups();
    const oneDieState: MatchState = { ...biddingState(), players: biddingState().players.map((player) => (player.seat === 0 ? { ...player, dice: [4] } : player)) };
    render(container, getViewFor(oneDieState, MY_PLAYER_ID));

    const wrapper = container.querySelector<HTMLElement>('[data-seat="0"]')!;
    expect(wrapper.querySelector(".hexdev-mentiroso-cup-status")?.textContent).toBe("1 dado");
  });

  /**
   * FOUND BY LOOKING (SDD `mentiroso`, work unit E4/task 5.4 — rendering this
   * package's own `showdown.ts` alongside `cups.ts` for the first time over a
   * dark table felt, per `AGENTS.md`'s "todos los defectos visuales... los
   * encontró alguien mirando"): this mark never set its own ink, so it drew
   * in the BROWSER'S DEFAULT text colour — near-black — over a dark green
   * felt. At 4x zoom on the rendered PNG it was barely a shadow, not text.
   * `diceStatusLabel`'s own string was always correct; nothing tested colour.
   */
  it("gives the status mark a light ink of its own, never the browser's default, so it reads against a dark felt", () => {
    const container = mountContainer();
    const render = createMentirosoCups();
    render(container, getViewFor(biddingState(), MY_PLAYER_ID));

    const status = container.querySelector<HTMLElement>('[data-seat="5"] .hexdev-mentiroso-cup-status')!;
    expect(status.style.color).toBe("rgb(242, 242, 242)");
  });
});

describe("cups: a seat's fragment keeps its own footprint, wherever its anchor lands in the container", () => {
  /**
   * FOUND BY LOOKING, per `AGENTS.md`'s own "todos los defectos visuales...
   * los encontró alguien mirando" — `cups.scene.test.ts`'s own render showed
   * the viewer's own five dice climbing straight up through the middle of
   * the table instead of sitting beside their cup.
   *
   * THE MECHANISM: an absolutely positioned box with only `left` set (never
   * `right`, never an explicit `width`) is NOT sized by its own preferred
   * content width — CSS clamps its shrink-to-fit width to whatever space is
   * left between `left` and the containing block's own right edge. The
   * viewer's own seat sits at `left: 50%`, so in an 800px-wide table only
   * ~400px remain to its right; `.hexdev-dice-root`'s cup-plus-five-dice row
   * needs far more than that, so `flex-wrap` folds it onto several ROWS
   * instead of the one it would use with room to spread. `transform:
   * translate()` cannot fix this: it repositions an already-sized box at
   * PAINT time, strictly after layout has already clamped the width.
   */
  it("lays the viewer's own five dice out in one row even where little room remains to the anchor's right", () => {
    const container = mountContainer();
    container.style.width = "800px";
    const render = createMentirosoCups();
    render(container, getViewFor(biddingState(), MY_PLAYER_ID));

    const own = cupsBySeat(container).get(MY_SEAT)!;
    const scenes = [...own.parentElement!.querySelectorAll(".hexdev-dice-scene")];
    expect(scenes).toHaveLength(5);
    const tops = scenes.map((scene) => scene.getBoundingClientRect().top);
    expect(new Set(tops).size).toBe(1);
  });
});

describe("cups: seat positions come from table-layout.ts — the viewer's own cup anchors at the bottom", () => {
  it("centers the viewer's own wrapper horizontally and places it below the table's vertical center", () => {
    const container = mountContainer();
    const render = createMentirosoCups();
    render(container, getViewFor(biddingState(), MY_PLAYER_ID));

    const own = container.querySelector<HTMLElement>(`[data-seat="${String(MY_SEAT)}"]`)!;
    expect(own.style.left).toBe("50%");
    expect(Number.parseFloat(own.style.top)).toBeGreaterThan(50);
  });
});

describe("cups: at six-seat showdown, every seat's tray stays legible — no cup's dice cover a neighbor's", () => {
  /**
   * FOUND BY LOOKING, per `AGENTS.md`'s own "todos los defectos visuales...
   * los encontró alguien mirando" — `cups.scene.test.ts`'s six-seat showdown
   * render showed every seat's revealed dice piled on top of its neighbors,
   * unreadable. The wrap fix above keeps each fragment from folding onto
   * several rows, but a `.hexdev-dice-root` at its native size (cup plus
   * five `DIE_SCENE_SIZE`-boxed dice) is far wider than the arc of table an
   * ellipse of six seats actually gives each one — centering that native
   * size on every seat's own anchor collides with the seats beside it the
   * moment more than one seat carries a full tray, which is exactly what
   * showdown does to all six at once. mentiroso-hidden-dice's own "Dice
   * become visible to all seats once showdown resolves" is not satisfied by
   * dice a viewer cannot actually read.
   */
  it("keeps every seat's wrapper clear of every other seat's, with six live seats all revealed at once", () => {
    const container = mountContainer();
    container.style.width = "1280px";
    container.style.height = "800px";
    const render = createMentirosoCups();

    const allRevealed: MatchState = {
      players: [
        { id: P0, seat: 0, dice: [1, 1, 1] },
        { id: P1, seat: 1, dice: [2, 2] },
        { id: P2, seat: 2, dice: [3, 3, 3, 3] },
        { id: P3, seat: 3, dice: [4, 4, 4, 4, 4] },
        { id: P4, seat: 4, dice: [5, 5, 5] },
        { id: P5, seat: 5, dice: [6, 6, 6, 6] },
      ],
      phase: { kind: "showdown", bid: { quantity: 1, face: 1 }, doubterSeat: 5, matched: 3, loserSeat: 5, winnerSeat: MY_SEAT },
    };
    render(container, getViewFor(allRevealed, MY_PLAYER_ID));

    const rects = [...cupsBySeat(container).values()].map((cup) => cup.parentElement!.getBoundingClientRect());
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i]!;
        const b = rects[j]!;
        const overlaps = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        expect(overlaps).toBe(false);
      }
    }
  });
});

describe("cups: re-rendering the same match reuses the mounted cups instead of remounting them", () => {
  it("keeps the same DOM button across two renders of an unchanged seat count", () => {
    const container = mountContainer();
    const render = createMentirosoCups();
    const view = getViewFor(biddingState(), MY_PLAYER_ID);
    render(container, view);
    const before = cupsBySeat(container).get(MY_SEAT);
    render(container, view);
    const after = cupsBySeat(container).get(MY_SEAT);
    expect(after).toBe(before);
  });
});
