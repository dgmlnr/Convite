import { describe, expect, it } from "vitest";
import type { GameModule, SeatAssignment } from "./contract.js";
import type { PlayerId } from "./ids.js";
import type { JsonValue } from "./json.js";
import type { GameModuleFixtures } from "./conformance.js";
import { describeGameModule } from "./conformance.js";

/**
 * A deliberately NON-truco fixture module: one seat, no opponent, no hidden
 * information, no teams, no turns, a score that is a single number, ends
 * when solved. Standing in for the design prompt's "Game A" (a single-player
 * puzzle) — proves the suite below asserts contract invariants, not truco
 * behavior, since nothing here could satisfy a truco-shaped assertion.
 *
 * AND IT NO LONGER SUPPLIES A BOT. It used to, because the port required one
 * of every module — a fixture whose own docblock said "no opponent" handing
 * out an opponent. Now that `createBot` is optional it says what it always
 * meant, and the `describeGameModule` call below stops being only a fixture:
 * it is the live proof that a one-seat, bot-less module passes the whole
 * conformance suite, registered with vitest for real.
 */
interface CounterState {
  readonly count: number;
  readonly target: number;
}

type CounterAction = { readonly type: "increment"; readonly playerId: PlayerId };
type CounterConfig = { readonly target: number };

const counterModule: GameModule<CounterState, CounterAction, CounterState, CounterConfig> = {
  id: "counter-fixture",
  metadata: { seatCount: 1, displayNameKey: "fixture.counter", assetBase: "/fixtures/counter" },
  configOptions: [],
  createMatch: (config) => ({ count: 0, target: config.target }),
  applyAction: (state) =>
    state.count >= state.target
      ? { ok: false, violation: { code: "already-done", message: "already reached target" } }
      : { ok: true, state: { ...state, count: state.count + 1 } },
  getLegalActions: (state, playerId) => (state.count >= state.target ? [] : [{ type: "increment", playerId }]),
  getViewFor: (state) => state,
  // One seat and one number, both of them the player's own: there is nothing
  // here another seat could learn, and no other seat to learn it.
  hiddenState: { kind: "nothing-is-hidden" },
  getOutcome: (state) => (state.count >= state.target ? { winnerIds: [] } : null),
  serialize: (state) => state as unknown as JsonValue,
  deserialize: (json) => json as unknown as CounterState,
};

const soloPlayerId = "solo-player" as PlayerId;
const seats: readonly SeatAssignment[] = [{ seat: 0, playerId: soloPlayerId }];

const counterFixtures: GameModuleFixtures<CounterState, CounterAction, CounterConfig> = {
  config: { target: 3 },
  seats,
  playerId: soloPlayerId,
  reachableState: { count: 0, target: 3 },
  legalAction: { type: "increment", playerId: soloPlayerId },
  terminalState: { count: 3, target: 3 },
  botTier: "easy",
};

describeGameModule(counterModule, counterFixtures, { describe, it, expect });

/**
 * THE SEAT-COUNT BRANCH, asserted on the suite ITSELF rather than through it.
 *
 * `createBot` is optional on the port, so the compiler no longer forces a new
 * game to arrive with an opponent. That pressure does not disappear, it MOVES:
 * conformance demands a bot whenever the module declares two or more seats, and
 * skips it — by a named, executed test — only for a game that seats one player.
 *
 * Both halves need a suite that FAILED, which a normal `describeGameModule`
 * call cannot give: a failing conformance suite would fail this file. So the
 * harness is inverted — `it` collects instead of registering, the collected
 * bodies run inside one real test, and their outcomes become data. Vitest's own
 * `expect` still does the asserting, so what is recorded is a genuine test
 * result and a genuine failure message, never a re-implementation of either.
 */
interface RecordedConformanceTest {
  readonly name: string;
  /**
   * `null` when the collected body ran clean; otherwise everything vitest
   * would PRINT for that failure.
   *
   * Both halves are needed, and finding that out cost a red run: vitest
   * ELIDES a long value inside `error.message` — the first attempt here read
   * back `expected 'two-seat-fixture declares metadata.se…' to be null` — and
   * prints the value in full only in the Expected/Received diff, which is the
   * `actual` property. Reading `message` alone would have concluded the
   * conformance failure says nothing useful, when in the terminal it does.
   */
  readonly failure: string | null;
}

