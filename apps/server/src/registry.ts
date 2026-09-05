import { createGameModuleRegistry } from "@hexdev/platform-core";
import type { AbandonedSeatActionProvider, ConsultAdviceProvider, ConsultAskProvider, GameModuleRegistration, GameModuleRegistry, SystemActionRequester } from "@hexdev/platform-core";
import type { GameId } from "@hexdev/platform-contract";
import { getConsultAdvice, getConsultAsk, requestSystemAction, requestSystemAction2v2, trucoModule, trucoModule2v2 } from "@hexdev/truco-module";
import { escobaModule, escobaModule2v2, requestEscobaSystemAction } from "@hexdev/escoba-module";
import { getAbandonedSeatAction as getMahjongAbandonedSeatAction, mahjongSolitaireModule, requestMahjongSolitaireSystemAction } from "@hexdev/mahjong-solitaire-module";

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
 * The composition root's own game registry — EXTRACTED from `index.ts`
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
 *
 * Renamed from `buildTrucoRegistry` (slice L): a SINGLE `GameModuleRegistry`
 * covers every game family this process serves, not just truco — there is
 * no way to compose two separate registries into one `createMatchServer`
 * call, so escoba's two entries join truco's here rather than in a second
 * function. Escoba registers in the OBJECT FORM too, but with
 * `requestSystemAction` ONLY: design §D3 / slice J settled that escoba has
 * no señas and no partner-consult mechanic at all (arts. 20.4/20.5 forbid
 * tipping a partner off in person, and a game that registers no consult
 * channel gives the engine no surface for it), so
 * `isNonBlockingAction`/`isHumanPriorityAction`/`getConsultAdvice`/
 * `getConsultAsk`/`isPaidQuestion` are correctly OMITTED, not merely
 * defaulted — `createGameModuleRegistry`'s own fail-closed defaults already
 * do the right thing for an entry that supplies none of them.
 */
/**
 * The exact registration list `buildGameRegistry` composes with — pulled
 * into its own constant (tenant-administration slice 3b) so `MATCH_GAME_IDS`
 * below can derive from the SAME array rather than authoring a second,
 * independently-maintained list of ids that could drift from it.
 */
const MATCH_GAME_REGISTRATIONS: readonly GameModuleRegistration[] = [
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
    {
      module: escobaModule,
      requestSystemAction: requestEscobaSystemAction as SystemActionRequester,
    },
    // The 2v2 escoba entry — additive, same relationship escoba's 1v1 entry
    // has to escobaModule2v2 truco's own pairs already model above.
    {
      module: escobaModule2v2,
      requestSystemAction: requestEscobaSystemAction as SystemActionRequester,
    },
    /**
     * THE FIRST ONE-SEAT GAME, and the first entry here that has to say what
     * an abandoned seat means.
     *
     * `requestSystemAction` is the same pairing escoba's two entries above
     * already carry, and it is what lays the board: a solitaire deals itself
     * from a system action (`MatchRoom.runAdvanceOnce` asks for one exactly
     * when no seat can act, which for a fresh solitaire match is the moment
     * it starts), so an entry registered without it would compose, admit a
     * player, and then sit forever in front of an empty table.
     *
     * `getAbandonedSeatAction` is the member NO OTHER ENTRY registers, and
     * it is registered here for a reason this game is alone in having: the
     * transport's default answer to a vacated seat is to hand it to a bot,
     * and this module supplies no `createBot` at all. Without this line the
     * seat would be left occupied by nobody until the room disposed. The
     * module's own docblock carries the argument; `platform-core`'s registry
     * defaults it to `null` ("no opinion"), which is exactly the wrong
     * answer for a game with one seat and no opponent.
     */
    {
      module: mahjongSolitaireModule,
      requestSystemAction: requestMahjongSolitaireSystemAction as SystemActionRequester,
      getAbandonedSeatAction: getMahjongAbandonedSeatAction as AbandonedSeatActionProvider,
    },
];

export function buildGameRegistry(): GameModuleRegistry {
  return createGameModuleRegistry(MATCH_GAME_REGISTRATIONS);
}

/** Every game id this role's registry actually serves, derived from the
 * SAME registration list `buildGameRegistry` composes with above — never a
 * second, independently maintained list. `apps/mint-server`'s own
 * `MINT_GAME_IDS` (registry.ts there) is this constant's sibling on the
 * other composition root; `scripts/dev-stack.mjs` sources its dev seed
 * tenant's `entitledGames` from the MINT root's copy (design §14), never
 * from a hand-written fixture. */
export const MATCH_GAME_IDS: readonly GameId[] = MATCH_GAME_REGISTRATIONS.map((registration) => ("module" in registration ? registration.module.id : registration.id));
