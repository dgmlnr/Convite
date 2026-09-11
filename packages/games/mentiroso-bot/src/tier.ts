import type { MentirosoAction, PlayerView } from "@hexdev/mentiroso-engine";

/**
 * An offer list that CANNOT be empty, stated as a type (SDD `mentiroso`, work
 * unit D2/task 4.2, design D7: "a `MentirosoTier` interface plus
 * `NonEmptyActions` narrowed once", the same shape `generala-bot/src/tier.ts`
 * already declares for its own tiers).
 *
 * The narrowing itself belongs to a future wrapper (design D7: "in
 * `createBotStrategy`'s wrapper") once `mentiroso-bot` gets its own `index.ts`
 * barrel — not this unit's job. This type is what every tier is handed
 * ALREADY narrowed, so a tier never has to defend against the empty case
 * itself: at the ceiling exactly one action (`doubt`) is always offered
 * (mentiroso-rules R-CEILING), so the empty case is unreachable by engine
 * invariant, the same argument `generala-bot/src/index.ts` makes for its own
 * wrapper's guard.
 */
export type NonEmptyActions = readonly [MentirosoAction, ...MentirosoAction[]];

/**
 * What a tier is, as opposed to what the platform port (`BotStrategy`,
 * `@hexdev/platform-contract`) is: a tier is the DECISION underneath it —
 * synchronous, total, and handed a list already proven non-empty. Mentiroso
 * registers no consult channel (design's own Data Flow has no `answer`
 * arrow), so no tier here has one to read.
 */
export interface MentirosoTier {
  chooseAction(view: PlayerView, legalActions: NonEmptyActions, budgetMs: number): MentirosoAction;
}
