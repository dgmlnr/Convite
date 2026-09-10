import { describe, expect, it } from "vitest";
import { findLeakedSecrets, seatViewFingerprint } from "./hidden-state.js";

/** The shape the whole mechanism exists for: truco's `PlayerView`, cut down to
 * the two arms that matter — the viewer's own hand, and an opponent reduced to
 * a count. Written here rather than imported so this package keeps ZERO
 * dependencies, not even on a game. */
const cleanTrucoShapedView = {
  self: { playerId: "player-a", seat: 0, hand: [{ suit: "espada", rank: 1 }] },
  opponents: [{ playerId: "player-b", seat: 1, cardsRemaining: 3 }],
  teams: [{ id: "team-a", score: 0 }],
};

const opponentsCard = { suit: "oro", rank: 12 };

describe("findLeakedSecrets", () => {
  it("finds nothing in a view that redacts correctly", () => {
    expect(findLeakedSecrets(cleanTrucoShapedView, [opponentsCard])).toEqual([]);
  });

  /**
   * THE REGRESSION THIS FUNCTION WAS WRITTEN FOR, reproduced as a test rather
   * than as a claim.
   *
   * `truco-engine/src/view.test.ts` fences hidden cards with
   * `JSON.stringify(view).includes(cardId(card))`, and `cardId` renders
   * `{ suit: "oro", rank: 12 }` as `"12-oro"` while the view serializes the
   * same card as `{"suit":"oro","rank":12}`. The second assertion below is the
   * OLD scan, run against a view that is leaking outright, and it passes.
   * That is why the property test built on it stayed green with the opponent's
   * whole hand published — measured by planting exactly this leak in
   * `truco-engine/src/view.ts`, not deduced from reading it.
   */
  it("finds a whole card leaked under a key nothing names, where a rendered-id substring scan cannot", () => {
    const leaking = { ...cleanTrucoShapedView, opponents: [{ playerId: "player-b", seat: 1, cardsRemaining: 3, hand: [opponentsCard] }] };

    expect(findLeakedSecrets(leaking, [opponentsCard])).toEqual([opponentsCard]);
    const renderedId = `${String(opponentsCard.rank)}-${opponentsCard.suit}`;
    expect(JSON.stringify(leaking)).not.toContain(renderedId); // the old fence, on a view that IS leaking
  });

  it("finds it however deeply it is buried, and whatever the key is called", () => {
    const buried = { hand: null, audit: { trail: [{ note: "dealt", payload: { card: opponentsCard } }] } };

    expect(findLeakedSecrets(buried, [opponentsCard])).toEqual([opponentsCard]);
  });

  /** Escoba's shipped scan is `JSON.stringify(view).includes(JSON.stringify(card))`,
   * which only bites while the leaked object serializes its keys in the same
   * order as the fixture's. The match here is structural, so it does not
   * depend on that coincidence. */
  it("finds it with its keys in the other order, where a serialized-fragment scan would not", () => {
    const reordered = { opponents: [{ hand: [{ rank: 12, suit: "oro" }] }] };

    expect(findLeakedSecrets(reordered, [opponentsCard])).toEqual([opponentsCard]);
    expect(JSON.stringify(reordered)).not.toContain(JSON.stringify(opponentsCard));
  });

  it("finds a string secret embedded inside a longer string, not only standing alone", () => {
    const chatty = { log: ["player-b signalled asDeEspada at trick 1"] };

    expect(findLeakedSecrets(chatty, ["asDeEspada"])).toEqual(["asDeEspada"]);
  });

  it("reports every leaked secret and only the leaked ones", () => {
    const partial = { opponents: [{ hand: [opponentsCard] }] };

    expect(findLeakedSecrets(partial, [opponentsCard, { suit: "basto", rank: 5 }])).toEqual([opponentsCard]);
  });

  it("does not mistake a near-miss for the secret", () => {
    const near = { opponents: [{ hand: [{ suit: "oro", rank: 11 }] }] };

    expect(findLeakedSecrets(near, [opponentsCard])).toEqual([]);
  });

  /**
   * BOTH DIRECTIONS, and only the second one discriminates — measured, not
   * assumed. Deleting `deepEquals`'s width check leaves the first assertion
   * green (the node's extra key is absent from the secret, so the walk fails
   * anyway) and reds the second, where the node is the narrower of the two and
   * every one of ITS keys does match. A test that only asserted the first
   * would have been a fence around a clause it could not break.
   */
  it("does not mistake a partial overlap for the secret, whichever of the two is wider", () => {
    const viewWithWiderCard = { opponents: [{ hand: [{ suit: "oro", rank: 12, faceDown: true }] }] };
    expect(findLeakedSecrets(viewWithWiderCard, [opponentsCard])).toEqual([]);

    const viewWithOwnCard = { self: { hand: [opponentsCard] } };
    expect(findLeakedSecrets(viewWithOwnCard, [{ suit: "oro", rank: 12, faceDown: true }])).toEqual([]);
  });

  it("keeps array order significant: the same cards in another order are not the same hand", () => {
    const hand = [{ suit: "oro", rank: 12 }, { suit: "basto", rank: 5 }];

    expect(findLeakedSecrets({ leaked: [...hand].reverse() }, [hand])).toEqual([]);
    expect(findLeakedSecrets({ leaked: [...hand] }, [hand])).toEqual([hand]);
  });

  it("finds a secret that IS the whole view", () => {
    expect(findLeakedSecrets(opponentsCard, [opponentsCard])).toEqual([opponentsCard]);
  });

  it("finds nothing when nothing was declared, without inventing a failure", () => {
    expect(findLeakedSecrets(cleanTrucoShapedView, [])).toEqual([]);
  });
});

