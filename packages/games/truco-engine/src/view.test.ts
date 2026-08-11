import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Card } from "./card.js";
import { cardId } from "./card.js";
import { buildDeck } from "./deck.js";
import type { PlayerId } from "./ids.js";
import { calculateEnvidoPoints } from "./envido-chain.js";
import { createHeadToHeadMatch, createTeamMatch, startHand } from "./match.js";
import type { MatchState } from "./match.js";
import { applyAction, getLegalActions } from "./truco-chain.js";
import type { Action } from "./truco-chain.js";
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

function apply(state: MatchState, action: Action): MatchState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`expected legal action, got violation: ${result.violation}`);
  return result.state;
}

/**
 * Envido declaration redaction (spec: "Envido Declaration Redaction Is
 * Structural"; design T-5/T-5m). Mirrors the señas property above: a purely
 * random legal walk rarely reaches a `revealed` envido (call/respond/reveal
 * is one action among many competing with card-play/truco/señas), so these
 * generators DRIVE the envido chain straight to reveal — mano opens, the
 * first legal opponent accepts, mano reveals — while still randomizing the
 * deal and (via `dealerSeat`) which seat is mano, for both 1v1 and 2v2.
 */
const revealedHeadToHeadArb = fc
  .tuple(fc.shuffledSubarray(buildDeck() as Card[], { minLength: 6, maxLength: 6 }), fc.constantFrom(0, 1))
  .map(([cards, dealerSeat]) => {
    const base = createHeadToHeadMatch({ playerAId: playerA, playerBId: playerB, pointsToWin: 30, dealerSeat });
    const dealt = startHand(base, [cards.slice(0, 3), cards.slice(3, 6)]);
    const manoSeat = dealt.hand!.manoSeat;
    const mano = dealt.players.find((player) => player.seat === manoSeat)!;
    const opponent = dealt.players.find((player) => player.seat !== manoSeat)!;
    const called = apply(dealt, { type: "call-envido", playerId: mano.id, level: "envido" });
    const accepted = apply(called, { type: "respond-envido", playerId: opponent.id, response: "quiero" });
    return apply(accepted, { type: "reveal-envido", playerId: mano.id });
  });

const revealedTeamArb = fc
  .tuple(fc.shuffledSubarray(buildDeck() as Card[], { minLength: 12, maxLength: 12 }), fc.constantFrom(0, 1, 2, 3))
  .map(([cards, dealerSeat]) => {
    const base = createTeamMatch({ seatOrder: [playerA, playerB, playerC, playerD], pointsToWin: 30, dealerSeat });
    const dealt = startHand(base, [cards.slice(0, 3), cards.slice(3, 6), cards.slice(6, 9), cards.slice(9, 12)]);
    const manoSeat = dealt.hand!.manoSeat;
    const mano = dealt.players.find((player) => player.seat === manoSeat)!;
    const opponent = dealt.players.find((player) => player.teamId !== mano.teamId)!;
    const called = apply(dealt, { type: "call-envido", playerId: mano.id, level: "envido" });
    const accepted = apply(called, { type: "respond-envido", playerId: opponent.id, response: "quiero" });
    return apply(accepted, { type: "reveal-envido", playerId: mano.id });
  });

describe("getViewFor — envido declaration redaction property, for any reachable revealed 1v1/2v2 state", () => {
  /**
   * TRAP, inherited from the señas property above (view.test.ts:146-165):
   * this MUST be a structural check (`!("points" in entry)`), never a
   * `JSON.stringify(...).includes(String(points))` check — envido points are
   * small integers (0-33) that collide with scores, seats, and card ranks
   * already present elsewhere in the view, exactly like señas' own documented
   * collision risk. Every viewer sees the SAME declaration list (D-6 — no
   * per-viewer branch), so this loops every player as viewer, not just one.
   */
  it("every sonBuenas entry structurally lacks a `points` key, for every viewer, in every reachable revealed state", () => {
    fc.assert(
      fc.property(fc.oneof(revealedHeadToHeadArb, revealedTeamArb), (state) =>
        state.players.every((viewer) => {
          const view = getViewFor(state, viewer.id);
          const envido = view.hand?.envido;
          if (envido === undefined || envido.status !== "revealed") return false; // generator always reveals -- a non-revealed view here is the bug
          return envido.declarations.every((entry) => entry.declaration !== "sonBuenas" || !("points" in entry));
        }),
      ),
    );
  });
});

