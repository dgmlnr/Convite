import { describe, expect, it } from "vitest";
import type { BotTier } from "@hexdev/platform-contract";
import { DICE_COUNT, ROLLS_PER_TURN, applyPlayerAction, applyRoll, createMatch, getLegalActions, getOutcome, getViewFor } from "@hexdev/generala-engine";
import type { ApplyResult, DieFace, GeneralaAction, MatchState, PlayerId } from "@hexdev/generala-engine";
import { createBotStrategy, rollOutcomes } from "./index.js";
import { ALICE, BOB, awaitingRollState, driveTo, openBoxCount, openingThrow, reachableStates, servidaWinState } from "./fixtures.js";

const TIERS: readonly BotTier[] = ["easy", "normal", "hard"];

/** The room's own budget, `match-room.ts:162`. No tier reads it; it is passed because the port does. */
const ROOM_BUDGET_MS = 1000;

/**
 * `fixtures.ts`'s own face script, and it is reused rather than re-picked for
 * the reason written there: no window of five is five of a kind, so no turn can
 * open on a generala servida and end the match before it has been played.
 */
const SELF_PLAY_FACES: readonly DieFace[] = [1, 2, 3, 4, 5, 6, 4, 4, 4, 2, 6, 1, 3, 3, 5, 2];

/** Two seats × eleven boxes × three throws, each costing a roll state and a decision state, is 132. */
const SELF_PLAY_CEILING = 400;

/** A move the engine refused is a bug in this test, not a result: say so loudly rather than carrying on. */
function applied(result: ApplyResult): MatchState {
  if (!result.ok) throw new Error(`the engine refused a move normal chose: ${result.violation.code} — ${result.violation.message}`);
  return result.state;
}

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
 * THE DIVERGENCE TEST SLICE 17 OWES, on the position that names what it is for.
 *
 * An escalera servida is worth 25 and is on the table already. `easy` picks by
 * chance, `normal` breaks it to keep the highest single die — the weakness its
 * own docstring records — and `hard` writes it, because one exact throw of
 * lookahead values the best re-roll available at 11.5. Three tiers, one
 * position, three answers, and the difference between "deliberately identical"
 * and "somebody forgot" stays legible in a green run.
 */
describe("all three tiers are their own now, and they answer one position three ways", () => {
  const servidaEscalera = driveTo([{ throw: [1, 2, 3, 4, 5] }]);
  const view = getViewFor(servidaEscalera, ALICE);
  const legal = getLegalActions(servidaEscalera, ALICE);
  const answerOf = (tier: BotTier): GeneralaAction => createBotStrategy(tier, () => 0.5).chooseAction(view, legal, ROOM_BUDGET_MS) as GeneralaAction;

  it("hard writes the escalera rather than breaking it", () => {
    expect(answerOf("hard")).toEqual({ type: "score", playerId: ALICE, category: "escalera" });
  });

  it("normal breaks it for the highest single die, and easy takes whatever the source lands on", () => {
    expect(answerOf("normal")).toEqual({ type: "hold", playerId: ALICE, keep: [4] });
    expect(answerOf("easy")).toEqual({ type: "hold", playerId: ALICE, keep: [1, 4] });
  });

  it("and the three answers really are three, not two that happen to differ", () => {
    expect(new Set([answerOf("easy"), answerOf("normal"), answerOf("hard")]).size).toBe(3);
  });
});

/**
 * WHICH TIER OWNS A SOURCE, asserted on the widest offer in the game.
 *
 * The describe above says the three tiers differ; this says why two of them
 * cannot be told apart by handing them a different source. `easy` IS its
 * source, so three values give three answers; `normal` and `hard` are total
 * functions of the position, so a source cannot move either of them at all.
 */
