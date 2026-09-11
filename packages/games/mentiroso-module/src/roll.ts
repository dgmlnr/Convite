import { DIE_FACES, getOutcome } from "@hexdev/mentiroso-engine";
import type { DieFace, MatchState } from "@hexdev/mentiroso-engine";
import type { PlayerId, RandomSource } from "@hexdev/platform-contract";

/**
 * mentiroso-module's own entropy door (SDD `mentiroso`, work unit C1/task
 * 3.1, design D3): `requestMentirosoSystemAction` is the ONLY place a random
 * draw enters this game, for either of the two DRAW shapes the ruleset
 * needs (a third, entropy-free shape resolves the showdown — see this
 * docblock's own "THREE SHAPES" section below). The
 * engine (`mentiroso-engine`, L0) never calls `rng` at all — every reducer it
 * exports (`applyOpeningDrawRoll`, `applyRaise`, `applyDoubt`,
 * `resolveShowdown`) is pinned pure, taking already-materialized data and
 * returning `ApplyResult`, never a `RandomSource` parameter.
 *
 * THE MOULD IS `truco-module/src/deal.ts`, NOT `generala-module/src/roll.ts`
 * — this is `sdd/mentiroso/design`'s own D4 and it is worth restating here,
 * where the confusion would actually bite: Generala's own `roll.ts` declares
 * "GENERALA REDACTS NOTHING" (every seat's dice are public), so its system
 * action can hand a bare `RollDiceAction` straight to the transport with
 * nothing to hide. Mentiroso needs PRIVATE per-seat dice, and dealing N
 * private hands from one system action is exactly what `truco-module`'s own
 * `createSystemActionRequester` already solves for cards — one action
 * materializes every seat's hidden values at once, and `mentiroso-engine`'s
 * own `view.ts` (work unit B5) is what later redacts them per seat, never
 * this file.
 *
 * WHAT *IS* COPIED FROM `generala-module/src/roll.ts`, DELIBERATELY, is the
 * STRAIGHT-LINE `for` loop that spends the entropy budget: "the number of
 * draws is the loop bound and the loop bound is read off the state" (that
 * file's own docblock). A `while`, a filter, or a retry would make the count
 * an ARGUMENT instead of a FACT, and for a dice game that count is the whole
 * integrity claim (`convite/mentiroso/reglas-decididas`'s own engineering
 * note on the opening draw). Both loops below are bounded this way.
 *
 * THREE SHAPES now (design D3's own data-flow table, plus task 3.5's own
 * showdown-resolution shape, added after work unit C3 discovered nothing in
 * this whole chain ever drove `showdown` back out again):
 *
 *   - `opening-draw`: exactly `contenders.length` draws, one face per seat
 *     STILL TIED at this point — never per total seat, which only coincides
 *     with `contenders.length` on the very FIRST draw of a fresh match and
 *     diverges the moment a tie re-enters this phase with a narrowed
 *     subset (`mentiroso-engine`'s own `applyOpeningDrawRoll`, work unit B3).
 *   - `awaiting-roll`: exactly one draw per die every seat CURRENTLY holds,
 *     summed across the whole table (`totalDice(state)` in `bids.ts`, though
 *     this file never calls that helper directly — the per-seat loop below
 *     derives the identical total by construction, one seat at a time). An
 *     eliminated seat holds zero dice and is asked for zero draws, and it
 *     stays in `diceBySeat` at its own index with an EMPTY array — never
 *     omitted from the list, the same "seats never shrink" invariant
 *     `state.ts`'s own `Player` docblock already states for `players`.
 *   - `showdown`: exactly ZERO draws (task 3.5) — `applyDoubt`
 *     (`mentiroso-engine/src/showdown.ts`) already decided the whole outcome
 *     the instant it transitioned into this phase; `resolveShowdown` (the
 *     same file) only reads that decision back out. The zero-entropy count
 *     is still DERIVABLE FROM STATE, the same claim the two draw shapes make
 *     — it is just always zero for this one, never a variable count.
 *
 * THIS FILE'S OWN VERSION OF THE TRAP `AGENTS.md` NAMES ("fixtures donde las
 * lecturas discrepen"): a fixture where every seat holds the SAME number of
 * dice, or where the total across the table happens to equal the seat count,
 * cannot tell "one draw per seat" from "one draw per die" apart — both wrong
 * and right implementations would spend the identical budget. `roll.test.ts`
 * deliberately gives seats ASYMMETRIC dice counts (2, 4, 0, 1 — summing to 7
 * against 4 seats) so the two readings diverge, exactly the discipline this
 * whole chain has followed since work unit A2.
 *
 * THE TWO DRAW SHAPES APPLY NOTHING; THE SHOWDOWN SHAPE STILL APPLIES
 * NOTHING EITHER — this function only materializes DATA, the same split
 * `truco-module/src/deal.ts`'s own `createSystemActionRequester` already
 * draws between "the system decided what to deal" and "the module's
 * `applyAction` decided whether that deal may be applied right now".
 * `mentiroso-module/src/index.ts`'s own `applyAction` (work unit C3, plus
 * task 3.5's own new branch) is where `action.playerId !== SYSTEM_ACTOR_ID`
 * is refused for all three shapes, and where the showdown-resolve shape is
 * finally interpreted, by adopting `resolveShowdown` — `deal.ts`'s own
 * docblock records the exact cost of forgetting the actor check once, for a
 * different game, and it is named here so the same gap is not reopened for
 * this one.
 *
 * WHY THE FIX LIVES HERE AND NOT INSIDE `applyAction`'s OWN "doubt" BRANCH
 * (task 3.5, design D6): `MatchRoom.runAdvanceOnce` pauses for
 * `systemActionPauseMs` BEFORE it applies whatever system action it just
 * requested — never after. Design D6 calls that pause "the showdown-reading
 * window": the tally has to sit on screen for it. If `applyAction`'s own
 * "doubt" branch called `resolveShowdown` in the SAME reducer call, the match
 * would jump straight from `bidding` to the NEXT round's `awaiting-roll`
 * with no pause and no visible `showdown` state in between — a player would
 * never see why they lost a die. Answering `showdown` with its OWN system
 * action here means the driving loop's pause happens BEFORE this
 * resolution runs, exactly once, exactly where design D6 puts it.
 */

