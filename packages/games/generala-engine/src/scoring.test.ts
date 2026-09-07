import { describe, expect, it } from "vitest";

import { DIE_FACES } from "./dice.js";
import type { Dice } from "./dice.js";
import type { PlayerId } from "./ids.js";
import { counts, faceTotal, isEscalera, isFull, isGenerala, isPoker, scoreFor } from "./scoring.js";
import { CATEGORY_IDS, createMatch } from "./state.js";
import type { Scorecard } from "./state.js";

describe("counts", () => {
  it("tallies how many dice show each face", () => {
    expect(counts([6, 6, 6, 2, 1])).toEqual({ 1: 1, 2: 1, 3: 0, 4: 0, 5: 0, 6: 3 });
  });

  it("tallies a different hand differently", () => {
    // Triangulation against a hardcoded tally: nothing about the shape of the
    // first hand survives into this one.
    expect(counts([4, 4, 1, 2, 3])).toEqual({ 1: 1, 2: 1, 3: 1, 4: 2, 5: 0, 6: 0 });
    expect(counts([5, 5, 5, 5, 5])).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 5, 6: 0 });
  });

  it("reads 0, never undefined, for a face nobody rolled", () => {
    // DECLARED AS HAVING NO ISOLATING MUTATION, measured rather than assumed: a
    // sparse tally that records only the faces it saw was planted, and it reds
    // the two `toEqual` cases above as well as this one (4 of 5 tests here go
    // red). So this test proves nothing those two do not already prove, and it
    // is kept anyway for the reason the archive's rung 4 permits — it states the
    // contract in the words a CONSUMER needs, at the place a consumer reads it.
    //
    // The contract: every face is an own key, always. Not because a missing key
    // looks untidy, but because `tally[3] * 3` is then `NaN` rather than 0 — and
    // that lands on exactly the hands where an upper box is crossed out at zero,
    // which is the commonest event in a real match. The property below is what
    // actually caught that `NaN` when the mutation was planted.
    const tally = counts([2, 2, 2, 2, 2]);

    for (const face of DIE_FACES) {
      expect(tally[face]).toBe(face === 2 ? 5 : 0);
      expect(Object.hasOwn(tally, String(face))).toBe(true);
    }
  });

  it("always tallies exactly five dice, for every hand there is", () => {
    // [PROPERTY] over all 6^5 = 7 776 hands, enumerated rather than sampled —
    // the whole space is small enough that "for every hand" can be literal. A
    // tally that dropped, double-counted or clamped a face would break the sum
    // for some hand in here, and nothing narrower would have to notice.
    let hands = 0;
    for (const a of DIE_FACES)
      for (const b of DIE_FACES)
        for (const c of DIE_FACES)
          for (const d of DIE_FACES)
            for (const e of DIE_FACES) {
              const tally = counts([a, b, c, d, e]);
              const total = DIE_FACES.reduce((sum, face) => sum + tally[face], 0);
              expect(total).toBe(5);
              hands += 1;
            }

    expect(hands).toBe(6 ** 5);
  });

  it("does not care what order the dice landed in", () => {
    // [PROPERTY] Every rule in this game reads the dice as a MULTISET — a full
    // is a full however the cup dropped it. That is what makes this one helper
    // able to back all eleven predicates, so it is asserted here rather than
    // re-argued in each of them.
    const hand: Dice = [3, 1, 6, 1, 4];

    expect(counts([1, 1, 3, 4, 6])).toEqual(counts(hand));
    expect(counts([6, 4, 3, 1, 1])).toEqual(counts(hand));
  });
});

/**
 * Every one of the 6^5 hands, enumerated rather than sampled. The whole space is
 * small enough that "for every hand there is" can be literal, so the counting
 * properties below are exact rather than statistical: a predicate that accepts
 * one hand too many or one too few moves the count, and no narrower example
 * would have to notice.
 */
function everyHand(): Dice[] {
  const hands: Dice[] = [];
  for (const a of DIE_FACES)
    for (const b of DIE_FACES)
      for (const c of DIE_FACES)
        for (const d of DIE_FACES) for (const e of DIE_FACES) hands.push([a, b, c, d, e]);
  return hands;
}

