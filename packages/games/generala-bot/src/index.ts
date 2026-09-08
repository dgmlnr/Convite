import type { BotStrategy, BotTier, RandomSource } from "@hexdev/platform-contract";
import type { GeneralaAction, PlayerView } from "@hexdev/generala-engine";
import { createEasyBot } from "./easy.js";
import { createNormalBot } from "./normal.js";
import type { GeneralaTier, NonEmptyActions } from "./tier.js";

export { createEasyBot } from "./easy.js";
export { createNormalBot } from "./normal.js";
export { SACRIFICE_ORDER, immediateValue, largestMatchingGroup, sacrificeRank } from "./heuristics.js";
export type { MatchingGroup } from "./heuristics.js";
export { DEFAULT_THINKING_DELAY_MS, withThinkingDelay } from "./latency.js";
export type { Sleep } from "./latency.js";
export type { GeneralaTier, NonEmptyActions } from "./tier.js";

/**
 * STILL A PARTIAL BARREL, and it still says which slice closes it.
 *
 * `createHardBot` (slice 17) is not written, so it is not exported.
 * `createNormalBot` now is, together with the three things `heuristics.ts`
 * holds — which slice 17 consumes rather than re-deriving, so they are API of
 * this package and not private to one tier. `fixtures.ts` is deliberately never
 * exported, exactly as `escoba-bot`'s is not: a fixture builder is this
 * package's test scaffolding, not its API.
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
 * TWO REAL TIERS AND ONE PLACEHOLDER, and the arms are kept apart so the
 * placeholder is visible as one.
 *
 * `hard` is slice 17 (exact one-ply EV over multisets). Collapsing its arm into
 * `normal`'s would read as a decision that the two are the same, which is the
 * opposite of what the design says, so `index.test.ts` asserts the placeholder
 * out loud for the same reason `conformance.ts:114-134` refuses a mute `if`:
 * the difference between "deliberately identical" and "somebody forgot" has to
 * be legible in a green run.
 *
 * ONLY `easy` TAKES THE SOURCE, and that is not an oversight either. Uniform
 * choice IS entropy, so `createEasyBot` cannot be written without it; normal is
 * a total function of the position and would be claiming something false by
 * accepting one. `truco-bot/src/index.ts:25` draws the same line in the other
 * direction, handing `rng` to `normal` and `hard` while `createEasyBot()` takes
 * none. What every caller programs against is `createBotStrategy(tier, rng)`,
 * which is uniform whatever this function does behind it.
 */
function tierFor(tier: BotTier, rng: RandomSource): GeneralaTier {
  if (tier === "easy") return createEasyBot(rng);
  if (tier === "normal") return createNormalBot();
  return createEasyBot(rng); // slice 17 replaces this with `createHardBot(rng)`
}
