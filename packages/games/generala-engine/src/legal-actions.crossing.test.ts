import { describe, expect, it } from "vitest";

import type { Dice } from "./dice.js";
import { CROSSING_ORDER, mayWrite } from "./legal-actions.js";
import { scoreFor } from "./scoring.js";
import { CATEGORY_IDS } from "./state.js";
import type { CategoryId, Scorecard } from "./state.js";

/**
 * ruleset §Orden obligatorio de tachado — the house rule added on 2026-09-09:
 * "Escribir un CERO (tachar): sólo permitido en la casilla abierta de mayor
 * pago", down `Generala doble → Generala → Póker → Full → Escalera → 6 → 5 → 4
 * → 3 → 2 → 1`. Writing a value greater than zero stays free.
 *
 * THIS FILE TESTS THE PREDICATE AND NOTHING ELSE, because at this point nothing
 * calls it. `getLegalActions` still offers every open box and `applyScore`
 * still accepts every open box; the slice that wires both of them into
 * `mayWrite` is the next one, and keeping the two apart is what lets a reviewer
 * read the rule without also reading the eleven fixtures it invalidates.
 */

/** A card with these boxes written; everything else open. */
function card(filled: Partial<Record<CategoryId, number>>): Scorecard {
  const built: Partial<Record<CategoryId, number | null>> = {};
  for (const category of CATEGORY_IDS) built[category] = filled[category] ?? null;
  return built as Scorecard;
}

/** Five dice that pay this box NOTHING, so asking about it is asking about a crossing. */
const NOTHING_FOR: Readonly<Record<CategoryId, Dice>> = {
  ones: [2, 2, 4, 5, 6],
  twos: [1, 1, 4, 5, 6],
  threes: [1, 1, 2, 4, 6],
  fours: [1, 1, 2, 5, 6],
  fives: [1, 1, 2, 4, 6],
  sixes: [1, 1, 2, 4, 5],
  escalera: [1, 1, 2, 4, 6],
  full: [1, 1, 2, 4, 6],
  poker: [1, 1, 2, 4, 6],
  generala: [1, 1, 2, 4, 6],
  "generala-doble": [1, 1, 2, 4, 6],
};

describe("CROSSING_ORDER — the ladder a zero walks down", () => {
  it("names all eleven boxes, exactly once each, richest first", () => {
    // A box missing from the ladder could never be the crossable one, so a card
    // whose every other box was spent would offer no zero at all and the turn
    // could not be ended. That is why this is a fence and not tidiness.
    expect([...CROSSING_ORDER].sort()).toEqual([...CATEGORY_IDS].sort());
    expect(new Set(CROSSING_ORDER).size).toBe(CATEGORY_IDS.length);
    expect(CROSSING_ORDER[0]).toBe("generala-doble");
    expect(CROSSING_ORDER[CROSSING_ORDER.length - 1]).toBe("ones");
  });

  it("is ordered by WHAT A BOX PAYS, which is not the order of what it costs to lose", () => {
    // `generala-bot`'s `SACRIFICE_ORDER` is the other ladder and the divergence
    // is deliberate (it lives in the bot, so it is named here rather than
    // imported — `generala-engine` is L0). The two agree on the first rung and
    // part company immediately: by cost `ones` is the next cheapest thing to
    // give up, by payout it is the very last.
    expect(CROSSING_ORDER.indexOf("generala")).toBeLessThan(CROSSING_ORDER.indexOf("ones"));
    expect(CROSSING_ORDER.indexOf("sixes")).toBeLessThan(CROSSING_ORDER.indexOf("twos"));
    expect(CROSSING_ORDER.indexOf("poker")).toBeLessThan(CROSSING_ORDER.indexOf("escalera"));
  });
});

describe("mayWrite — a filled box never reopens", () => {
  it("refuses a box already written, zero included", () => {
    // "Filled at 0" is filled: `null` is open and a number is not, so a crossed
    // box refuses exactly like a scored one (`state.ts`).
    expect(mayWrite("sixes", card({ sixes: 18 }), [6, 6, 6, 2, 1], 1)).toBe(false);
    expect(mayWrite("generala-doble", card({ "generala-doble": 0 }), [6, 6, 6, 6, 6], 2)).toBe(false);
  });
});

describe("mayWrite — a value greater than zero goes anywhere", () => {
  it("allows every box the dice pay something in, wherever it sits on the ladder", () => {
    // The rule narrows crossing and NOTHING ELSE. `ones` is the bottom rung and
    // pays 2 here, and a seat that wants those two points may take them — that
    // is the choice the rule sharpens rather than removes.
    const fresh = card({});
    const dice: Dice = [1, 1, 2, 3, 4];

    for (const category of ["ones", "twos", "threes", "fours"] as const) {
      expect(scoreFor(category, dice, 2, fresh), `${category} has to pay for this case to say anything`).toBeGreaterThan(0);
      expect(mayWrite(category, fresh, dice, 2), category).toBe(true);
    }
  });

  it("asks `scoreFor` rather than deciding what a box is worth", () => {
    // Both of the valuations that depend on more than the dice arrive with the
    // answer: the servida bonus reads `rollsUsed`, and the doble's 100 reads
    // the CARD. An escalera is worth something on either throw, so it is
    // writable on either; the doble is worth nothing until a real generala is
    // written above it, and then it is worth 100.
    expect(mayWrite("escalera", card({}), [1, 2, 3, 4, 5], 1)).toBe(true);
    expect(mayWrite("escalera", card({}), [1, 2, 3, 4, 5], 3)).toBe(true);

    const unlocked = card({ generala: 50 });
    expect(scoreFor("generala-doble", [5, 5, 5, 5, 5], 2, unlocked)).toBe(100);
    expect(mayWrite("generala-doble", unlocked, [5, 5, 5, 5, 5], 2)).toBe(true);
  });
});