describe("faceTotal — the upper section", () => {
  it("totals six times how many sixes are showing", () => {
    // The ruleset's own worked example: `[6,6,6,2,1]` in the sixes box is 18.
    expect(faceTotal(6, [6, 6, 6, 2, 1])).toBe(18);
  });

  it("totals four times how many fours are showing", () => {
    // The ruleset's second worked example, triangulating the first: nothing
    // about the face 6 or the count 3 survives into this one.
    expect(faceTotal(4, [4, 4, 1, 2, 3])).toBe(8);
  });

  it("totals zero for a number nobody rolled", () => {
    // An unmatched number is a legal target worth 0 — this is what crossing an
    // upper box out IS, and it is the commonest event in a real match. The
    // answer is 0 and not `NaN`, which is what a tally with a missing key would
    // have produced.
    expect(faceTotal(5, [1, 1, 2, 3, 4])).toBe(0);
  });

  it("has no minimum: one die still counts", () => {
    // There is no threshold. A single 3 pays 3, not nothing.
    expect(faceTotal(3, [3, 1, 2, 4, 5])).toBe(3);
  });

  it("has no bonus at the top either: five sixes pay exactly 30", () => {
    // The largest an upper box can ever be is 5 × face. A Yahtzee-style
    // upper-section bonus would show up here as anything above 30; the chosen
    // ruleset has none ("Sin bonus").
    expect(faceTotal(6, [6, 6, 6, 6, 6])).toBe(30);
  });

  it("is face times count for every face of every hand, with nothing added", () => {
    // [PROPERTY] The upper section is one multiplication and no branches. This
    // reads the tally back independently, so an implementation that special-
    // cased a face, a count or a threshold breaks it somewhere in 7 776 hands.
    for (const hand of everyHand()) {
      const tally = counts(hand);
      for (const face of DIE_FACES) expect(faceTotal(face, hand)).toBe(tally[face] * face);
    }
  });
});

describe("isEscalera", () => {
  it("accepts 1-2-3-4-5", () => {
    expect(isEscalera([1, 2, 3, 4, 5])).toBe(true);
  });

  it("accepts 2-3-4-5-6", () => {
    expect(isEscalera([2, 3, 4, 5, 6])).toBe(true);
  });

  it("does not care what order the cup dropped them in", () => {
    // The predicate reads the multiset, so a shuffled run is the same run.
    expect(isEscalera([4, 1, 5, 3, 2])).toBe(true);
  });

  it("REFUSES 3-4-5-6-1, the escalera al as", () => {
    // The chosen ruleset lists `3-4-5-6-1` as "opcional, a convenir de
    // antemano". It cannot be a knob here — `configOptions` must stay empty
    // because `deriveModalities` cartesian-products every option into its own
    // matchmaking pool — and without a knob, "to be agreed" reads as not on by
    // default: agreeing is what you do to ADD it.
    expect(isEscalera([3, 4, 5, 6, 1])).toBe(false);
  });

  it("refuses [1,3,4,5,6], which is the ace-wrap hand under another name", () => {
    // DECLARED AS HAVING NO ISOLATING MUTATION, measured rather than assumed:
    // `[1,3,4,5,6]` and `[3,4,5,6,1]` are the SAME MULTISET, so this is the
    // refusal above restated — readmitting the wrap reds both. It is kept
    // because it is also the only hand outside that wrap which the wildcard
    // reading would complete (the ace standing as a 2 makes 2-3-4-5-6), so a
    // reader reaching for that reading finds it answered at the hand they would
    // reach for. The test below is the one that actually separates the two.
    expect(isEscalera([1, 3, 4, 5, 6])).toBe(false);
  });

  it("does not let the 1 stand in as a comodín", () => {
    // `[1,1,3,4,5]` is 1-2-3-4-5 only if one of the aces is a wildcard. THIS IS
    // THE ISOLATING CASE, measured with two mutations: readmitting only the ace
    // wrap leaves it green, while implementing the wildcard reds it. The
    // strongest single-source reading (laps4) says the 1 stands as a 2 or a 6;
    // the chosen ruleset explicitly REJECTS it, so the engine must not carry it
    // in any shape.
    expect(isEscalera([1, 1, 3, 4, 5])).toBe(false);
  });

  it("refuses a run of four", () => {
    expect(isEscalera([2, 3, 4, 5, 5])).toBe(false);
  });

  it("accepts exactly 240 of the 7 776 hands", () => {
    // [PROPERTY] Two accepted runs, each of five distinct faces, so 2 × 5! =
    // 240 orderings and not one more. Admitting the ace-high wrap would make it
    // 360; admitting the wildcard readings, more still. This is the assertion
    // that catches an over-broad predicate without anybody having to think of
    // the hand that exposes it.
    expect(everyHand().filter(isEscalera)).toHaveLength(240);
  });
});

