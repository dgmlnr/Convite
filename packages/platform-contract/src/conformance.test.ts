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

describe("describeGameModule: the bot requirement follows the seat count", () => {
  it("a game with opponents and no bot fails as a TEST, and the failure names the module", async () => {
    const recorded = await recordConformance(twoSeatWithoutBot, counterFixtures);

    // Anti-vacuity, first: "no assertion complained" and "no assertion ran"
    // are the same observation from the outside. Pinning the count is what
    // tells them apart, and it is why every branch below can be trusted.
    expect(recorded, "sanity: the whole conformance suite must have been collected and run").toHaveLength(10);

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
    // scenario: those ten tests are registered with vitest for real and pass
    // for real. What is left for this one is the half a passing suite cannot
    // show from the inside — WHICH tests ran.
    const recorded = await recordConformance(counterModule, counterFixtures);

    // Not only anti-vacuity here: this count is what catches a MUTE skip.
    // Drop the `else` branch and the one-seat path registers nine tests
    // instead of ten, silently — measured, radius one test repo-wide.
    expect(recorded, "sanity: the whole conformance suite must have been collected and run").toHaveLength(10);
    expect(recorded.filter((entry) => entry.failure !== null)).toEqual([]);
    // And this catches the other half, which the count cannot see: a skip that
    // runs but does not SAY it is one. Renaming the skip test to anything that
    // does not state the reason reds exactly this line and leaves the count at
    // ten — measured too, so the two assertions have separate discriminators.
    expect(recorded.map((entry) => entry.name).filter((name) => name.includes("no opponent"))).toHaveLength(1);
  });
});
