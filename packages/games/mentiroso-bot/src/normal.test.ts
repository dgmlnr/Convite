import { describe, expect, it } from "vitest";
import type { RandomSource } from "@hexdev/platform-contract";
import type { Bid, MentirosoAction, PlayerId, PlayerView } from "@hexdev/mentiroso-engine";
import { raisesFrom } from "@hexdev/mentiroso-engine";
import { DIE_FACE_PROBABILITY } from "./probability.js";
import { chooseMentirosoAction, createNormalBot } from "./normal.js";
import type { NonEmptyActions } from "./tier.js";

/**
 * SDD `mentiroso`, work unit D2/task 4.2, design D7 ("normal": the honest
 * probability-proportional evaluation).
 *
 * `createNormalBot`'s tier reads ONLY `PlayerView` — never `MatchState` — the
 * exact shape a human sitting in that seat receives (`mentiroso-engine`'s own
 * `getViewFor`). A rival is a `{ seat, playerId, diceCount }` triple with no
 * `dice` field outside `showdown` (`view.ts`'s own `RivalView`), so a bot that
 * tried to read a rival's actual faces would not compile — the same
 * compile-time guarantee `view.ts` already documents for `getViewFor`.
 */

const SELF = "self-player" as PlayerId;
const RIVAL_A = "rival-a" as PlayerId;
const RIVAL_B = "rival-b" as PlayerId;
const RIVAL_C = "rival-c" as PlayerId;

/** A `RandomSource` fixed at one value — `[0, 1)` per its own contract
 * (`platform-contract/src/random.ts`) — so every test below asserts a
 * DECISION, never a distribution. */
function fixedRng(value: number): RandomSource {
  return () => value;
}

function doubt(playerId: PlayerId = SELF): MentirosoAction {
  return { type: "doubt", playerId };
}

function raise(bid: Bid, playerId: PlayerId = SELF): MentirosoAction {
  return { type: "raise", playerId, bid };
}

describe("createNormalBot -- forced doubt at the ceiling (mentiroso-rules R-CEILING, design D2)", () => {
  it("doubts when doubt is the only legal action, even though its OWN dice make the bid look certain", () => {
    // Own dice already cover the bid's quantity (k <= 0, so the probability
    // engine would answer "certainly true"), and it must not matter: the
    // ceiling forces exactly one legal action, full stop
    // ("convite/mentiroso/reglas-decididas": "única jugada forzada del
    // juego"). Negative control for this branch: removing it and falling
    // through to the probability gate would treat rng() >= 1 as "keep
    // going" in every realistic draw, landing in the now-EMPTY raise list.
    const view: PlayerView = {
      self: { playerId: SELF, seat: 0, dice: [6, 6] },
      rivals: [{ seat: 1, playerId: RIVAL_A, diceCount: 0 }],
      phase: { kind: "bidding", turnSeat: 0, bid: { quantity: 2, face: 6 } },
    };
    const legalActions: NonEmptyActions = [doubt()];
    expect(createNormalBot(fixedRng(0.5)).chooseAction(view, legalActions, 0)).toEqual(doubt());
  });

  it("stays doubt-only across every rng draw -- the branch never consults chance at all", () => {
    const view: PlayerView = {
      self: { playerId: SELF, seat: 0, dice: [1, 2] },
      rivals: [{ seat: 1, playerId: RIVAL_A, diceCount: 3 }],
      phase: { kind: "bidding", turnSeat: 0, bid: { quantity: 5, face: 6 } },
    };
    const legalActions: NonEmptyActions = [doubt()];
    for (const value of [0, 0.001, 0.5, 0.999]) {
      expect(createNormalBot(fixedRng(value)).chooseAction(view, legalActions, 0)).toEqual(doubt());
    }
  });
});