/** Generala's own shape (`generala-engine/src/view.ts`): every seat gets the
 * same table, re-keyed so that the reader is `self`. */
function generalaShapedView(viewerSeat: number) {
  const seats = [
    { playerId: "alice", seat: 0 },
    { playerId: "bob", seat: 1 },
    { playerId: "carol", seat: 2 },
  ];
  return {
    self: seats[viewerSeat],
    others: seats.filter((_, index) => index !== viewerSeat),
    totals: [12, 30, 0],
    turn: { phase: "deciding", seat: 1, rollsUsed: 2, dice: [6, 6, 6, 2, 1] },
  };
}

describe("seatViewFingerprint", () => {
  it("reads two seats of a genuinely public game as carrying the same information", () => {
    expect(seatViewFingerprint(generalaShapedView(0))).toEqual(seatViewFingerprint(generalaShapedView(2)));
  });

  it("separates two seats of a redacting game — the shape that must never pass as public", () => {
    const seatA = { self: { hand: [{ suit: "espada", rank: 1 }] }, opponents: [{ cardsRemaining: 3 }] };
    const seatB = { self: { hand: [{ suit: "oro", rank: 12 }] }, opponents: [{ cardsRemaining: 3 }] };

    expect(seatViewFingerprint(seatA)).not.toEqual(seatViewFingerprint(seatB));
  });

  it("moves when ONE seat is told something extra", () => {
    const withExtra = { ...generalaShapedView(0), nextFace: 4 };

    expect(seatViewFingerprint(withExtra)).not.toEqual(seatViewFingerprint(generalaShapedView(0)));
  });

  /**
   * THE REASON A LEAF CARRIES ITS KEY, and the only assertion in this file
   * that can tell. Adding a field always changes the multiset's SIZE, so the
   * test above reds whether or not the key travels — measured by dropping the
   * key from the leaf, which left every other assertion here green. What a
   * bare multiset of VALUES cannot see is two seats told the same numbers
   * under different names, which is a swap of who-knows-what and exactly the
   * per-seat difference a public game must not have.
   */
  it("separates two seats told the same values under different names", () => {
    expect(seatViewFingerprint({ rollsUsed: 2, seat: 1 })).not.toEqual(seatViewFingerprint({ rollsUsed: 1, seat: 2 }));
  });

  it("ignores the position a leaf sits in, which is what a re-key changes", () => {
    expect(seatViewFingerprint({ a: [1, 2] })).toEqual(seatViewFingerprint({ a: [2, 1] }));
  });

  it("tells a null apart from the string that spells it", () => {
    expect(seatViewFingerprint({ a: null })).not.toEqual(seatViewFingerprint({ a: "null" }));
  });

  it("is empty for a view that says nothing — the floor a vacuous comparison would pass on", () => {
    expect(seatViewFingerprint({})).toEqual([]);
    expect(seatViewFingerprint({ self: {}, others: [] })).toEqual([]);
    expect(seatViewFingerprint(generalaShapedView(0)).length).toBeGreaterThan(0);
  });
});
