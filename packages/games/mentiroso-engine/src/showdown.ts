import { getLegalActions } from "./legal-actions.js";
import type { MentirosoAction } from "./legal-actions.js";
import { previousActiveSeat } from "./seating.js";
import type { DieFace, MatchState } from "./state.js";
import { reject } from "./violation.js";
import type { ApplyResult } from "./violation.js";

/**
 * mentiroso-engine's showdown reducers (SDD `mentiroso`, work unit B4/task
 * 2.4): `applyDoubt` resolves a seated player's "doubt" into the showdown
 * phase (mentiroso-rules' own tally, surrender, and loser-attribution
 * requirements), and `resolveShowdown` advances a resolved showdown into the
 * next round (the winner-opens-next requirement). `tallyFace` is the shared
 * exact-match count both `getOutcome` callers and this file's own tests read
 * off directly.
 *
 * Adopts `apply.ts`'s own deferred job (work unit B3/task 2.3's docblock:
 * "doubt is a THIRD action ... work unit 2.4 adopts this file by adding the
 * 'doubt' reducer once its own tally exists") and `seating.ts`'s
 * `previousActiveSeat` (work unit B4, introduced in this same unit).
 */

/** The one action `applyDoubt` accepts — narrowed off `legal-actions.ts`'s
 * own `MentirosoAction` union, mirroring `apply.ts`'s own `RaiseAction`. */
type DoubtAction = Extract<MentirosoAction, { readonly type: "doubt" }>;

/**
 * How many dice on the WHOLE table show `face`, counted EXACTLY
 * (mentiroso-rules: "a die showing one is never wild and never substitutes
 * for another face"). A die reading 1 is compared like any other face —
 * there is no branch here that treats it specially, which is the point: the
 * absence of a wildcard case IS the fence, not a check bolted on top of one.
 *
 * Sums across every seat, live or eliminated — an eliminated seat's empty
 * `dice` array contributes zero with no separate filter, the identical
 * derive-from-the-one-field discipline `bids.ts`'s own `totalDice` already
 * applies to the same field.
 */
export function tallyFace(state: MatchState, face: DieFace): number {
  return state.players.reduce((count, player) => count + player.dice.filter((die) => die === face).length, 0);
}

/**
 * True iff `action` is one `getLegalActions` would actually offer this seat
 * right now — the identical reuse discipline `apply.ts`'s own `isLegalRaise`
 * already documents: two independently-written gates can drift apart, and
 * reusing the one that already exists cannot.
 */
function isLegalDoubt(state: MatchState, action: DoubtAction): boolean {
  return getLegalActions(state, action.playerId).some((legal) => legal.type === "doubt");
}

/**
 * Resolve one seated player's "doubt" (design's own `showdown.ts` job,
 * mentiroso-rules' showdown requirements) — tally, loser attribution, and
 * the die surrender, all in the SAME transition into the `showdown` phase.
 *
 * `getLegalActions` only ever offers `doubt` when `state.phase.bid` is
 * non-null (the opening of a round has nothing yet to doubt) — `isLegalDoubt`
 * above already gates on exactly that, so `bid!` below is invariant-backed,
 * the same discipline `seating.ts`'s own `nextActiveSeat` documents for its
 * own non-null player lookup.
 *
 * BIDDER ATTRIBUTION: `Phase.bidding` stores `turnSeat` (whoever acts NEXT)
 * and `bid`, never the seat that PLACED that bid (design's own
 * no-stored-derivable-field convention). The bidder's seat is derived HERE,
 * on the state as it stood the instant doubt was called — before the loser's
 * die is surrendered below — via `seating.ts`'s own `previousActiveSeat`.
 * Deriving it any later, from a `players` array that may already have
 * eliminated the doubter, would be unsound (see `state.ts`'s own docblock on
 * `Phase.showdown`'s `winnerSeat` field for why); deriving it now, once, is
 * exactly what this reducer is for.
 *
 * TIES GO TO THE BIDDER: `matched >= bid.quantity` (mentiroso-rules: "gana la
 * apuesta si hay AL MENOS esa cantidad") — the case a naive strict `>` would
 * get backward is matched EXACTLY equal to the bid.
 *
 * `winnerSeat` is stored directly (state.ts's own documented deviation from
 * design's four-field showdown shape) precisely so `resolveShowdown` below
 * never has to re-derive it.
 */
export function applyDoubt(state: MatchState, action: DoubtAction): ApplyResult {
  if (state.phase.kind !== "bidding") {
    return reject("not-bidding", `a doubt can only be applied during the bidding phase, and this match is ${state.phase.kind}`);
  }
  if (!isLegalDoubt(state, action)) {
    return reject("illegal-doubt", `doubt is not a legal action for ${action.playerId} right now`);
  }

  const doubterSeat = state.phase.turnSeat;
  const currentBid = state.phase.bid!;
  const bidderSeat = previousActiveSeat(state.players, doubterSeat);

  const matched = tallyFace(state, currentBid.face);
  const bidderWins = matched >= currentBid.quantity;
  const loserSeat = bidderWins ? doubterSeat : bidderSeat;
  const winnerSeat = bidderWins ? bidderSeat : doubterSeat;

  const players = state.players.map((player) => (player.seat === loserSeat ? { ...player, dice: player.dice.slice(0, -1) } : player));

  return {
    ok: true,
    state: { ...state, players, phase: { kind: "showdown", bid: currentBid, doubterSeat, matched, loserSeat, winnerSeat } },
  };
}

/**
 * Advance a resolved showdown into the next round (mentiroso-rules: "la
 * ronda siguiente la abre el que GANÓ el desafío, no el que perdió el dado").
 *
 * `winnerSeat` reads straight off the persisted `showdown` phase (no
 * re-derivation, see `applyDoubt`'s own docblock and `state.ts`'s
 * `Phase.showdown` docblock for why that would be unsound after a surrender).
 * Touches `phase` only — `players` passes through UNCHANGED, since the die
 * surrender already happened inside `applyDoubt`, the same "one fact belongs
 * to one reducer" split `apply.ts`'s own two reducers already keep.
 *
 * Does NOT check `getOutcome` (`outcome.ts`, this same work unit) — whether
 * the match is actually over is the caller's job, mirroring
 * `generala-module`'s own external `getOutcome` checks after its reducers
 * run, never baked into the reducer itself.
 */
export function resolveShowdown(state: MatchState): ApplyResult {
  if (state.phase.kind !== "showdown") {
    return reject("not-showdown", `a showdown can only resolve out of the showdown phase, and this match is ${state.phase.kind}`);
  }
  return { ok: true, state: { ...state, phase: { kind: "awaiting-roll", openerSeat: state.phase.winnerSeat } } };
}