describe("the doubt/continue gate is probability-proportional over P(bid holds) -- research C5, design D7", () => {
  it("continues (raises) when the bid, evaluated honestly with the viewer's own dice folded in, is likely true", () => {
    // 4 of self's own 5 dice already show the claimed face, so k = 5 - 4 = 1
    // real unseen die, not 5 (research C2). atLeast(1, 10, 1/6) ~= 0.838; a
    // fixed rng of 0.5 falls well below it, so this must continue.
    const view: PlayerView = {
      self: { playerId: SELF, seat: 0, dice: [4, 4, 4, 4, 6] },
      // Deliberately asymmetric (2 rivals, 10 unseen dice, neither number
      // equal to the other) so a bug that counted RIVALS instead of DICE
      // would use n = 2, not n = 10 -- AGENTS.md's own "family of traps": a
      // fixture where two readings coincide measures nothing.
      rivals: [
        { seat: 1, playerId: RIVAL_A, diceCount: 5 },
        { seat: 2, playerId: RIVAL_B, diceCount: 5 },
      ],
      phase: { kind: "bidding", turnSeat: 0, bid: { quantity: 5, face: 4 } },
    };
    const raiseOption = raise({ quantity: 6, face: 1 });
    const legalActions: NonEmptyActions = [doubt(), raiseOption];
    expect(createNormalBot(fixedRng(0.5)).chooseAction(view, legalActions, 0)).toBe(raiseOption);
  });

  it("doubts the SAME shape of bid when the own-dice reduction would not apply -- the negative control for that clause", () => {
    // Same table, same bid, same rng -- but this time NONE of self's dice
    // show the claimed face, so k stays the full 5. This is exactly what a
    // bug deleting "quantity - ownMatching" would compute for the fixture
    // above too. atLeast(5, 10, 1/6) ~= 0.0155, so rng = 0.5 must doubt.
    const view: PlayerView = {
      self: { playerId: SELF, seat: 0, dice: [1, 2, 3, 5, 6] },
      rivals: [
        { seat: 1, playerId: RIVAL_A, diceCount: 5 },
        { seat: 2, playerId: RIVAL_B, diceCount: 5 },
      ],
      phase: { kind: "bidding", turnSeat: 0, bid: { quantity: 5, face: 4 } },
    };
    const legalActions: NonEmptyActions = [doubt(), raise({ quantity: 6, face: 1 })];
    expect(createNormalBot(fixedRng(0.5)).chooseAction(view, legalActions, 0)).toEqual(doubt());
  });

  it("the unseen count is the SUM of rivals' diceCount, never the rival array's length", () => {
    // Same self dice/bid as the "continues" case above (own reduction gives
    // k = 1), but the 10 unseen dice are spread over THREE rivals (2+3+5)
    // instead of two -- a different rival COUNT for the identical total, so
    // the decision must be byte-identical to the two-rival case, never
    // drift with headcount.
    const view: PlayerView = {
      self: { playerId: SELF, seat: 0, dice: [4, 4, 4, 4, 6] },
      rivals: [
        { seat: 1, playerId: RIVAL_A, diceCount: 2 },
        { seat: 2, playerId: RIVAL_B, diceCount: 3 },
        { seat: 3, playerId: RIVAL_C, diceCount: 5 },
      ],
      phase: { kind: "bidding", turnSeat: 0, bid: { quantity: 5, face: 4 } },
    };
    const raiseOption = raise({ quantity: 6, face: 1 });
    const legalActions: NonEmptyActions = [doubt(), raiseOption];
    expect(createNormalBot(fixedRng(0.5)).chooseAction(view, legalActions, 0)).toBe(raiseOption);
  });
});

