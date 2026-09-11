import { describe, expect, it } from "vitest";
import type { Bid, MentirosoAction, PlayerId, PlayerView } from "@hexdev/mentiroso-engine";
import { raisesFrom } from "@hexdev/mentiroso-engine";
import { DIE_FACE_PROBABILITY } from "./probability.js";
import { fixedRng, forbiddenRng, RIVAL_A, RIVAL_B, SELF } from "./fixtures.js";
import { chooseHardMentirosoAction, createHardBot } from "./hard.js";
import type { NonEmptyActions } from "./tier.js";

/**
 * SDD `mentiroso`, work unit D4/task 4.4, design D7: `hard` reuses the SAME
 * shared core every tier shares (`chooseModulatedMentirosoAction`,
 * `normal.ts`) with the IDENTITY estimate (the honest `atLeast`-based
 * probability is already exact — there is no analytic gain from noising or
 * determinizing IT), and supplies only its own `selectRaise` hook: instead
 * of `normal`'s uniform pick or `easy`'s minimal-raise bias, `hard`
 * determinizes many plausible full boards (`determinize.ts`) and picks the
 * raise most often TRUE across them — a house decision (no source names a
 * raise-selection algorithm; research C14 only names the generic
 * threshold/noise SHAPE, and `easy.ts` already spent that shape), declared
 * as one, not imported from anywhere.
 */

function doubt(playerId = SELF): MentirosoAction {
  return { type: "doubt", playerId };
}

function raise(bid: Bid, playerId = SELF): MentirosoAction {
  return { type: "raise", playerId, bid };
}

describe("createHardBot -- forced doubt at the ceiling, through the SHARED core (mentiroso-rules R-CEILING)", () => {
  it("doubts when doubt is the only legal action, across every rng draw -- the shared ceiling gate is reused, not re-implemented", () => {
    const view: PlayerView = {
      self: { playerId: SELF, seat: 0, dice: [6, 6] },
      rivals: [{ seat: 1, playerId: RIVAL_A, diceCount: 0 }],
      phase: { kind: "bidding", turnSeat: 0, bid: { quantity: 2, face: 6 } },
    };
    const legalActions: NonEmptyActions = [doubt()];
    for (const value of [0, 0.001, 0.5, 0.999]) {
      expect(createHardBot(fixedRng(value)).chooseAction(view, legalActions, 0)).toEqual(doubt());
    }
  });
});

describe("hard's doubt/continue gate is the SAME honest evaluation as normal's (identity estimate, no noise layer)", () => {
  it("the p = 1/6-vs-1/3 fence still applies through hard's own wiring, unmodulated", () => {
    // Same fixture shape normal.test.ts/easy.test.ts already use for this
    // fence: k = 4 (no own matches), n = 15 unseen. atLeast(4,15,1/6) ~= 0.2315
    // (doubts), atLeast(4,15,1/3) ~= 0.7908 (raises) at a fixed 0.5 coin flip.
    const view: PlayerView = {
      self: { playerId: SELF, seat: 0, dice: [1, 2, 3, 5, 6] },
      rivals: [
        { seat: 1, playerId: RIVAL_A, diceCount: 5 },
        { seat: 2, playerId: RIVAL_B, diceCount: 5 },
        { seat: 3, playerId: "rival-c" as PlayerId, diceCount: 5 },
      ],
      phase: { kind: "bidding", turnSeat: 0, bid: { quantity: 4, face: 4 } },
    };
    const onlyRaise = raise({ quantity: 5, face: 1 });
    const legalActions: NonEmptyActions = [doubt(), onlyRaise];

    expect(chooseHardMentirosoAction(view, legalActions, 1 / 6, fixedRng(0.5))).toEqual(doubt());
    expect(chooseHardMentirosoAction(view, legalActions, 1 / 3, fixedRng(0.5))).toBe(onlyRaise);
    expect(DIE_FACE_PROBABILITY).toBe(1 / 6);
    expect(createHardBot(fixedRng(0.5)).chooseAction(view, legalActions, 0)).toEqual(doubt());
  });
});

describe("layer -- determinized raise selection favors a raise made CERTAIN by the viewer's own dice", () => {
  it("picks the raise whose face the viewer already holds enough of, over raises a fixed rival sample never satisfies", () => {
    // Self holds four 5s -- raising to (1, 5) is already TRUE regardless of
    // any rival dice, so its safety fraction across every determinized
    // sample is 1.0. The rng is fixed so every sampled rival die reads
    // exactly 4 (DIE_FACES[3]): raising to (1, 1) is never true (self holds
    // no 1s, no sampled rival die is a 1 either), and neither is (2, 6)
    // (self holds exactly one 6, and no sampled rival die is a 6 either, so
    // the tally for face 6 never reaches 2). Deliberately NOT in face or
    // list-order (the correct answer sits in the MIDDLE, and is neither the
    // smallest face nor the smallest quantity), so this cannot pass by
    // coincidentally picking "the first" or "the smallest".
    const view: PlayerView = {
      self: { playerId: SELF, seat: 0, dice: [5, 5, 5, 5, 6] },
      rivals: [{ seat: 1, playerId: RIVAL_A, diceCount: 3 }],
      phase: { kind: "bidding", turnSeat: 0, bid: null },
    };
    const raiseAtOne = raise({ quantity: 1, face: 1 });
    const raiseAtFive = raise({ quantity: 1, face: 5 });
    const raiseAtSix = raise({ quantity: 2, face: 6 });
    const legalActions: NonEmptyActions = [raiseAtOne, raiseAtFive, raiseAtSix];

    expect(chooseHardMentirosoAction(view, legalActions, DIE_FACE_PROBABILITY, fixedRng(0.55))).toBe(raiseAtFive);
  });
});