async function recordConformance<TState, TAction extends { readonly playerId: PlayerId }, TView, TConfig>(
  gameModule: GameModule<TState, TAction, TView, TConfig>,
  fixtures: GameModuleFixtures<TState, TAction, TConfig>,
): Promise<readonly RecordedConformanceTest[]> {
  const collected: { readonly name: string; readonly body: () => void | Promise<void> }[] = [];
  describeGameModule(gameModule, fixtures, {
    // Run the block body immediately: the whole point is to reach the `it`
    // calls inside it, including the ones the seat-count branch decides.
    describe: (_name, body) => {
      body();
    },
    it: (name, body) => {
      collected.push({ name, body });
    },
    expect,
  });

  const recorded: RecordedConformanceTest[] = [];
  for (const { name, body } of collected) {
    try {
      await body();
      recorded.push({ name, failure: null });
    } catch (error) {
      const printed = error instanceof Error ? error.message : String(error);
      const actual: unknown = (error as { actual?: unknown }).actual;
      recorded.push({ name, failure: typeof actual === "string" ? `${printed}\n${actual}` : printed });
    }
  }
  return recorded;
}

/** Two seats and no bot — the shape the compiler used to make impossible, and
 * the one conformance now has to refuse on its own. `createBot` is ABSENT
 * here, not present-and-`undefined`: a registration that forgets a member is
 * what this has to catch, not one that spells the omission out. */
const twoSeatWithoutBot: GameModule<CounterState, CounterAction, CounterState, CounterConfig> = {
  ...counterModule,
  id: "two-seat-fixture",
  metadata: { ...counterModule.metadata, seatCount: 2 },
};

/** Its own seats, and NOT `counterFixtures`': the hidden-state branch refuses a
 * fixture that seats fewer players than the module declares, so reusing the
 * one-seat fixture here would make this module fail for two unrelated reasons
 * and turn `failures).toHaveLength(1)` below into a test of the wrong thing. */
const twoSeatFixtures: GameModuleFixtures<CounterState, CounterAction, CounterConfig> = {
  ...counterFixtures,
  seats: [
    { seat: 0, playerId: soloPlayerId },
    { seat: 1, playerId: "second-player" as PlayerId },
  ],
};

describe("describeGameModule: the bot requirement follows the seat count", () => {
  it("a game with opponents and no bot fails as a TEST, and the failure names the module", async () => {
    const recorded = await recordConformance(twoSeatWithoutBot, twoSeatFixtures);

    // Anti-vacuity, first: "no assertion complained" and "no assertion ran"
    // are the same observation from the outside. Pinning the count is what
    // tells them apart, and it is why every branch below can be trusted.
    //
    // THIRTEEN, not eleven: the hidden-state branch registers two more tests
    // for a game that seats two or more. The number is spelled out per module
    // SHAPE rather than shared, because the shapes no longer register the same
    // suite — see the one-seat case below.
    expect(recorded, "sanity: the whole conformance suite must have been collected and run").toHaveLength(13);

    const failures = recorded.filter((entry) => entry.failure !== null);
    expect(failures).toHaveLength(1);
    // The failure has to SAY what is wrong to whoever is registering a new
    // game. A bare `expected undefined to be defined` names neither the module
    // nor the rule it broke.
    expect(failures[0]!.failure).toContain("two-seat-fixture");
    expect(failures[0]!.failure).toContain("must supply a bot");
  });

  it("a game that seats one player passes, and the skip is a named test in the executed list", async () => {
    // `counterModule` IS the one-seat, bot-less module — which is why the
    // top-level `describeGameModule` call above is the live half of this
    // scenario: those twelve tests are registered with vitest for real and pass
    // for real. What is left for this one is the half a passing suite cannot
    // show from the inside — WHICH tests ran.
    const recorded = await recordConformance(counterModule, counterFixtures);

    // Not only anti-vacuity here: this count is what catches a MUTE skip.
    // Drop either `else` branch and the one-seat path registers eleven tests
    // instead of twelve, silently — measured, radius one test repo-wide.
    //
    // TWELVE against the two-seat case's THIRTEEN, and the difference is the
    // whole reason the number is written down twice: a one-seat game takes the
    // NAMED skip for the cross-seat comparison, where a two-seat game takes the
    // comparison and its floor.
    expect(recorded, "sanity: the whole conformance suite must have been collected and run").toHaveLength(12);
    expect(recorded.filter((entry) => entry.failure !== null)).toEqual([]);
    // And this catches the other half, which the count cannot see: a skip that
    // runs but does not SAY it is one. Renaming either skip test to anything
    // that does not state the reason reds exactly this line and leaves the
    // count at twelve — measured too, so the assertions have separate
    // discriminators.
    expect(recorded.map((entry) => entry.name).filter((name) => name.includes("no opponent"))).toHaveLength(1);
    expect(recorded.map((entry) => entry.name).filter((name) => name.includes("no other seat to keep a secret from"))).toHaveLength(1);
  });
});