describe("with no bid yet (the opening of a round) the tier always raises -- nothing exists to doubt", () => {
  it("with a single opening raise offered, it is returned regardless of rng", () => {
    const view: PlayerView = {
      self: { playerId: SELF, seat: 0, dice: [1, 2, 3, 4, 5] },
      rivals: [{ seat: 1, playerId: RIVAL_A, diceCount: 5 }],
      phase: { kind: "bidding", turnSeat: 0, bid: null },
    };
    const onlyRaise = raise({ quantity: 1, face: 1 });
    const legalActions: NonEmptyActions = [onlyRaise];
    for (const value of [0, 0.4, 0.999]) {
      expect(createNormalBot(fixedRng(value)).chooseAction(view, legalActions, 0)).toBe(onlyRaise);
    }
  });

  it("with several opening raises offered, rng genuinely selects among them by index", () => {
    const view: PlayerView = {
      self: { playerId: SELF, seat: 0, dice: [1, 2, 3, 4, 5] },
      rivals: [{ seat: 1, playerId: RIVAL_A, diceCount: 5 }],
      phase: { kind: "bidding", turnSeat: 0, bid: null },
    };
    const first = raise({ quantity: 1, face: 1 });
    const middle = raise({ quantity: 1, face: 2 });
    const last = raise({ quantity: 1, face: 3 });
    const legalActions: NonEmptyActions = [first, middle, last];
    // rng() = 0 must land on index 0; rng() just under 1 must land on the
    // last index -- proving the choice genuinely depends on rng rather than
    // always returning the same entry regardless of its draw.
    expect(createNormalBot(fixedRng(0)).chooseAction(view, legalActions, 0)).toBe(first);
    expect(createNormalBot(fixedRng(0.9999)).chooseAction(view, legalActions, 0)).toBe(last);
  });
});

describe("the p = 1/6-vs-1/3 fence sits at the DECISION level, not the constant level (design D7's own trap)", () => {
  // k = 4 (no own matches), n = 15 unseen dice: atLeast(4, 15, 1/6) ~= 0.2315
  // (rng = 0.5 must doubt), atLeast(4, 15, 1/3) ~= 0.7908 (the SAME rng must
  // instead continue). Neither test below reads DIE_FACE_PROBABILITY at
  // all -- this asserts the DECISION FUNCTION honors whatever `p` it is
  // handed, so changing the production constant AND this test in the same
  // commit could not defeat it, since this test never reads that constant.
  const view: PlayerView = {
    self: { playerId: SELF, seat: 0, dice: [1, 2, 3, 5, 6] },
    rivals: [
      { seat: 1, playerId: RIVAL_A, diceCount: 5 },
      { seat: 2, playerId: RIVAL_B, diceCount: 5 },
      { seat: 3, playerId: RIVAL_C, diceCount: 5 },
    ],
    phase: { kind: "bidding", turnSeat: 0, bid: { quantity: 4, face: 4 } },
  };
  const onlyRaise = raise({ quantity: 5, face: 1 });
  const legalActions: NonEmptyActions = [doubt(), onlyRaise];

  it("doubts at the real, no-wildcard p = 1/6", () => {
    expect(chooseMentirosoAction(view, legalActions, 1 / 6, fixedRng(0.5))).toEqual(doubt());
  });

  it("raises at the wildcard-tainted p = 1/3 -- the SAME position, the SAME rng draw", () => {
    expect(chooseMentirosoAction(view, legalActions, 1 / 3, fixedRng(0.5))).toBe(onlyRaise);
  });

  it("createNormalBot's production wiring reaches the same p = 1/6 answer through the real DIE_FACE_PROBABILITY constant", () => {
    // Same fixture, through the REAL entry point this time -- catches a bug
    // where the tier re-hardcodes its own p instead of importing the
    // constant `probability.ts` (task 4.1) already fences at exactly 1/6.
    expect(DIE_FACE_PROBABILITY).toBe(1 / 6);
    expect(createNormalBot(fixedRng(0.5)).chooseAction(view, legalActions, 0)).toEqual(doubt());
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
    const bot = createNormalBot(fixedRng(0.5));
    const started = performance.now();
    for (let trial = 0; trial < 1000; trial += 1) bot.chooseAction(view, legalActions, 0);
    const elapsed = performance.now() - started;
    expect(elapsed / 1000).toBeLessThan(8.87);
  });
});
