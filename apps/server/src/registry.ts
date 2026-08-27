import { createGameModuleRegistry } from "@hexdev/platform-core";
import type { ConsultAdviceProvider, ConsultAskProvider, GameModuleRegistry, SystemActionRequester } from "@hexdev/platform-core";
import { getConsultAdvice, getConsultAsk, requestSystemAction, requestSystemAction2v2, trucoModule, trucoModule2v2 } from "@hexdev/truco-module";

// The registry erases per-module state types (same documented boundary as
// `platform-core/registry.ts` itself); this is that one spot for the pairing.
// `isNonBlockingAction` closes a real, reproduced deadlock (platform-core's
// own `NonBlockingActionClassifier` docstring has the full story): a seña is
// legal continuously, independent of turn, so `MatchRoom` must never treat
// "a bot's ONLY legal action is send-sena" as "this bot must act now" — it
// would starve the actual pending decision forever. Harmless for the 1v1
// entry (send-sena is never offered there at all — señas are teammate-gated
// and a 1v1 team has exactly one player by construction), included on both
// entries for consistency rather than asymmetric registration.
const isTrucoSenaNonBlocking = (action: unknown): boolean => typeof action === "object" && action !== null && (action as { type?: unknown }).type === "send-sena";
// The human answers first. Truco offers a pending call's response to BOTH
// members of the answering team, so a bot partner had it legal at the same
// instant its human teammate did and always won the race — reported from real
// 2v2 play. These two action types are the whole shared surface: opening a
// call is not on the list, because a bot opening its own truco is its own
// decision and not one it is taking away from anybody.
const isTrucoResponseHumanFirst = (action: unknown): boolean => {
  if (typeof action !== "object" || action === null) return false;
  const type = (action as { type?: unknown }).type;
  return type === "respond-truco" || type === "respond-envido";
};
// Asking your partner costs a seña (truco-engine's `consult.ts`), so a bot
// that spends the action is OWED the answer — `MatchRoom` needs to be told
// which action that is, because a bot's question comes back from
// `chooseAction` as an ordinary action with no channel of its own. Only this
// one type: a game that named more here would be handing bots information
// they never paid for.
const isTrucoPaidQuestion = (action: unknown): boolean => typeof action === "object" && action !== null && (action as { type?: unknown }).type === "consult-partner";

/**
 * The composition root's own truco registry — EXTRACTED from `index.ts`
 * (sdd-verify CRITICAL-3: deleting either `getConsultAsk` registration line
 * below left the whole suite green while every consult silently reverted to
 * the synchronous bot path in production, because `index.ts` itself carried
 * no test and `match-room.consult.test.ts` fenced only a hand-copied stand-in
 * registry, commented "same real registrations apps/server wires" — a copy,
 * never the thing). Pulling this out into its own side-effect-free function
 * is what lets `registry.test.ts` import and call the EXACT function
 * `index.ts` calls, so a deleted line here fails a test rather than shipping
 * silently. Nothing about `index.ts`'s own behaviour changes: same modules,
 * same classifiers, same providers, same order.
 *
 * `getConsultAsk` on the 1v1 (`trucoModule`) entry is registered for the
 * same consistency reason `isTrucoSenaNonBlocking` is: `getConsultAsk`
 * itself returns `null` unconditionally in a head-to-head match (no
 * teammate exists to ask), so this one entry is structurally unable to
 * prove itself wired versus unwired from ITS OWN return value alone —
 * `registry.test.ts` fences the 2v2 entry instead, the only one where a
 * live teammate can make the difference observable.
 */
export function buildTrucoRegistry(): GameModuleRegistry {
  return createGameModuleRegistry([
    {
      module: trucoModule,
      requestSystemAction: requestSystemAction as SystemActionRequester,
      isNonBlockingAction: isTrucoSenaNonBlocking,
      isHumanPriorityAction: isTrucoResponseHumanFirst,
      getConsultAdvice: getConsultAdvice as ConsultAdviceProvider,
      getConsultAsk: getConsultAsk as ConsultAskProvider,
      isPaidQuestion: isTrucoPaidQuestion,
    },
    // The 2v2 module, additive registration (obs 2927/2925's own named gap):
    // same registry, same generic MatchRoom, a distinct gameId. Nothing above
    // this line changed for the 1v1 entry.
    {
      module: trucoModule2v2,
      requestSystemAction: requestSystemAction2v2 as SystemActionRequester,
      isNonBlockingAction: isTrucoSenaNonBlocking,
      isHumanPriorityAction: isTrucoResponseHumanFirst,
      getConsultAdvice: getConsultAdvice as ConsultAdviceProvider,
      getConsultAsk: getConsultAsk as ConsultAskProvider,
      isPaidQuestion: isTrucoPaidQuestion,
    },
  ]);
}
