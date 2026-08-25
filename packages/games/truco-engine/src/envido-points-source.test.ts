import { describe, expect, it } from "vitest";
import type { PlayerId } from "./ids.js";
import { createHeadToHeadMatch, createTeamMatch, startHand } from "./match.js";
import type { MatchState } from "./match.js";
import { applyAction, getLegalActions } from "./truco-chain.js";
import type { Action } from "./truco-chain.js";

/**
 * THE ENVIDO IS WORTH WHAT YOU WERE DEALT, not what you are still holding.
 *
 * WHAT WAS BROKEN. `card-play.ts` removes a played card from `player.hand`
 * -- correct, that is what a hand IS for the trick game -- and the envido
 * read its points straight off that same shrinking array. So any envido
 * opened after a card was down scored the REMAINDER. A player dealt
 * espada 7 + espada 6 + oro 3 is worth 33; play the espada 7 first and the
 * engine called it 6, because two espadas had become one.
 *
 * Silent, and wrong in the direction nobody checks: it never throws, never
 * refuses a move, and produces a number that is perfectly plausible on its
 * own. It only shows up if you know what the player was dealt.
 *
 * WHY IT SURFACED NOW. It was always reachable -- in 1v1 the mano could
 * always play and then be envido'd -- but the pie rule
 * (envido-opener.test.ts) makes it the NORMAL case rather than the corner
 * one: a pie is the last seat of its team, so in 2v2 an envido is opened
 * with two cards already on the table, every single time. The bug went from
 * rare to universal, which is how it was found.
 *
 * WHY currentTrickPlays IS ENOUGH to put the cards back. The envido is legal
 * only while the FIRST trick is unresolved, and the declaration round freezes
 * the cards while it runs, so every card this player has put down is still in
 * `hand.currentTrickPlays` -- nothing has been swept into a TrickOutcome yet
 * (which keeps only a winner, not the cards). No new state, and so no new
 * redaction surface: `getViewFor` already decides who may see a hand, and
 * played cards are face up on the table by definition.
 */

const A = "pts-a" as PlayerId;
const B = "pts-b" as PlayerId;
const C = "pts-c" as PlayerId;
const D = "pts-d" as PlayerId;

/** espada 7 + espada 6 = 33. Playing the 7 first leaves a 6 behind. */
const THIRTY_THREE = [{ suit: "espada", rank: 7 }, { suit: "espada", rank: 6 }, { suit: "oro", rank: 3 }] as const;
const WEAK = [{ suit: "basto", rank: 5 }, { suit: "copa", rank: 10 }, { suit: "oro", rank: 2 }] as const;
const FOUR = [{ suit: "oro", rank: 4 }, { suit: "basto", rank: 4 }, { suit: "copa", rank: 4 }] as const;
const TWENTY_SEVEN = [{ suit: "basto", rank: 3 }, { suit: "basto", rank: 4 }, { suit: "oro", rank: 1 }] as const;

function apply(state: MatchState, action: Action): MatchState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`expected legal action, got violation: ${result.violation}`);
  return result.state;
}

/** Every seat ahead of `playerId` plays instead of speaking, then they open. */
function openEnvidoAs(state: MatchState, playerId: PlayerId): MatchState {
  let current = state;
  for (let guard = 0; guard <= state.players.length; guard += 1) {
    if (getLegalActions(current, playerId).some((action) => action.type === "call-envido")) {
      return apply(current, { type: "call-envido", playerId, level: "envido" });
    }
    const onTheClock = current.players.find((player) => player.seat === current.hand?.turnSeat);
    const card = onTheClock === undefined ? undefined : getLegalActions(current, onTheClock.id).find((action) => action.type === "play-card");
    if (card === undefined) break;
    current = apply(current, card);
  }
  throw new Error(`the floor never reached ${playerId} with an envido to open`);
}

function declareAll(state: MatchState): MatchState {
  let next = state;
  for (let i = 0; i < state.players.length; i += 1) {
    const seat = (next.hand!.manoSeat + i) % next.players.length;
    const who = next.players.find((player) => player.seat === seat)!;
    if (!getLegalActions(next, who.id).some((action) => action.type === "declare-envido")) break;
    next = apply(next, { type: "declare-envido", playerId: who.id, declaration: "points" });
  }
  return next;
}

const pointsOf = (state: MatchState, playerId: PlayerId): number | undefined => {
  const envido = state.hand?.envido;
  if (envido?.status !== "revealed") throw new Error("the envido never revealed");
  const entry = envido.declarations.find((declaration) => declaration.playerId === playerId);
  return entry !== undefined && entry.declaration === "points" ? entry.points : undefined;
};

describe("a card already played still counts toward the envido", () => {
  it("1v1: the mano plays their espada 7 and is still worth 33", () => {
    const dealt = startHand(createHeadToHeadMatch({ playerAId: A, playerBId: B, pointsToWin: 30, dealerSeat: 1 }), [THIRTY_THREE, WEAK]);
    // dealerSeat 1 makes A the mano; A plays the higher of the two espadas.
    const played = apply(dealt, { type: "play-card", playerId: A, card: { suit: "espada", rank: 7 } });
    const accepted = apply(apply(played, { type: "call-envido", playerId: B, level: "envido" }), { type: "respond-envido", playerId: A, response: "quiero" });

    expect(pointsOf(declareAll(accepted), A), "33 was dealt; only 6 is still in hand").toBe(33);
  });

  it("2v2: every seat that already played still declares what it was dealt", () => {
    // dealerSeat 3 seats the mano at 0, so the pies are seats 2 and 3 and two
    // cards are necessarily down before playerC can open.
    const dealt = startHand(createTeamMatch({ seatOrder: [A, B, C, D], pointsToWin: 30, dealerSeat: 3 }), [THIRTY_THREE, WEAK, FOUR, TWENTY_SEVEN]);
    const accepted = apply(openEnvidoAs(dealt, C), { type: "respond-envido", playerId: B, response: "quiero" });
    const revealed = declareAll(accepted);

    expect(pointsOf(revealed, A), "seat 0 played first and was dealt 33").toBe(33);
    expect(pointsOf(revealed, D), "seat 3 never played and was dealt 27").toBe(27);
  });

  it("2v2: and the hand is awarded on those dealt values", () => {
    const dealt = startHand(createTeamMatch({ seatOrder: [A, B, C, D], pointsToWin: 30, dealerSeat: 3 }), [THIRTY_THREE, WEAK, FOUR, TWENTY_SEVEN]);
    const accepted = apply(openEnvidoAs(dealt, C), { type: "respond-envido", playerId: B, response: "quiero" });
    const revealed = declareAll(accepted);

    const teamA = revealed.teams.find((team) => team.playerIds.includes(A))!;
    // A's 33 beats D's 27 -- but only if A's two espadas are both counted.
    expect(revealed.hand?.envido).toMatchObject({ status: "revealed", winningTeamId: teamA.id });
  });
});
