import type { BotTier, GameId, GameModule, JsonValue, PlayerId, RandomSource } from "@hexdev/platform-contract";

/** What every conformant `TAction` structurally carries (`GameModule`'s
 * bound) — kept as the registry's erased action shape instead of `unknown`
 * so a transport can read `action.playerId` for ANY game, no duck-typing. */
type ActorTaggedAction = { readonly playerId: PlayerId };

/**
 * Materializes a system action ("nobody can act, but the match must
 * advance" — truco's `start-hand` and its dealt cards) from opaque state
 * and a server-owned entropy source, or `null` when no system action is
 * currently needed. Deliberately NOT a `GameModule` port member (the port
 * stays free of anything only a transport-driven advance loop needs) —
 * paired with its module HERE instead, supplied by the same package that
 * supplies the module (design decision, apply-progress system-action note). */
export type SystemActionRequester = (state: unknown, rng: RandomSource) => ActorTaggedAction | null;

/**
 * Classifies a SPECIFIC action as "non-blocking": legal any time (not
 * turn-gated) and safe for the driving loop to skip auto-taking on a bot's
 * behalf when it is the ONLY thing that bot has legal (`truco-module`'s own
 * `send-sena`, paired here — never a `platform-contract` port member, same
 * convention as `SystemActionRequester`). Closes a REAL, reproduced
 * deadlock: `transport-colyseus`'s `MatchRoom.findActingBot` used to treat
 * "this bot has ANY legal action" as "this bot must act now" — but a seña
 * is legal continuously, for any player with a teammate, independent of
 * whose real turn it is. A bot whose ONLY legal action was `send-sena`
 * (because it genuinely was not that bot's turn for anything else) kept
 * getting auto-driven forever, starving the actual pending decision
 * (`respond-truco`/`respond-envido`) from ever being reached — reproduced
 * with a real 2v2 bot-vs-bot simulation that never converged in 2000 steps.
 * `MatchRoom` itself must never hardcode "send-sena" (design's own
 * game-agnostic-transport rule) — this classifier is the generic seam that
 * lets it ask "is this specific action safe to skip" without knowing what
 * the action even is.
 */
export type NonBlockingActionClassifier = (action: unknown) => boolean;

/**
 * Classifies an action as one a BOT must not take on its own initiative
 * while a human seat is being offered the same decision.
 *
 * THE CASE IT EXISTS FOR, reported from real 2v2 play: when the opposing
 * team calls, truco's engine deliberately offers the response to BOTH
 * members of the answering team — either partner may say quiero. A bot
 * partner therefore had the answer legal at the same instant its human
 * teammate did, and `MatchRoom` picks the first bot with a blocking action,
 * so the bot always won the race. The human never got to decide anything
 * their partner could decide first: "el bot compañero canta y responde muy
 * rápido las cosas, debería dejar que responda el jugador (humano), como
 * prioridad".
 *
 * WHY THIS IS A CLASSIFIER AND NOT A RULE IN THE TRANSPORT. The obvious
 * general rule — "a bot waits whenever a human has a blocking action" —
 * DEADLOCKS truco outright, and measurably so: `call-truco` is legal for
 * every player for as long as nobody has called, so a human seat almost
 * always has a blocking action and no bot would ever move again. What is
 * actually shared is a specific KIND of decision (answering a pending
 * call), which only the game knows how to recognise. Same seam, same
 * reason, and the same pairing convention as `NonBlockingActionClassifier`
 * above.
 *
 * IT CANNOT STALL A MATCH. Deferring is only ever chosen when a human is
 * being offered that decision — which is exactly the condition under which
 * `MatchRoom` has already armed that seat's turn clock. If the human never
 * answers, the clock expires and the existing takeover plays the seat's
 * move. The bot yields the first word, not the last one.
 */
export type HumanPriorityActionClassifier = (action: unknown) => boolean;

/**
 * Answers a player's question about a decision they are facing, privately.
 *
 * WHY IT IS A HOOK AND NOT A PORT MEMBER, same reasoning as the two above:
 * the answer needs three things that live in three different places, and only
 * a module holds all of them. The ENGINE knows who a player's partner is and
 * what that partner is holding, but is a pure reducer and has no business
 * inventing judgement. The TRANSPORT knows which seats are bots, but has no
 * team concept at all and must not grow one (`SeatAssignment` is team-free on
 * purpose). The MODULE has the engine AND `createBot`, so it can ask the
 * partner's own strategy what it would do and hand back that answer.
 *
 * The RESULT IS PRIVATE, which is the whole point: `MatchRoom` sends it to
 * the asking client alone and never broadcasts it. What everyone else sees is
 * only the cost — in truco the question spends a seña, and that counter is
 * ordinary public state.
 *
 * `null` for "there is nobody to ask, or nothing to ask about". The game's own
 * rules will have refused the action already in both cases; this is the belt
 * to that suspenders, and it is why an unregistered game answers null rather
 * than throwing.
 */
export type ConsultAdviceProvider = (
  state: unknown,
  playerId: PlayerId,
  tier: BotTier,
  /** WHAT was asked, carried on the question the player actually sent. A game
   * whose consult opens more than one window needs it: inferring the subject
   * from the state can only ever pick one when two are open at once. Optional
   * so a game with a single window never has to name it. */
  about?: string,
) => Promise<JsonValue | null>;

