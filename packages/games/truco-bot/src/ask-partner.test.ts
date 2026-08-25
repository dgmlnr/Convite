import { describe, expect, it } from "vitest";
import { applyAction, createTeamMatch, getLegalActions, getViewFor, startHand } from "@hexdev/truco-engine";
import type { Action, MatchState, PlayerId } from "@hexdev/truco-engine";
import { createBotStrategy } from "./index.js";

/**
 * A BOT PIE ASKS ITS PARTNER BEFORE PASSING ON AN ENVIDO.
 *
 * WHY THERE IS ANYTHING TO ASK. Only a pie may open an envido, which takes
 * the call away from two of the four seats — possibly the one holding the
 * points. Señas name CARDS, never tantos, so a non-pie partner with 33 cannot
 * say so. The pie may buy that answer for a seña (truco-engine's
 * `consult.ts`), and until now only a human could: a bot has no socket, and
 * `chooseAction` had nowhere to receive one, so a bot that asked would pay
 * and learn nothing. `BotStrategy`'s fourth input is that missing half.
 *
 * IT ASKS ONLY WHEN IT WOULD OTHERWISE PASS. A hand that already justifies
 * the call gets called — spending a seña to be told what you had decided is
 * the same waste in either direction.
 *
 * AND IT ASKS ONCE. `undefined` (never asked) is distinct from `null` (asked,
 * no answer came) precisely so this cannot loop: a bot on the clock that
 * re-asked every decision would burn the whole per-hand budget on one
 * question. Both post-answer cases are fenced below, because the difference
 * between them is invisible until it costs three señas.
 */

const A = "ask-a" as PlayerId;
const B = "ask-b" as PlayerId;
const C = "ask-c" as PlayerId;
const D = "ask-d" as PlayerId;

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
 * Dealt from seat 3 the mano is A and the pies are C and D, so C is the first
 * seat that may open an envido — with A's and B's cards already down, which is
 * what the pie rule guarantees. `cHand` is what the bot under test holds.
 */
function floorAtC(cHand: readonly { suit: string; rank: number }[]): MatchState {
  let state = startHand(createTeamMatch({ seatOrder: [A, B, C, D], pointsToWin: 30, dealerSeat: 3 }), [FIVE, SIX, cHand, FOUR] as never);
  for (const seat of [A, B]) {
    state = apply(state, getLegalActions(state, seat).find((action) => action.type === "play-card")!);
  }
  return state;
}

const decide = async (state: MatchState, answer?: unknown): Promise<Action> =>
  createBotStrategy("normal", () => 0.5).chooseAction(getViewFor(state, C), getLegalActions(state, C), 200, answer as never);

describe("a bot pie and the question it can now afford", () => {
  it("asks, instead of quietly passing on an envido its partner may want", async () => {
    const state = floorAtC(FOUR); // a 4: nothing this bot would call on its own
    expect(getLegalActions(state, C).some((action) => action.type === "consult-partner"), "fence setup: the question is on offer").toBe(true);

    await expect(decide(state)).resolves.toMatchObject({ type: "consult-partner" });
  });

  it("opens the envido when the answer comes back yes", async () => {
    const state = floorAtC(FOUR);

    await expect(decide(state, "quiero")).resolves.toMatchObject({ type: "call-envido" });
  });

  it("lets it go when the answer is no, and does NOT ask again", async () => {
    const state = floorAtC(FOUR);

    const chosen = await decide(state, "no-quiero");
    expect(chosen.type, "asking twice about the same envido burns a budget of three on one question").not.toBe("consult-partner");
    expect(chosen.type).not.toBe("call-envido");
  });

  it("lets it go when the question went unanswered, and does NOT ask again", async () => {
    // `null` is "asked, nothing came" — distinct from never having asked, and
    // this is the case that would loop if the two were collapsed.
    const state = floorAtC(FOUR);

    const chosen = await decide(state, null);
    expect(chosen.type).not.toBe("consult-partner");
    expect(chosen.type).not.toBe("call-envido");
  });

  it("does not ask at all when its own hand already justifies the call", async () => {
    const state = floorAtC(THIRTY_THREE);

    await expect(decide(state)).resolves.toMatchObject({ type: "call-envido" });
  });

  it("passes without asking once the seña budget is gone", async () => {
    let state = floorAtC(FOUR);
    for (const signal of ["asDeEspada", "asDeBasto", "tres"] as const) {
      state = apply(state, { type: "send-sena", playerId: C, signal });
    }
    expect(getLegalActions(state, C).some((action) => action.type === "consult-partner"), "fence setup: the question is no longer affordable").toBe(false);

    const chosen = await decide(state);
    expect(chosen.type).not.toBe("consult-partner");
  });
});