describe("easy moves with its source and the other two do not move at all", () => {
  it("easy and normal answer the same position differently", () => {
    const easy = createBotStrategy("easy", () => 0.5).chooseAction(widestView, widestLegal, ROOM_BUDGET_MS);
    const normal = createBotStrategy("normal", () => 0.5).chooseAction(widestView, widestLegal, ROOM_BUDGET_MS);
    expect(easy).toBe(widestLegal[21]);
    expect(normal).not.toBe(easy);
    // Named, not merely different: five distinct faces means five groups of
    // one, and D7's tie rule takes the higher face — the 6 sitting at index 4.
    expect(normal).toEqual({ type: "hold", playerId: ALICE, keep: [4] });
  });

  /**
   * The half that makes the case above more than a coincidence of one rng
   * value. Easy IS its source; normal does not have one.
   */
  it("easy moves with the source and neither of the others does", () => {
    const sources = [() => 0, () => 0.5, () => 0.999999];
    const answers = (tier: BotTier): GeneralaAction[] => sources.map((rng) => createBotStrategy(tier, rng).chooseAction(widestView, widestLegal, ROOM_BUDGET_MS) as GeneralaAction);
    expect(new Set(answers("easy")).size).toBe(3);
    expect(new Set(answers("normal")).size).toBe(1);
    // The line that used to sit below this one asserted the opposite for
    // `hard`: that it answered whatever `easy` answered. It reded the moment
    // slice 17 wired the tier in — `expected { type: 'hold', …(2) } to be
    // { type: 'hold', …(2) }` — which is exactly what slice 8 wrote it to do,
    // and slice 16 made the same collection one slice earlier.
    expect(new Set(answers("hard")).size).toBe(1);
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

/**
 * TASKS 16.2 AND 17.3 — the property of task 8.1 re-run for each DETERMINISTIC
 * tier, over the positions ITS OWN PLAY reaches rather than the ones a fixed
 * script does.
 *
 * Slice 16 wrote this for `normal`; slice 17 owes the same for `hard` and takes
 * the loop rather than a copy. A second self-play harness would be a second
 * place to fix the same thing, and the two tiers reach genuinely different
 * corners of the state space — `hard` writes made hands early, so its own play
 * visits shapes a greedy tier never stops on.
 *
 * The sweep above is driven by `fixtures.ts`'s deliberately boring policy: hold
 * while throws remain, then write the first open box. Every tier is asked about
 * those 133 states and that is worth having — but it is a claim about a list
 * somebody else built. A deterministic tier can do something stronger, and only
 * a deterministic one can: play both seats itself, all the way to a terminal
 * outcome, and be asked at exactly the positions its own decisions produced.
 *
 * WHAT WOULD OTHERWISE GO UNSEEN. A bot whose holds converge on one shape drives
 * itself into a corner of the state space that no external script visits. The
 * counts below are asserted for the same reason slice 8 counted its sweep: "it
 * returned a legal action at every position it was asked about" is satisfied
 * vacuously by a match that ended on turn two, and one-box-remaining — named by
 * spec Domain F because that is where a "pick the best category" heuristic falls
 * through — would simply never occur.
 */
const DETERMINISTIC_TIERS = ["normal", "hard"] as const;

for (const tier of DETERMINISTIC_TIERS) describe(`${tier} plays a whole match out by itself, and the property holds at every position it reaches (Spec F)`, () => {
  /**
   * The cup, for a match nobody is sitting at. The faces are `fixtures.ts`'s own
   * script and cycle through it: no window of five is five of a kind, so no
   * TURN can open on a generala servida and cut the match short (ruleset
   * §Generala servida) — which would truncate every count below without failing
   * anything.
   */
  function scriptedCup(): (budget: number) => readonly DieFace[] {
    let cursor = 0;
    return (budget) => {
      const faces: DieFace[] = [];
      for (let index = 0; index < budget; index += 1) {
        faces.push(SELF_PLAY_FACES[cursor % SELF_PLAY_FACES.length]!);
        cursor += 1;
      }
      return faces;
    };
  }

  const selfPlay = ((): { states: readonly MatchState[]; asked: number; openCounts: ReadonlySet<number>; rollsUsed: ReadonlySet<number> } => {
    const strategy = createBotStrategy(tier, () => 0.5);
    const cup = scriptedCup();
    const states: MatchState[] = [];
    const openCounts = new Set<number>();
    const rollsUsed = new Set<number>();
    let state = createMatch([ALICE, BOB]);
    let asked = 0;

    for (let step = 0; step < SELF_PLAY_CEILING; step += 1) {
      states.push(state);
      if (getOutcome(state) !== null) return { states, asked, openCounts, rollsUsed };

      const turn = state.turn;
      if (turn.phase === "awaiting-roll") {
        state = applied(applyRoll(state, cup(turn.slots.filter((slot) => slot === null).length)));
        continue;
      }
      if (turn.phase === "servida-win") return { states, asked, openCounts, rollsUsed };

      const playerId = state.players[turn.seat]!;
      const legal = getLegalActions(state, playerId);
      const chosen = strategy.chooseAction(getViewFor(state, playerId), legal, ROOM_BUDGET_MS);
      // The property itself, asserted at every single position rather than
      // collected and checked afterwards: IDENTITY, because `sameAction`
      // (`match-room.ts:220-232`) walks `keep` by index and a rebuilt hold is
      // unsubmittable however equal it looks.
      expect(legal).toContain(chosen);
      openCounts.add(openBoxCount(state, turn.seat));
      rollsUsed.add(turn.rollsUsed);
      asked += 1;
      state = applied(applyPlayerAction(state, chosen as GeneralaAction));
    }

    throw new Error(`${tier} drove ${String(SELF_PLAY_CEILING)} steps without the match ending`);
  })();

  it("the match reached a real ending, with every box on both cards written", () => {
    const last = selfPlay.states[selfPlay.states.length - 1]!;
    expect(getOutcome(last)).not.toBeNull();
    expect(openBoxCount(last, 0)).toBe(0);
    expect(openBoxCount(last, 1)).toBe(0);
    // Nothing before the end was already over, so the match was played rather
    // than abandoned into a terminal state early.
    expect(selfPlay.states.slice(0, -1).filter((state) => getOutcome(state) !== null)).toEqual([]);
  });

  it("it was really asked, at more positions than the scripted sweep offers", () => {
    // 22 turns of up to three decisions each. A tier that answered once and
    // then stalled would satisfy every `toContain` above without making a claim.
    expect(selfPlay.asked).toBeGreaterThan(40);
  });

  it("its own play spans every open-box count from a full card down to ONE BOX REMAINING", () => {
    for (let open = 1; open <= 11; open += 1) expect(selfPlay.openCounts).toContain(open);
  });

  it("and every value of `rollsUsed` a turn can hold", () => {
    expect(selfPlay.rollsUsed).toEqual(new Set([1, 2, 3]));
  });

  /**
   * The half the counts above cannot make: at the LAST box, the tier must write
   * it. There is exactly one score on offer, so an implementation whose value
   * comparison never selected anything would fall through to `legalActions[0]`
   * — which at `rollsUsed < 3` is a hold, and the turn would go round again
   * without the box ever being filled.
   */
  it("with one box left and no throws left, it writes that box", () => {
    const lastBoxes = selfPlay.states.filter((state) => state.turn.phase === "deciding" && state.turn.rollsUsed === ROLLS_PER_TURN && openBoxCount(state, state.turn.seat) === 1);
    expect(lastBoxes.length).toBeGreaterThan(0);
    for (const state of lastBoxes) {
      const turn = state.turn;
      if (turn.phase !== "deciding") continue;
      const playerId = state.players[turn.seat]!;
      const legal = getLegalActions(state, playerId);
      expect(legal.length).toBe(1);
      expect(createBotStrategy(tier, () => 0.5).chooseAction(getViewFor(state, playerId), legal, ROOM_BUDGET_MS)).toBe(legal[0]);
    }
  });
});

/**
 * TASK 17.2 — every decision completes inside `BOT_BUDGET_MS` (1000,
 * `match-room.ts:162`).
 *
 * The claim is made twice, and the two halves are not the same claim. A clock
 * measures this machine on this day; a COUNT measures the search. The count is
 * the one that cannot drift, and it is also where design D7's own arithmetic
 * turns out to be conservative by a factor of nearly five.
 *
 * It matters more than a passing number suggests. `withThinkingDelay` runs the
 * decision and the presentation pause CONCURRENTLY (`latency.ts`, and the fence
 * slice 8 wrote after a mutation found none), so a slow decision does not fail
 * anything — it just makes the turn longer. A bot that thinks for thirty
 * seconds is a defect every test passes.
 */
describe("the exact search fits inside the room's budget (task 17.2)", () => {
  /**
   * D7 sizes this as "≤31 holds × 252 ≈ 7.8k weighted evaluations per
   * decision". That is the right shape and the wrong number: 252 is the table
   * for FIVE re-rolled dice, and exactly one of the 31 holds re-rolls five.
   * The other thirty keep one to four dice and draw from tables of 126, 56, 21
   * and 6, so the widest decision in the game is 1682 leaves — 30 × 6 plus
   * 10 × 21 plus 10 × 56 plus 5 × 126 plus 252. Reported, not quietly corrected.
   */
  it("the widest decision in the game is 1682 weighted leaves, counted rather than timed", () => {
    const holds = widestLegal.filter((action) => action.type === "hold");
    expect(holds.length).toBe(31);
    const leaves = holds.reduce((total, action) => total + rollOutcomes(DICE_COUNT - action.keep.length).length, 0);
    expect(leaves).toBe(1682);
    expect(leaves).toBeLessThan(31 * 252);
  });

  /**
   * And the clock, over every position the scripted sweep reaches rather than
   * one hand-picked decision. The margin is three orders of magnitude, so this
   * is a fence against a rewrite that walked 7776 sequences per hold — not a
   * timing test anybody should tune.
   */
  it("and no single decision in the whole scripted sweep comes near 1000 ms", () => {
    const strategy = createBotStrategy("hard", () => 0.5);
    let slowest = 0;
    for (const { state, playerId, legal } of positions) {
      const started = performance.now();
      strategy.chooseAction(getViewFor(state, playerId), legal, ROOM_BUDGET_MS);
      slowest = Math.max(slowest, performance.now() - started);
    }
    expect(positions.length).toBeGreaterThan(60);
    expect(slowest).toBeLessThan(ROOM_BUDGET_MS);
  });
});