/**
 * "Is this the action that BUYS an answer?" — the one thing a transport needs
 * to know in order to hand a bot what it just paid for.
 *
 * A human asks over a channel of its own (`MatchRoom.handleConsult` is a
 * distinct client message), so the room knows a question was asked because of
 * WHERE it arrived. A bot has no channel: its question comes back from
 * `chooseAction` as an ordinary action, indistinguishable from a card play
 * unless the game says otherwise. This is the game saying otherwise.
 *
 * IT MUST BE ASKED, never assumed. Resolving advice after every bot action
 * and handing it over would give a bot answers it never paid for — the exact
 * cheat the whole `BotStrategy` shape exists to make unrepresentable. Fails
 * closed to `false` for the same reason every classifier here does: a game
 * that registers none has no paid questions, so no bot of its ever receives
 * anything.
 */
export type PaidQuestionClassifier = (action: unknown) => boolean;

/** Either a bare `GameModule` (no system-action factory — the common case
 * for a game whose players can always act) or a module paired with its
 * optional `requestSystemAction`/`isNonBlockingAction`. Both forms resolve
 * identically via `get`. */
export type GameModuleRegistration =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | GameModule<any, any, any, any>
  | {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      readonly module: GameModule<any, any, any, any>;
      readonly requestSystemAction?: SystemActionRequester;
      readonly isNonBlockingAction?: NonBlockingActionClassifier;
      readonly isHumanPriorityAction?: HumanPriorityActionClassifier;
      readonly getConsultAdvice?: ConsultAdviceProvider;
      readonly isPaidQuestion?: PaidQuestionClassifier;
    };

/**
 * Maps a stable `GameId` to the `GameModule` implementing it — the one
 * seam a generic transport is allowed to know about a specific game: its
 * id. `TState`/`TView`/`TConfig` stay erased to `unknown` on purpose: the
 * whole point of a registry is to hold heterogeneous games behind one
 * uniform shape, the same way `GameModule.applyAction` already treats a
 * client message as opaque data until the module itself interprets it.
 */
export interface GameModuleRegistry {
  get(gameId: GameId): GameModule<unknown, ActorTaggedAction, unknown, unknown> | undefined;
  /** `null` when nothing is registered for `gameId`, OR the registered
   * module has no `requestSystemAction`, OR the module itself decides no
   * system action is currently needed — all three fail closed identically. */
  getSystemAction(gameId: GameId, state: unknown, rng: RandomSource): ActorTaggedAction | null;
  /** `false` (every action blocks — the safe, conservative default) when
   * nothing is registered for `gameId` OR the registered module supplied no
   * classifier at all. */
  isNonBlockingAction(gameId: GameId, action: unknown): boolean;
  /** `false` (a bot may take it — the previous behaviour, unchanged for any
   * game that registers no classifier) when nothing is registered for
   * `gameId` OR the registered module supplied none. */
  isHumanPriorityAction(gameId: GameId, action: unknown): boolean;
  /** `null` when nothing is registered for `gameId`, OR the module supplied no
   * provider, OR the game itself has no answer — all three fail closed the
   * same way, exactly like `getSystemAction` above. */
  getConsultAdvice(gameId: GameId, state: unknown, playerId: PlayerId, tier: BotTier, about?: string): Promise<JsonValue | null>;
  /** `false` (this action buys nothing, so a bot taking it is owed no answer)
   * when nothing is registered for `gameId` OR the module supplied no
   * classifier — the same fail-closed shape as the two above. */
  isPaidQuestion(gameId: GameId, action: unknown): boolean;
}

// See the erasure note above: registering a `GameModule<TState,...>` for a
// concrete game into a heterogeneous registry needs a type-parameter-erasing
// boundary somewhere, and this is that one deliberate, documented spot.
export function createGameModuleRegistry(modules: readonly GameModuleRegistration[]): GameModuleRegistry {
  const entries = modules.map((registration) => ("module" in registration ? registration : { module: registration }));
  for (const { module } of entries) {
    // Fail loud at composition time, naming the module: `metadata.seatCount`
    // is consumed downstream by BOTH transports (`MatchRoom.onCreate` sizes
    // its seats from it; `PresenceRoom` forms matchmaking groups of it, and
    // `MatchmakingPool.tryPairSeats` rejects any seatCount that is not an
    // integer >= 2), so an invalid value here would otherwise only surface
    // at runtime — as an unhandled rejection out of a lobby join, on every
    // single join attempt for that game.
    if (!Number.isInteger(module.metadata.seatCount) || module.metadata.seatCount < 2) {
      throw new Error(
        `createGameModuleRegistry: module "${module.id}" declares metadata.seatCount ${String(module.metadata.seatCount)} — must be an integer >= 2, a group that size can never form a match`,
      );
    }
  }
  const byId = new Map(entries.map((entry) => [entry.module.id, entry]));
  return {
    get: (gameId) => byId.get(gameId)?.module,
    getSystemAction: (gameId, state, rng) => byId.get(gameId)?.requestSystemAction?.(state, rng) ?? null,
    isNonBlockingAction: (gameId, action) => byId.get(gameId)?.isNonBlockingAction?.(action) ?? false,
    isHumanPriorityAction: (gameId, action) => byId.get(gameId)?.isHumanPriorityAction?.(action) ?? false,
    getConsultAdvice: async (gameId, state, playerId, tier, about) => (await byId.get(gameId)?.getConsultAdvice?.(state, playerId, tier, about)) ?? null,
    isPaidQuestion: (gameId, action) => byId.get(gameId)?.isPaidQuestion?.(action) ?? false,
  };
}
