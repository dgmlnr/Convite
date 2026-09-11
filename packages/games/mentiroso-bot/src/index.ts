import type { BotStrategy, BotTier, RandomSource } from "@hexdev/platform-contract";
import type { MentirosoAction, PlayerView } from "@hexdev/mentiroso-engine";
import { createEasyBot } from "./easy.js";
import { createHardBot } from "./hard.js";
import { createNormalBot } from "./normal.js";
import type { MentirosoTier, NonEmptyActions } from "./tier.js";

export { createEasyBot } from "./easy.js";
export { createHardBot } from "./hard.js";
export { createNormalBot } from "./normal.js";
export { DEFAULT_THINKING_DELAY_MS, withThinkingDelay } from "./latency.js";
export type { Sleep } from "./latency.js";
export type { MentirosoTier, NonEmptyActions } from "./tier.js";

/**
 * THE BARREL (SDD `mentiroso`, task 3.6) — `tier.ts`'s own docblock (task
 * 4.2) named this exact wrapper as "a future wrapper... once mentiroso-bot
 * gets its own index.ts barrel — not this unit's job". This file is that
 * job, now that `hard.ts` (task 4.4) and 4.6's reasoned `normal.ts` raise
 * policy both exist. Mirrors `generala-bot/src/index.ts`'s own
 * `createBotStrategy` shape: ONE guard, here rather than duplicated three
 * times the way `truco-bot`/`escoba-bot` write it — `tier.ts`'s own docblock
 * already argues for the centralized shape, so this file follows it.
 */

/** The narrowing `MentirosoTier` is built on — mirrors
 * `generala-bot/src/index.ts`'s own `isNonEmpty`. */
function isNonEmpty(legalActions: readonly MentirosoAction[]): legalActions is NonEmptyActions {
  return legalActions.length > 0;
}

/**
 * ALL THREE TIERS TAKE `rng`, unlike `generala-bot`'s own split (`easy`
 * only) — mentiroso's `normal` and `hard` both consult it too, for the
 * doubt/raise coin flip `chooseModulatedMentirosoAction` (`normal.ts`)
 * shares with every tier; `easy` layers its own extra draws (noise,
 * minimal-raise bias) on top of that same call. A caller therefore never
 * branches per tier either way — the same "construct all three identically"
 * property every sibling `createBotStrategy` in this repo already gives.
 */
function tierFor(tier: BotTier, rng: RandomSource): MentirosoTier {
  if (tier === "easy") return createEasyBot(rng);
  if (tier === "normal") return createNormalBot(rng);
  return createHardBot(rng);
}

/**
 * THE ONE GUARD, in the wrapper — design D7's third layer, `tier.ts`'s own
 * reserved home for it. `easy.ts`/`normal.ts`/`hard.ts` each carry NO throw
 * of their own: `NonEmptyActions` (`tier.ts`) already proves, at the type
 * level, that a tier is never handed an empty list — the ceiling
 * (mentiroso-rules R-CEILING) always forces exactly one legal action
 * (`doubt`), so the empty case is unreachable by engine invariant, the
 * identical argument `generala-bot/src/index.ts` makes for its own wrapper.
 */
export function createBotStrategy(tier: BotTier, rng: RandomSource): BotStrategy<PlayerView, MentirosoAction> {
  const strategy = tierFor(tier, rng);
  return {
    chooseAction(view, legalActions, budgetMs) {
      if (!isNonEmpty(legalActions)) {
        throw new Error(
          "mentiroso-bot: asked to choose from no legal actions — the ceiling always forces exactly one (doubt), so this position should be unreachable",
        );
      }
      return strategy.chooseAction(view, legalActions, budgetMs);
    },
  };
}
