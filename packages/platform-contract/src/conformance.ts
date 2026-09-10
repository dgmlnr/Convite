import type { BotTier, GameModule, SeatAssignment } from "./contract.js";
import { findLeakedSecrets, seatViewFingerprint } from "./hidden-state.js";
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
  /**
   * More reachable states for BOTH hidden-state branches — the leak scan and
   * the cross-seat comparison — on top of `reachableState` and
   * `terminalState`.
   *
   * OPTIONAL, AND THE FLOOR IS WHAT MAKES IT MANDATORY IN PRACTICE. A game
   * whose fixtures never reach a state carrying one of its declared secrets
   * fails the floor test below by name, so "supply enough states" is enforced
   * by a red run rather than by a required field somebody would satisfy with
   * `[]`.
   *
   * WHERE THE PROPERTY TESTS GO. `truco-engine/src/view.test.ts` already walks
   * a fast-check generator of reachable states looking for leaks; this is the
   * seam that lifts that walk to the platform without dragging fast-check into
   * a package whose whole point is having no dependencies — not even a test
   * runner (see `ConformanceExpectation`). The game generates, the platform
   * scans.
   */
  readonly hiddenStateSamples?: readonly TState[];
}

/**
 * The executable guard against a truco-shaped "generic" interface: every
 * game runs this against its own `GameModule`. Asserts ONLY contract
 * invariants — purity, legal-action/apply agreement, view safety,
 * outcome/termination consistency, bot legality — never a rule specific to
 * any one game.
 */
