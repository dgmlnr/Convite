import type { BotStrategy, BotTier, RandomSource } from "@hexdev/platform-contract";
import type { PlayCardAction, PlayerView } from "@hexdev/escoba-engine";
import { createEasyBot } from "./easy.js";
import { createHardBot } from "./hard.js";
import { createNormalBot } from "./normal.js";

export { createEasyBot } from "./easy.js";
export { createNormalBot } from "./normal.js";
export { createHardBot } from "./hard.js";
export { DEFAULT_THINKING_DELAY_MS, withThinkingDelay } from "./latency.js";
export type { Sleep } from "./latency.js";

/**
 * The one place that maps a `BotTier` onto a real strategy — mirrors
 * `truco-bot/src/index.ts`'s own `createBotStrategy`. `rng` is required for
 * every tier's signature even though `easy` never consults it, so a caller
 * can construct all three tiers identically with no tier-specific branch of
 * its own.
 */
export function createBotStrategy(tier: BotTier, rng: RandomSource): BotStrategy<PlayerView, PlayCardAction> {
  if (tier === "easy") return createEasyBot();
  if (tier === "normal") return createNormalBot(rng);
  return createHardBot(rng);
}
