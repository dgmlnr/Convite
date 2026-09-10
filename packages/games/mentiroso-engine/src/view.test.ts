import { describe, expect, it } from "vitest";
import { hiddenStateSamples, midMatchEliminatedState, openingDrawState, reachableState, SEAT_PLAYER_IDS, showdownState } from "./fixtures.js";
import type { MatchState, PlayerId } from "./state.js";
import { getViewFor, secretsFor } from "./view.js";

/**
 * `view.ts`'s own tests (SDD `mentiroso`, work unit B5/task 2.5, design D4,
 * mentiroso-hidden-dice's own requirements). Every scenario below is one this
 * project has already been burned by once (per this file's own header
 * comment in `AGENTS.md`): "si la vista de un jugador filtra los dados de
 * otro, no hay un bug: no hay juego."
 *
 * NO IMPORT FROM `@hexdev/platform-contract` — this package is L0
 * (`.dependency-cruiser.cjs`'s own `l0-game-engine-no-workspace-deps`, which
 * globs `src` and therefore fences test files too). `findLeakedSecretsLocally`
 * below is a deliberate, LOCAL re-implementation of the platform's own
 * `findLeakedSecrets` (structural deep-equality against every node of a
 * view), mirroring the same "re-declared, not imported" discipline
 * `violation.ts`'s own docblock already states for `RuleViolation`/
 * `ApplyResult` — the identical boundary, applied to a test file instead of a
 * production one.
 */

/** Structural equality: key ORDER never matters, array order always does —
 * the same semantics `platform-contract/src/hidden-state.ts`'s own
 * `deepEquals` documents, reproduced here because this L0 package may not
 * import it. */
function deepEqualsLocally(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((entry, index) => deepEqualsLocally(entry, right[index]));
  }
  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) return false;
  const leftEntries = Object.entries(left);
  if (leftEntries.length !== Object.keys(right).length) return false;
  return leftEntries.every(([key, value]) => key in right && deepEqualsLocally(value, (right as Record<string, unknown>)[key]));
}

/** Every node of a value, the root included — the same walk
 * `platform-contract/src/hidden-state.ts`'s own `nodesOf` documents. */
function* nodesOfLocally(value: unknown): Generator<unknown> {
  yield value;
  if (Array.isArray(value)) {
    for (const entry of value) yield* nodesOfLocally(entry);
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const nested of Object.values(value)) yield* nodesOfLocally(nested);
  }
}

/** Which of `secrets` can be found inside `view`, at any depth, under any
 * key — a LOCAL re-implementation of `findLeakedSecrets`, used to prove this
 * unit's own redaction guarantee before `mentiroso-module` (Phase 3) ever
 * wires the real one in through `describeGameModule`. */
function findLeakedSecretsLocally(view: unknown, secrets: readonly unknown[]): readonly unknown[] {
  const nodes = [...nodesOfLocally(view)];
  return secrets.filter((secret) => nodes.some((node) => deepEqualsLocally(node, secret)));
}

const [SEAT_0, SEAT_1, SEAT_2, SEAT_3] = SEAT_PLAYER_IDS as readonly [PlayerId, PlayerId, PlayerId, PlayerId];

describe("getViewFor — rival shape at bidding (mentiroso-hidden-dice: R-RIVAL-SHAPE)", () => {
  it("exposes exactly seat, playerId, and diceCount for a rival — no dice array, no extra field, under any name", () => {
    const view = getViewFor(reachableState, SEAT_0);
    expect(view.rivals).toHaveLength(3);
    for (const rival of view.rivals) {
      expect(Object.keys(rival).sort()).toEqual(["diceCount", "playerId", "seat"]);
    }
    const rival1 = view.rivals.find((rival) => rival.playerId === SEAT_1);
    expect(rival1).toEqual({ seat: 1, playerId: SEAT_1, diceCount: 4 });
  });

  it("exposes the viewer's own dice in full, never redacted from themselves", () => {
    const view = getViewFor(reachableState, SEAT_2);
    expect(view.self).toEqual({ playerId: SEAT_2, seat: 2, dice: [6, 2, 3, 4, 1] });
  });

  it("throws for a playerId not seated in the match", () => {
    expect(() => getViewFor(reachableState, "ghost" as PlayerId)).toThrow();
  });
});