/**
 * The author of every draw, and an id no seat can ever hold — the identical
 * sentinel shape `truco-module`/`generala-module`/`escoba-module`/
 * `mahjong-solitaire-module` already each declare for their own system
 * actions. It is a SENTINEL, not a guarantee on its own: refusing a
 * client-forged draw under this id is `applyAction`'s job (not yet built,
 * work unit C3), not this constant's.
 */
export const SYSTEM_ACTOR_ID = "__system__" as PlayerId;

/**
 * The materialized opening-draw system action (design D3, mentiroso-hidden-
 * dice's own "re-roll tied seats" requirement) — one already-drawn face per
 * CURRENT contender, in the SAME order as `state.phase.contenders`,
 * index-aligned exactly the way `mentiroso-engine/src/apply.ts`'s own
 * `applyOpeningDrawRoll(state, faces)` expects to receive them. That reducer
 * is what a future `applyAction` calls to interpret this action; this shape
 * carries nothing that reducer does not already need.
 */
export interface OpeningDrawRollAction {
  readonly type: "opening-draw-roll";
  readonly playerId: PlayerId;
  readonly faces: readonly DieFace[];
}

/**
 * The materialized per-round dice roll (design D3's own "awaiting-roll:
 * exactly totalDice(state) rng() calls"): every seat's freshly drawn dice,
 * ONE ARRAY PER SEAT, index-aligned with `Player.seat` exactly like
 * `state.ts`'s own `MatchState.players` already is — never keyed by seat
 * number directly, so a consumer reads `diceBySeat[seat]`, not a lookup.
 *
 * A seat holding zero dice draws zero faces and still owns an entry here —
 * `diceBySeat[seat]` is `[]`, never a missing index — the module-layer
 * mirror of `state.ts`'s own "seats never shrink" invariant.
 */
export interface RoundRollAction {
  readonly type: "round-roll";
  readonly playerId: PlayerId;
  readonly diceBySeat: readonly (readonly DieFace[])[];
}

/**
 * The materialized showdown resolution (task 3.5, design D6) — carries no
 * entropy-derived payload at all, unlike the two draw shapes above, because
 * `resolveShowdown` (`mentiroso-engine/src/showdown.ts`) needs none: the
 * outcome was already decided the instant `applyDoubt` transitioned into
 * `showdown`. This action exists purely so the showdown's resolution is a
 * SEPARATE, requestable system action `mentiroso-module`'s own `applyAction`
 * can apply on its own later driving-loop tick — see this file's own top
 * docblock for why that separation, not a same-call chain, is the fix.
 */
export interface ShowdownResolveAction {
  readonly type: "showdown-resolve";
  readonly playerId: PlayerId;
}

