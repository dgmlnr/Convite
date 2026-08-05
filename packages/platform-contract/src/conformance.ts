import type { BotTier, GameModule, SeatAssignment } from "./contract.js";
import type { PlayerId } from "./ids.js";

/** Structural subset of a test framework's `expect`, injected rather than
 * imported so this package keeps ZERO dependencies — not even a test
 * runner. Vitest's real `describe`/`it`/`expect` satisfy this shape as-is. */
export interface ConformanceExpectation {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
  toBeNull(): void;
  toContainEqual(expected: unknown): void;
  not: { toThrow(): void };
}

export interface ConformanceHarness {
  readonly describe: (name: string, fn: () => void) => void;
  readonly it: (name: string, fn: () => void | Promise<void>) => void;
  readonly expect: (actual: unknown) => ConformanceExpectation;
}

/**
 * Fixtures a game module supplies to run the shared conformance suite
 * against its OWN reachable states — `describeGameModule` never invents
 * game-specific data, so it can never assert one game's rules on another.
 */
export interface GameModuleFixtures<TState, TAction, TConfig> {
  readonly config: TConfig;
  readonly seats: readonly SeatAssignment[];
  readonly playerId: PlayerId;
  /** Any state where `legalAction` is legal for `playerId`. */
  readonly reachableState: TState;
  readonly legalAction: TAction;
  /** A state for which the match has already ended. */
  readonly terminalState: TState;
  readonly botTier: BotTier;
}

/**
 * The executable guard against a truco-shaped "generic" interface: every
 * game runs this against its own `GameModule`. Asserts ONLY contract
 * invariants — purity, legal-action/apply agreement, view safety,
 * outcome/termination consistency, bot legality — never a rule specific to
 * any one game.
 */
export function describeGameModule<TState, TAction, TView, TConfig>(
  gameModule: GameModule<TState, TAction, TView, TConfig>,
  fixtures: GameModuleFixtures<TState, TAction, TConfig>,
  harness: ConformanceHarness,
): void {
  const { describe, it, expect } = harness;

  describe(`GameModule conformance: ${gameModule.id}`, () => {
    it("exposes a non-empty id", () => {
      expect(gameModule.id.length > 0).toBe(true);
    });

    it("createMatch survives a serialize/deserialize round-trip", () => {
      const state = gameModule.createMatch(fixtures.config, fixtures.seats);
      expect(gameModule.deserialize(gameModule.serialize(state))).toEqual(state);
    });

    it("getLegalActions offers the fixture's legal action", () => {
      const legal = gameModule.getLegalActions(fixtures.reachableState, fixtures.playerId);
      expect(legal.length > 0).toBe(true);
      expect(legal).toContainEqual(fixtures.legalAction);
    });

    it("every action getLegalActions offers is accepted by applyAction", () => {
      const legal = gameModule.getLegalActions(fixtures.reachableState, fixtures.playerId);
      for (const action of legal) {
        expect(gameModule.applyAction(fixtures.reachableState, action).ok).toBe(true);
      }
    });

    it("applyAction is pure: repeated calls agree and the input state is untouched", () => {
      const before = gameModule.serialize(fixtures.reachableState);
      const first = gameModule.applyAction(fixtures.reachableState, fixtures.legalAction);
      const second = gameModule.applyAction(fixtures.reachableState, fixtures.legalAction);
      expect(gameModule.serialize(fixtures.reachableState)).toEqual(before);
      expect(first).toEqual(second);
    });

    it("getViewFor never throws for any seated player", () => {
      for (const seat of fixtures.seats) {
        expect(() => gameModule.getViewFor(fixtures.reachableState, seat.playerId)).not.toThrow();
      }
    });

    it("getOutcome is null while the match has not ended", () => {
      expect(gameModule.getOutcome(fixtures.reachableState)).toBeNull();
    });

    it("getOutcome is non-null once the match has ended", () => {
      expect(gameModule.getOutcome(fixtures.terminalState) === null).toBe(false);
    });

    it("a bot always chooses one of the legal actions it is offered", async () => {
      const legal = gameModule.getLegalActions(fixtures.reachableState, fixtures.playerId);
      const view = gameModule.getViewFor(fixtures.reachableState, fixtures.playerId);
      const bot = gameModule.createBot(fixtures.botTier);
      const chosen = await bot.chooseAction(view, legal, 50);
      expect(legal).toContainEqual(chosen);
    });
  });
}