describe("layer -- determinized raise selection responds to the SAMPLED rival dice, not only the viewer's own", () => {
  it("picks whichever candidate face the fixed sample consistently produces, when the viewer's own dice favor NEITHER", () => {
    // Self shows only 2s -- zero automatic matches for either candidate
    // face. rng is fixed so the sole rival die always reads exactly 4
    // (DIE_FACES[3]): (1, 4) is therefore true in every sample, (1, 6)
    // never is. Listed with the CORRECT answer second, and NOT face-sorted
    // (6 before 4), so a list-position or ascending-face shortcut would
    // fail this the same way it would fail the fixture above.
    const view: PlayerView = {
      self: { playerId: SELF, seat: 0, dice: [2, 2, 2, 2, 2] },
      rivals: [{ seat: 1, playerId: RIVAL_A, diceCount: 1 }],
      phase: { kind: "bidding", turnSeat: 0, bid: null },
    };
    const raiseAtSix = raise({ quantity: 1, face: 6 });
    const raiseAtFour = raise({ quantity: 1, face: 4 });
    const legalActions: NonEmptyActions = [raiseAtSix, raiseAtFour];

    expect(chooseHardMentirosoAction(view, legalActions, DIE_FACE_PROBABILITY, fixedRng(0.6))).toBe(raiseAtFour);
  });
});

describe("tie-break -- when two raises are BOTH certain, the earliest in the offered list wins, deterministically", () => {
  it("does not depend on face order -- the higher face is listed first and still loses to list order", () => {
    // Self holds enough of BOTH candidate faces (four 5s, five... well two
    // faces at quantity 1 both already certain): (1, 6) and (1, 5) are both
    // always true purely from self's own dice, tying at safety = 1.0. The
    // HIGHER face (6) is listed FIRST here, deliberately the opposite of
    // `raisesFrom`'s own ascending convention, so this cannot pass by
    // silently preferring "the higher face" or "ascending order" instead of
    // "whatever came first in the offered list".
    const view: PlayerView = {
      self: { playerId: SELF, seat: 0, dice: [6, 5, 5, 5, 5] },
      rivals: [{ seat: 1, playerId: RIVAL_A, diceCount: 2 }],
      phase: { kind: "bidding", turnSeat: 0, bid: null },
    };
    const raiseAtSix = raise({ quantity: 1, face: 6 });
    const raiseAtFive = raise({ quantity: 1, face: 5 });
    const legalActions: NonEmptyActions = [raiseAtSix, raiseAtFive];

    expect(chooseHardMentirosoAction(view, legalActions, DIE_FACE_PROBABILITY, fixedRng(0.5))).toBe(raiseAtSix);
  });
});

describe("a single legal raise short-circuits without spending any entropy on sampling", () => {
  it("returns the lone raise directly -- rng() is never called", () => {
    const view: PlayerView = {
      self: { playerId: SELF, seat: 0, dice: [1, 2, 3, 4, 5] },
      rivals: [{ seat: 1, playerId: RIVAL_A, diceCount: 5 }],
      phase: { kind: "bidding", turnSeat: 0, bid: null },
    };
    const onlyRaise = raise({ quantity: 1, face: 1 });
    const legalActions: NonEmptyActions = [onlyRaise];
    expect(chooseHardMentirosoAction(view, legalActions, DIE_FACE_PROBABILITY, forbiddenRng("single-raise short-circuit"))).toBe(
      onlyRaise,
    );
  });
});

describe("performance -- the decision stays cheap at the largest table this game reaches (comparable budget: generala-bot hard tier, 8.87 ms)", () => {
  it("stays well under budget with a full 6-seat raise lattice in play", () => {
    const ceiling: Bid = { quantity: 30, face: 6 };
    const currentBid: Bid = { quantity: 10, face: 3 };
    const raiseOptions = raisesFrom(currentBid, ceiling);
    expect(raiseOptions.length).toBeGreaterThan(100); // a real worst case, not a token list
    const legalActions = [doubt(), ...raiseOptions.map((bid) => raise(bid))] as NonEmptyActions;
    const view: PlayerView = {
      self: { playerId: SELF, seat: 0, dice: [1, 2, 3, 4, 5] },
      rivals: [
        { seat: 1, playerId: RIVAL_A, diceCount: 10 },
        { seat: 2, playerId: RIVAL_B, diceCount: 15 },
      ],
      phase: { kind: "bidding", turnSeat: 0, bid: currentBid },
    };
    const bot = createHardBot(fixedRng(0.5));
    const started = performance.now();
    for (let trial = 0; trial < 100; trial += 1) bot.chooseAction(view, legalActions, 0);
    const elapsed = performance.now() - started;
    expect(elapsed / 100).toBeLessThan(8.87);
  });
});
