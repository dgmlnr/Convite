import type { BotStrategy, BotTier, RandomSource } from "@hexdev/platform-contract";
import type { GeneralaAction, PlayerView } from "@hexdev/generala-engine";
import { createEasyBot } from "./easy.js";
import type { GeneralaTier, NonEmptyActions } from "./tier.js";

export { createEasyBot } from "./easy.js";
export type { GeneralaTier, NonEmptyActions } from "./tier.js";

/**
 * A PARTIAL BARREL, and it says which slice closes it.
 *
 * `createNormalBot` (slice 16) and `createHardBot` (slice 17) are not written,
 * so they are not exported. `withThinkingDelay` is this slice's other half and
 * lands with it; `fixtures.ts` is deliberately never exported, exactly as
 * `escoba-bot`'s is not — a fixture builder is this package's test scaffolding,
 * not its API.
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
 * EVERY TIER IS THE UNIFORM ONE TODAY, and the three arms are kept apart so the
 * two that are placeholders are visible as placeholders.
 *
 * `normal` is slice 16 (greedy, `SACRIFICE_ORDER`) and `hard` is slice 17
 * (exact one-ply EV). Collapsing this to a single `return createEasyBot(rng)`
 * would read as a decision that Generala's tiers are the same, which is the
 * opposite of what the design says. `index.test.ts` asserts the placeholder out
 * loud for the same reason `conformance.ts:114-134` refuses a mute `if`: the
 * difference between "deliberately identical" and "somebody forgot" has to be
 * legible in a green run.
 */
function tierFor(tier: BotTier, rng: RandomSource): GeneralaTier {
  if (tier === "easy") return createEasyBot(rng);
  if (tier === "normal") return createEasyBot(rng); // slice 16 replaces this with `createNormalBot(rng)`
  return createEasyBot(rng); //                        slice 17 replaces this with `createHardBot(rng)`
}
