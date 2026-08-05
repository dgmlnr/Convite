import type { Action, PlayerView } from "@hexdev/truco-engine";
import type { BotStrategy, BotTier, RandomSource } from "@hexdev/platform-contract";
import { createEasyBot } from "./easy.js";
import { createHardBot } from "./hard.js";
import { createNormalBot } from "./normal.js";

export { createEasyBot } from "./easy.js";
export { createNormalBot } from "./normal.js";
export { createHardBot } from "./hard.js";
export { sampleOpponentHand } from "./determinize.js";
export { envidoPoints, handPower, scoreFollowingCardPlay } from "./heuristics.js";
export { DEFAULT_THINKING_DELAY_MS, withThinkingDelay } from "./latency.js";
export type { Sleep } from "./latency.js";

/**
 * The one place that maps a `BotTier` onto a real, instant (no artificial
 * delay — see `latency.ts`) strategy. `rng` is required for every tier's
 * signature even though only `hard` consults it (design: real determinism
 * needs real entropy, injected — never `Math.random`), so a caller can
 * construct all three tiers identically without a tier-specific branch of
 * its own.
 */
export function createBotStrategy(tier: BotTier, rng: RandomSource): BotStrategy<PlayerView, Action> {
  if (tier === "easy") return createEasyBot();
  if (tier === "normal") return createNormalBot();
  return createHardBot(rng);
}