describe("isFull", () => {
  it("accepts three of one and two of another", () => {
    expect(isFull([3, 3, 3, 2, 2])).toBe(true);
  });

  it("accepts five of a kind — the multiset contains a 3 and a 2", () => {
    // Under the ruleset's generalization every open category evaluates against
    // these dice for whatever its own rule yields, and five equal dice DO
    // contain three of a kind plus a pair. This is what makes "a juego mayor
    // may go into its own box or into another open one" free rather than a
    // special case.
    expect(isFull([5, 5, 5, 5, 5])).toBe(true);
  });

  it("refuses four of a kind: the leftovers are not a pair", () => {
    // `[4,4,4,4,2]` contains three 4s, but the two dice left over are a 4 and a
    // 2 — not a pair of the same face. A predicate written as "some face has 3
    // or more, and five dice minus that is 2" would wrongly accept this.
    expect(isFull([4, 4, 4, 4, 2])).toBe(false);
  });

  it("refuses two pairs", () => {
    expect(isFull([2, 2, 3, 3, 5])).toBe(false);
  });

  it("refuses three of a kind alone", () => {
    expect(isFull([2, 2, 2, 3, 5])).toBe(false);
  });

  it("accepts exactly 306 of the 7 776 hands", () => {
    // [PROPERTY] 6 triple faces × 5 pair faces × C(5,3) = 300 arrangements of a
    // 3+2, plus the 6 five-of-a-kinds this rule also admits. The 306 is what
    // pins the five-of-a-kind reading: refusing it would read 300.
    expect(everyHand().filter(isFull)).toHaveLength(306);
  });
});

describe("isPoker", () => {
  it("accepts four of a kind", () => {
    expect(isPoker([4, 4, 4, 4, 2])).toBe(true);
  });

  it("accepts five of a kind — the multiset contains four of a kind", () => {
    expect(isPoker([5, 5, 5, 5, 5])).toBe(true);
  });

  it("refuses three of a kind", () => {
    expect(isPoker([4, 4, 4, 2, 3])).toBe(false);
  });

  it("refuses a full", () => {
    // A full is 3+2, and neither part is four of a kind.
    expect(isPoker([3, 3, 3, 2, 2])).toBe(false);
  });

  it("accepts exactly 156 of the 7 776 hands", () => {
    // [PROPERTY] 6 quad faces × 5 odd faces × C(5,4) = 150, plus the 6
    // five-of-a-kinds. A predicate written `=== 4` instead of `>= 4` reads 150.
    expect(everyHand().filter(isPoker)).toHaveLength(156);
  });
});

describe("isGenerala", () => {
  it("accepts five of a kind", () => {
    expect(isGenerala([3, 3, 3, 3, 3])).toBe(true);
  });

  it("refuses four of a kind", () => {
    expect(isGenerala([3, 3, 3, 3, 1])).toBe(false);
  });

  it("accepts exactly the 6 hands there are, one per face", () => {
    // [PROPERTY] One per face and nothing else. The count is small enough to
    // state, and it is the cheapest possible guard against a `>= 4` slip in the
    // rule the whole game is named after.
    expect(everyHand().filter(isGenerala)).toHaveLength(6);
  });
});

describe("the face values are irrelevant to the juegos mayores", () => {
  it("recognises a full of 2s and 3s exactly as a full of 5s and 6s", () => {
    // [PROPERTY] Every full house expressible on five dice is a full, whichever
    // faces compose it. 30 of them exist (6 triple faces × 5 pair faces).
    let fulls = 0;
    for (const triple of DIE_FACES)
      for (const pair of DIE_FACES) {
        if (triple === pair) continue;
        expect(isFull([triple, triple, triple, pair, pair])).toBe(true);
        fulls += 1;
      }

    expect(fulls).toBe(30);
  });

  it("recognises a póker of 1s exactly as a póker of 6s", () => {
    // [PROPERTY] Same claim for the póker: 30 of them, and no face is special.
    let pokers = 0;
    for (const quad of DIE_FACES)
      for (const odd of DIE_FACES) {
        if (quad === odd) continue;
        expect(isPoker([quad, quad, quad, quad, odd])).toBe(true);
        pokers += 1;
      }

    expect(pokers).toBe(30);
  });
});

