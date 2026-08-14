import { describe, expect, it } from "vitest";
import type { Card } from "./card.js";
import type { PlayerId } from "./ids.js";
import { createHeadToHeadMatch, createTeamMatch, startHand } from "./match.js";
import type { MatchState } from "./match.js";
import { applyAction, getLegalActions } from "./truco-chain.js";
import type { Action } from "./truco-chain.js";
import { MAX_SENAS_PER_HAND, SENA_SIGNALS, getSenasRemaining } from "./senas.js";

const playerA = "player-a" as PlayerId;
const playerB = "player-b" as PlayerId;
const playerC = "player-c" as PlayerId;
const playerD = "player-d" as PlayerId;

function apply(state: MatchState, action: Action): MatchState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`expected legal action, got violation: ${result.violation}`);
  return result.state;
}

function freshTeamHand(): MatchState {
  const state = createTeamMatch({ seatOrder: [playerA, playerB, playerC, playerD], pointsToWin: 15 });
  return startHand(state, [[], [], [], []]);
}

/** Like `freshTeamHand`, but with REAL cards dealt, so truco/envido/card-play
 * are genuinely on offer — the only way the "cap gates nothing else" fence
 * below has something other than `send-sena` to lose. */
function dealtTeamHand(): MatchState {
  const state = createTeamMatch({ seatOrder: [playerA, playerB, playerC, playerD], pointsToWin: 15 });
  const deal: readonly (readonly Card[])[] = [
    [{ suit: "espada", rank: 1 }, { suit: "espada", rank: 2 }, { suit: "espada", rank: 3 }],
    [{ suit: "basto", rank: 1 }, { suit: "basto", rank: 2 }, { suit: "basto", rank: 3 }],
    [{ suit: "oro", rank: 1 }, { suit: "oro", rank: 2 }, { suit: "oro", rank: 3 }],
    [{ suit: "copa", rank: 1 }, { suit: "copa", rank: 2 }, { suit: "copa", rank: 3 }],
  ];
  return startHand(state, deal);
}

/** Spends `playerId`'s whole per-hand quota, one legal seña at a time. */
function spendWholeQuota(state: MatchState, playerId: PlayerId): MatchState {
  let spent = state;
  for (let sent = 0; sent < MAX_SENAS_PER_HAND; sent += 1) {
    spent = apply(spent, { type: "send-sena", playerId, signal: "dos" });
  }
  return spent;
}

function freshHeadToHeadHand(): MatchState {
  const state = createHeadToHeadMatch({ playerAId: playerA, playerBId: playerB, pointsToWin: 15 });
  return startHand(state, [[], []]);
}

describe("señas — closed vocabulary (design: model the SIGNAL, not free-form chat)", () => {
  it("the vocabulary is exactly the six canonical top-card signals, nothing else", () => {
    expect([...SENA_SIGNALS].sort()).toEqual(
      ["asDeBasto", "asDeEspada", "dos", "sieteDeEspada", "sieteDeOro", "tres"].sort(),
    );
  });
});

describe("getLegalActions — send-sena is only offered in 2v2 (a player with a teammate)", () => {
  it("is legal for a player whose team has a partner", () => {
    const state = freshTeamHand();
    expect(getLegalActions(state, playerA)).toContainEqual({ type: "send-sena", playerId: playerA, signal: "asDeEspada" });
  });

  it("is NOT offered in a 1v1 match — there is no teammate to signal", () => {
    const state = freshHeadToHeadHand();
    expect(getLegalActions(state, playerA).some((a) => a.type === "send-sena")).toBe(false);
    expect(getLegalActions(state, playerB).some((a) => a.type === "send-sena")).toBe(false);
  });

  it("offers all six signals, for every player (a seña is a CLAIM, not validated against the hand — bluffing is allowed)", () => {
    const state = freshTeamHand();
    const sendActions = getLegalActions(state, playerC).filter((a) => a.type === "send-sena");
    expect(sendActions.map((a) => (a as { signal: string }).signal).sort()).toEqual([...SENA_SIGNALS].sort());
  });
});