/**
 * THE NEW FENCE, PROVEN BY THE FIVE WAYS IT HAS TO GO RED.
 *
 * "El control negativo es lo que prueba una valla" — a guard that cannot fail
 * is not a guard, and this one exists precisely because the hand-written
 * redaction property it replaces could not (see `hidden-state.test.ts` for the
 * `cardId` arithmetic). So the failures are not a one-time manual check that
 * lives in a report: they are registered tests, using the same inverted
 * harness the bot requirement uses, and they stay red-capable forever.
 *
 * Each fixture below breaks EXACTLY ONE thing, and each is asserted to produce
 * EXACTLY ONE failure — a fixture that failed for two reasons would let a
 * broken assertion hide behind a working one.
 */
interface SecretState {
  readonly held: readonly string[];
  readonly over: boolean;
}
type SecretAction = { readonly type: "pass"; readonly playerId: PlayerId };

const seatZero = "seat-zero" as PlayerId;
const seatOne = "seat-one" as PlayerId;
const HELD: readonly string[] = ["what-seat-zero-holds", "what-seat-one-holds"];
const seatIndexOf = (playerId: PlayerId): number => (playerId === seatZero ? 0 : 1);

/** A correctly redacting two-seat game: each seat is told its own held value
 * and the other's COUNT. The control every fixture below is a mutation of. */
const redactingModule: GameModule<SecretState, SecretAction, unknown, void> = {
  id: "redacting-fixture",
  metadata: { seatCount: 2, displayNameKey: "fixture.redacting", assetBase: "/fixtures/redacting" },
  configOptions: [],
  createMatch: () => ({ held: [...HELD], over: false }),
  applyAction: (state) => ({ ok: true, state: { ...state, over: true } }),
  getLegalActions: (state, playerId) => (state.over ? [] : [{ type: "pass", playerId }]),
  getViewFor: (state, playerId) => ({ mine: state.held[seatIndexOf(playerId)], theirs: 1 }),
  hiddenState: { kind: "hidden-per-seat", secretsFor: (state, viewer) => state.held.filter((_, seat) => seat !== seatIndexOf(viewer)) },
  getOutcome: (state) => (state.over ? { winnerIds: [] } : null),
  serialize: (state) => state as unknown as JsonValue,
  deserialize: (json) => json as unknown as SecretState,
  createBot: () => ({ chooseAction: (_view, legal) => legal[0]! }),
};

const redactingFixtures: GameModuleFixtures<SecretState, SecretAction, void> = {
  config: undefined,
  seats: [
    { seat: 0, playerId: seatZero },
    { seat: 1, playerId: seatOne },
  ],
  playerId: seatZero,
  reachableState: { held: [...HELD], over: false },
  legalAction: { type: "pass", playerId: seatZero },
  terminalState: { held: [...HELD], over: true },
  botTier: "easy",
};

/** The live half, exactly as `counterModule`'s call above is: a genuinely
 * redacting module registered with vitest for real, so the passing side of the
 * hidden-per-seat branch is a real green and not a claim. */
describeGameModule(redactingModule, redactingFixtures, { describe, it, expect });