/**
 * Everything `requestMentirosoSystemAction` may hand back (design's own
 * Interfaces section: `MentirosoSystemAction`) — a closed union of the two
 * D3 draw shapes above, plus task 3.5's own showdown-resolution shape, and
 * nothing else. `mentiroso-module/src/index.ts`'s own `applyAction` (work
 * unit C3, extended by task 3.5) narrows on `.type` the same way
 * `truco-module/src/index.ts` narrows its own `TrucoModuleAction` union on
 * `"start-hand"`.
 */
export type MentirosoSystemAction = OpeningDrawRollAction | RoundRollAction | ShowdownResolveAction;

/** One die, one draw — the identical total mapping
 * `generala-module/src/roll.ts`'s own `rollDie` already documents:
 * `RandomSource` is contractually `[0, 1)`, so indexing `DIE_FACES` by
 * `rng() * DIE_FACES.length` lands on a face for every value the interval
 * contains, with nothing to clamp and nothing to reject. `DIE_FACES` comes
 * from the engine rather than a literal `6` here, so "a die has six faces"
 * stays declared in exactly the one place `dice.ts` already states it. */
function rollDie(rng: RandomSource): DieFace {
  return DIE_FACES[Math.floor(rng() * DIE_FACES.length)]!;
}

/**
 * THE ONLY DOOR ENTROPY COMES THROUGH, for the whole game (mirrors
 * `generala-module/src/roll.ts`'s own docblock, word for word in spirit).
 *
 * THE FIRST GUARD, ASKED BEFORE THE PHASE IS EVEN LOOKED AT: a finished
 * match. `mentiroso-engine`'s own `getOutcome` is read off `players` alone,
 * never off `phase` — so a table that already has a sole survivor draws
 * NOTHING, regardless of what `phase` happens to say, the same
 * "both guards load-bearing, in this order" discipline
 * `generala-module/src/roll.ts` documents for its own `getOutcome` check.
 * `roll.test.ts` proves this ordering directly: a one-live-seat state whose
 * `phase` is `awaiting-roll` (which would otherwise draw) still declines,
 * with an `rng` that throws if called at all.
 *
 * THE SECOND GUARD IS THE PHASE ITSELF. `opening-draw` and `awaiting-roll`
 * are the only two that ever need ENTROPY (design D3's own data-flow table).
 * `showdown` needs no entropy but DOES need a system action now (task 3.5):
 * see this file's own top docblock for why the resolution has to be its own
 * requestable action rather than something `applyAction`'s "doubt" branch
 * chains inline. `bidding` is the only phase that offers nothing here at
 * all — a SEATED PLAYER has the move there (`legal-actions.ts`, work unit
 * B2), not the system, so it falls through to the final `return null`.
 */
export function requestMentirosoSystemAction(state: MatchState, rng: RandomSource): MentirosoSystemAction | null {
  if (getOutcome(state) !== null) return null;

  if (state.phase.kind === "opening-draw") {
    const { contenders } = state.phase;
    // A STRAIGHT-LINE `for`, DELIBERATELY (see this file's own top
    // docblock): the bound is `contenders.length`, read off the state, never
    // the full seat count and never a retry.
    const faces: DieFace[] = [];
    for (let draw = 0; draw < contenders.length; draw += 1) faces.push(rollDie(rng));
    return { type: "opening-draw-roll", playerId: SYSTEM_ACTOR_ID, faces };
  }

  if (state.phase.kind === "awaiting-roll") {
    // One straight-line `for` per seat, each bounded by THAT seat's own
    // `dice.length` — never a shared constant, and never `state.players.length`
    // (which is the exact "seats instead of dice" confusion this file's own
    // top docblock names). A seat holding zero dice runs zero iterations and
    // still gets an entry: `diceBySeat.push(dice)` always runs, even when
    // `dice` stays empty.
    const diceBySeat: DieFace[][] = [];
    for (const player of state.players) {
      const dice: DieFace[] = [];
      for (let draw = 0; draw < player.dice.length; draw += 1) dice.push(rollDie(rng));
      diceBySeat.push(dice);
    }
    return { type: "round-roll", playerId: SYSTEM_ACTOR_ID, diceBySeat };
  }

  if (state.phase.kind === "showdown") {
    // ZERO entropy, task 3.5 (see this file's own top docblock): the
    // outcome was already decided by `applyDoubt`, so this branch draws
    // nothing at all — it only materializes the RESOLUTION as a requestable
    // action, so `mentiroso-module`'s own `applyAction` can adopt
    // `resolveShowdown` on a later driving-loop tick, after the showdown has
    // sat on screen for `systemActionPauseMs` (design D6).
    return { type: "showdown-resolve", playerId: SYSTEM_ACTOR_ID };
  }

  // `bidding` — see this function's own docblock for why it needs no
  // system action at all: a seated player has the move, not the system.
  return null;
}
