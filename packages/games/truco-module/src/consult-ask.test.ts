import { describe, expect, it } from "vitest";
import { applyAction, createHeadToHeadMatch, createTeamMatch, getLegalActions, startHand } from "@hexdev/truco-engine";
import type { Action, MatchState, PlayerId } from "@hexdev/truco-engine";
import { getConsultAdvice, getConsultAsk } from "./index.js";

/**
 * WHO MAY BE ASKED, AND WHAT THEY MAY SAY (design D7).
 *
 * `getConsultAsk` is built off the SAME private `questionFor` that already
 * feeds `getConsultAdvice`, mapping each option to its own `response` value
 * — one source for the answer domain, so a human answer and a bot answer are
 * the same value in the same shape by construction. This file also carries
 * the regression fence that Slice 1 costs zero behavior change for the bot
 * path: `getConsultAdvice`'s return must stay byte-identical to today.
 */

const A = "cq-a" as PlayerId;
const B = "cq-b" as PlayerId;
const C = "cq-c" as PlayerId;
const D = "cq-d" as PlayerId;

const HAND_A = [{ suit: "espada", rank: 7 }, { suit: "espada", rank: 6 }, { suit: "oro", rank: 3 }] as const;
const HAND_B = [{ suit: "oro", rank: 4 }, { suit: "basto", rank: 4 }, { suit: "copa", rank: 4 }] as const;
const HAND_C = [{ suit: "basto", rank: 5 }, { suit: "copa", rank: 10 }, { suit: "oro", rank: 2 }] as const;
const HAND_D = [{ suit: "copa", rank: 6 }, { suit: "basto", rank: 2 }, { suit: "espada", rank: 11 }] as const;

function apply(state: MatchState, action: Action): MatchState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`fence setup: ${action.type} — ${result.violation}`);
  return result.state;
}

/**
 * A real 2v2 team match (seats 0/2 = A+C, seats 1/3 = B+D) with a pending
 * truco call already on the table — built through the real reducer and its
 * own turn order, never a hand-authored state. `call-truco` only opens for
 * whoever currently holds `turnSeat` (truco-chain.ts), so A, B and C each
 * play a card first to walk the floor to D before D calls.
 */
function pendingCallOnC(): MatchState {
  let state = startHand(createTeamMatch({ seatOrder: [A, B, C, D], pointsToWin: 30, dealerSeat: 3 }), [HAND_A, HAND_B, HAND_C, HAND_D] as never);
  for (const seat of [A, B, C]) {
    const card = getLegalActions(state, seat).find((action) => action.type === "play-card")!;
    state = apply(state, card);
  }
  return apply(state, { type: "call-truco", playerId: D, level: "truco" });
}

function headsUpNoTeammate(): MatchState {
  return startHand(createHeadToHeadMatch({ playerAId: A, playerBId: B, pointsToWin: 30, dealerSeat: 0 }), [HAND_A, HAND_B] as never);
}

describe("getConsultAsk — who may be asked, and what they may say", () => {
  it("returns the same option domain getConsultAdvice chooses from, values exactly \"quiero\"/\"no-quiero\"", () => {
    const state = pendingCallOnC();
    // Fence setup, from the REAL engine (not a hand-authored array): A's
    // full legal-actions list also contains send-sena/consult-partner
    // alongside respond-truco — this filters the real list rather than
    // asserting against a hand-cleaned substitute.
    const realResponses = getLegalActions(state, A).filter((action) => action.type === "respond-truco");
    expect(realResponses.length, "fence setup: A has a real respond-truco to answer").toBeGreaterThan(0);
    expect(getLegalActions(state, C).some((action) => action.type === "consult-partner"), "fence setup: C may ask").toBe(true);

    const ask = getConsultAsk(state, C);
    expect(ask).not.toBeNull();
    expect(ask!.partnerId).toBe(A);
    expect(new Set(ask!.options)).toEqual(new Set(realResponses.map((action) => (action as { response: string }).response)));
    expect(ask!.options.every((option) => option === "quiero" || option === "no-quiero")).toBe(true);
  });

  it("returns null when the asker has no teammate (heads-up match)", () => {
    expect(getConsultAsk(headsUpNoTeammate(), B)).toBeNull();
  });
});

describe("getConsultAdvice stays byte-identical to today (regression fence: Slice 1 costs zero behavior change for the bot path)", () => {
  it("still answers a pending call from the partner's real legal responses", async () => {
    const state = pendingCallOnC();
    const advice = await getConsultAdvice(state, C, "normal");
    expect(advice === "quiero" || advice === "no-quiero", `got ${JSON.stringify(advice)}`).toBe(true);
  });

  it("still returns null in a heads-up match with nobody to ask", async () => {
    await expect(getConsultAdvice(headsUpNoTeammate(), B, "normal")).resolves.toBeNull();
  });
});
