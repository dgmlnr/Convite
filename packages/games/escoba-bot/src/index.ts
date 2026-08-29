import type { BotStrategy, BotTier, RandomSource } from "@hexdev/platform-contract";
import type { PlayCardAction, PlayerView } from "@hexdev/escoba-engine";
import { createEasyBot } from "./easy.js";

export { createEasyBot } from "./easy.js";
export { DEFAULT_THINKING_DELAY_MS, withThinkingDelay } from "./latency.js";
export type { Sleep } from "./latency.js";

/**
 * The one place that maps a `BotTier` onto a real strategy — mirrors
 * `truco-bot/src/index.ts`'s own `createBotStrategy`. `rng` is required for
 * every tier's signature even though `easy` never consults it, so a caller
 * can construct all three tiers identically with no tier-specific branch of
 * its own.
 *
 * K1: `normal` and `hard` land in the next two commits (K2, K3) — every
 * tier maps to the easy strategy for now, so `escoba-module`'s `createBot`
 * (a required, exhaustive `GameModule` method over the closed `BotTier`
 * union) can start calling this today without waiting on the other tiers.
 */
export function createBotStrategy(tier: BotTier, rng: RandomSource): BotStrategy<PlayerView, PlayCardAction> {
  void tier;
  void rng;
  return createEasyBot();
}
