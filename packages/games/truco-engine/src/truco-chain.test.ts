import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Card } from "./card.js";
import { buildDeck } from "./deck.js";
import type { PlayerId } from "./ids.js";
import { createHeadToHeadMatch, createTeamMatch, getMatchWinner, rotateDealer, startHand } from "./match.js";
import type { MatchState, TrucoCallLevel } from "./match.js";
import { applyAction, getLegalActions } from "./truco-chain.js";
import type { Action, TrucoAction } from "./truco-chain.js";

const playerA = "player-a" as PlayerId;
const playerB = "player-b" as PlayerId;
const playerC = "player-c" as PlayerId;
const playerD = "player-d" as PlayerId;

function freshHand(): MatchState {
  // dealerSeat 1 makes playerA the MANO, and every chain in this file opens
  // with playerA. Opening a call — truco or envido — is taking the floor, and
  // the floor starts with the mano (see `getLegalTrucoActions` and
  // `canOpenEnvido`). The default of 0 had every fixture here opening out of
  // turn, which only ever worked because the rule did not exist yet.
  //
  // The hands are EMPTY on purpose, which is what keeps the exhaustive
  // `toEqual` assertions below readable: the mano holds the turn, so a real
  // hand would add three play-card actions to every one of them.
  const state = createHeadToHeadMatch({ playerAId: playerA, playerBId: playerB, pointsToWin: 15, dealerSeat: 1 });
  return startHand(state, [[], []]);
}

function apply(state: MatchState, action: TrucoAction): MatchState {
  const result = applyAction(state, action);
  if (!result.ok) {
    throw new Error(`expected legal action, got violation: ${result.violation}`);
  }
  return result.state;
}

/** Escalates truco/retruco/valeCuatro strictly (alternating callers, each
 * accepted) up to and including calling `level`, leaving it pending. Shared
 * by every test below that needs a specific level pending or accepted. */
function pendingAt(level: TrucoCallLevel): MatchState {
  let state = apply(freshHand(), { type: "call-truco", playerId: playerA, level: "truco" });
  if (level === "truco") return state;
  state = apply(state, { type: "respond-truco", playerId: playerB, response: "quiero" });
  state = apply(state, { type: "call-truco", playerId: playerB, level: "retruco" });
  if (level === "retruco") return state;
  state = apply(state, { type: "respond-truco", playerId: playerA, response: "quiero" });
  return apply(state, { type: "call-truco", playerId: playerA, level: "valeCuatro" });
}

