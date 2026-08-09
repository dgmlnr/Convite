import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Card } from "./card.js";
import { cardId } from "./card.js";
import { buildDeck } from "./deck.js";
import type { PlayerId } from "./ids.js";
import { createHeadToHeadMatch, createTeamMatch, startHand } from "./match.js";
import type { MatchState } from "./match.js";
import { applyAction, getLegalActions } from "./truco-chain.js";
import { getViewFor } from "./view.js";

const playerA = "player-a" as PlayerId;
const playerB = "player-b" as PlayerId;
const playerC = "player-c" as PlayerId;
const playerD = "player-d" as PlayerId;

function freshDealtHand(handA: readonly Card[], handB: readonly Card[]): MatchState {
  const state = createHeadToHeadMatch({ playerAId: playerA, playerBId: playerB, pointsToWin: 15 });
  return startHand(state, [handA, handB]);
}

describe("getViewFor — per-player redaction (spec: 'Per-Player View Redaction')", () => {
  it("contains the viewer's own hand and the opponent's card count, never the opponent's cards", () => {
    const state = freshDealtHand([{ suit: "espada", rank: 1 }], [{ suit: "oro", rank: 12 }]);

    const viewA = getViewFor(state, playerA);

    expect(viewA.self.hand).toEqual([{ suit: "espada", rank: 1 }]);
    expect(viewA.self.seat).toBe(0);
    expect(viewA.opponents).toEqual([{ playerId: playerB, teamId: state.teams[1]!.id, seat: 1, cardsRemaining: 1 }]);
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

/**
 * Señas redaction (design/spec: "delivered only to the teammate... no field
 * is structurally capable of holding hidden information — a leak is a
 * compile error"). This is the security-critical property of the whole
 * feature, so it gets both a concrete test AND a property test below.
 */
function freshTeamHandFor2v2(): MatchState {
  const state = createTeamMatch({ seatOrder: [playerA, playerB, playerC, playerD], pointsToWin: 15 });
  return startHand(state, [[], [], [], []]);
}

describe("getViewFor — señas are delivered ONLY to the teammate, never the opponent", () => {
  it("a teammate's view exposes the signal; an opponent's view does not contain it anywhere", () => {
    const signaled = applyAction(freshTeamHandFor2v2(), { type: "send-sena", playerId: playerA, signal: "asDeEspada" });
    if (!signaled.ok) throw new Error("expected ok");

    // playerC is playerA's TEAMMATE (seats 0 and 2 — createTeamMatch's alternating pattern).
    const teammateView = getViewFor(signaled.state, playerC);
    expect(teammateView.teammates).toContainEqual(
      expect.objectContaining({ playerId: playerA, lastSena: "asDeEspada" }),
    );

    // playerB and playerD are OPPONENTS of playerA — the signal must not appear anywhere in their view.
    const opponentViewB = getViewFor(signaled.state, playerB);
    const opponentViewD = getViewFor(signaled.state, playerD);
    expect(JSON.stringify(opponentViewB)).not.toContain("asDeEspada");
    expect(JSON.stringify(opponentViewD)).not.toContain("asDeEspada");
  });

  it("the signaling player's own view reflects their own signal (self-confirmation, not a leak)", () => {
    const signaled = applyAction(freshTeamHandFor2v2(), { type: "send-sena", playerId: playerA, signal: "tres" });
    if (!signaled.ok) throw new Error("expected ok");

    const ownView = getViewFor(signaled.state, playerA);
    expect(ownView.self.lastSena).toBe("tres");
  });
});

/** Reachable-state generator for 2v2, including send-sena among the random
 * walk's legal actions — the property below must catch a seña leak in ANY
 * state this can reach, not just a single hand-authored scenario. */
const reachableTeamStateArb = fc
  .tuple(
    fc.shuffledSubarray(buildDeck() as Card[], { minLength: 12, maxLength: 12 }),
    fc.array(fc.nat({ max: 9 }), { maxLength: 20 }),
  )
  .map(([cards, steps]) => {
    let state = freshTeamHandFor2v2();
    state = startHand(state, [cards.slice(0, 3), cards.slice(3, 6), cards.slice(6, 9), cards.slice(9, 12)]);
    const players = [playerA, playerB, playerC, playerD];
    for (const step of steps) {
      const legal = players.flatMap((p) => getLegalActions(state, p));
      if (legal.length === 0) break;
      const result = applyAction(state, legal[step % legal.length]!);
      if (result.ok) state = result.state;
    }
    return state;
  });

describe("getViewFor — señas redaction property, for any reachable 2v2 state", () => {
  it("an opponent's view NEVER attaches a signal to the entry representing the signaler — structural check, not string-matching (two different players can legitimately claim the same signal, so raw text content would collide)", () => {
    fc.assert(
      fc.property(reachableTeamStateArb, (state) => {
        const teamOf = (id: PlayerId) => state.players.find((p) => p.id === id)!.teamId;
        return [playerA, playerB, playerC, playerD].every((signaler) => {
          const opponents = state.players.filter((p) => p.teamId !== teamOf(signaler));
          return opponents.every((opponent) => {
            const view = getViewFor(state, opponent.id);
            const signalerEntry = view.opponents.find((o) => o.playerId === signaler);
            // The signaler MUST appear in `opponents` (never `teammates`) from
            // this viewer's perspective, and that entry structurally has no
            // `lastSena` key at all — OpponentView's type has no such field.
            return signalerEntry !== undefined && !("lastSena" in signalerEntry);
          });
        });
      }),
    );
  });
});