describe("applyAction — send-sena records the signal without validating it against the sender's hand", () => {
  it("records the signal for the sending player, even though they hold none of the signaled card", () => {
    const state = freshTeamHand(); // players were dealt empty hands
    const signaled = apply(state, { type: "send-sena", playerId: playerA, signal: "asDeEspada" });

    expect(signaled.hand?.senas).toContainEqual({ playerId: playerA, teamId: signaled.players[0]!.teamId, signal: "asDeEspada", seq: 1 });
  });

  it("a later signal from the same player REPLACES their earlier one, rather than accumulating", () => {
    const first = apply(freshTeamHand(), { type: "send-sena", playerId: playerA, signal: "asDeEspada" });
    const second = apply(first, { type: "send-sena", playerId: playerA, signal: "tres" });

    const mine = second.hand?.senas.filter((s) => s.playerId === playerA);
    expect(mine).toEqual([{ playerId: playerA, teamId: second.players[0]!.teamId, signal: "tres", seq: 2 }]);
  });

  it("re-sending the SAME signal still bumps the ordinal — the only thing that lets a viewer tell 'signaled again' apart from 'nothing happened'", () => {
    const first = apply(freshTeamHand(), { type: "send-sena", playerId: playerA, signal: "asDeEspada" });
    const again = apply(first, { type: "send-sena", playerId: playerA, signal: "asDeEspada" });

    const before = first.hand!.senas.find((s) => s.playerId === playerA)!;
    const after = again.hand!.senas.find((s) => s.playerId === playerA)!;
    expect(after.signal).toBe(before.signal);
    expect(after.seq).toBeGreaterThan(before.seq);
  });

  it("ordinals stay strictly increasing across senders, so a replaced entry never reuses a spent ordinal", () => {
    let state = apply(freshTeamHand(), { type: "send-sena", playerId: playerA, signal: "asDeEspada" });
    state = apply(state, { type: "send-sena", playerId: playerC, signal: "tres" });
    state = apply(state, { type: "send-sena", playerId: playerA, signal: "dos" });

    expect(state.hand!.senas.map((s) => s.seq)).toEqual([2, 3]); // playerC's 2 survives, playerA's 1 was replaced by 3
  });

  it("a fresh hand starts the ordinals over — señas are hand-scoped, exactly like the rest of `HandState`", () => {
    const signaled = apply(freshTeamHand(), { type: "send-sena", playerId: playerA, signal: "dos" });
    const redealt = startHand(signaled, [[], [], [], []]);
    const afterRedeal = apply(redealt, { type: "send-sena", playerId: playerA, signal: "dos" });

    expect(afterRedeal.hand!.senas.map((s) => s.seq)).toEqual([1]);
  });

  it("does not mutate the input state", () => {
    const state = freshTeamHand();
    const before = JSON.stringify(state);
    applyAction(state, { type: "send-sena", playerId: playerA, signal: "dos" });
    expect(JSON.stringify(state)).toBe(before);
  });

  it("rejects send-sena in a 1v1 match even if crafted directly (never trust legality to the client alone)", () => {
    const state = freshHeadToHeadHand();
    const result = applyAction(state, { type: "send-sena", playerId: playerA, signal: "dos" });
    expect(result.ok).toBe(false);
  });
});

/**
 * The per-hand cap (product decision: at a real table abusing señas gets you
 * SEEN by the opponent, a cost the digital table lost entirely — the cap is
 * what puts a price back on the side channel).
 */