describe("getLegalActions — truco call chain", () => {
  it("at the start of a hand ONLY the mano may speak — both calls are hers, and the pie has none", () => {
    // playerB is the mano — `dealerSeat` defaults to 0 and mano is the seat
    // after the dealer. Truco is not turn-gated in this engine; opening an
    // envido is taking the floor, and the floor starts with the mano. See
    // envido-chain.test.ts for that rule's own coverage.
    const state = freshHand();

    expect(getLegalActions(state, playerA)).toEqual([
      { type: "call-truco", playerId: playerA, level: "truco" },
      { type: "call-envido", playerId: playerA, level: "envido" },
    ]);
    expect(getLegalActions(state, playerB), "the pie has nothing to say until the floor reaches them").toEqual([]);
  });

  it("while a truco is pending the callers have NOTHING to say — the floor, including the envido, is the answering team's", () => {
    const state = pendingAt("truco");

    // The caller used to keep `call-envido` here, and it was wrong: putting an
    // envido on top of a truco is a way of REPLYING to that truco ("el envido
    // está primero"), so it belongs to whoever owes the reply. Reported from
    // real play as one seat calling truco and then, with nobody having
    // answered, calling the envido on its own call.
    expect(getLegalActions(state, playerA), "they already spoke; the turn to speak is the other team's").toEqual([]);
    expect(getLegalActions(state, playerB)).toEqual([
      { type: "respond-truco", playerId: playerB, response: "quiero" },
      { type: "respond-truco", playerId: playerB, response: "no-quiero" },
      { type: "call-envido", playerId: playerB, level: "envido" },
    ]);
  });

  it("only the accepting team may escalate truco after quiero (envido may still interrupt it)", () => {
    const accepted = apply(pendingAt("truco"), { type: "respond-truco", playerId: playerB, response: "quiero" });

    // playerA holds the floor (mano, nobody has played) so the envido is
    // still theirs to open, but the truco chain is not: they called it.
    // playerB may escalate — that is answering, not opening, so the turn does
    // not gate it — but may NOT open an envido out of turn.
    expect(getLegalActions(accepted, playerA)).toEqual([{ type: "call-envido", playerId: playerA, level: "envido" }]);
    expect(getLegalActions(accepted, playerB)).toEqual([
      { type: "call-truco", playerId: playerB, level: "retruco" },
    ]);
  });

  it("vale cuatro accepted has no further truco escalation for either team, but envido may still open (first trick, no card played yet)", () => {
    const accepted = apply(pendingAt("valeCuatro"), {
      type: "respond-truco",
      playerId: playerB,
      response: "quiero",
    });

    expect(getLegalActions(accepted, playerA), "the truco ceiling is reached, but the floor is still theirs").toEqual([
      { type: "call-envido", playerId: playerA, level: "envido" },
    ]);
    expect(getLegalActions(accepted, playerB), "nothing left to escalate, and not their turn to open").toEqual([]);
  });

  it("no truco action is legal after a decline", () => {
    const declined = apply(pendingAt("truco"), { type: "respond-truco", playerId: playerB, response: "no-quiero" });

    expect(getLegalActions(declined, playerA)).toEqual([]);
    expect(getLegalActions(declined, playerB)).toEqual([]);
  });

  it("a fresh hand after a decline offers only a fresh truco call (plus envido), no leftover escalation", () => {
    const declined = apply(pendingAt("truco"), { type: "respond-truco", playerId: playerB, response: "no-quiero" });
    const handTwo = startHand(declined, [[], []]);

    // `startHand` does not rotate the dealer (that is `rotateDealer`'s job),
    // so playerB is still the mano in this second hand.
    expect(getLegalActions(handTwo, playerA)).toEqual([
      { type: "call-truco", playerId: playerA, level: "truco" },
      { type: "call-envido", playerId: playerA, level: "envido" },
    ]);
    expect(getLegalActions(handTwo, playerB)).toEqual([]);
  });

  it("returns no actions once the hand has not started", () => {
    const state = createHeadToHeadMatch({ playerAId: playerA, playerBId: playerB, pointsToWin: 15 });

    expect(getLegalActions(state, playerA)).toEqual([]);
  });
});

describe("applyAction — legal escalation sequence (spec: truco-rules)", () => {
  it("truco -> quiero -> retruco is legal and pending on the original caller's team", () => {
    const state = pendingAt("retruco");

    expect(state.hand?.truco).toEqual({ status: "pending", level: "retruco", callingTeamId: state.teams[1]!.id });
    expect(getLegalActions(state, playerA)).toEqual([
      { type: "respond-truco", playerId: playerA, response: "quiero" },
      { type: "respond-truco", playerId: playerA, response: "no-quiero" },
      { type: "call-envido", playerId: playerA, level: "envido" },
    ]);
  });
});

describe("applyAction — decline terminates the hand (spec: truco-rules)", () => {
  it.each([
    ["truco" as const, playerB, 1, 0],
    ["retruco" as const, playerA, 0, 2],
    ["valeCuatro" as const, playerB, 3, 0],
  ])("declining a %s call concedes the previous accepted level's value", (level, decliner, scoreA, scoreB) => {
    const state = apply(pendingAt(level), { type: "respond-truco", playerId: decliner, response: "no-quiero" });

    expect(state.teams[0]!.score).toBe(scoreA);
    expect(state.teams[1]!.score).toBe(scoreB);
    expect(state.hand?.truco.status).toBe("declined");
  });

  it("accepting (quiero) never awards points by itself", () => {
    const state = apply(pendingAt("truco"), { type: "respond-truco", playerId: playerB, response: "quiero" });

    expect(state.teams[0]!.score).toBe(0);
    expect(state.teams[1]!.score).toBe(0);
  });
});