describe("describeGameModule: the hidden-state declaration is enforced, and can be made to fail", () => {
  it("a view that hands a seat the other seat's secret fails, and the failure carries the leaked value", async () => {
    const leaking: GameModule<SecretState, SecretAction, unknown, void> = { ...redactingModule, id: "leaking-fixture", getViewFor: (state) => state };

    const recorded = await recordConformance(leaking, redactingFixtures);

    expect(recorded, "sanity: the whole conformance suite must have been collected and run").toHaveLength(13);
    const failures = recorded.filter((entry) => entry.failure !== null);
    expect(failures).toHaveLength(1);
    // Whoever hits this needs to see WHICH seat and WHICH value, not that two
    // arrays differed.
    expect(failures[0]!.failure).toContain("what-seat-one-holds");
    expect(failures[0]!.failure).toContain(seatZero);
  });

  /**
   * THE VACUOUSLY TRUE FENCE, refused by name. A game whose declared secret is
   * empty passes the scan above against any code at all — which is exactly the
   * shape of the property this whole change replaces.
   */
  it("a game that declares hidden-per-seat and never produces a secret fails the floor, and the failure says why", async () => {
    const declaresNothing: GameModule<SecretState, SecretAction, unknown, void> = {
      ...redactingModule,
      id: "empty-declaration-fixture",
      hiddenState: { kind: "hidden-per-seat", secretsFor: () => [] },
    };

    const recorded = await recordConformance(declaresNothing, redactingFixtures);

    expect(recorded, "sanity: the whole conformance suite must have been collected and run").toHaveLength(13);
    const failures = recorded.filter((entry) => entry.failure !== null);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.failure).toContain("empty-declaration-fixture");
    expect(failures[0]!.failure).toContain("without measuring anything");
  });

  /**
   * THE ESCAPE HATCH, CLOSED. `{ kind: "nothing-is-hidden" }` is the shorter
   * thing to type, so it is the one a game under deadline reaches for. A
   * redacting game that declares it does not quietly opt out of the scan — it
   * lands in the cross-seat comparison and reds there.
   */
  it("a redacting game cannot escape by declaring that it hides nothing", async () => {
    const falselyPublic: GameModule<SecretState, SecretAction, unknown, void> = {
      ...redactingModule,
      id: "falsely-public-fixture",
      hiddenState: { kind: "nothing-is-hidden" },
    };

    const recorded = await recordConformance(falselyPublic, redactingFixtures);

    expect(recorded, "sanity: the whole conformance suite must have been collected and run").toHaveLength(13);
    expect(recorded.filter((entry) => entry.failure !== null)).toHaveLength(1);
  });

  /** Two empty views are equal, so the comparison above passes on a
   * `getViewFor` that tells nobody anything. Its own floor is what catches
   * that, and this is the fixture that proves the floor can fail. */
  it("a game whose seats are told nothing at all fails the comparison's floor", async () => {
    const mute: GameModule<SecretState, SecretAction, unknown, void> = {
      ...redactingModule,
      id: "mute-fixture",
      hiddenState: { kind: "nothing-is-hidden" },
      getViewFor: () => ({}),
    };

    const recorded = await recordConformance(mute, redactingFixtures);

    expect(recorded, "sanity: the whole conformance suite must have been collected and run").toHaveLength(13);
    const failures = recorded.filter((entry) => entry.failure !== null);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.name).toContain("says something");
  });

  /** And the fixture-shaped way to get a green for nothing: declare two seats,
   * hand the suite one, and the cross-seat comparison compares a view against
   * itself. */
  it("a two-seat game whose fixtures seat one player fails instead of comparing a view against itself", async () => {
    const publicModule: GameModule<SecretState, SecretAction, unknown, void> = {
      ...redactingModule,
      id: "under-seated-fixture",
      hiddenState: { kind: "nothing-is-hidden" },
      getViewFor: (state) => ({ shared: state.held.length }),
    };

    const recorded = await recordConformance(publicModule, { ...redactingFixtures, seats: [{ seat: 0, playerId: seatZero }] });

    expect(recorded, "sanity: the whole conformance suite must have been collected and run").toHaveLength(13);
    const failures = recorded.filter((entry) => entry.failure !== null);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.failure).toContain("under-seated-fixture");
    expect(failures[0]!.failure).toContain("compared a view against itself");
  });
});
