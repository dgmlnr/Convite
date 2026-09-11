import { createGameModuleRegistry } from "@hexdev/platform-core";
import type { AbandonedSeatActionProvider, ConsultAdviceProvider, ConsultAskProvider, GameModuleRegistration, GameModuleRegistry, SystemActionRequester } from "@hexdev/platform-core";
import type { GameId } from "@hexdev/platform-contract";
import { getConsultAdvice, getConsultAsk, requestSystemAction, requestSystemAction2v2, trucoModule, trucoModule2v2 } from "@hexdev/truco-module";
import { escobaModule, escobaModule2v2, requestEscobaSystemAction } from "@hexdev/escoba-module";
import { generalaModule, requestGeneralaSystemAction } from "@hexdev/generala-module";
import { getAbandonedSeatAction as getMahjongAbandonedSeatAction, mahjongSolitaireModule, requestMahjongSolitaireSystemAction } from "@hexdev/mahjong-solitaire-module";
import { mentirosoModule, mentirosoModule4, mentirosoModule6, requestMentirosoSystemAction } from "@hexdev/mentiroso-module";

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
 * THE BEAT BEFORE EACH OF GENERALA'S THROWS, and the first time any entry in
 * this list has had an opinion about its own pacing.
 *
 * A card game pays the room's `handEndPauseMs` ONCE PER HAND, and that pause
 * exists for a reported reason: without it the winning card went past in the
 * same broadcast burst that replaced it. Generala pays a pause once per ROLL.
 * Two seats, eleven boxes and up to three throws a turn is 66 system actions in
 * a full match — at the room's own 1800ms that is roughly two minutes of a
 * match in which nothing whatsoever happens, against roughly 23 seconds at 350.
 *
 * WHY NOT ZERO, since a shorter pause is strictly cheaper. This one is dead
 * time BEFORE the throw rather than instead of it: `dice-ui`'s tumble runs
 * ~640ms and starts when the view arrives, so the roll is already legible with
 * no pause at all. What 350ms buys is the beat between the previous view
 * leaving and the dice beginning to move — long enough for the eye to arrive at
 * the tray, short enough that nobody waits for it.
 *
 * DECLARED RATHER THAN OMITTED, and the difference is not cosmetic: omitting it
 * is the answer "no opinion, keep the room's own beat", which is what every
 * other entry below says. This one has an opinion, so it states it. A named
 * constant rather than a literal in the entry itself, because the number is the
 * conclusion of the arithmetic above and a bare 350 down there would read as a
 * magic value nobody could argue with.
 */
const GENERALA_SYSTEM_ACTION_PAUSE_MS = 350;

/**
 * THE SECOND GAME WITH AN OPINION ABOUT ITS OWN PACING, and `platform-core`'s
 * own registry docblock already previewed exactly this case: "a card game
 * pays it ONCE PER HAND; a dice game would pay it once per ROLL, which at
 * the room's 1800ms beat is minutes of dead time per match."
 *
 * MEASURED, NOT ESTIMATED (design D6, `sdd/mentiroso/design`): a round ends
 * with exactly one die surrendered, so rounds = dice surrendered. Six seats
 * hold 30 dice at the start and the match ends when five seats hold none:
 * 25-29 rounds, i.e. 26-30 system actions counting the opening draw. At the
 * room's 1800ms beat that is 47-54 seconds of a six-seat table sitting
 * still — under a minute, not the "minutos muertos" a naive projection would
 * assume. Two seats: 6-10 system actions, 12-18 seconds.
 *
 * WHY 1200 AND NOT GENERALA'S 350: Generala's pause is dead time BEFORE an
 * animation that already carries the information — `dice-ui`'s own ~640ms
 * tumble starts the instant the view arrives, so the roll is legible with
 * no pause at all, and 350ms is only the beat between one view leaving and
 * the next throw beginning. Mentiroso's pause IS the showdown-reading
 * window itself: up to 30 revealed dice and a counted face sit on screen
 * during it, replaced by the next round's roll the moment it ends — exactly
 * the failure `systemActionPauseMs` exists to prevent ("no hay tiempo de
 * verla, enseguida desaparece"). 1200ms leaves roughly 560ms of stillness
 * past the tumble and caps dead time near 36s at the six-seat ceiling, 12s
 * at the two-seat one — both measured against system-action COUNTS
 * (rounds plus the opening draw), the same unit the 1800ms figures above
 * use throughout, never rounds alone.
 *
 * OMITTING THIS FIELD IS A DIFFERENT ANSWER FROM DECLARING `0` — see
 * `GameModuleRegistration.systemActionPauseMs`'s own docstring
 * (`platform-core/registry.ts`): omitting means "no opinion, keep the
 * room's 1800ms"; `0` means "do not pause at all". This registration has an
 * opinion, so — like Generala's — it states it rather than leaving the
 * accessor to answer on its behalf.
 */
