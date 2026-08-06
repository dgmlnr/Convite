import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Card } from "./card.js";
import { cardId } from "./card.js";
import { buildDeck } from "./deck.js";
import type { PlayerId } from "./ids.js";
import { createHeadToHeadMatch, startHand } from "./match.js";
import type { MatchState } from "./match.js";
import { applyAction, getLegalActions } from "./truco-chain.js";
import { getViewFor } from "./view.js";

const playerA = "player-a" as PlayerId;
const playerB = "player-b" as PlayerId;

function freshDealtHand(handA: readonly Card[], handB: readonly Card[]): MatchState {
  const state = createHeadToHeadMatch({ playerAId: playerA, playerBId: playerB, pointsToWin: 15 });
  return startHand(state, [handA, handB]);
}

describe("getViewFor — per-player redaction (spec: 'Per-Player View Redaction')", () => {
  it("contains the viewer's own hand and the opponent's card count, never the opponent's cards", () => {
    const state = freshDealtHand([{ suit: "espada", rank: 1 }], [{ suit: "oro", rank: 12 }]);

    const viewA = getViewFor(state, playerA);

    expect(viewA.self.hand).toEqual([{ suit: "espada", rank: 1 }]);
    expect(viewA.opponents).toEqual([{ playerId: playerB, teamId: state.teams[1]!.id, cardsRemaining: 1 }]);
    expect(JSON.stringify(viewA)).not.toContain(cardId({ suit: "oro", rank: 12 }));
  });

  it("throws for a playerId not in the match", () => {
    const state = freshDealtHand([], []);
    expect(() => getViewFor(state, "ghost" as PlayerId)).toThrow();
  });

  it("projects turn/trick state (already-played cards are public, unlike unplayed hand cards)", () => {
    // default dealerSeat is 0, so mano (seat 1, playerB) leads trick 1.
    const state = freshDealtHand([{ suit: "espada", rank: 4 }], [{ suit: "espada", rank: 1 }]);
    const played = applyAction(state, { type: "play-card", playerId: playerB, card: { suit: "espada", rank: 1 } });
    if (!played.ok) throw new Error("expected ok");

    const view = getViewFor(played.state, playerA);

    expect(view.hand?.turnSeat).toBe(0); // playerA's turn now
    expect(view.hand?.currentTrickPlays).toEqual([{ playerId: playerB, teamId: played.state.teams[1]!.id, seat: 1, card: { suit: "espada", rank: 1 } }]);
    expect(view.hand?.trickOutcomes).toEqual([]);
    expect(view.hand?.outcome).toEqual({ decided: false });
  });
});

/** Reachable-state generator: shuffles the real 40-card deck into two 3-card
 * hands, then runs a bounded random walk of legal actions from either seat —
 * the property below must catch a leak in ANY state this can reach. */
const reachableStateArb = fc
  .tuple(
    fc.shuffledSubarray(buildDeck() as Card[], { minLength: 6, maxLength: 6 }),
    fc.array(fc.nat({ max: 9 }), { maxLength: 15 }),
  )
  .map(([cards, steps]) => {
    let state = freshDealtHand(cards.slice(0, 3), cards.slice(3, 6));
    for (const step of steps) {
      const legal = [...getLegalActions(state, playerA), ...getLegalActions(state, playerB)];
      if (legal.length === 0) break;
      const result = applyAction(state, legal[step % legal.length]!);
      if (result.ok) state = result.state;
    }
    return state;
  });

describe("getViewFor — redaction property (design §4: no field can structurally hold hidden data)", () => {
  it("never leaks either player's hand cards into the other's view, for any reachable state", () => {
    fc.assert(
      fc.property(reachableStateArb, (state) =>
        ([[playerA, playerB], [playerB, playerA]] as const).every(([viewer, opponent]) => {
          const opponentHand = state.players.find((player) => player.id === opponent)!.hand;
          const serialized = JSON.stringify(getViewFor(state, viewer));
          return opponentHand.every((card) => !serialized.includes(cardId(card)));
        }),
      ),
    );
  });
});
