import type { RandomSource } from "@hexdev/platform-contract";
import type { GeneralaTier } from "./tier.js";

/**
 * design §D7: "Uniform choice over the legal list."
 *
 * DELIBERATELY UNLIKE ESCOBA'S AND TRUCO'S EASY TIERS, and the design says so:
 * both of those take the first action in the engine's canonical order, which
 * works because a card game's offer list is ordered by something meaningful — a
 * hand card, a priority ladder. Generala's is not. It is 31 hold shapes in
 * subset-enumeration order followed by whatever boxes are still open, so "the
 * first one" is always the same hold and the bot would play every turn
 * identically. Uniform is both the weakest honest tier and the only one that
 * does not need a heuristic this slice has not written yet.
 *
 * `rng` is therefore genuinely consulted here, unlike `escoba-bot`'s
 * `createEasyBot()` which takes none. `createBotStrategy` still passes it to
 * every tier for escoba's stated reason: a caller constructs all three
 * identically, with no tier-specific branch of its own.
 *
 * TOTAL, WITH NO THROW AND NO FALL-THROUGH — D7's second layer. `RandomSource`
 * is contractually `[0, 1)`, so `Math.floor(rng() * length)` lands inside a list
 * the type already guarantees is non-empty. The `?? legalActions[0]` is what
 * answers `noUncheckedIndexedAccess` without a non-null assertion, and it is
 * only reachable by a source that broke its own contract — in which case this
 * still returns a move the room will admit rather than `undefined`, which it
 * would not.
 */
export function createEasyBot(rng: RandomSource): GeneralaTier {
  return {
    chooseAction(_view, legalActions) {
      const index = Math.floor(rng() * legalActions.length);
      return legalActions[index] ?? legalActions[0];
    },
  };
}