/**
 * An all-open card, built by the PRODUCER rather than assembled here, so this
 * suite cannot read back a shape it invented. There is no scorecard reducer yet
 * — filling a box lands with the player reducer — so the two filled-generala
 * cards below are this open one with the single box under test written over it,
 * which is the narrowest fake that still exercises the real predicate.
 */
function openCard(): Scorecard {
  return createMatch(["seat-0" as PlayerId]).cards[0];
}

const ARMADA = 3;
const SERVIDA = 1;

describe("scoreFor — the upper section, box by box", () => {
  it("pays the ones box 2 armada", () => {
    expect(scoreFor("ones", [1, 1, 2, 3, 4], ARMADA, openCard())).toBe(2);
  });

  it("pays the ones box 2 servida too — the upper section has no servida bonus", () => {
    expect(scoreFor("ones", [1, 1, 2, 3, 4], SERVIDA, openCard())).toBe(2);
  });

  it("pays the twos box 6 armada", () => {
    expect(scoreFor("twos", [2, 2, 2, 1, 3], ARMADA, openCard())).toBe(6);
  });

  it("pays the twos box 6 servida too", () => {
    expect(scoreFor("twos", [2, 2, 2, 1, 3], SERVIDA, openCard())).toBe(6);
  });

  it("pays the threes box 6 armada", () => {
    expect(scoreFor("threes", [3, 3, 1, 2, 4], ARMADA, openCard())).toBe(6);
  });

  it("pays the threes box 6 servida too", () => {
    expect(scoreFor("threes", [3, 3, 1, 2, 4], SERVIDA, openCard())).toBe(6);
  });

  it("pays the fours box 8 armada", () => {
    // The ruleset's own worked example.
    expect(scoreFor("fours", [4, 4, 1, 2, 3], ARMADA, openCard())).toBe(8);
  });

  it("pays the fours box 8 servida too", () => {
    expect(scoreFor("fours", [4, 4, 1, 2, 3], SERVIDA, openCard())).toBe(8);
  });

  it("pays the fives box 15 armada", () => {
    expect(scoreFor("fives", [5, 5, 5, 1, 2], ARMADA, openCard())).toBe(15);
  });

  it("pays the fives box 15 servida too", () => {
    expect(scoreFor("fives", [5, 5, 5, 1, 2], SERVIDA, openCard())).toBe(15);
  });

  it("pays the sixes box 18 armada", () => {
    // The ruleset's second worked example.
    expect(scoreFor("sixes", [6, 6, 6, 2, 1], ARMADA, openCard())).toBe(18);
  });

  it("pays the sixes box 18 servida too", () => {
    expect(scoreFor("sixes", [6, 6, 6, 2, 1], SERVIDA, openCard())).toBe(18);
  });
});