describe("applyAction/getLegalActions — match termination (spec: 'Match and Hand Termination')", () => {
  it("a decline that reaches the target ends the match: no further action is legal for either player", () => {
    // dealerSeat 1 -> playerA is mano, which is who calls below.
    const almostWonMatch = createHeadToHeadMatch({ playerAId: playerA, playerBId: playerB, pointsToWin: 15, dealerSeat: 1 });
    const oneCallFromTarget: MatchState = {
      ...almostWonMatch,
      teams: [{ ...almostWonMatch.teams[0]!, score: 14 }, almostWonMatch.teams[1]!],
    };
    const called = apply(startHand(oneCallFromTarget, [[], []]), { type: "call-truco", playerId: playerA, level: "truco" });
    const declined = apply(called, { type: "respond-truco", playerId: playerB, response: "no-quiero" });

    expect(getMatchWinner(declined)).toBe(declined.teams[0]!.id);
    expect(getLegalActions(declined, playerA)).toEqual([]);
    expect(getLegalActions(declined, playerB)).toEqual([]);
  });

  it("a decline that does not reach the target leaves the match open for a fresh, mano-rotated hand", () => {
    const declined = apply(pendingAt("truco"), { type: "respond-truco", playerId: playerB, response: "no-quiero" });
    expect(getMatchWinner(declined)).toBeNull();

    const nextHand = startHand(rotateDealer(declined), [[], []]);

    expect(nextHand.hand?.manoSeat).not.toBe(declined.hand?.manoSeat);
    // Asked of the NEW mano rather than of playerA, and the difference is the
    // point of the rotation: the floor moved with it. playerA opened the last
    // hand; this one opens with playerB, who now has calls to make while
    // playerA waits their turn to speak.
    expect(nextHand.hand?.manoSeat).toBe(1);
    expect(getLegalActions(nextHand, playerB).length, "a fresh hand really is open — for whoever now holds the floor").toBeGreaterThan(0);
  });
});

describe("applyAction — illegal actions are rejected, not silently ignored", () => {
  it("rejects escalating straight to retruco without an existing call", () => {
    const result = applyAction(freshHand(), { type: "call-truco", playerId: playerA, level: "retruco" });

    expect(result.ok).toBe(false);
  });

  it("rejects the calling team responding to its own call", () => {
    const result = applyAction(pendingAt("truco"), { type: "respond-truco", playerId: playerA, response: "quiero" });

    expect(result.ok).toBe(false);
  });

  it("rejects an action from an unknown player", () => {
    const result = applyAction(freshHand(), {
      type: "call-truco",
      playerId: "ghost" as PlayerId,
      level: "truco",
    });

    expect(result.ok).toBe(false);
  });

  it("does not mutate the input state", () => {
    const state = freshHand();
    const before = JSON.stringify(state);

    applyAction(state, { type: "call-truco", playerId: playerA, level: "truco" });

    expect(JSON.stringify(state)).toBe(before);
  });
});

describe("applyAction — full purity property over the combined truco+envido action space (spec: 'applyAction is pure')", () => {
  it("for any reachable state and any of its legal actions, applying twice yields equal results and never mutates the input", () => {
    const dealArb = fc.shuffledSubarray(buildDeck() as Card[], { minLength: 6, maxLength: 6 });
    const walkArb = fc.array(fc.nat({ max: 9 }), { maxLength: 15 });

    fc.assert(
      fc.property(dealArb, walkArb, fc.nat({ max: 9 }), (cards, walk, finalStep) => {
        const fresh = createHeadToHeadMatch({ playerAId: playerA, playerBId: playerB, pointsToWin: 15 });
        let state = startHand(fresh, [cards.slice(0, 3), cards.slice(3, 6)]);
        for (const step of walk) {
          const legal = [...getLegalActions(state, playerA), ...getLegalActions(state, playerB)];
          if (legal.length === 0) break;
          const result = applyAction(state, legal[step % legal.length]!);
          if (result.ok) state = result.state;
        }

        const legal: readonly Action[] = [...getLegalActions(state, playerA), ...getLegalActions(state, playerB)];
        if (legal.length === 0) return true; // match/hand already terminal — nothing left to apply

        const action = legal[finalStep % legal.length]!;
        const before = JSON.stringify(state);
        const first = applyAction(state, action);
        const second = applyAction(state, action);

        return JSON.stringify(state) === before && JSON.stringify(first) === JSON.stringify(second);
      }),
    );
  });
});

describe("declining a truco ends the hand", () => {
  it("marks the hand decided in favour of the calling team, so the next hand can be dealt", () => {
    // A no-quiero ends the hand — that is the whole point of declining. The
    // engine awarded the points but left `hand.outcome` untouched, so
    // `truco-module`'s re-deal gate (`state.hand.outcome.decided`) never
    // opened and the match stalled with nobody able to act. Found while
    // wiring the end-of-hand UI, never triggered live only because the easy
    // bot always accepts.
    const state = pendingAt("truco");
    const caller = state.players.find((p) => p.id === playerA)!;

    const result = applyAction(state, { type: "respond-truco", playerId: playerB, response: "no-quiero" });

    expect(result.ok).toBe(true);
    const hand = result.ok ? result.state.hand! : null;
    expect(hand!.outcome).toEqual({ decided: true, winnerTeamId: caller.teamId });
  });
});

