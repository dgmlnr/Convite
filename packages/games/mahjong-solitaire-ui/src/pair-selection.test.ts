import { describe, expect, it } from "vitest";
import type { MahjongPair } from "./pair-selection.js";
import { resolvePress } from "./pair-selection.js";

/**
 * A tiny, hand-built offer list. Nothing here comes from the engine on
 * purpose: this file is about the RULE that turns two presses into a move,
 * and the rule's whole input is "what did the server say is legal". Building
 * the list by hand is also what keeps these assertions from being a second
 * run of `getLegalActions` (R15) — a fixture the production code assembled
 * cannot disagree with it.
 *
 * `1 & 2` and `1 & 3` share a tile deliberately: a free tile usually has more
 * than one partner on a real board, so "the selected tile is in a legal pair"
 * is never the same question as "these two are a legal pair".
 */
const LEGAL: readonly MahjongPair[] = [
  { a: 1, b: 2 },
  { a: 1, b: 3 },
  { a: 7, b: 9 },
];

/**
 * THE TWO INPUTS ARE INDEPENDENT, AND THAT INDEPENDENCE IS THE WHOLE POINT OF
 * THIS FIXTURE. `5` is liftable and appears in NO offer — a tile the player
 * can pick up which has no partner free right now. It is the exact case the
 * previous rule got wrong, so it is a member of this set and absent from
 * `LEGAL` on purpose, and any future edit that quietly aligns the two has
 * removed the only case worth testing.
 *
 * `4` is in neither: blocked, and therefore not selectable by anybody.
 */
const LIFTABLE: ReadonlySet<number> = new Set([1, 2, 3, 5, 7, 9]);

describe("resolvePress — two presses become a move, or they become nothing", () => {
  it("selects any tile the player may lift, partner or no partner", () => {
    expect(resolvePress(null, 1, LEGAL, LIFTABLE)).toEqual({ kind: "select", position: 1 });
    expect(resolvePress(null, 9, LEGAL, LIFTABLE)).toEqual({ kind: "select", position: 9 });
  });

  it("selects a liftable tile that no offer names — being unmatched is not being stuck", () => {
    // THE REGRESSION THIS FILE EXISTS FOR. `5` is free: nothing covers it and
    // one of its sides is open, so a player can reach it. It simply has no
    // twin available at this instant. Refusing the selection conflated those
    // two facts and showed the player neither, which read on a real board as
    // "this tile is broken" — the same silence a blocked tile answers with.
    expect(resolvePress(null, 5, LEGAL, LIFTABLE)).toEqual({ kind: "select", position: 5 });
  });

  it("refuses to select a tile the player cannot lift — a blocked tile does not light up", () => {
    // 4 is covered or walled in on both sides. Pressing it is not an error
    // and not a move; it is nothing, and nothing is what it has to look like.
    expect(resolvePress(null, 4, LEGAL, LIFTABLE)).toEqual({ kind: "clear" });
  });

  it("plays the pair when the second press completes one the server offered", () => {
    expect(resolvePress(1, 2, LEGAL, LIFTABLE)).toEqual({ kind: "play", pair: { a: 1, b: 2 } });
  });

  it("answers with the offer's OWN ordering, never the order the two were pressed in", () => {
    // The engine promises `a < b` and `applyAction` accepts only an exact
    // offer, so dispatching `{a: 9, b: 7}` — the order the presses happened
    // in — would be refused by a module whose every unit test passes.
    expect(resolvePress(9, 7, LEGAL, LIFTABLE)).toEqual({ kind: "play", pair: { a: 7, b: 9 } });
  });

  it("clears BOTH when the second press does not complete a pair, whatever that tile is", () => {
    // One rule for every miss, and deliberately not "re-select the second
    // tile if it looks usable". A press that does not make the pair is the
    // player finding out these two do not go together, and the answer to
    // that is the board going dark — not a new tile quietly lighting up
    // under a press the player meant as a question about the old one.
    expect(resolvePress(1, 7, LEGAL, LIFTABLE)).toEqual({ kind: "clear" });
    expect(resolvePress(1, 5, LEGAL, LIFTABLE)).toEqual({ kind: "clear" });
    expect(resolvePress(1, 4, LEGAL, LIFTABLE)).toEqual({ kind: "clear" });
  });

  it("clears when the selected tile is pressed again — the way out of a selection", () => {
    expect(resolvePress(1, 1, LEGAL, LIFTABLE)).toEqual({ kind: "clear" });
  });

  it("still lets a liftable tile be selected once nothing at all is on offer", () => {
    // A deadlocked board is the server's call to make and it ends the match;
    // until it does, a tile the player can reach still answers a press. The
    // old rule went silent here, which is precisely how a deadlock looked
    // identical to a bug.
    expect(resolvePress(null, 1, [], LIFTABLE)).toEqual({ kind: "select", position: 1 });
    expect(resolvePress(1, 2, [], LIFTABLE)).toEqual({ kind: "clear" });
  });

  it("asks the liftable set to start a selection and the offer list to finish one — never the other way round", () => {
    // The two inputs answer two different questions and neither substitutes
    // for the other. A first press asks "may I pick this up", which only the
    // liftable set knows; a second press asks "is this pair a legal removal",
    // which only the server's offer list can say. The fixture below cannot
    // occur on a real board — every tile the server names in an offer is free
    // by construction — and it is built impossible on purpose, so that a
    // future edit routing one question to the other input fails here instead
    // of on somebody's board.
    const nothing: ReadonlySet<number> = new Set();
    expect(resolvePress(null, 1, LEGAL, nothing)).toEqual({ kind: "clear" });
    expect(resolvePress(1, 2, LEGAL, nothing)).toEqual({ kind: "play", pair: { a: 1, b: 2 } });
  });

  it("reads the pair it is given rather than any pair — a press that completes a DIFFERENT offer is not this offer", () => {
    // `2` and `3` are each partnered with `1`, and with nothing else. Pressing
    // one while the other is selected completes no offer, so it clears.
    expect(resolvePress(2, 3, LEGAL, LIFTABLE)).toEqual({ kind: "clear" });
  });
});
