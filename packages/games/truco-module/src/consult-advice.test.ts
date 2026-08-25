import { describe, expect, it } from "vitest";
import { applyAction, createHeadToHeadMatch, createTeamMatch, getLegalActions, startHand } from "@hexdev/truco-engine";
import type { Action, MatchState, PlayerId } from "@hexdev/truco-engine";
import { getConsultAdvice } from "./index.js";

/**
 * WHAT YOUR PARTNER THINKS OF AN ENVIDO YOU HAVE NOT CALLED YET.
 *
 * The pie rule (truco-engine's envido-opener.test.ts) took the envido away
 * from two of the four seats, and one of them may be the seat holding the
 * points. Señas name CARDS, never tantos, so a non-pie partner with 33 has no
 * way to say so — the team simply loses envidos it should win. `consult.ts`
 * opened a window for the pie to ASK; this is the answer.
 *
 * THE QUESTION IS PUT IN THE FORM THE PARTNER ALREADY ANSWERS. There is no
 * "would you call this?" move to offer them — they are a non-pie, calling is
 * exactly what the rule forbids — so they are asked the equivalent they DO
 * have judgement for: if this envido were on the table, would you want it?
 * That is a `respond-envido`, decided by their own strategy at the match's own
 * tier from their own view, which is the same honesty rule the pending-call
 * advice above holds itself to.
 *
 * WHY NOT OFFER THEM A SYNTHETIC `call-envido` INSTEAD, which reads closer to
 * the literal question: because the strategies fall back to "take whatever
 * non-seña action is left" when nothing else fits, and a lone synthetic call
 * IS that action. The answer would have been "yes" every time, from a code
 * path that never weighed the hand at all. A quiero/no-quiero pair cannot
 * degenerate that way — both arms are real answers.
 *
 * The accept threshold is deliberately the lower bar. The partner is not
 * being asked to call it; they are saying whether they would play it, and the
 * pie combines that with its own hand.
 */

const A = "ca-a" as PlayerId;
const B = "ca-b" as PlayerId;
const C = "ca-c" as PlayerId;
const D = "ca-d" as PlayerId;

const THIRTY_THREE = [{ suit: "espada", rank: 7 }, { suit: "espada", rank: 6 }, { suit: "oro", rank: 3 }] as const;
const FOUR = [{ suit: "oro", rank: 4 }, { suit: "basto", rank: 4 }, { suit: "copa", rank: 4 }] as const;
const FIVE = [{ suit: "basto", rank: 5 }, { suit: "copa", rank: 10 }, { suit: "oro", rank: 2 }] as const;
const SIX = [{ suit: "copa", rank: 6 }, { suit: "basto", rank: 2 }, { suit: "espada", rank: 11 }] as const;

function apply(state: MatchState, action: Action): MatchState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`fence setup: ${action.type} — ${result.violation}`);
  return result.state;
}

/**
 * Walks the floor to C — dealt from seat 3 the mano is A and the pies are C
 * and D, so C is the first seat that may open an envido, with A and B's cards
 * already down.
 */
function floorAtC(partnerHand: readonly { suit: string; rank: number }[]): MatchState {
  let state = startHand(
    createTeamMatch({ seatOrder: [A, B, C, D], pointsToWin: 30, dealerSeat: 3 }),
    [partnerHand, FIVE, FOUR, SIX] as never,
  );
  for (const seat of [A, B]) {
    const card = getLegalActions(state, seat).find((action) => action.type === "play-card")!;
    state = apply(state, card);
  }
  return state;
}

describe("the pie asks before opening an envido", () => {
  it("a partner holding 33 says they want it", async () => {
    // A is C's partner (seats 0 and 2) and was dealt the 33 -- and has
    // already played one of its espadas, which is exactly the state the pie
    // rule guarantees. The advice must weigh the DEALT hand, not the 6 left.
    const state = floorAtC(THIRTY_THREE);
    expect(getLegalActions(state, C).some((action) => action.type === "consult-partner"), "fence setup: C may ask").toBe(true);

    await expect(getConsultAdvice(state, C, "normal")).resolves.toBe("quiero");
  });

  it("a partner holding a 4 says they do not", async () => {
    const state = floorAtC(FOUR);

    await expect(getConsultAdvice(state, C, "normal")).resolves.toBe("no-quiero");
  });

  it("nobody to ask in a heads-up match", async () => {
    // Belt to the engine's suspenders: it refuses the action here anyway.
    const heads = startHand(createHeadToHeadMatch({ playerAId: A, playerBId: B, pointsToWin: 30, dealerSeat: 0 }), [THIRTY_THREE, FIVE] as never);
    await expect(getConsultAdvice(heads, B, "normal")).resolves.toBeNull();
  });

  it("still answers a pending call the old way, unchanged", async () => {
    // The original mode has to keep working: a truco on the table is answered
    // from the partner's REAL legal responses, not from the synthetic pair.
    // C plays, which closes its own envido window, and D then trucos the team
    // that owes the answer — so only the original mode can be what replies.
    let state = floorAtC(THIRTY_THREE);
    state = apply(state, getLegalActions(state, C).find((action) => action.type === "play-card")!);
    state = apply(state, { type: "call-truco", playerId: D, level: "truco" });
    expect(getLegalActions(state, C).some((action) => action.type === "call-envido"), "fence setup: C's own envido window is shut").toBe(false);

    const advice = await getConsultAdvice(state, C, "normal");
    expect(advice === "quiero" || advice === "no-quiero", `got ${JSON.stringify(advice)}`).toBe(true);
  });
});