describe("scoreFor — the juegos mayores, box by box", () => {
  it("pays the escalera box 20 armada", () => {
    expect(scoreFor("escalera", [1, 2, 3, 4, 5], ARMADA, openCard())).toBe(20);
  });

  it("pays the escalera box 25 servida", () => {
    expect(scoreFor("escalera", [1, 2, 3, 4, 5], SERVIDA, openCard())).toBe(25);
  });

  it("pays the full box 30 armada", () => {
    expect(scoreFor("full", [3, 3, 3, 2, 2], ARMADA, openCard())).toBe(30);
  });

  it("pays the full box 35 servida", () => {
    expect(scoreFor("full", [3, 3, 3, 2, 2], SERVIDA, openCard())).toBe(35);
  });

  it("pays the póker box 40 armada", () => {
    expect(scoreFor("poker", [4, 4, 4, 4, 2], ARMADA, openCard())).toBe(40);
  });

  it("pays the póker box 45 servida", () => {
    expect(scoreFor("poker", [4, 4, 4, 4, 2], SERVIDA, openCard())).toBe(45);
  });

  it("pays the generala box 50 armada", () => {
    expect(scoreFor("generala", [3, 3, 3, 3, 3], ARMADA, openCard())).toBe(50);
  });

  it("pays the generala box 50 on the opening roll too — 55 exists in no source", () => {
    // The ruleset's servida column for generala does not hold a number: it
    // holds "gana en el acto". A generala on the opening roll ENDS THE MATCH,
    // so the roll reducer never lets this call happen in play. The table
    // therefore records no servida value for the box, and the +5 that every
    // other juego mayor carries must not leak into it: 55 is a number no source
    // states and no player would ever be paid.
    expect(scoreFor("generala", [3, 3, 3, 3, 3], SERVIDA, openCard())).toBe(50);
  });

  it("pays the doble box 100 armada, when the generala box holds a real generala", () => {
    expect(scoreFor("generala-doble", [5, 5, 5, 5, 5], ARMADA, { ...openCard(), generala: 50 })).toBe(100);
  });

  it("pays the doble box 100 on the opening roll too — the servida cell is a dash", () => {
    // Also unreachable, and for the sharper reason: reaching the doble at all
    // needs the generala box already holding 50, and a five of a kind on the
    // opening roll would have won the match outright before this box could be
    // chosen. THE DOBLE IS ONLY EVER REACHABLE ARMADA. The value is asserted
    // anyway so the table stays total and 105 cannot appear by accident.
    expect(scoreFor("generala-doble", [5, 5, 5, 5, 5], SERVIDA, { ...openCard(), generala: 50 })).toBe(100);
  });
});

describe("scoreFor — servida is the roll counter at scoring time, never a memory", () => {
  it("pays a full remade on the third roll 30, not 35", () => {
    // The player opened with a full, broke it, and remade it on the last roll.
    // It is ARMADA. An implementation that remembered "it was there on roll 1"
    // would pay 35 here — and it cannot even be written, because `scoreFor`
    // receives the roll counter and no history at all.
    expect(scoreFor("full", [3, 3, 3, 2, 2], 3, openCard())).toBe(30);
  });

  it("pays a combination made on the second roll 30, not 35", () => {
    // Servida is `rollsUsed === 1` and nothing else: the second roll is already
    // armada. An off-by-one written as `rollsUsed <= 2` fails here and passes
    // every other test in this file.
    expect(scoreFor("full", [3, 3, 3, 2, 2], 2, openCard())).toBe(30);
  });

  it("pays an escalera straight off the cup 25", () => {
    expect(scoreFor("escalera", [1, 2, 3, 4, 5], 1, openCard())).toBe(25);
  });
});

describe("scoreFor — five of a kind pays into the boxes it satisfies", () => {
  it("pays the full box 30 for five of a kind", () => {
    // The multiset contains 3+2, so the box evaluates to what its own rule
    // yields. This is what makes "a juego mayor may go into its own box or into
    // another open one" free rather than a special case.
    expect(scoreFor("full", [6, 6, 6, 6, 6], ARMADA, openCard())).toBe(30);
  });

  it("pays the póker box 40 for five of a kind", () => {
    expect(scoreFor("poker", [6, 6, 6, 6, 6], ARMADA, openCard())).toBe(40);
  });

  it("pays the sixes box 30 for five sixes", () => {
    // The same dice, into an upper box: five 6s is 30 there too, by an entirely
    // different rule. Both boxes are legal targets and the choice is the
    // player's.
    expect(scoreFor("sixes", [6, 6, 6, 6, 6], ARMADA, openCard())).toBe(30);
  });
});