/**
 * Mutation guard (T-5m, manual — documented inline exactly as this trap is
 * documented for the señas property above at view.ts:93-97).
 *
 * DISCLOSED FINDING: the mutation named in tasks.md ("invert `>` to `>=`, or
 * drop the strict check") was tried first and does NOT make the property
 * above fail. Inverting the comparator only changes WHO declares at a tie —
 * every entry `resolveEnvidoDeclarations` builds is still either a
 * fully-typed `"points"` object or a fully-typed `"sonBuenas"` object
 * (TypeScript's excess-property check forbids attaching `points` to a
 * `"sonBuenas"` literal), so no comparator change alone can produce a leak.
 * This is D-1 working exactly as designed: "a leak is a compile error, not a
 * runtime check someone could forget."
 *
 * The mutation that DOES bite: temporarily changing the `sonBuenas` push in
 * `resolveEnvidoDeclarations` (envido-chain.ts) to
 * `{ declaration: "sonBuenas", playerId, teamId, seat, points } as EnvidoDeclaration`
 * — an unsafe cast bypassing the excess-property check — confirmed the
 * property above FAILS with the withheld `points` value now present on a
 * `sonBuenas` entry. Reverted immediately after confirming the failure; the
 * property as committed runs against the correct, unmutated code. See
 * apply-progress for the exact failing output of both attempts.
 */

/**
 * Positive coverage rider (PR-2 review, WARNING): the property above only
 * ever asserts on `sonBuenas` entries — for a `declaration: "points"` entry,
 * `entry.declaration !== "sonBuenas"` is already `true`, so the property is
 * VACUOUSLY satisfied for it and never actually reads `entry.points`. This
 * closes that gap with a genuinely positive check: an independent oracle
 * (`calculateEnvidoPoints`, pure and exported per D-1) recomputes each
 * declarer's points straight from their own dealt hand, and the view's own
 * `points` value must agree exactly — proving `getViewFor` neither drops nor
 * mutates a legitimate declaration on its way through the projection.
 */
describe("getViewFor — a legitimate points declaration keeps its EXACT value through the projection, for every viewer, in every reachable revealed state", () => {
  it("every declaration === 'points' entry's points equals calculateEnvidoPoints(that player's own dealt hand)", () => {
    fc.assert(
      fc.property(fc.oneof(revealedHeadToHeadArb, revealedTeamArb), (state) =>
        state.players.every((viewer) => {
          const view = getViewFor(state, viewer.id);
          const envido = view.hand?.envido;
          if (envido === undefined || envido.status !== "revealed") return false; // generator always reveals -- a non-revealed view here is the bug
          return envido.declarations.every((entry) => {
            if (entry.declaration !== "points") return true; // covered by the redaction property above
            const declarer = state.players.find((player) => player.seat === entry.seat)!;
            return entry.points === calculateEnvidoPoints(declarer.hand);
          });
        }),
      ),
    );
  });
});

/**
 * Spec: "Call Log and Trick Plays Are Public" — the "Any viewer" scenario.
 * Every sibling public/redacted field already has its own cross-viewer fence
 * (señas, hand cards, envido declarations); this closes the one gap the
 * verify phase found. Today `getViewFor` hands every viewer the same values
 * with no per-viewer branch, so this can only fail if someone introduces
 * one — which is exactly the regression it exists to catch.
 */
describe("getViewFor — call log and trick plays are identical across every player's view (spec: 'Any viewer')", () => {
  it("all four 2v2 viewers see the same callEvents and resolvedTrickPlays after a call chain and a resolved trick", () => {
    const seatOrder: readonly [PlayerId, PlayerId, PlayerId, PlayerId] = [playerA, playerB, playerC, playerD];
    const base = createTeamMatch({ seatOrder, pointsToWin: 15, dealerSeat: 3 }); // manoSeat 0 -> playerA
    let state = startHand(base, [
      [{ suit: "espada", rank: 1 }, { suit: "espada", rank: 2 }, { suit: "espada", rank: 3 }],
      [{ suit: "basto", rank: 1 }, { suit: "basto", rank: 2 }, { suit: "basto", rank: 3 }],
      [{ suit: "oro", rank: 1 }, { suit: "oro", rank: 2 }, { suit: "oro", rank: 3 }],
      [{ suit: "copa", rank: 1 }, { suit: "copa", rank: 2 }, { suit: "copa", rank: 3 }],
    ]);
    state = apply(state, { type: "call-envido", playerId: playerA, level: "envido" });
    state = apply(state, { type: "respond-envido", playerId: playerB, response: "quiero" });
    state = apply(state, { type: "reveal-envido", playerId: playerA });
    state = apply(state, { type: "play-card", playerId: playerA, card: { suit: "espada", rank: 1 } });
    state = apply(state, { type: "play-card", playerId: playerB, card: { suit: "basto", rank: 1 } });
    state = apply(state, { type: "play-card", playerId: playerC, card: { suit: "oro", rank: 1 } });
    state = apply(state, { type: "play-card", playerId: playerD, card: { suit: "copa", rank: 1 } });

    const views = seatOrder.map((playerId) => getViewFor(state, playerId));

    expect(views[0]!.hand?.callEvents).toHaveLength(3); // sanity: the log really has content to compare
    expect(views[0]!.hand?.resolvedTrickPlays).toHaveLength(1); // sanity: one trick really resolved
    for (const view of views.slice(1)) {
      expect(view.hand?.callEvents).toEqual(views[0]!.hand?.callEvents);
      expect(view.hand?.resolvedTrickPlays).toEqual(views[0]!.hand?.resolvedTrickPlays);
    }
  });
});
