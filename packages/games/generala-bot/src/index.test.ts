import { describe, expect, it } from "vitest";
import type { BotTier } from "@hexdev/platform-contract";
import { getLegalActions, getViewFor } from "@hexdev/generala-engine";
import { createBotStrategy } from "./index.js";
import { ALICE, BOB, awaitingRollState, openingThrow, servidaWinState } from "./fixtures.js";

const TIERS: readonly BotTier[] = ["easy", "normal", "hard"];

/** The room's own budget, `match-room.ts:162`. No tier reads it; it is passed because the port does. */
const ROOM_BUDGET_MS = 1000;

const widest = openingThrow();
const widestView = getViewFor(widest, ALICE);
const widestLegal = getLegalActions(widest, ALICE);

describe("the widest offer really is the widest, so the tests below are not measuring a short list", () => {
  it("31 holds plus 11 open boxes", () => {
    expect(widestLegal.length).toBe(42);
    expect(widestLegal.filter((action) => action.type === "hold").length).toBe(31);
    expect(widestLegal.filter((action) => action.type === "score").length).toBe(11);
  });
});

describe("easy is UNIFORM over the offered list, not a fixed pick", () => {
  it("an rng at the bottom of its range takes the first offered action", () => {
    expect(createBotStrategy("easy", () => 0).chooseAction(widestView, widestLegal, ROOM_BUDGET_MS)).toBe(widestLegal[0]);
  });

  it("an rng just under 1 takes the last offered action", () => {
    expect(createBotStrategy("easy", () => 0.999999).chooseAction(widestView, widestLegal, ROOM_BUDGET_MS)).toBe(widestLegal[41]);
  });

  /**
   * The one that makes the two above non-vacuous. "First" and "last" are both
   * satisfied by a tier that always returns the same action if the two
   * assertions are read separately; walking bucket by bucket says the index is
   * a real function of the source, and it catches a `Math.round` where a
   * `Math.floor` belongs.
   */
  it("a source walking bucket by bucket visits all 42, in order and with none repeated", () => {
    let step = 0;
    const midBucket = (): number => (step++ + 0.5) / widestLegal.length;
    const strategy = createBotStrategy("easy", midBucket);
    const chosen = widestLegal.map(() => strategy.chooseAction(widestView, widestLegal, ROOM_BUDGET_MS));
    expect(chosen).toEqual([...widestLegal]);
  });

  /**
   * `RandomSource` is contractually `[0, 1)` and this asks what happens when a
   * caller breaks that contract anyway: still a legal action, never `undefined`
   * — which the room would reject, stalling the table for a reason nobody could
   * read off the wire.
   */
  it("a source that breaks its own `[0, 1)` contract still yields a legal action instead of `undefined`", () => {
    expect(widestLegal).toContain(createBotStrategy("easy", () => 1).chooseAction(widestView, widestLegal, ROOM_BUDGET_MS));
  });

  /**
   * `toBe`, not `toEqual`: IDENTITY. An action rebuilt to look equal could carry
   * `keep` in another order, and `sameAction` (`match-room.ts:220-232`) walks
   * arrays BY INDEX — `[1,0]` is simply not the action `[0,1]` is, so a rebuilt
   * hold is unsubmittable however equal it looks.
   */
  it("the action returned is the very object it was offered, not a copy of it", () => {
    const chosen = createBotStrategy("easy", () => 0.5).chooseAction(widestView, widestLegal, ROOM_BUDGET_MS);
    expect(widestLegal.some((action) => action === chosen)).toBe(true);
  });
});

/**
 * ONE guard, in the wrapper — task 8.4 and design D7's third layer.
 *
 * `truco-bot` writes this throw THREE TIMES (`easy.ts:48`, `normal.ts:72`,
 * `hard.ts:131`), so a fix to it must be made three times, and that throw once
 * took down the whole server process. The observable difference between one
 * guard and three is asserted here: all three tiers refuse with the SAME
 * message, and that message names no tier — three copy-pasted throws would each
 * name their own, exactly as truco's do.
 *
 * DECLARED, not oversold: three identical copies would also pass this, so it is
 * a proxy rather than a proof. The half that IS a proof is the compiler's —
 * `GeneralaTier` takes a list that cannot be empty (`tier.ts`), so a tier has no
 * representable reason to carry a throw and slices 16 and 17 cannot quietly add
 * one back.
 */
describe("ONE shared empty-list guard, and the tiers have no throw of their own (D7)", () => {
  for (const tier of TIERS) {
    it(`${tier} throws rather than fabricating an action the room would refuse`, () => {
      expect(() => createBotStrategy(tier, () => 0.5).chooseAction(widestView, [], ROOM_BUDGET_MS)).toThrow(/no legal actions/i);
    });
  }

  it("all three refuse with the same message, and it names no tier", () => {
    const messages = TIERS.map((tier) => {
      try {
        createBotStrategy(tier, () => 0.5).chooseAction(widestView, [], ROOM_BUDGET_MS);
        return "did not throw";
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    });
    expect(new Set(messages).size).toBe(1);
    expect(messages[0]).not.toBe("did not throw");
    for (const name of TIERS) expect(messages[0]).not.toContain(name);
  });

  /**
   * The guard is defence in depth over a proven engine invariant, not a
   * hypothetical — so the positions that offer nothing are shown to be real
   * ones the engine reaches, all three shapes of them.
   */
  it("the positions that offer nothing are ones the engine really reaches", () => {
    const awaiting = awaitingRollState();
    expect(getLegalActions(awaiting, ALICE)).toEqual([]);
    expect(getLegalActions(awaiting, BOB)).toEqual([]);
    expect(getLegalActions(servidaWinState(), ALICE)).toEqual([]);
    // A seat that is simply not on turn, while the seat that is has plenty.
    expect(getLegalActions(widest, BOB)).toEqual([]);
    expect(getLegalActions(widest, ALICE).length).toBe(42);
  });
});

/**
 * The placeholder, executed rather than left in a comment — `conformance.ts`'s
 * own "never a mute `if`" discipline.
 *
 * `normal` is slice 16 and `hard` is slice 17. Until they are written every
 * tier resolves to the uniform one, and the difference between "Generala's
 * tiers deliberately agree" and "somebody forgot to wire two of them" has to be
 * visible in a green run. This test is what turns red the day slice 16 lands,
 * which is when it should be replaced by that slice's own divergence test.
 */
describe("normal and hard are not written yet, and say so out loud", () => {
  it("all three tiers make the same choice from the same source, because all three ARE the uniform tier today", () => {
    const chosen = TIERS.map((tier) => createBotStrategy(tier, () => 0.5).chooseAction(widestView, widestLegal, ROOM_BUDGET_MS));
    expect(new Set(chosen).size).toBe(1);
    expect(chosen[0]).toBe(widestLegal[21]);
  });
});