export function describeGameModule<TState, TAction extends { readonly playerId: PlayerId }, TView, TConfig>(
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

    /**
     * THE REDACTION GUARANTEE, AS A PLATFORM REQUIREMENT RATHER THAN A HABIT.
     *
     * Until now the suite's only view assertion was that `getViewFor` does not
     * THROW. Whether it hands a seat another seat's cards was checked by each
     * game separately, in its own engine's tests, and a module that wrote none
     * passed conformance whole. `gameModule.hiddenState` is what closes that:
     * the game says what is secret, and the two branches below say what it
     * costs to claim either answer.
     *
     * ONE OF THESE BRANCHES IS ALWAYS A NAMED, EXECUTED TEST — never a mute
     * `if` — for the same reason the bot requirement below is: in a green run,
     * "this game has no secret" and "somebody forgot" have to look different.
     */
    const hiddenState = gameModule.hiddenState;
    /**
     * BOTH BRANCHES READ THE SAME STATES, and the second one needs them more
     * than the first. Measured: adding a per-seat `peek: state.cards[seat]` to
     * generala's view did NOT red the cross-seat comparison when only the
     * fixture's `reachableState` was compared — a freshly opened match has
     * every scorecard empty, so the leaked cards were identical and the
     * comparison was right to call them the same information. On a state where
     * the seats have diverged, the same mutation reds. A comparison that runs
     * on one early state is a comparison that runs before there is anything to
     * tell apart.
     */
    const scanned = [fixtures.reachableState, fixtures.terminalState, ...(fixtures.hiddenStateSamples ?? [])];
    if (hiddenState.kind === "hidden-per-seat") {
      it("no seated player's view holds a value this game declares secret from them", () => {
        const leaks = scanned.flatMap((state) =>
          fixtures.seats.flatMap((seat) => {
            const leaked = findLeakedSecrets(gameModule.getViewFor(state, seat.playerId), hiddenState.secretsFor(state, seat.playerId));
            return leaked.length === 0 ? [] : [{ leakedTo: seat.playerId, leaked }];
          }),
        );
        // Asserted as a MESSAGE rather than as `toEqual([])`, the way the bot
        // requirement below is, and for a reason this file already paid for
        // once: vitest ELIDES a long value inside `error.message` (`expected
        // [ …(4) ] to deeply equal []`) and prints it in full only in the
        // Expected/Received diff. Whoever hits this needs the seat and the
        // value in the sentence, not in a diff a harness may not carry.
        expect(leaks.length === 0 ? null : `${gameModule.id} hands seats values it declares secret from them: ${JSON.stringify(leaks)}`).toBeNull();
      });

      /**
       * THE FLOOR, and the assertion this whole change exists to avoid needing
       * twice. A scan for secrets that were never declared passes on any code
       * at all — it is the shape of guard that looks like protection and
       * measures nothing, which is exactly how `truco-engine`'s own
       * `cardId`-substring redaction property stayed green with the opponent's
       * whole hand published.
       */
      it("declares a secret that some state its fixtures reach actually holds — a scan with nothing to find is not a fence", () => {
        const declared = scanned.reduce(
          (total, state) => total + fixtures.seats.reduce((seatTotal, seat) => seatTotal + hiddenState.secretsFor(state, seat.playerId).length, 0),
          0,
        );
        expect(
          declared === 0
            ? `${gameModule.id} declares hiddenState "hidden-per-seat" and not one of the ${String(scanned.length)} state(s) its fixtures reach produces a single secret — the leak scan above passed without measuring anything. Supply a state that holds one (fixtures.hiddenStateSamples), or declare "nothing-is-hidden".`
            : null,
        ).toBeNull();
      });
    } else if (gameModule.metadata.seatCount >= 2) {
      /**
       * WHAT "NOTHING IS HIDDEN" IS WORTH: every seat is told the same things.
       * `generala-engine/src/view.ts` argues this in prose — "a redacted field
       * is by definition not equal across seats" — and its own test file
       * asserts it for four hand-picked fields. Here it is the platform's, for
       * the whole view, and it is what makes the cheap arm uncheap: truco's two
       * hands differ per viewer, so a redacting game that declared this reds on
       * its first dealt state instead of quietly opting out of the scan.
       */
      it("every seat is told the same things — this game declares that it hides nothing", () => {
        expect(
          fixtures.seats.length < 2
            ? `${gameModule.id} declares metadata.seatCount ${String(gameModule.metadata.seatCount)} and its fixtures seat only ${String(fixtures.seats.length)} — the cross-seat comparison would have compared a view against itself`
            : null,
        ).toBeNull();
        for (const state of scanned) {
          const first = seatViewFingerprint(gameModule.getViewFor(state, fixtures.seats[0]!.playerId));
          for (const seat of fixtures.seats.slice(1)) {
            expect(seatViewFingerprint(gameModule.getViewFor(state, seat.playerId))).toEqual(first);
          }
        }
      });

      /** The floor for the branch above, the twin of the one for the other
       * branch: two empty views are equal, and a `getViewFor` that returned
       * `{}` would satisfy the comparison without ever telling a seat
       * anything. */
      it("hands each seat a view that says something — two empty views are equal for the wrong reason", () => {
        const spoken = fixtures.seats.filter((seat) => seatViewFingerprint(gameModule.getViewFor(fixtures.reachableState, seat.playerId)).length > 0);
        expect(spoken.length).toBe(fixtures.seats.length);
      });
    } else {
      it("skips the cross-seat comparison deliberately: this game seats one player, so there is no other seat to keep a secret from", () => {
        // The licence, executed rather than left in a comment — the same shape
        // as the bot requirement's own skip below. ONE seat is the entire
        // reason this guarantee does not apply: invert the branch and every
        // shipped multi-seat game lands here and fails on its own seat count.
        expect(gameModule.metadata.seatCount).toBe(1);
      });
    }

    it("getOutcome is null while the match has not ended", () => {
      expect(gameModule.getOutcome(fixtures.reachableState)).toBeNull();
    });

    it("getOutcome is non-null once the match has ended", () => {
      expect(gameModule.getOutcome(fixtures.terminalState) === null).toBe(false);
    });

    it("the fixture's legal action structurally claims the player it belongs to", () => {
      // Every GameModule's TAction is required (compile-time) to extend
      // `{ readonly playerId: PlayerId }` — this is the executed proof that
      // the contract holds for THIS module's own action shape, not just
      // asserted at the type level. See platform-contract/src/contract.ts.
      expect(fixtures.legalAction.playerId).toBe(fixtures.playerId);
    });

    /**
     * EVERY OFFERED ACTION, not just the fixture's — and this became a
     * correctness requirement rather than a nicety the day the transport
     * started gating on it.
     *
     * `MatchRoom.handleAction` refuses any action whose `playerId` is not the
     * authenticated seat's, BEFORE the module ever sees it. So an action this
     * module offers to player A while stamping it player B is a legal move
     * that NOBODY CAN MAKE: the player picks it, the server answers
     * `actor-mismatch`, and the game is stuck with no test anywhere going
     * red. The module believes it offered a move; the transport believes the
     * client forged one; both are behaving exactly as written.
     *
     * The fixture's own action is checked above. That check passes on a list
     * whose OTHER entries are all mis-stamped, which is the gap this closes —
     * the same shape as `getLegalActions offers the fixture's legal action`
     * passing on a list that is otherwise wrong.
     */
    it("every action offered to a player claims that same player", () => {
      const legal = gameModule.getLegalActions(fixtures.reachableState, fixtures.playerId);
      // Compared as whole lists rather than one `toBe` per entry: the injected
      // `expect` takes no message argument, and a diff of the two arrays is
      // what names the offending id in the failure output.
      expect(legal.map((action) => action.playerId)).toEqual(legal.map(() => fixtures.playerId));
    });

    // THE BOT REQUIREMENT, BY SEAT COUNT — and both halves are a named test
    // that RUNS. `createBot` is optional on the port (see `contract.ts`), so
    // this branch is now the only thing standing between a game with
    // opponents and a registration that silently forgot to bring one.
    //
    // Never a mute `if` around the assertion below. A game that skips a
    // contract requirement has to say so out loud, in the executed test list,
    // with the reason attached — otherwise the difference between "this game
    // has no opponent" and "somebody forgot" is invisible in a green run.
    if (gameModule.metadata.seatCount >= 2) {
      it("a game with opponents supplies a bot, and that bot always chooses one of the legal actions it is offered", async () => {
        const createBot = gameModule.createBot;
        // Asserted as a MESSAGE rather than as `toBe(true)`: whoever hits this
        // is registering a new game, and needs to be told which module and
        // which rule, not that `false` was not `true`.
        expect(
          createBot === undefined
            ? `${gameModule.id} declares metadata.seatCount ${String(gameModule.metadata.seatCount)} and supplies no createBot — a game with opponents must supply a bot`
            : null,
        ).toBeNull();
        // Unreachable: the assertion above already threw. Present so the
        // narrowing is the compiler's, not a cast's.
        if (createBot === undefined) return;

        const legal = gameModule.getLegalActions(fixtures.reachableState, fixtures.playerId);
        const view = gameModule.getViewFor(fixtures.reachableState, fixtures.playerId);
        const bot = createBot(fixtures.botTier);
        const chosen = await bot.chooseAction(view, legal, 50);
        expect(legal).toContainEqual(chosen);
      });
    } else {
      it("skips the bot requirement deliberately: this game seats one player, so it has no opponent for a bot to play", () => {
        // The justification, executed rather than left in a comment. ONE seat
        // is the entire licence to skip the assertion above, so it is asserted
        // here: invert the branch and every shipped two-seat game lands in
        // this test and fails on its own seat count.
        expect(gameModule.metadata.seatCount).toBe(1);
      });
    }
  });
}
