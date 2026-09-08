import type { GeneralaAction, PlayerView } from "@hexdev/generala-engine";

/**
 * An offer list that CANNOT be empty, stated as a type.
 *
 * This is the compile-time half of design D7's "one shared guard, not three".
 * `truco-bot` gave each of its tiers the same throw (`easy.ts:48`,
 * `normal.ts:72`, `hard.ts:131`) because each of them could be handed nothing;
 * a tier here cannot, so it has no representable reason to carry a throw of its
 * own — and slices 16 and 17 cannot quietly add one back, because there is no
 * empty case for it to answer.
 *
 * The narrowing happens once, in `createBotStrategy`'s wrapper, which is the
 * only place that sees a `readonly GeneralaAction[]` at all.
 */
export type NonEmptyActions = readonly [GeneralaAction, ...GeneralaAction[]];

/**
 * What a tier is, as opposed to what the platform port is.
 *
 * `BotStrategy` (platform-contract) is the seam a transport programs against:
 * it takes any list, may answer asynchronously, and carries the `answer` a bot
 * bought. A TIER is the decision underneath it — synchronous, total, and handed
 * a list the wrapper has already proven non-empty. Generala registers no
 * consult channel, so no tier has an `answer` to read, and leaving it off this
 * interface is what makes that permanent rather than conventional.
 */
export interface GeneralaTier {
  chooseAction(view: PlayerView, legalActions: NonEmptyActions, budgetMs: number): GeneralaAction;
}
