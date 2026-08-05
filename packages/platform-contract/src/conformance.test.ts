import { describe, expect, it } from "vitest";
import type { GameModule, SeatAssignment } from "./contract.js";
import type { PlayerId } from "./ids.js";
import type { JsonValue } from "./json.js";
import { describeGameModule } from "./conformance.js";

/**
 * A deliberately NON-truco fixture module: one seat, no opponent, no hidden
 * information, no teams, no turns, a score that is a single number, ends
 * when solved. Standing in for the design prompt's "Game A" (a single-player
 * puzzle) — proves the suite below asserts contract invariants, not truco
 * behavior, since nothing here could satisfy a truco-shaped assertion.
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
  createBot: () => ({
    chooseAction: (_view, legal) => {
      const [first] = legal;
      if (first === undefined) throw new Error("no legal actions");
      return first;
    },
  }),
};

const soloPlayerId = "solo-player" as PlayerId;
const seats: readonly SeatAssignment[] = [{ seat: 0, playerId: soloPlayerId }];

describeGameModule(
  counterModule,
  {
    config: { target: 3 },
    seats,
    playerId: soloPlayerId,
    reachableState: { count: 0, target: 3 },
    legalAction: { type: "increment", playerId: soloPlayerId },
    terminalState: { count: 3, target: 3 },
    botTier: "easy",
  },
  { describe, it, expect },
);