/**
 * 2v2 truco calls (spec prompt: "any player may call for their team; the
 * response comes from the opposing team. Decide and justify who may answer
 * when both opponents could."). DESIGN DECISION: `getLegalTrucoActions`
 * already gates purely on `player.teamId === truco.callingTeamId` (never on
 * a specific player), so BOTH members of the opposing team are simultaneously
 * offered `respond-truco`, and whichever one actually acts first settles it
 * for the whole team — the same "first mover for the team" shape the truco
 * chain already used for calling. This is the real-table behavior (a team's
 * response is a team decision; either partner may voice it) and requires NO
 * engine change: this test is a characterization/approval test proving the
 * existing team-scoped legality check already generalizes correctly to two
 * players per team, rather than accidentally only working for one.
 */
/**
 * Completeness proof for the call log (design §3: "Append-site completeness
 * is proved by behaviour, not by structure"; risk table: "A future append
 * site is added without a `CallEvent`"). This does NOT test new behavior —
 * every append site already exists from the prior commit. It fences a
 * REGRESSION: if a future call/response/reveal action's append site is ever
 * forgotten, `callEvents.length` falls behind the count of actions actually
 * applied, and this property catches it — the failure names which count
 * diverged, pointing at the missing site, not at this test.
 */
describe("callEvents — property: no append site is missing (design §3, T-6)", () => {
  it("callEvents.length equals the number of call/response/reveal actions successfully applied along a random legal walk", () => {
    const dealArb = fc.shuffledSubarray(buildDeck() as Card[], { minLength: 6, maxLength: 6 });
    const walkArb = fc.array(fc.nat({ max: 9 }), { maxLength: 20 });
    const isCallEventAction = (action: Action): boolean =>
      action.type === "call-truco" ||
      action.type === "respond-truco" ||
      action.type === "call-envido" ||
      action.type === "respond-envido" ||
      action.type === "declare-envido";

    fc.assert(
      fc.property(dealArb, walkArb, (cards, walk) => {
        const fresh = createHeadToHeadMatch({ playerAId: playerA, playerBId: playerB, pointsToWin: 15 });
        let state = startHand(fresh, [cards.slice(0, 3), cards.slice(3, 6)]);
        let appliedCallActionCount = 0;
        for (const step of walk) {
          const legal = [...getLegalActions(state, playerA), ...getLegalActions(state, playerB)];
          if (legal.length === 0) break;
          const action = legal[step % legal.length]!;
          const result = applyAction(state, action);
          if (!result.ok) continue;
          state = result.state;
          if (isCallEventAction(action)) appliedCallActionCount += 1;
        }
        return state.hand?.callEvents.length === appliedCallActionCount;
      }),
    );
  });
});

describe("2v2 — either member of the opposing team may respond to a truco call", () => {
  function freshTeamHand(): MatchState {
    // dealerSeat 3 -> playerA (seat 0) is mano, which is who calls in every
    // case below. Opening is taking the floor, and the floor starts there.
    const state = createTeamMatch({ seatOrder: [playerA, playerB, playerC, playerD], pointsToWin: 15, dealerSeat: 3 });
    return startHand(state, [[], [], [], []]);
  }

  it("both opposing players see respond-truco as legal, and the calling team's OWN teammate cannot respond", () => {
    const called = apply(freshTeamHand(), { type: "call-truco", playerId: playerA, level: "truco" });

    // team A = playerA + playerC (the callers); team B = playerB + playerD (opponents).
    expect(getLegalActions(called, playerB)).toContainEqual({ type: "respond-truco", playerId: playerB, response: "quiero" });
    expect(getLegalActions(called, playerD)).toContainEqual({ type: "respond-truco", playerId: playerD, response: "quiero" });
    // playerC is on the CALLING team — may not also respond to their own team's call.
    expect(getLegalActions(called, playerC).some((a) => a.type === "respond-truco")).toBe(false);
  });

  it("either opponent's response settles it for the whole team — the teammate who did NOT respond is bound by it", () => {
    const called = apply(freshTeamHand(), { type: "call-truco", playerId: playerA, level: "truco" });
    // playerD (not playerB) responds — the team B teammate who spoke.
    const accepted = apply(called, { type: "respond-truco", playerId: playerD, response: "quiero" });

    expect(accepted.hand?.truco).toMatchObject({ status: "accepted" });
    // The call is settled for the WHOLE hand — playerB (who never acted) has no
    // outstanding respond-truco left, and cannot call retruco either — only
    // the team that just accepted (team B, spec: "only the team that most
    // recently accepted may escalate") may do so, via EITHER of its members.
    expect(getLegalActions(accepted, playerB).some((a) => a.type === "respond-truco")).toBe(false);
    expect(getLegalActions(accepted, playerA).some((a) => a.type === "call-truco")).toBe(false); // calling team may not escalate its own accepted call
    expect(getLegalActions(accepted, playerB)).toContainEqual({ type: "call-truco", playerId: playerB, level: "retruco" });
  });
});