describe("getViewFor — reveal only at showdown (mentiroso-hidden-dice: R-HIDDEN, R-REVEAL)", () => {
  it("a rival's dice carry NO `dice` key anywhere in a bidding-phase view", () => {
    const view = getViewFor(reachableState, SEAT_0);
    for (const rival of view.rivals) {
      expect("dice" in rival).toBe(false);
    }
  });

  it("every seat's real dice become visible to every other seat once showdown resolves", () => {
    const view = getViewFor(showdownState, SEAT_0);
    const rival1 = view.rivals.find((rival) => rival.playerId === SEAT_1);
    expect(rival1).toEqual({ seat: 1, playerId: SEAT_1, diceCount: 3, dice: [6, 5, 1] });
    // Two different viewers see the SAME real values for the same rival —
    // the reveal is not itself viewer-dependent.
    const viewFromSeat3 = getViewFor(showdownState, SEAT_3);
    expect(viewFromSeat3.rivals.find((rival) => rival.playerId === SEAT_1)).toEqual(rival1);
  });
});

describe("secretsFor — phase-dependent (design D4)", () => {
  it("declares NO secrets during the opening draw — the draw is public", () => {
    expect(secretsFor(openingDrawState, SEAT_0)).toEqual([]);
  });

  it("declares NO secrets at showdown — the reveal IS the rule", () => {
    expect(secretsFor(showdownState, SEAT_0)).toEqual([]);
  });

  it("declares every OTHER active seat's dice array as a secret during bidding, never the viewer's own", () => {
    const secrets = secretsFor(reachableState, SEAT_1);
    expect(secrets).toEqual([[2, 4, 6], [6, 2, 3, 4, 1], [3]]);
    // THE FENCE (array-valued, never a bare scalar): none of the three
    // secrets above is a number — each is the rival's WHOLE dice array.
    for (const secret of secrets) expect(Array.isArray(secret)).toBe(true);
  });

  it("THE FENCE: excludes an eliminated seat's empty dice array from the declared secrets", () => {
    const secrets = secretsFor(midMatchEliminatedState, SEAT_3);
    // Seat 2 is eliminated (dice: []) — its empty array must not appear here,
    // not even once. Deleting the exclusion clause would push a fourth entry
    // (`[]`) onto this list and this exact equality would go red.
    expect(secrets).toEqual([[4, 4, 6], [2, 5]]);
    expect(secrets).not.toContainEqual([]);
  });
});

describe("secretsFor/getViewFor — the redaction guarantee (R-HIDDEN, R-ARRAY-SECRET, R-EMPTY-EXCLUDE)", () => {
  const scanned: readonly MatchState[] = [reachableState, ...hiddenStateSamples];

  it("no seated player's view holds a value this engine declares secret from them, across every fixture state", () => {
    const leaks = scanned.flatMap((state) =>
      SEAT_PLAYER_IDS.flatMap((seat) => {
        const leaked = findLeakedSecretsLocally(getViewFor(state, seat), secretsFor(state, seat));
        return leaked.length === 0 ? [] : [{ leakedTo: seat, leaked }];
      }),
    );
    expect(leaks).toEqual([]);
  });

  it("THE FLOOR: at least one fixture state actually produces a real secret — a scan with nothing to find is not a fence", () => {
    const declared = scanned.reduce(
      (total, state) => total + SEAT_PLAYER_IDS.reduce((seatTotal, seat) => seatTotal + secretsFor(state, seat).length, 0),
      0,
    );
    expect(declared).toBeGreaterThan(0);
  });

  it("a coincidental scalar match elsewhere in the view is NOT treated as a leak (mentiroso-hidden-dice's own trap)", () => {
    // Viewer sits at seat 3, holds exactly 3 dice, one of which reads 3, and
    // the current bid's quantity is ALSO 3 — four unrelated 3s, none of them
    // the declared secret. A rival (seat 0) separately holds a die reading 3.
    const state: MatchState = {
      players: [
        { id: SEAT_0, seat: 0, dice: [3, 6] },
        { id: SEAT_1, seat: 1, dice: [5, 4] },
        { id: SEAT_2, seat: 2, dice: [2, 6] },
        { id: SEAT_3, seat: 3, dice: [3, 5, 2] },
      ],
      phase: { kind: "bidding", turnSeat: 0, bid: { quantity: 3, face: 5 } },
    };
    const leaked = findLeakedSecretsLocally(getViewFor(state, SEAT_3), secretsFor(state, SEAT_3));
    expect(leaked).toEqual([]);
  });

  it("THE MANDATORY NEGATIVE CONTROL: a view that DOES leak a rival's dice array is caught by the scan", () => {
    const view = getViewFor(reachableState, SEAT_0);
    // Simulate the exact bug this whole requirement set exists to prevent:
    // a rival's true dice smuggled into the view under a plausible-looking
    // extra field.
    const brokenView = { ...view, debugRivalDice: reachableState.players[1]!.dice };
    const leaked = findLeakedSecretsLocally(brokenView, secretsFor(reachableState, SEAT_0));
    expect(leaked.length).toBeGreaterThan(0);
    expect(leaked).toContainEqual([5, 5, 1, 3]);
  });
});
