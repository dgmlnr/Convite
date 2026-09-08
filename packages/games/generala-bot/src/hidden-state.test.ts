import { describe, expect, it } from "vitest";
import { getLegalActions, getViewFor } from "@hexdev/generala-engine";
import type { GeneralaAction, MatchState, PlayerView } from "@hexdev/generala-engine";
import { createBotStrategy } from "./index.js";
import { reachableStates, servidaWinState } from "./fixtures.js";

const ROOM_BUDGET_MS = 1000;
const TIERS = ["easy", "normal", "hard"] as const;
const states: readonly MatchState[] = [...reachableStates(), servidaWinState()];

/**
 * Spec Domain F: "Each tier MUST decide from the seat view and the legal-action
 * list alone. It MUST NOT receive unrolled faces, another seat's private state,
 * or the random source."
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT RE-ASSERT. `escoba-bot`'s own
 * `hidden-state.test.ts` restates its engine's redaction as a runtime safety
 * net, and for escoba that is worth doing because its `MatchState`
 * structurally contains cards nobody has seen. Generala's does not, and its
 * engine already owns the whole fence in `generala-engine/src/view.test.ts`:
 * the exact key set at every phase (`:119`), cross-seat structural equality as
 * a counted property (`:66`), and three planted-value scans including a
 * pre-rolled face parked on the TURN (`:148`). Copying those here would be a
 * mutation the pre-existing tests already catch — measured, not assumed: a
 * `nextRoll` field planted in `getViewFor` reds `view.test.ts:119` on its own,
 * and the compiler refuses it before either test runs.
 *
 * So what is left is the half only this package can say: what reaches the
 * STRATEGY, which is a seam the engine has never heard of.
 */
describe("the bot sees only what a seat sees (Spec F: the bot sees only what a seat sees)", () => {
  /**
   * THE STRONGEST OF THE FOUR, and it is a consequence of the phase gate rather
   * than of any redaction.
   *
   * A Generala bot is only ever consulted where it has a legal action, and the
   * only phase that offers one is `deciding` — where all five dice are face-up
   * on the table. `awaiting-roll` is the phase that has a throw still pending,
   * and it offers NOBODY anything, so no tier is ever handed a turn with an
   * unrolled die in it. The bot cannot see a future roll because it is never
   * asked in a position that has one.
   */
  it("a tier is only ever asked in `deciding`, where all five dice are already face-up", () => {
    let asked = 0;
    for (const state of states) {
      for (const playerId of state.players) {
        if (getLegalActions(state, playerId).length === 0) continue;
        const turn = getViewFor(state, playerId).turn;
        expect(turn.phase).toBe("deciding");
        if (turn.phase !== "deciding") continue;
        expect(turn.dice).toHaveLength(5);
        expect(turn.dice.filter((face) => face === null)).toEqual([]);
        asked += 1;
      }
    }
    // Non-vacuity: a sweep that offered nothing anywhere would satisfy every
    // assertion above without making one.
    expect(asked).toBeGreaterThan(60);
  });

  /**
   * The fourth argument of the port, and the reason it is always `undefined`
   * here.
   *
   * `BotStrategy.chooseAction`'s `answer` carries what a bot ASKED for and PAID
   * for — truco's consult, bought with a seña. Generala registers no consult
   * channel at all (there is no advice provider and no action that buys one),
   * so the transport has nothing to put there. This asserts that no tier reads
   * it anyway: a decision that changed when an answer was planted would mean a
   * Generala tier had grown a channel the game does not have.
   */
  it("a planted `answer` cannot change any tier's decision, because Generala has no consult channel to have bought one", () => {
    const { view, legal } = firstOffer();
    for (const tier of TIERS) {
      const withoutAnswer = createBotStrategy(tier, () => 0.5).chooseAction(view, legal, ROOM_BUDGET_MS);
      const withAnswer = createBotStrategy(tier, () => 0.5).chooseAction(view, legal, ROOM_BUDGET_MS, { theNextRollIs: [6, 6, 6, 6, 6] });
      expect(withAnswer).toBe(withoutAnswer);
    }
  });

  /**
   * "Reads only what it was handed", enforced by the runtime rather than
   * asserted about it.
   *
   * Both arguments are deep-frozen at every reachable position. A tier that
   * tried to enrich its input, cache something onto the view, or re-order the
   * offer list in place would throw here — ES modules are strict, so a write to
   * a frozen object is a `TypeError`, not a silent no-op. It is also the
   * strongest available statement that the offer list reaches the room in the
   * order the engine emitted it, which `sameAction`'s index-by-index comparison
   * makes load-bearing.
   */
  it("every tier decides from a deep-frozen view and a deep-frozen offer list, and mutates neither", () => {
    let asked = 0;
    for (const state of states) {
      for (const playerId of state.players) {
        const legal = deepFreeze(getLegalActions(state, playerId));
        if (legal.length === 0) continue;
        const view = deepFreeze(getViewFor(state, playerId));
        for (const tier of TIERS) {
          expect(legal).toContain(createBotStrategy(tier, () => 0.5).chooseAction(view, legal, ROOM_BUDGET_MS));
        }
        asked += 1;
      }
    }
    expect(asked).toBeGreaterThan(60);
  });

  /**
   * The room builds ONE strategy and reuses it for any seat —
   * `match-room.ts:315-318` says so in writing: "a `BotStrategy` is stateless
   * (it is handed the view and the legal actions on every call), so one
   * instance can resolve a timed-out turn for any seat."
   *
   * That is a promise this package has to keep, and it is the same promise the
   * port's `answer` docstring makes when it says an answer "arrives EXACTLY
   * ONCE... so it can never accumulate into a standing feed". A tier that
   * remembered anything between calls would let seat 0's position influence
   * seat 1's decision — a leak with no field to see it in.
   */
  it("one reused instance answers exactly as a fresh one would, seat after seat", () => {
    const offers = everyOffer();
    const reused = createBotStrategy("easy", scriptedRng());
    const fromReused = offers.map((offer) => reused.chooseAction(offer.view, offer.legal, ROOM_BUDGET_MS));
    const fresh = scriptedRng();
    const fromFresh = offers.map((offer) => createBotStrategy("easy", () => fresh()).chooseAction(offer.view, offer.legal, ROOM_BUDGET_MS));
    expect(fromReused).toEqual(fromFresh);
    expect(offers.length).toBeGreaterThan(60);
  });
});

function everyOffer(): readonly { view: PlayerView; legal: readonly GeneralaAction[] }[] {
  const offers: { view: PlayerView; legal: readonly GeneralaAction[] }[] = [];
  for (const state of states) {
    for (const playerId of state.players) {
      const legal = getLegalActions(state, playerId);
      if (legal.length > 0) offers.push({ view: getViewFor(state, playerId), legal });
    }
  }
  return offers;
}

function firstOffer(): { view: PlayerView; legal: readonly GeneralaAction[] } {
  return everyOffer()[0]!;
}

/** Walks the same range for both runs, so "reused" and "fresh" are compared on equal entropy. */
function scriptedRng(): () => number {
  let step = 0;
  const values = [0, 0.17, 0.33, 0.5, 0.66, 0.83, 0.999999];
  return () => values[step++ % values.length]!;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
