import { describe, expect, it } from "vitest";
import type { BotTier } from "@hexdev/platform-contract";
import { getLegalActions, getOutcome, getViewFor } from "@hexdev/generala-engine";
import type { GeneralaAction, MatchState, PlayerId } from "@hexdev/generala-engine";
import { createBotStrategy } from "./index.js";
import { ALICE, BOB, awaitingRollState, openBoxCount, openingThrow, reachableStates, servidaWinState } from "./fixtures.js";

const TIERS: readonly BotTier[] = ["easy", "normal", "hard"];

/** The room's own budget, `match-room.ts:162`. No tier reads it; it is passed because the port does. */
const ROOM_BUDGET_MS = 1000;

const widest = openingThrow();
const widestView = getViewFor(widest, ALICE);
const widestLegal = getLegalActions(widest, ALICE);

const sweep = reachableStates();

/** Every (state, seat) pair in the sweep where that seat is actually offered something. */
function offeredPositions(states: readonly MatchState[]): readonly { state: MatchState; playerId: PlayerId; legal: readonly GeneralaAction[] }[] {
  const found: { state: MatchState; playerId: PlayerId; legal: readonly GeneralaAction[] }[] = [];
  for (const state of states) {
    for (const playerId of state.players) {
      const legal = getLegalActions(state, playerId);
      if (legal.length > 0) found.push({ state, playerId, legal });
    }
  }
  return found;
}

const positions = offeredPositions(sweep);

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

/**
 * THE SWEEP IS COUNTED BEFORE IT IS USED, and this describe is the whole reason
 * the property below says anything.
 *
 * "The bot returned one of the offered actions at every position the sweep
 * reached" is satisfied vacuously by a sweep that reached no position at all —
 * a driver that stopped after one turn, or a `getLegalActions` that answered
 * `[]` for everything, would leave every assertion green and every claim
 * unmade. So the spans spec Domain F names — both phases, every `rollsUsed`,
 * scorecards from empty to ONE BOX REMAINING — are asserted here as numbers
 * rather than assumed from the driver's shape.
 */
describe("the sampled reachable states really span what the property claims (Spec F)", () => {
  it("the match ran to a real ending, not into the driver's ceiling", () => {
    expect(sweep.length).toBeGreaterThan(100);
    const last = sweep[sweep.length - 1]!;
    expect(getOutcome(last)).not.toBeNull();
    expect(openBoxCount(last, 0)).toBe(0);
    expect(openBoxCount(last, 1)).toBe(0);
    // Nothing before the end was already over: a sweep truncated early would
    // still satisfy the assertion above.
    expect(sweep.slice(0, -1).filter((state) => getOutcome(state) !== null)).toEqual([]);
  });

  it("both of the phases a match spends its time in appear", () => {
    expect(new Set(sweep.map((state) => state.turn.phase))).toEqual(new Set(["awaiting-roll", "deciding"]));
  });

  it("every value of `rollsUsed` a turn can hold is decided from", () => {
    const seen = sweep.filter((state) => state.turn.phase === "deciding").map((state) => (state.turn.phase === "deciding" ? state.turn.rollsUsed : -1));
    expect(new Set(seen)).toEqual(new Set([1, 2, 3]));
  });

  it("scorecards run from empty all the way to ONE BOX REMAINING, for both seats", () => {
    const deciding = sweep.filter((state) => state.turn.phase === "deciding");
    const open = deciding.map((state) => (state.turn.phase === "deciding" ? openBoxCount(state, state.turn.seat) : -1));
    expect(new Set(open)).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]));
    const oneLeft = deciding.filter((state) => state.turn.phase === "deciding" && openBoxCount(state, state.turn.seat) === 1);
    expect(new Set(oneLeft.map((state) => (state.turn.phase === "deciding" ? state.players[state.turn.seat] : undefined)))).toEqual(new Set([ALICE, BOB]));
  });

  it("the offer list spans its widest and its narrowest shape", () => {
    const sizes = new Set(positions.map((position) => position.legal.length));
    // 31 holds + 11 open boxes at one end; the last box on the third throw at the other.
    expect(sizes.has(42)).toBe(true);
    expect(sizes.has(1)).toBe(true);
    expect(positions.length).toBeGreaterThan(60);
  });

  it("every re-roll budget from one die to five is exercised", () => {
    const budgets = sweep.filter((state) => state.turn.phase === "awaiting-roll").map((state) => (state.turn.phase === "awaiting-roll" ? state.turn.slots.filter((slot) => slot === null).length : -1));
    expect(new Set(budgets)).toEqual(new Set([1, 2, 3, 4, 5]));
  });
});

/**
 * A source that walks the whole of `[0, 1)` rather than sitting on one value: a
 * fixed `() => 0` would let "always take the first offered action" satisfy every
 * assertion below.
 */
function sweepingRng(): () => number {
  let step = 0;
  const values = [0, 0.17, 0.33, 0.5, 0.66, 0.83, 0.999999];
  return () => values[step++ % values.length]!;
}

describe("every tier answers every reachable position (Spec F: three tiers, and none of them throws)", () => {
  for (const tier of TIERS) {
    it(`${tier} returns one of the offered actions — the very object it was offered — and never throws`, async () => {
      const strategy = createBotStrategy(tier, sweepingRng());
      let asked = 0;
      for (const { state, playerId, legal } of positions) {
        const chosen = await strategy.chooseAction(getViewFor(state, playerId), legal, ROOM_BUDGET_MS);
        expect(legal).toContain(chosen);
        asked += 1;
      }
      expect(asked).toBe(positions.length);
    });
  }
});
