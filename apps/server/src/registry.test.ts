import { describe, expect, it } from "vitest";
import { applyAction, createTeamMatch, getLegalActions, startHand } from "@hexdev/truco-engine";
import type { Action, MatchState, PlayerId } from "@hexdev/truco-engine";
import type { SeatAssignment } from "@hexdev/platform-contract";
import { buildGameRegistry } from "./registry.js";

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

describe("buildGameRegistry — the REAL composition root's own registration (sdd-verify CRITICAL-3)", () => {
  it("wires getConsultAsk on the 2v2 entry: a live teammate is named, not null", () => {
    const registry = buildGameRegistry();
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

/**
 * Slice L.1: escoba's own registration on this SAME real composition-root
 * function — not a hand-copied stand-in. `requestEscobaSystemAction` firing
 * for real, through `registry.getSystemAction`, is the proof the object-form
 * entry is genuinely wired (mutation: deleting the entry would make this
 * `null`, same "registration itself is missing" failure mode the truco
 * fence above already documents).
 */
describe("buildGameRegistry — escoba's registration (slice L.1)", () => {
  const seats: readonly SeatAssignment[] = [
    { seat: 0, playerId: "escoba-srv-a" as PlayerId },
    { seat: 1, playerId: "escoba-srv-b" as PlayerId },
  ];

  it("wires requestEscobaSystemAction on the 1v1 entry: a real start-hand deal, not null", () => {
    const registry = buildGameRegistry();
    const module = registry.get("escoba-de-15");
    expect(module, "null here means the module itself is missing from the registry").toBeDefined();
    const fresh = module!.createMatch({}, seats);

    const action = registry.getSystemAction("escoba-de-15", fresh, () => 0.25);

    expect(action, "null here means the requestSystemAction REGISTRATION itself is missing").not.toBeNull();
    expect(JSON.parse(JSON.stringify(action)).type).toBe("start-hand");
  });

  it("wires requestEscobaSystemAction on the 2v2 entry too, under its own separate gameId", () => {
    const registry = buildGameRegistry();
    const seats4p: readonly SeatAssignment[] = [
      { seat: 0, playerId: "escoba-srv-0" as PlayerId },
      { seat: 1, playerId: "escoba-srv-1" as PlayerId },
      { seat: 2, playerId: "escoba-srv-2" as PlayerId },
      { seat: 3, playerId: "escoba-srv-3" as PlayerId },
    ];
    const module = registry.get("escoba-de-15-2v2");
    expect(module).toBeDefined();
    const fresh = module!.createMatch({}, seats4p);

    expect(registry.getSystemAction("escoba-de-15-2v2", fresh, () => 0.25)).not.toBeNull();
  });

  // design §D3 / slice J: escoba registers NO consult hooks at all — asserted
  // here on the REAL registry rather than assumed, so a future accidental
  // registration (e.g. copy-pasting truco's consult lines onto escoba's
  // entry) fails this test instead of shipping a channel escoba's own
  // engine has no surface for.
  it("registers NO consult hooks for escoba — no señas, no partner-consult mechanic (design §D3, slice J)", () => {
    const registry = buildGameRegistry();
    const fresh = registry.get("escoba-de-15")!.createMatch({}, seats);

    expect(registry.isNonBlockingAction("escoba-de-15", { type: "play-card" })).toBe(false);
    expect(registry.isHumanPriorityAction("escoba-de-15", { type: "play-card" })).toBe(false);
    expect(registry.isPaidQuestion("escoba-de-15", { type: "play-card" })).toBe(false);
    expect(registry.getConsultAsk("escoba-de-15", fresh, seats[0]!.playerId)).toBeNull();
  });
});
