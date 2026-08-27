import { describe, expect, it } from "vitest";
import { applyAction, createTeamMatch, getLegalActions, startHand } from "@hexdev/truco-engine";
import type { Action, MatchState, PlayerId } from "@hexdev/truco-engine";
import { buildTrucoRegistry } from "./registry.js";

/**
 * sdd-verify CRITICAL-3: `apps/server/src/index.ts`'s own `getConsultAsk`
 * registration had no fence — `match-room.consult.test.ts` builds its OWN
 * hand-authored registry (commented "same real registrations apps/server
 * wires"), which is a copy, not the composition root itself. This file
 * imports `buildTrucoRegistry`, the EXACT function `index.ts` now calls
 * (registry.ts), so deleting either `getConsultAsk` registration line fails
 * this test rather than shipping silently — the identical class of gap
 * Slice 4b already closed one layer down in `game-ui-registry.ts`.
 */

const A = "srv-a" as PlayerId;
const B = "srv-b" as PlayerId;
const C = "srv-c" as PlayerId;
const D = "srv-d" as PlayerId;
const HAND_A = [{ suit: "espada", rank: 7 }, { suit: "espada", rank: 6 }, { suit: "oro", rank: 3 }] as const;
const HAND_B = [{ suit: "oro", rank: 4 }, { suit: "basto", rank: 4 }, { suit: "copa", rank: 4 }] as const;
const HAND_C = [{ suit: "basto", rank: 5 }, { suit: "copa", rank: 10 }, { suit: "oro", rank: 2 }] as const;
const HAND_D = [{ suit: "copa", rank: 6 }, { suit: "basto", rank: 2 }, { suit: "espada", rank: 11 }] as const;

function apply(state: MatchState, action: Action): MatchState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`fence setup: ${action.type} — ${result.violation}`);
  return result.state;
}

/** A real 2v2 pending truco call, built through the real reducer (same
 * fixture shape as `truco-module`'s own `consult-ask.test.ts`) — so a
 * non-null result can only come from a genuinely wired provider, never from
 * a hand-authored stand-in. */
function pendingCallState(): MatchState {
  let state = startHand(createTeamMatch({ seatOrder: [A, B, C, D], pointsToWin: 30, dealerSeat: 3 }), [HAND_A, HAND_B, HAND_C, HAND_D] as never);
  for (const seat of [A, B, C]) {
    const card = getLegalActions(state, seat).find((action) => action.type === "play-card")!;
    state = apply(state, card);
  }
  return apply(state, { type: "call-truco", playerId: D, level: "truco" });
}

describe("buildTrucoRegistry — the REAL composition root's own registration (sdd-verify CRITICAL-3)", () => {
  it("wires getConsultAsk on the 2v2 entry: a live teammate is named, not null", () => {
    const registry = buildTrucoRegistry();
    const state = pendingCallState();

    const ask = registry.getConsultAsk("truco-argentino-2v2", state, C);

    // `null` here would mean either "nobody to ask" or "no provider
    // registered" — this fixture rules out the first: A genuinely owes a
    // real respond-truco, fenced below the same way consult-ask.test.ts
    // fences its own equivalent setup.
    expect(getLegalActions(state, A).some((action) => action.type === "respond-truco"), "fence setup: A has a real respond-truco to answer").toBe(true);
    expect(ask, "null here means the getConsultAsk REGISTRATION itself is missing").not.toBeNull();
    expect(ask!.partnerId).toBe(A);
    expect(new Set(ask!.options)).toEqual(new Set(["quiero", "no-quiero"]));
  });
});