const MENTIROSO_SYSTEM_ACTION_PAUSE_MS = 1200;

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
    /**
     * THE FIRST GAME THAT PACES ITSELF, and the first one whose system action
     * is not a deal but a THROW.
     *
     * `requestSystemAction` is the same pairing escoba's and the solitaire's
     * entries above already carry, and here it is the entire game's supply of
     * randomness: `applyAction` is pinned pure by an executed conformance test
     * and receives no `rng` at all, so a roll cannot be materialized inside it.
     * Every Generala turn begins in `awaiting-roll`, a phase in which NO seat
     * has a legal action — which is exactly the condition
     * `MatchRoom.runAdvanceOnce` reads as its cue to ask this registry for a
     * system action. An entry registered without the pairing would seat both
     * players and then sit in front of a cup nobody in the process is able to
     * shake.
     *
     * `systemActionPauseMs` is the member NO OTHER ENTRY declares, and the
     * reason is arithmetic rather than taste — see the constant's own comment.
     * It is declared HERE, on the registration, rather than by changing
     * `index.ts`'s `handEndPauseMs`: that scalar is the ROOM's default beat and
     * it keeps both its name and its meaning, so truco, escoba and the
     * solitaire are unaffected by construction rather than by migration.
     *
     * No consult hooks, and that is a decision rather than an omission.
     * Generala has no señas, no partner and nothing a seat could usefully be
     * asked; the module registers no consult provider and its bot tiers declare
     * no `answer` parameter at all. `createGameModuleRegistry`'s own
     * fail-closed defaults already answer correctly for an entry that supplies
     * none of them.
     */
    {
      module: generalaModule,
      requestSystemAction: requestGeneralaSystemAction as SystemActionRequester,
      systemActionPauseMs: GENERALA_SYSTEM_ACTION_PAUSE_MS,
    },
    /**
     * THE THREE MENTIROSO REGISTRATIONS (SDD `mentiroso`, task 6.1) — three
     * separate `GameId`s over the ONE shared `requestMentirosoSystemAction`
     * requester (`mentiroso-module/src/roll.ts`), the same seat-count-generic
     * shape `mentirosoModule`/`mentirosoModule4`/`mentirosoModule6` already
     * share for every other member (`applyAction`, `getLegalActions`,
     * `getViewFor`, `getOutcome`) — nothing here branches on seat count
     * either.
     *
     * `requestSystemAction` pairs the same way Generala's own entry does:
     * every mentiroso match begins in `opening-draw`, a phase in which no
     * seat has a legal action at all (`legal-actions.ts` offers nothing
     * outside `bidding`) — exactly the condition `MatchRoom.runAdvanceOnce`
     * reads as its cue to ask this registry for a system action. Without
     * this pairing a fresh table would seat every player and then sit in
     * front of a cup nobody in the process is able to shake.
     *
     * `systemActionPauseMs` is declared on all three, identically —
     * see `MENTIROSO_SYSTEM_ACTION_PAUSE_MS`'s own comment for the
     * measurement.
     *
     * No consult hooks, the same decision Generala's own entry states:
     * mentiroso registers no partner and nothing a seat could usefully be
     * asked (design's own Data Flow diagram has no `answer` arrow), so the
     * fail-closed defaults already answer correctly for the three entries
     * that supply none of them.
     */
    {
      module: mentirosoModule,
      requestSystemAction: requestMentirosoSystemAction as SystemActionRequester,
      systemActionPauseMs: MENTIROSO_SYSTEM_ACTION_PAUSE_MS,
    },
    {
      module: mentirosoModule4,
      requestSystemAction: requestMentirosoSystemAction as SystemActionRequester,
      systemActionPauseMs: MENTIROSO_SYSTEM_ACTION_PAUSE_MS,
    },
    {
      module: mentirosoModule6,
      requestSystemAction: requestMentirosoSystemAction as SystemActionRequester,
      systemActionPauseMs: MENTIROSO_SYSTEM_ACTION_PAUSE_MS,
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