/**
 * OPENING A TRUCO FOLLOWS THE TURN TO SPEAK; ESCALATING DOES NOT.
 *
 * The same split `canOpenEnvido` draws, for the same reason. Taking the floor
 * belongs to whoever holds it — the mano first, then each seat as the play
 * order reaches it. Escalating is answering a call that is already on the
 * table, and an unanswered call FREEZES `turnSeat`, so gating a reply on the
 * turn would refuse the very move the chain exists to allow.
 *
 * Reported from real 2v2 play against bots: "en lugar de cantarlo la mano, lo
 * canta el compañero sin que sea su turno".
 */
describe("who may open a truco", () => {
  function dealt2v2(dealerSeat: number): MatchState {
    const state = createTeamMatch({ seatOrder: [playerA, playerB, playerC, playerD], pointsToWin: 15, dealerSeat });
    return startHand(state, [
      [{ suit: "espada", rank: 1 }, { suit: "basto", rank: 4 }, { suit: "espada", rank: 3 }],
      [{ suit: "basto", rank: 5 }, { suit: "oro", rank: 1 }, { suit: "basto", rank: 6 }],
      [{ suit: "oro", rank: 4 }, { suit: "copa", rank: 4 }, { suit: "basto", rank: 4 }],
      [{ suit: "copa", rank: 5 }, { suit: "basto", rank: 3 }, { suit: "copa", rank: 6 }],
    ]);
  }

  const mayOpen = (state: MatchState, playerId: PlayerId): boolean =>
    getLegalActions(state, playerId).some((action) => action.type === "call-truco" && action.level === "truco");

  /** This file's shared `apply` is typed to the truco chain alone, and these
   * cases need a card on the table — the only way the floor ever moves. */
  const play = (state: MatchState, action: Action): MatchState => {
    const result = applyAction(state, action);
    if (!result.ok) throw new Error(`test setup: engine rejected ${action.type} — ${result.violation}`);
    return result.state;
  };

  it("the mano, and nobody else — not even their own partner", () => {
    // dealerSeat 3 puts the mano on seat 0 (playerA). playerC is playerA's
    // partner, and that is the case the report was about: the partner
    // speaking out of turn is still speaking out of turn.
    const hand = dealt2v2(3);

    expect(mayOpen(hand, playerA), "the mano holds the floor").toBe(true);
    for (const waiting of [playerB, playerC, playerD]) {
      expect(mayOpen(hand, waiting), "nobody may jump ahead of a seat that has not spoken").toBe(false);
    }
  });

  it("the floor moves down the play order as each seat plays", () => {
    const hand = dealt2v2(3);
    const played = play(hand, { type: "play-card", playerId: playerA, card: { suit: "espada", rank: 1 } });

    expect(mayOpen(played, playerA), "your card is down; your say is spent").toBe(false);
    expect(mayOpen(played, playerB), "the next seat in order now holds it").toBe(true);
    expect(mayOpen(played, playerC), "and the one after it still does not").toBe(false);
  });

  it("ESCALATING is not turn-gated — an unanswered call freezes the turn, so gating it would refuse the reply", () => {
    // playerA (the mano) opens and playerB accepts. The turn never moved:
    // calls do not advance it. If escalation were gated the same way, playerB
    // could never retruco — which is the whole shape of the chain.
    const accepted = apply(apply(dealt2v2(3), { type: "call-truco", playerId: playerA, level: "truco" }), {
      type: "respond-truco",
      playerId: playerB,
      response: "quiero",
    });

    expect(accepted.hand?.turnSeat, "fence setup: the turn really is still the mano's").toBe(0);
    expect(
      getLegalActions(accepted, playerB).some((action) => action.type === "call-truco" && action.level === "retruco"),
      "the accepting team may escalate from wherever they are sitting",
    ).toBe(true);
  });

  it("RESPONDING is not turn-gated either", () => {
    const called = apply(dealt2v2(3), { type: "call-truco", playerId: playerA, level: "truco" });

    for (const answerer of [playerB, playerD]) {
      expect(
        getLegalActions(called, answerer).some((action) => action.type === "respond-truco"),
        "either member of the answering team may reply, whoever holds the turn",
      ).toBe(true);
    }
  });
});
