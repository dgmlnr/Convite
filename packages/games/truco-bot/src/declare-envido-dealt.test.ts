import { describe, expect, it } from "vitest";
import { applyAction, createTeamMatch, getLegalActions, getViewFor, startHand } from "@hexdev/truco-engine";
import type { Action, MatchState, PlayerId } from "@hexdev/truco-engine";
import { chooseEnvidoDeclaration } from "./declare-envido.js";

/**
 * A BOT DECIDES ON WHAT IT WAS DEALT, the same three cards the engine scores
 * it on.
 *
 * WHAT WAS BROKEN. `view.self.hand` shrinks as cards are played -- correct,
 * it is the trick game's hand -- and this helper read its envido points
 * straight off it. The engine had the same defect and it is now fixed
 * (envido-points-source.test.ts), which made this one WORSE rather than
 * harmless: the engine declares the real 33, while the bot deciding whether
 * to declare at all was looking at the 6 left in hand. A bot holding the
 * winning number would concede it -- and "son buenas" gives the envido up
 * for the WHOLE TEAM.
 *
 * WHY IT IS REACHABLE, AND ONLY FROM ONE SEAT. Two guards stand in front of
 * the concession: the number in front must belong to the OPPONENTS, and the
 * partner must have SPOKEN already. Walk the two orders and exactly one seat
 * clears both while holding a played-out hand:
 *
 *   play order    1st  2nd  3rd  4th   (from the mano)
 *   declare order 1st  2nd  3rd  4th   (also from the mano, but a
 *                                       DIFFERENT rotation of the same ring)
 *
 * Only a PIE may open an envido and a pie is never the mano, so every seat
 * ahead of the opener has played. Of those, the mano declares first (nothing
 * standing, so it always says its number) and the second seat's partner
 * speaks last (so `partnerSpoke` is false). The THIRD seat is the one: it has
 * played, its partner is the mano who already spoke, and the standing number
 * can be an opponent's. That is the case below, and it is not exotic -- it is
 * every hand where the dealer's own pie opens the envido.
 */

const A = "dd-a" as PlayerId;
const B = "dd-b" as PlayerId;
const C = "dd-c" as PlayerId;
const D = "dd-d" as PlayerId;

/** espada 7 + espada 6 = 33; play the 7 and only a 6 is left in hand. */
const THIRTY_THREE = [{ suit: "espada", rank: 7 }, { suit: "espada", rank: 6 }, { suit: "oro", rank: 3 }] as const;
const TWENTY_SEVEN = [{ suit: "basto", rank: 3 }, { suit: "basto", rank: 4 }, { suit: "oro", rank: 1 }] as const;
const FOUR = [{ suit: "oro", rank: 4 }, { suit: "basto", rank: 4 }, { suit: "copa", rank: 4 }] as const;
const FIVE = [{ suit: "basto", rank: 5 }, { suit: "copa", rank: 10 }, { suit: "oro", rank: 2 }] as const;

function apply(state: MatchState, action: Action): MatchState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`fence setup: ${action.type} — ${result.violation}`);
  return result.state;
}

/**
 * A(4) B(27) C(33) D(5), dealt from seat 3 so the mano is A and the pies are
 * C and D. A, B and C play, D opens as the dealer's own pie, A accepts, then
 * A and B say their numbers -- leaving C on the clock with B's 27 standing,
 * its partner A already spoken, and one espada of its 33 face up.
 */
function roundReachingC(): MatchState {
  let state = startHand(createTeamMatch({ seatOrder: [A, B, C, D], pointsToWin: 30, dealerSeat: 3 }), [FOUR, TWENTY_SEVEN, THIRTY_THREE, FIVE]);
  state = apply(state, { type: "play-card", playerId: A, card: { suit: "oro", rank: 4 } });
  state = apply(state, { type: "play-card", playerId: B, card: { suit: "basto", rank: 3 } });
  state = apply(state, { type: "play-card", playerId: C, card: { suit: "espada", rank: 7 } });
  state = apply(state, { type: "call-envido", playerId: D, level: "envido" });
  state = apply(state, { type: "respond-envido", playerId: A, response: "quiero" });
  state = apply(state, { type: "declare-envido", playerId: A, declaration: "points" });
  state = apply(state, { type: "declare-envido", playerId: B, declaration: "points" });
  return state;
}

describe("the bot declares on its dealt hand, not on what is left of it", () => {
  it("says 33 with an espada of it already on the table, instead of conceding the team's envido", () => {
    const state = roundReachingC();
    const view = getViewFor(state, C);

    // Both halves of the trap, asserted so this cannot go quietly hollow.
    expect(view.self.hand, "fence setup: C really has played a card").toHaveLength(2);
    const standing = state.hand?.envido.status === "accepted" ? state.hand.envido.declarations : [];
    expect(standing.filter((entry) => entry.declaration === "points").map((entry) => entry.points), "fence setup: an OPPONENT's 27 is what C is facing").toContain(27);

    const chosen = chooseEnvidoDeclaration(view, getLegalActions(state, C));
    expect(chosen?.declaration, "C was dealt 33, which beats the 27 standing — reading the 6 left in hand concedes a won envido for the whole team").toBe("points");
  });

  it("still concedes when the DEALT hand genuinely loses", () => {
    // The mirror, so the fix cannot be "never concede": same seat, same two
    // guards cleared, but C was dealt the 4 and B's 27 really does beat it.
    let state = startHand(createTeamMatch({ seatOrder: [A, B, C, D], pointsToWin: 30, dealerSeat: 3 }), [THIRTY_THREE, TWENTY_SEVEN, FOUR, FIVE]);
    state = apply(state, { type: "play-card", playerId: A, card: { suit: "espada", rank: 7 } });
    state = apply(state, { type: "play-card", playerId: B, card: { suit: "basto", rank: 3 } });
    state = apply(state, { type: "play-card", playerId: C, card: { suit: "oro", rank: 4 } });
    state = apply(state, { type: "call-envido", playerId: D, level: "envido" });
    state = apply(state, { type: "respond-envido", playerId: A, response: "quiero" });
    // A says 33 -- C's OWN partner, so the "never concede a hand we are
    // winning" guard would carry this case for the wrong reason. B's 27 is
    // lower, so the number C actually faces is its partner's, and C must
    // still say its own rather than concede to its own side.
    state = apply(state, { type: "declare-envido", playerId: A, declaration: "points" });

    const chosen = chooseEnvidoDeclaration(getViewFor(state, B), getLegalActions(state, B));
    expect(chosen?.declaration, "B holds 27 against A's standing 33 but its partner D has not spoken — conceding would end the round over D's head").toBe("points");
  });
});