describe("mayWrite — a zero goes in the highest-paying open box and nowhere else", () => {
  it("refuses every box worth nothing except the top of the ladder", () => {
    const fresh = card({});

    expect(mayWrite("generala-doble", fresh, NOTHING_FOR["generala-doble"], 2)).toBe(true);
    for (const category of CATEGORY_IDS) {
      if (category === "generala-doble") continue;
      if (scoreFor(category, NOTHING_FOR[category], 2, fresh) > 0) continue;
      expect(mayWrite(category, fresh, NOTHING_FOR[category], 2), `${category} on an untouched card`).toBe(false);
    }
  });

  it("orders by payout and not by what a seat minds losing least, on the fixture where they differ", () => {
    // THE ONLY SHAPE THAT PROVES WHICH LADDER IS IN FORCE. With the doble
    // spent, the payout ladder reaches `generala`; the bot's sacrifice ladder
    // would reach `ones`, because a single ace is the cheapest thing on the
    // card to renounce.
    const spentDoble = card({ "generala-doble": 0 });

    expect(mayWrite("generala", spentDoble, NOTHING_FOR.generala, 2)).toBe(true);
    expect(mayWrite("ones", spentDoble, NOTHING_FOR.ones, 2)).toBe(false);
  });

  it("makes the DEAREST upper box the crossable one once the lower half is spent", () => {
    // The ladder runs 6 → 5 → 4 → 3 → 2 → 1 through the upper section, so the
    // box a seat gives up last is the six — the highest-paying upper box and
    // the one most likely to pay something on any throw.
    const lowerSpent = card({ escalera: 0, full: 0, poker: 0, generala: 0, "generala-doble": 0 });

    expect(mayWrite("sixes", lowerSpent, NOTHING_FOR.sixes, 2)).toBe(true);
    for (const category of ["ones", "twos", "threes", "fours", "fives"] as const) {
      expect(mayWrite(category, lowerSpent, NOTHING_FOR[category], 2), category).toBe(false);
    }
  });

  it("walks the whole ladder: each rung takes the zero only once everything above it is spent", () => {
    // A guard that only ever protected `generala-doble` passes every case above
    // and fails here, and so does one that read the bot's ladder.
    const spent: Partial<Record<CategoryId, number>> = {};

    for (const rung of CROSSING_ORDER) {
      const here = card(spent);
      expect(mayWrite(rung, here, NOTHING_FOR[rung], 2), `${rung} is the top of what is left`).toBe(true);
      for (const lower of CROSSING_ORDER.slice(CROSSING_ORDER.indexOf(rung) + 1)) {
        if (scoreFor(lower, NOTHING_FOR[lower], 2, here) > 0) continue;
        expect(mayWrite(lower, here, NOTHING_FOR[lower], 2), `${lower} sits below ${rung}`).toBe(false);
      }
      spent[rung] = 0;
    }

    expect(Object.keys(spent)).toHaveLength(CATEGORY_IDS.length);
  });
});

/**
 * WHAT THE LADDER MAKES TRUE OF EVERY CARD THE RULE CAN PRODUCE — enumerated
 * rather than argued, over all 13312 of them.
 *
 * Two claims rest on this and both are load-bearing. TERMINATION: every card
 * with an open box has a box that may be written, so a turn can always be
 * ended and no match can strand. THE DOBLE'S PRECONDITION: writing 0 in the
 * generala box costs the doble first, so an open doble always sits above a
 * generala box that is open or holds a real generala — and if the doble is the
 * LAST open box, the 100 is live. `generala-bot` will lean on that second one.
 *
 * The walk is over card SHAPES rather than over dice, because both claims are
 * about the ladder and not about a throw: a box either pays something (and is
 * writable wherever it sits) or pays nothing (and is writable only at the top).
 * `mayWrite`'s agreement with that reading is what every case above pins.
 */
describe("the shapes the ladder can produce", () => {
  it("leaves every non-full card with something writable, and never a crossed generala under an open doble", () => {
    const seen = new Set<string>();
    let stranded = 0;
    let crossedGeneralaUnderOpenDoble = 0;
    let dobleAlone = 0;
    let dobleAloneWithoutARealGenerala = 0;

    const walk = (shape: Readonly<Record<CategoryId, "open" | "zero" | "paid">>): void => {
      const key = CATEGORY_IDS.map((category) => shape[category]).join(",");
      if (seen.has(key)) return;
      seen.add(key);

      const open = CATEGORY_IDS.filter((category) => shape[category] === "open");
      const crossable = CROSSING_ORDER.find((category) => shape[category] === "open");
      if (open.length > 0 && crossable === undefined) stranded += 1;
      if (shape["generala-doble"] === "open" && shape.generala === "zero") crossedGeneralaUnderOpenDoble += 1;
      if (open.length === 1 && open[0] === "generala-doble") {
        dobleAlone += 1;
        if (shape.generala !== "paid") dobleAloneWithoutARealGenerala += 1;
      }

      for (const category of open) {
        walk({ ...shape, [category]: "paid" });
        if (category === crossable) walk({ ...shape, [category]: "zero" });
      }
    };

    walk(Object.fromEntries(CATEGORY_IDS.map((category) => [category, "open"])) as Record<CategoryId, "open" | "zero" | "paid">);

    // The loop is only worth something if it ran over the whole space.
    expect(seen.size).toBe(13312);
    expect(stranded).toBe(0);
    expect(crossedGeneralaUnderOpenDoble).toBe(0);
    expect(dobleAlone).toBe(1);
    expect(dobleAloneWithoutARealGenerala).toBe(0);
  });
});
