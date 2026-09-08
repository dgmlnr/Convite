import type { BotStrategy, BotTier, RandomSource } from "@hexdev/platform-contract";
import type { GeneralaAction, PlayerView } from "@hexdev/generala-engine";
import { createEasyBot } from "./easy.js";
import { createHardBot } from "./hard.js";
import { createNormalBot } from "./normal.js";
import type { GeneralaTier, NonEmptyActions } from "./tier.js";

export { createEasyBot } from "./easy.js";
export { createHardBot, expectedValueOfHold } from "./hard.js";
export { createNormalBot } from "./normal.js";
export { orderedThrowCount, rollOutcomes } from "./outcomes.js";
export type { RollOutcome } from "./outcomes.js";
export { SACRIFICE_ORDER, immediateValue, largestMatchingGroup, sacrificeRank } from "./heuristics.js";
export type { MatchingGroup } from "./heuristics.js";
export { DEFAULT_THINKING_DELAY_MS, withThinkingDelay } from "./latency.js";
export type { Sleep } from "./latency.js";
export type { GeneralaTier, NonEmptyActions } from "./tier.js";

/**
 * THE BARREL IS CLOSED. Three tiers, and every fact they reason from.
 *
 * It said "still partial" through slices 8 and 16 and named the slice that
 * would close it; this is that slice. `heuristics.ts` holds facts about a
 * POSITION and `outcomes.ts` holds facts about the CUP, and both are exported
 * for the same reason `createHardBot` is: they are what a tier reasons from
 * rather than one tier's private business, and a second copy inside a tier is
 * how two tiers come to disagree about the RULES instead of about strategy.
 *
 * `expectedValueOfHold` is exported beside its tier because it is that tier's
 * valuation and the only thing that makes its decisions checkable as
 * arithmetic rather than only as outcomes.
 *
 * `fixtures.ts` is still deliberately never exported, exactly as `escoba-bot`'s
 * is not: a fixture builder is this package's test scaffolding, not its API.
 */

/**
 * The one place a `BotTier` becomes a real strategy — `escoba-bot`'s
 * `index.ts:20-24` shape, `rng` required for every tier so a caller needs no
 * tier-specific branch of its own.
 *
 * THE EMPTY-LIST GUARD IS HERE AND NOWHERE ELSE — task 8.4, design D7's third
 * layer, and the whole reason this wrapper exists rather than returning the
 * tier directly.
 *
 * `truco-bot` writes the same throw three times, once per tier (`easy.ts:48`,
 * `normal.ts:72`, `hard.ts:131`), so a fix to it has to be made three times —
 * and that throw once took down the whole server process. Here it is written
 * once, above three tiers that are typed so they can never see the empty case
 * (`tier.ts`), over an engine invariant that already makes it unreachable:
 * `deciding` always offers at least one score action, because a seat only
 * reaches `deciding` with an open box, and that is pinned in
 * `generala-engine/src/legal-actions.ts` rather than discovered here.
 *
 * IT THROWS, and returning a fabricated action instead was rejected in the
 * design: the transport would apply it, `applyAction` would refuse it,
 * `runAdvanceOnce` would `return`, and the table would stall silently with
 * nobody able to say why. A thrown error is contained by `runAdvanceOnce`'s
 * outer try/catch (`match-room.ts:1288-1296`, added AS the fix for that
 * incident) to one abandoned driving step — loud, caught, and survivable.
 *
 * The message names no tier on purpose: one guard has one message, and the day
 * somebody copies a throw back down into a tier the difference is visible in
 * `index.test.ts` rather than only in a diff.
 */
export function createBotStrategy(tier: BotTier, rng: RandomSource): BotStrategy<PlayerView, GeneralaAction> {
  const strategy = tierFor(tier, rng);
  return {
    chooseAction(view, legalActions, budgetMs) {
      if (!isNonEmpty(legalActions)) {
        throw new Error("generala-bot: asked to choose from no legal actions — the engine's `deciding` phase always offers at least one open box, so this position should be unreachable");
      }
      return strategy.chooseAction(view, legalActions, budgetMs);
    },
  };
}

/** The narrowing the tiers are built on, written once beside the guard that performs it. */
function isNonEmpty(legalActions: readonly GeneralaAction[]): legalActions is NonEmptyActions {
  return legalActions.length > 0;
}

/**
 * THREE REAL TIERS, AND NO PLACEHOLDER LEFT.
 *
 * The arm that returned the uniform tier for `hard` is gone, and the assertion
 * slice 8 wrote to make it visible — "hard still resolves to the uniform tier,
 * and this is the assertion slice 17 reds" — did red, on schedule, and was
 * replaced by this slice's own divergence test. The same collection slice 16
 * made on slice 8's placeholder, one slice later.
 *
 * The three arms stay apart rather than collapsing into a shared expression,
 * for the reason `conformance.ts:114-134` refuses a mute `if`: the difference
 * between "deliberately identical" and "somebody forgot" has to be legible in a
 * green run, and one position now answers three ways to say so.
 *
 * ONLY `easy` TAKES THE SOURCE, and that is not an oversight. Uniform choice IS
 * entropy, so `createEasyBot` cannot be written without it; `normal` and `hard`
 * are total functions of the position and would be claiming something false by
 * accepting one. `truco-bot/src/index.ts:25` draws the same line in the other
 * direction. What every caller programs against is `createBotStrategy(tier,
 * rng)`, which is uniform whatever this function does behind it — and
 * `match-room.ts:315-318` builds ONE strategy per room and reuses it for every
 * seat, so a tier that drifted with a source would answer the same position
 * differently depending on how many decisions came before it.
 */
function tierFor(tier: BotTier, rng: RandomSource): GeneralaTier {
  if (tier === "easy") return createEasyBot(rng);
  if (tier === "normal") return createNormalBot();
  return createHardBot();
}