describe("señas — at most MAX_SENAS_PER_HAND per PLAYER per hand", () => {
  it("caps a hand at three señas per player — a PRODUCT number (enough to describe three cards, a fourth is abuse), fenced here so moving it is a deliberate act", () => {
    expect(MAX_SENAS_PER_HAND).toBe(3);
  });

  it("counts every SEND, which is not what `senas` records — that array keeps only the latest entry per player, so its length can never be the count", () => {
    let state = apply(freshTeamHand(), { type: "send-sena", playerId: playerA, signal: "dos" });
    state = apply(state, { type: "send-sena", playerId: playerA, signal: "dos" });

    // The trap, asserted from both sides: ONE entry in `senas` (the second
    // send replaced the first), but TWO sends against the quota.
    expect(state.hand!.senas.filter((entry) => entry.playerId === playerA)).toHaveLength(1);
    expect(state.hand!.senasSent).toContainEqual({ playerId: playerA, count: 2 });
  });

  it("is per PLAYER, never per team — a partner burning their own quota leaves yours untouched", () => {
    // playerC is playerA's PARTNER (seats 0 and 2 — createTeamMatch's alternating pattern).
    let state = apply(freshTeamHand(), { type: "send-sena", playerId: playerA, signal: "dos" });
    state = apply(state, { type: "send-sena", playerId: playerC, signal: "tres" });
    state = apply(state, { type: "send-sena", playerId: playerC, signal: "tres" });

    expect(state.hand!.senasSent).toContainEqual({ playerId: playerA, count: 1 });
    expect(state.hand!.senasSent).toContainEqual({ playerId: playerC, count: 2 });
  });

  it("keeps the LAST seña of the quota legal and drops send-sena only once the cap is actually reached", () => {
    let state = freshTeamHand();
    for (let sent = 0; sent < MAX_SENAS_PER_HAND; sent += 1) {
      expect(getLegalActions(state, playerA).some((action) => action.type === "send-sena")).toBe(true);
      state = apply(state, { type: "send-sena", playerId: playerA, signal: "dos" });
    }

    expect(getLegalActions(state, playerA).some((action) => action.type === "send-sena")).toBe(false);
  });

  it("does not narrow WHICH signals are offered on the way to the cap — all six stay on the table (bluffing rule), the cap limits HOW MANY", () => {
    let state = freshTeamHand();
    for (let sent = 0; sent < MAX_SENAS_PER_HAND - 1; sent += 1) {
      state = apply(state, { type: "send-sena", playerId: playerA, signal: "dos" });
    }

    const offered = getLegalActions(state, playerA).filter((action) => action.type === "send-sena");
    expect(offered.map((action) => (action as { signal: string }).signal).sort()).toEqual([...SENA_SIGNALS].sort());
  });

  it("rejects an over-cap send through the SAME legality path everything else uses — a violation, and nothing recorded", () => {
    const state = spendWholeQuota(freshTeamHand(), playerA);

    const result = applyAction(state, { type: "send-sena", playerId: playerA, signal: "tres" });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a violation");
    expect(result.violation).toContain("send-sena");
    // The rejected send left no trace: neither the claim nor the count moved.
    expect(state.hand!.senasSent).toContainEqual({ playerId: playerA, count: MAX_SENAS_PER_HAND });
    expect(state.hand!.senas.find((entry) => entry.playerId === playerA)?.signal).toBe("dos");
  });

  it("takes ONLY send-sena away at the cap — every other action type the player had stays legal", () => {
    const state = dealtTeamHand();
    const before = getLegalActions(state, playerA);
    expect(before.some((action) => action.type !== "send-sena")).toBe(true); // sanity: there is something else that could break

    const after = getLegalActions(spendWholeQuota(state, playerA), playerA);

    // Exact-equality, not a spot check: anything the cap accidentally gated
    // would go missing from this list, and anything it accidentally UNLOCKED
    // would appear in it.
    expect(after).toEqual(before.filter((action) => action.type !== "send-sena"));
  });

  it("resets the quota on a fresh deal — the count is hand-scoped, exactly like the rest of `HandState`", () => {
    const spent = spendWholeQuota(freshTeamHand(), playerA);
    expect(getLegalActions(spent, playerA).some((action) => action.type === "send-sena")).toBe(false);

    const redealt = startHand(spent, [[], [], [], []]);

    expect(redealt.hand!.senasSent).toEqual([]);
    expect(getLegalActions(redealt, playerA).some((action) => action.type === "send-sena")).toBe(true);
  });

  it("reads the FULL cap while no hand is in progress — a match that has not been dealt yet has spent nothing", () => {
    // Not a hypothetical state: `MatchRoom.onJoin` creates the match and
    // broadcasts a view BEFORE the first deal, so this is the very first
    // number every player's señas control is drawn from. Reporting 0 there —
    // "you spent them", to every consumer — would greet a 2v2 table with a
    // control that looks used up before a single card exists.
    const undealt = createTeamMatch({ seatOrder: [playerA, playerB, playerC, playerD], pointsToWin: 15 });
    expect(undealt.hand).toBeNull();

    expect(getSenasRemaining(undealt, playerA)).toBe(MAX_SENAS_PER_HAND);
    // Full, yet not on offer: the quota is arithmetic, never a legality flag.
    // Both halves matter — a "fix" that folded legality in here would satisfy
    // the second expectation by breaking the first.
    expect(getLegalActions(undealt, playerA).some((action) => action.type === "send-sena")).toBe(false);
  });

  it("spends one player's quota without touching anyone else's — the other three can still signal at will", () => {
    const state = spendWholeQuota(freshTeamHand(), playerA);

    for (const other of [playerB, playerC, playerD]) {
      expect(getLegalActions(state, other).some((action) => action.type === "send-sena")).toBe(true);
    }
  });
});
