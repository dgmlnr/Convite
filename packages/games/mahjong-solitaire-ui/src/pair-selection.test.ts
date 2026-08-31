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

describe("resolvePress — two presses become a move, or they become nothing", () => {
  it("selects a tile that has at least one partner on offer", () => {
    expect(resolvePress(null, 1, LEGAL)).toEqual({ kind: "select", position: 1 });
    expect(resolvePress(null, 9, LEGAL)).toEqual({ kind: "select", position: 9 });
  });

  it("refuses to select a tile no offer names — a tile that cannot be lifted does not light up", () => {
    // 4 is not in any pair: covered, blocked on both sides, or simply
    // without a match on the board. Pressing it is not an error and not a
    // move; it is nothing, and nothing is what it has to look like.
    expect(resolvePress(null, 4, LEGAL)).toEqual({ kind: "clear" });
  });

  it("plays the pair when the second press completes one the server offered", () => {
    expect(resolvePress(1, 2, LEGAL)).toEqual({ kind: "play", pair: { a: 1, b: 2 } });
  });

  it("answers with the offer's OWN ordering, never the order the two were pressed in", () => {
    // The engine promises `a < b` on every action it emits and refuses a
    // move that does not match one exactly — an integration defect slice 5
    // found the expensive way, when the generator recorded its own steps in
    // the order it chose them. Pressing high-then-low must produce the
    // offered pair, not a mirrored one.
    expect(resolvePress(9, 7, LEGAL)).toEqual({ kind: "play", pair: { a: 7, b: 9 } });
  });

  it("moves the selection when the second press is a different tile that also has a partner", () => {
    // 7 and 1 are both selectable and are not a pair. Changing your mind is
    // the common case, not an error state: the press selects the new tile
    // rather than clearing and making the player press it twice.
    expect(resolvePress(1, 7, LEGAL)).toEqual({ kind: "select", position: 7 });
  });

  it("clears when the second press is a tile with no partner at all", () => {
    expect(resolvePress(1, 4, LEGAL)).toEqual({ kind: "clear" });
  });

  it("clears when the selected tile is pressed again — the way out of a selection", () => {
    expect(resolvePress(1, 1, LEGAL)).toEqual({ kind: "clear" });
  });

  it("clears every press once nothing is on offer, so a finished or deadlocked board cannot be selected on", () => {
    // Anti-vacuity for the empty case (R6): with no offers the loop over
    // them never runs, so this states what happens instead of relying on it.
    expect(resolvePress(null, 1, [])).toEqual({ kind: "clear" });
    expect(resolvePress(1, 2, [])).toEqual({ kind: "clear" });
  });

  it("reads the pair it is given rather than any pair — a press that completes a DIFFERENT offer is not this offer", () => {
    // 2 and 3 are each a legal partner of 1, and `{a: 2, b: 3}` is not on
    // offer. A rule that only checked "both tiles appear somewhere in the
    // list" would play it.
    expect(resolvePress(2, 3, LEGAL)).toEqual({ kind: "select", position: 3 });
  });
});