describe("scoreFor — generala doble is always targetable and conditionally worth 100", () => {
  it("pays 100 when the generala box holds 50 and the dice are five of a kind", () => {
    expect(scoreFor("generala-doble", [5, 5, 5, 5, 5], ARMADA, { ...openCard(), generala: 50 })).toBe(100);
  });

  it("pays 0 when the generala box is still OPEN, and does not refuse the action", () => {
    // The generala box was simultaneously available for 50, so choosing the
    // doble box was the player's own call and the engine must not second-guess
    // it. A valuation that threw here would make a legal move unplayable.
    expect(scoreFor("generala-doble", [5, 5, 5, 5, 5], ARMADA, openCard())).toBe(0);
  });

  it("pays 0 when the generala box was CROSSED AT ZERO — anotado is not tachado", () => {
    // The single case the whole predicate exists for. A crossed-out generala
    // box is FILLED, so a "generala box is not null" test would wrongly pay
    // 100 here. The ruleset says "haber ANOTADO la primera generala", and
    // crossing out is not scoring: `card.generala !== null && card.generala > 0`.
    expect(scoreFor("generala-doble", [5, 5, 5, 5, 5], ARMADA, { ...openCard(), generala: 0 })).toBe(0);
  });

  it("pays 0 for dice that are not five of a kind, so the box can be crossed out", () => {
    // This is what makes a match terminable at all. Under the rejected reading
    // — the box untargetable until generala is scored — a player who never
    // rolls five of a kind could never fill it, and "the match ends when every
    // box is filled" would never fire.
    expect(scoreFor("generala-doble", [4, 4, 4, 4, 2], ARMADA, { ...openCard(), generala: 50 })).toBe(0);
  });
});

describe("scoreFor — every open box is a legal target worth whatever it yields", () => {
  it("pays 0 for an escalera box that is not an escalera", () => {
    expect(scoreFor("escalera", [1, 1, 2, 3, 4], ARMADA, openCard())).toBe(0);
  });

  it("pays 0 for a full box that is not a full, servida or not", () => {
    // The +5 rides the combination, never the box: no combination, no bonus.
    // An implementation adding the servida bonus before testing the predicate
    // would pay 5 here.
    expect(scoreFor("full", [1, 1, 2, 3, 4], SERVIDA, openCard())).toBe(0);
  });

  it("pays 0 for a póker box that is not a póker", () => {
    expect(scoreFor("poker", [1, 1, 2, 3, 4], ARMADA, openCard())).toBe(0);
  });

  it("pays 0 for a generala box that is not a generala", () => {
    expect(scoreFor("generala", [1, 1, 2, 3, 4], ARMADA, openCard())).toBe(0);
  });

  it("pays a box that is already filled exactly what the dice yield", () => {
    // `scoreFor` is a VALUATION, not a legality check. Whether a filled box may
    // be targeted at all belongs to the legal-action enumeration, and putting
    // the answer in two places is how the two come to disagree. The scorecard
    // reaches here only for the doble's precondition.
    expect(scoreFor("full", [3, 3, 3, 2, 2], ARMADA, { ...openCard(), full: 0 })).toBe(30);
  });
});

describe("scoreFor — the properties the table must hold", () => {
  it("pays every full 30 and every póker 40, whatever faces compose it", () => {
    // [PROPERTY] Face values are irrelevant to the juegos mayores: a full of 2s
    // and 3s pays exactly what a full of 5s and 6s pays.
    for (const high of DIE_FACES)
      for (const low of DIE_FACES) {
        if (high === low) continue;
        expect(scoreFor("full", [high, high, high, low, low], ARMADA, openCard())).toBe(30);
        expect(scoreFor("poker", [high, high, high, high, low], ARMADA, openCard())).toBe(40);
      }
  });

  it("is total: every box, every hand, every roll count yields a plain non-negative integer", () => {
    // [PROPERTY] 11 boxes × 7 776 hands. `NaN` is the failure this guards — it
    // is what a missing tally key produces, it propagates silently through a
    // sum, and it compares false against everything including itself, so a
    // match total would go quietly wrong rather than loudly.
    const card = openCard();
    const offenders: string[] = [];

    for (const hand of everyHand())
      for (const category of CATEGORY_IDS) {
        const value = scoreFor(category, hand, ARMADA, card);
        if (!Number.isInteger(value) || value < 0) offenders.push(`${category} ${hand.join("")} -> ${String(value)}`);
      }

    expect(offenders).toEqual([]);
  });

  it("never pays a juego mayor more servida than its cited bonus of 5", () => {
    // [PROPERTY] The servida column is the armada column plus 5 for the three
    // boxes that carry it, and identical for the two that do not. Asserted as a
    // difference so a transcription slip in either column moves it.
    const card = { ...openCard(), generala: 50 };

    for (const hand of everyHand())
      for (const category of CATEGORY_IDS) {
        const gap = scoreFor(category, hand, SERVIDA, card) - scoreFor(category, hand, ARMADA, card);
        expect(gap === 0 || gap === 5).toBe(true);
      }
  });
});
