import { CloseCode, Room, ServerError, type AuthContext, type Client } from "@colyseus/core";
import type { BotStrategy, BotTier, GameId, GameModule, JsonValue, MatchOutcome, PlayerId, RandomSource, SeatAssignment } from "@hexdev/platform-contract";
import type { GameModuleRegistry, JtiReplayGuard, RateLimiter, SessionTokenVerifier, TenantRepository } from "@hexdev/platform-core";

/** Everything `onAuth` needs to verify a join, injected per-room instead of
 * imported directly: `transport-colyseus` must not know HOW tokens are
 * signed or tenants are stored, only that it can ask.
 *
 * `verifier` is deliberately typed `SessionTokenVerifier`, not the wider
 * `SessionTokenIssuer` — `onAuth` never mints, only verifies (see
 * `tenant-auth.ts`'s own docstring on `createSessionTokenVerifier`: this
 * field is the concrete place that construction's "cannot mint" property is
 * actually wired into the running system, not merely proven in a unit
 * test). `apps/server`'s composition root passes a real verify-only object
 * here today. */
export interface MatchRoomAuthOptions {
  readonly verifier: SessionTokenVerifier;
  readonly repository: TenantRepository;
  readonly replayGuard: JtiReplayGuard;
  /** Per-IP join throttle (hardening, obs 2945: room join had no rate
   * limiting at all). Checked BEFORE token verification, so even a flood of
   * token-less connection attempts from one address is bounded. */
  readonly joinRateLimiter: RateLimiter;
  /**
   * THE FIX for a real bug found running a genuine browser join, not
   * assumed: this used to be `tenant.allowedOrigins.includes(origin)` — but
   * the WebSocket handshake this room's `onAuth` sees is opened by code
   * running INSIDE the widget's own iframe, whose origin is ALWAYS this
   * server's own widget origin, NEVER the tenant's host page origin (that
   * page never opens the socket at all — only `/embed`'s HTTP navigation,
   * already correctly checked at mint time via `referer-origin.ts`, sees
   * it). Comparing the WS origin against `tenant.allowedOrigins` therefore
   * could never succeed for ANY real tenant — every real multiplayer join
   * failed with "origin not allowed", invisible to every prior test because
   * they all hand-constructed the `AuthContext.headers` directly with
   * whatever origin the assertion wanted, never through an actual browser.
   * Re-validating against the SERVER's OWN known widget origin(s) instead
   * still defends against a raw hand-rolled WebSocket client asserting an
   * arbitrary or absent origin (the bar the spec's "re-validate at
   * room-join time" requirement is actually able to raise here) — it does
   * NOT, and never could, distinguish "this tenant" from "that tenant",
   * since by the time a request reaches this room, that distinction no
   * longer lives in the transport-level origin at all.
   */
  readonly allowedWidgetOrigins: readonly string[];
}

export interface MatchRoomCreateOptions {
  readonly gameId: GameId;
  readonly config: unknown;
  readonly registry: GameModuleRegistry;
  readonly auth: MatchRoomAuthOptions;
  /** The server-owned entropy source for this room's system actions (design
   * §4: "the engine never randomizes" — this is where randomness enters).
   * `apps/server` supplies a real CSPRNG; tests supply a fixed source. */
  readonly rng: RandomSource;
  /** Bot-fill mode (spec: "Single-Player vs Bot Mode", generalized to N
   * seats for 2v2 — obs 2927/2925's own named gap): when present, every seat
   * from the LAST one down to (but excluding) `humanSeatsNeeded` is filled
   * with a bot controller of this tier BEFORE any human joins, and
   * `maxClients` shrinks to exactly the remaining human seat(s) — the match
   * starts the moment they ALL fill, with no lobby wait (design §9: bot
   * substitution is a seat-controller concept, not a second code path; this
   * is the same mechanism a disconnect-takeover mutates later). For a 2-seat
   * module with the default `humanSeatsNeeded` (1), this is byte-identical
   * to the original single-player behavior: exactly one bot, the last seat. */
  readonly botTier?: BotTier;
  /** How many of `metadata.seatCount` seats are real clients, the rest bot-
   * filled — defaults to 1 (single-player vs bot, unchanged 1v1 behavior).
   * A 2v2 "play vs bots" entry point passes 1 here too (3 bot seats); a
   * future "2 real players vs 2 bots" entry point would pass 2. Only
   * consulted when `botTier` is also present.
   *
   * VALIDATED IN `onCreate` as an integer `1 <= n <= metadata.seatCount`,
   * and refused before any controller exists — this is not one of the four
   * keys `createMatchServer`'s `defaultOptions` merges OVER the client's
   * (`server.ts`), so it is whatever the room request carried.
   * `degradeLongWaits`, the only server-side producer, returns
   * early for `seatCount <= 2` and otherwise passes `1 <= k < seatCount`,
   * so every value it can produce is already inside that range. */
  readonly humanSeatsNeeded?: number;
  /** Reconnection window (spec: "Disconnect, Reconnection Window, and Bot
   * Takeover"; design open question resolved to 30s, obs 2919/2921). */
  readonly reconnectionWindowSeconds?: number;
  /**
   * How long the table sits still after a hand ends, before the next one is
   * dealt.
   *
   * Reported from real play: "cuando se tira la ultima carta de la ronda no
   * hay tiempo de verla, enseguida desaparece y se vuelve a repartir". There
   * was no pause at all -- the moment no seat could act, the system action
   * dealt again, so the winning card and the hand's own outcome went past in
   * the same broadcast burst that replaced them.
   *
   * A room-level option rather than a constant because every test that plays
   * a hand to its end would otherwise wait it out: the suites pass 0, and
   * only a real server pays it.
   */
  readonly handEndPauseMs?: number;
  /** The tier a takeover bot uses once the window expires (obs 2919: decided
   * as "normal" — easy would hand the match to the remaining player, hard
   * would punish them for a network drop that was never their fault). */
  readonly takeoverTier?: BotTier;
  /**
   * Per-turn time limit: how long a HUMAN seat may sit on a turn before a bot
   * resolves that ONE turn for it (repo owner's decision — chosen over a full
   * bot takeover and over escalating after N timeouts, because someone who
   * looked away for a single turn should not lose their seat).
   *
   * A configurable DURATION, deliberately the same shape as
   * `reconnectionWindowSeconds` above rather than an injected clock port: the
   * room has never needed one, and tests make this fast by passing a tiny
   * value exactly the way the reconnection tests already pass `0.01`.
   */
  readonly turnTimeoutSeconds?: number;
}

const DEFAULT_RECONNECTION_WINDOW_SECONDS = 30;
const DEFAULT_TAKEOVER_TIER: BotTier = "normal";
/** "~1 minute per turn" (repo owner). Long enough that a thinking player is
 * never rushed, short enough that a table is never held hostage. */
const DEFAULT_TURN_TIMEOUT_SECONDS = 60;

interface MatchRoomJoinOptions {
  readonly token?: string;
}

/** What `onAuth` resolves and colyseus attaches to `client.auth` — the
 * ONLY source `onJoin` trusts for identity. Never `options.playerId`. */
interface MatchRoomAuth {
  readonly playerId: PlayerId;
}

/** The erased action shape every conformant `GameModule` requires
 * structurally (`platform-contract`'s `TAction extends {playerId}` bound) —
 * named here so `MatchRoom`'s own generic-registry field, the bot strategy
 * field, and every call site agree on one shape instead of repeating it. */
type ErasedAction = { readonly playerId: PlayerId };

/**
 * "Who drives this seat when there is no person behind it?" (design §9) —
 * a seat is EITHER a live client OR a bot strategy, and swapping which one
 * never touches `matchState`. Single-player mode populates a `bot` entry at
 * `onCreate`; disconnect-takeover mutates a `human` entry into a `bot` one
 * later — the SAME map, the SAME two variants, never a second turn loop.
 */
type Controller =
  | { readonly kind: "human"; readonly playerId: PlayerId; readonly client: Client }
  | { readonly kind: "bot"; readonly playerId: PlayerId; readonly strategy: BotStrategy<unknown, ErasedAction> };

/** A bot's own `chooseAction` budget — no strategy in this codebase reads it
 * today (`truco-bot`'s tiers ignore it; `withThinkingDelay` enforces its own
 * ~1s pause independently, design §9), kept as a real, named constant rather
 * than a magic number at each call site. */
const BOT_BUDGET_MS = 1000;

/** A live human teammate's whole answer window (design D1) — never longer,
 * even with a long turn clock: a silent partner has, in practice, declined. */
const CONSULT_CAP_MS = 30_000;

/** An open question to a live human teammate (design D1/D7). `id` is the
 * resolve-once guard `resolveConsult` checks: the field itself IS the
 * guard, no `await` between check and clear (same argument as `advanceChain`). */
interface PendingConsult {
  readonly id: number;
  readonly askerSeat: number;
  readonly askerPlayerId: PlayerId;
  readonly partnerSeat: number;
  readonly about: string | undefined;
  readonly options: readonly JsonValue[];
  readonly deadline: number;
  readonly timer: ReturnType<typeof setTimeout> | undefined;
}

/** Reads a claimed actor identity off an otherwise-opaque action arriving
 * over the wire as `unknown`. FORMERLY relied on an unenforced convention
 * (flagged in obs 2941); `platform-contract`'s `GameModule<TState, TAction
 * extends {playerId}, ...>` bound now makes `playerId` a COMPILE-TIME
 * requirement of every conformant module's action type, so this runtime
 * check is only doing the wire-boundary job (untrusted JSON has no static
 * type) — not compensating for a missing port guarantee. A malformed or
 * absent field returns `undefined`, which the caller treats as a mismatch:
 * fails closed, never open. */
function actorOf(action: unknown): PlayerId | undefined {
  if (typeof action !== "object" || action === null || !("playerId" in action)) {
    return undefined;
  }
  const claimed = (action as { playerId: unknown }).playerId;
  return typeof claimed === "string" ? (claimed as PlayerId) : undefined;
}

/**
 * The one room every game shares. It holds zero game-specific knowledge:
 * every legality check and every redaction decision is delegated to the
 * `GameModule` looked up from the registry by `gameId`. There is
 * deliberately no `TrucoRoom` — if this room ever needed a truco-specific
 * fact to function, the `GameModule` port would be wrong (design §5).
 *
 * DELIBERATE CHOICE — no Colyseus `state`/`StateView`: `StateView` requires
 * `@colyseus/schema` classes with a `@view()` decorator per field, which
 * would force this room to know each game's shape ahead of time — exactly
 * the coupling the generic-room requirement forbids. `TState`/`TView` here
 * are opaque JSON a module produces; per-client redaction instead pushes
 * `client.send("view", module.getViewFor(state, playerId))` after every
 * mutation — the identical guarantee (a client only ever receives its own
 * view), with no Schema/StateView machinery and no per-game room subclass.
 */
/** An erased action's own `type`, if it has one. The transport never knows a
 * game's action shape -- it only ever compares like with like. */
/** The `about` a game's own question carries, when it carries one. Opaque to
 * the transport: it only ever hands it back to the game that issued it. */
function subjectOf(action: unknown): string | undefined {
  if (typeof action !== "object" || action === null) return undefined;
  const about = (action as { about?: unknown }).about;
  return typeof about === "string" ? about : undefined;
}

/** The `answer` a `consult-answer` message claims (design D5's wire shape,
 * `{about?, answer}`). Opaque to the transport: `handleConsultAnswer` only
 * ever compares it by strict equality against the open consult's OWN
 * `options`, never inspects or interprets it — the same "hand it back to the
 * game that issued it" posture `subjectOf` already takes for `about`. */
function answerOf(message: unknown): unknown {
  if (typeof message !== "object" || message === null || !("answer" in message)) return undefined;
  return (message as { answer: unknown }).answer;
}

function typeOf(action: unknown): string | undefined {
  if (typeof action !== "object" || action === null) return undefined;
  const type = (action as { type?: unknown }).type;
  return typeof type === "string" ? type : undefined;
}

export class MatchRoom extends Room {
  private module: GameModule<unknown, ErasedAction, unknown, unknown> | undefined;
  private config: unknown;
  private matchState: unknown;
  private auth: MatchRoomAuthOptions | undefined;
  private registry: GameModuleRegistry | undefined;
  private gameId: GameId | undefined;
  private rng: RandomSource | undefined;
  private reconnectionWindowSeconds = DEFAULT_RECONNECTION_WINDOW_SECONDS;
  private takeoverTier: BotTier = DEFAULT_TAKEOVER_TIER;
  /** The tier this room's own bots play at, kept because a consult has to be
   * answered by the partner AT THE STRENGTH THEY ACTUALLY PLAY. Advice from a
   * tier the partner is not is worse than no advice: it would recommend a
   * move the partner was never going to make. Falls back to the takeover tier
   * when the room seats no bots of its own, which is also the only case where
   * a bot partner can appear later. */
  private botTier: BotTier = DEFAULT_TAKEOVER_TIER;
  private turnTimeoutSeconds = DEFAULT_TURN_TIMEOUT_SECONDS;
  /** See `MatchRoomCreateOptions.handEndPauseMs`. */
  private handEndPauseMs = 0;
  private turnTimer: ReturnType<typeof setTimeout> | undefined;
  /**
   * The absolute instant the seat currently on the clock runs out — computed
   * ONCE when the timer is armed and then read by `viewMessageFor`, so every
   * client is handed the identical number rather than a per-client remaining
   * count each would have to reconcile against its own idea of "now". An
   * absolute instant is also the only shape a client can count down from
   * locally: a per-second server tick would be per-match-per-second traffic
   * for a number the client can derive itself.
   */
  private turnDeadline: number | null = null;
  /** Which seat that deadline belongs to — the key that decides whether a
   * broadcast re-arms the clock (a genuinely new turn) or leaves it alone. */
  private turnTimerSeat: number | undefined;
  /** The one open consult, or none (design D1). */
  private pendingConsult: PendingConsult | null = null;
  /** Resolve-token source; never reused, so a stale deferred fallback can
   * never resolve a LATER consult it was never asked about. */
  private consultSeq = 0;
  /** Built lazily and reused: a `BotStrategy` is stateless (it is handed the
   * view and the legal actions on every call), so one instance can resolve a
   * timed-out turn for any seat. */
  private timeoutBot: BotStrategy<unknown, ErasedAction> | undefined;
  private readonly controllers = new Map<number, Controller>();
  /**
   * What a bot BOUGHT, held from the question to its very next decision.
   *
   * A human's answer goes out on their own socket (`handleConsult` below). A
   * bot has no socket and only three inputs, so before this the transport had
   * nowhere to put one: a bot could spend the action, pay the price, and
   * learn nothing — strictly worse than not asking, which is why no tier ever
   * asked.
   *
   * SET ONLY AFTER A PAID QUESTION, and cleared by anything else that bot
   * does. That is what keeps it from becoming a standing feed of the
   * partner's hand: the answer exists for exactly one decision, the one
   * immediately after the question it paid for. `has` vs `get` is
   * load-bearing — a present `null` means "asked, no answer came", which a
   * strategy must be able to tell from "never asked" so it does not spend a
   * second seña on the same question.
   */
  private readonly boughtAnswers = new Map<PlayerId, JsonValue | null>();
  /**
   * The serialization boundary for `advance()` (closes the disclosed
   * overlap debt, apply-progress obs 2927/2925). Every external trigger —
   * `handleAction`, the seat-fill in `onJoin`, `takeOverSeat` — chains onto
   * this promise instead of calling the stepping logic directly. Always
   * settled (never left rejected): `advance()` below always replaces it
   * with a `.catch()`-guarded link, so a later caller's `.then()` is never
   * attached to a promise that will reject.
   */
  private advanceChain: Promise<void> = Promise.resolve();
  /**
   * Set once, at disposal, and never cleared — the room is gone from here on.
   * Colyseus gives `onDispose` exactly ONE synchronous moment, but this room
   * has work that comes BACK after it: a timed-out turn's bot is mid-decision
   * (production wraps every truco strategy in `withThinkingDelay`'s ~1s pause,
   * so that gap is a real second, not a microtask), and an in-flight
   * `advance()` still has its own decision to return from. Both resume into
   * `broadcastViews`, which is why clearing the timer at disposal could never
   * be enough on its own: there was nothing armed to clear at that instant,
   * and the re-arm happens afterwards.
   */
  private disposed = false;

  override onCreate(options: MatchRoomCreateOptions): void {
    const module = options.registry.get(options.gameId);
    if (module === undefined) {
      throw new Error(`MatchRoom: no GameModule registered for gameId "${options.gameId}"`);
    }
    this.module = module;
    this.config = options.config;
    this.auth = options.auth;
    this.registry = options.registry;
    this.gameId = options.gameId;
    this.rng = options.rng;
    this.handEndPauseMs = options.handEndPauseMs ?? 0;
    this.reconnectionWindowSeconds = options.reconnectionWindowSeconds ?? DEFAULT_RECONNECTION_WINDOW_SECONDS;
    this.takeoverTier = options.takeoverTier ?? DEFAULT_TAKEOVER_TIER;
    this.botTier = options.botTier ?? this.takeoverTier;
    this.turnTimeoutSeconds = options.turnTimeoutSeconds ?? DEFAULT_TURN_TIMEOUT_SECONDS;
    // Fail loud at room creation, before a single controller exists, the same
    // discipline as the unknown-gameId throw above and as
    // `createGameModuleRegistry`'s own `seatCount` guard.
    //
    // WHAT AN UNVALIDATED VALUE COSTS: `humanSeatsNeeded` is not one of the
    // four keys `createMatchServer`'s `defaultOptions` merges OVER the
    // client's (`server.ts`), so it arrives from whoever asked for the
    // room. At 0 the loop below fills EVERY seat with a bot and
    // `maxClients` lands on 0 — a room that holds a whole match between bots
    // and that no client can ever join. Above `seatCount` it silently
    // reserves seats the module does not have. A non-integer is worse than
    // either: `seat >= 2.5` is a perfectly good loop condition, so the room
    // starts on a seat split nobody wrote down.
    //
    // CHECKED EVEN WHEN `botTier` IS ABSENT, deliberately. The value is only
    // CONSULTED below, inside the bot branch — but a caller that sends a
    // nonsense number is wrong about this room either way, and a guard that
    // only fires in one branch would be a guard whose coverage depends on an
    // unrelated option. Refusing on shape costs nothing and cannot drift.
    if (options.humanSeatsNeeded !== undefined && (!Number.isInteger(options.humanSeatsNeeded) || options.humanSeatsNeeded < 1 || options.humanSeatsNeeded > module.metadata.seatCount)) {
      throw new Error(
        `MatchRoom: humanSeatsNeeded ${String(options.humanSeatsNeeded)} is out of range for gameId "${options.gameId}" — must be an integer between 1 and metadata.seatCount (${String(module.metadata.seatCount)})`,
      );
    }
    // `createBot` is OPTIONAL on the port, and its absence is what a game
    // with no opponent looks like from here. Nothing is pre-seated for such a
    // module and NOTHING THROWS: `botTier` is a request a client can send for
    // any room, and answering "this game has no opponent to give you" by
    // refusing the room would be refusing the game itself. The room simply
    // opens with every seat left for a person — for a one-seat module that is
    // `maxClients` 1, which is the whole of single-player.
    const createBot = module.createBot;
    if (options.botTier !== undefined && createBot !== undefined) {
      // Unguessable on purpose: `/embed?p=` is client-suppliable (design
      // §7), so a fixed or predictable bot id would be an identity a client
      // could pre-claim a token for. A fresh random UUID, generated only
      // once this room exists, never can be.
      //
      // Fills every seat from the LAST down to (not including) the human
      // seats reserved at the front — `humanSeatsNeeded` defaults to 1, so a
      // 2-seat module (1v1) fills exactly seat 1, unchanged from before this
      // was generalized. A 4-seat module (2v2) with the same default fills
      // seats 1, 2, and 3, leaving only seat 0 for the real player.
      const humanSeatsNeeded = options.humanSeatsNeeded ?? 1;
      for (let seat = module.metadata.seatCount - 1; seat >= humanSeatsNeeded; seat -= 1) {
        this.controllers.set(seat, { kind: "bot", playerId: crypto.randomUUID() as PlayerId, strategy: createBot(options.botTier) });
      }
    }
    this.maxClients = module.metadata.seatCount - this.controllers.size;
    this.onMessage("action", (client, message: unknown) => this.handleAction(client, message));
    // A CONSULT IS AN ORDINARY ACTION plus one private reply, which is why it
    // arrives on a channel of its own rather than as a flag on "action". The
    // room stays game-agnostic either way: it never inspects the payload, it
    // only knows that a message on THIS channel is one whose sender is owed
    // an answer. Everything else — whether the action is legal, what it
    // costs, what the answer is — belongs to the module.
    this.onMessage("consult", (client, message: unknown) => this.handleConsult(client, message));
    // The one real trust boundary this room enforces (design D4): a reply on
    // this channel is believed only after `handleConsultAnswer`'s four
    // guards pass, never on the strength of anything the client claims.
    this.onMessage("consult-answer", (client, message: unknown) => this.handleConsultAnswer(client, message));
    this.onMessage("quit", (client) => {
      this.handleQuit(client);
    });
  }

  /**
   * The join-time authentication gate (spec: origin allowlist + entitlement
   * catalog, BOTH server-enforced; design §7's token flow). Runs BEFORE
   * `onJoin`; colyseus attaches whatever this returns to `client.auth`,
   * which `onJoin` below treats as the ONLY source of the joining player's
   * identity — `options.playerId` no longer exists on the wire at all.
   * Every rejection throws (colyseus turns a thrown `onAuth` into a denied
   * connection) and is fail-closed: an unresolvable tenant, an origin
   * mismatch, and a missing entitlement all reject identically to a bad
   * signature, so a client cannot distinguish WHY a join failed.
   */
  override async onAuth(_client: Client, options: MatchRoomJoinOptions, context: AuthContext): Promise<MatchRoomAuth> {
    const module = this.module;
    const auth = this.auth;
    if (module === undefined || auth === undefined) {
      throw new Error("MatchRoom: onAuth called before onCreate registered a module");
    }
    const ip = Array.isArray(context.ip) ? context.ip[0] : context.ip;
    if (ip !== undefined && !(await auth.joinRateLimiter.tryConsume(ip))) {
      throw new Error("MatchRoom: join rejected, too many join attempts from this address");
    }
    if (typeof options.token !== "string") {
      throw new Error("MatchRoom: join rejected, no session token presented");
    }
    const claims = await auth.verifier.verify(options.token);
    if (claims === undefined) {
      throw new Error("MatchRoom: join rejected, invalid or expired session token");
    }
    // Origin re-validation, spec-mandated and explicitly NOT redundant with
    // the mint-time check: a captured token could be replayed by something
    // other than a genuine browser session running inside our own widget.
    // Checked against `auth.allowedWidgetOrigins` (this server's OWN known
    // origins), NOT `tenant.allowedOrigins` — see `MatchRoomAuthOptions`'s
    // own docstring for why the tenant's page origin is structurally
    // unobservable at this point. `Origin` is spoofable by a hand-rolled WS
    // client — this raises the bar, it is not a cryptographic boundary (see
    // apply-progress security posture).
    const origin = context.headers.get("origin");
    if (origin === null || !auth.allowedWidgetOrigins.includes(origin)) {
      throw new Error("MatchRoom: join rejected, origin not allowed");
    }
    const tenant = await auth.repository.findById(claims.tenantId);
    if (tenant === undefined) {
      throw new Error("MatchRoom: join rejected, unknown tenant");
    }
    if (!tenant.entitledGames.includes(module.id)) {
      throw new Error("MatchRoom: join rejected, tenant is not entitled to this game");
    }
    if (!(await auth.replayGuard.consume(claims.jti))) {
      throw new Error("MatchRoom: join rejected, session token already used");
    }
    return { playerId: claims.playerId };
  }

  override async onJoin(client: Client & { auth?: MatchRoomAuth }): Promise<void> {
    const module = this.module;
    if (module === undefined) {
      throw new Error("MatchRoom: onJoin called before onCreate registered a module");
    }
    const playerId = client.auth?.playerId;
    if (playerId === undefined) {
      throw new Error("MatchRoom: onJoin called without a resolved onAuth identity");
    }
    this.controllers.set(this.freeSeat(module.metadata.seatCount), { kind: "human", playerId, client });
    if (this.controllers.size === module.metadata.seatCount) {
      const seatAssignments: SeatAssignment[] = [...this.controllers.entries()].map(([seat, controller]) => ({ seat, playerId: controller.playerId }));
      this.matchState = module.createMatch(this.config, seatAssignments);
      this.broadcastViews();
      // NOT awaited, and that is the whole point of this line.
      //
      // `@colyseus/core@0.17.46` sends the JOIN_ROOM confirmation — the
      // message that resolves the client's own `join()`/`create()` promise —
      // only AFTER `await this.onJoin(...)` returns (src/Room.ts:1251 and
      // :1293, read in the installed source). Awaiting the chain here
      // therefore held the join open for the entire bot opening: measured at
      // 12 SECONDS for a 2v2-vs-bots match, three bots at a real ~1s
      // `withThinkingDelay` each through a whole envido/truco/retruco chain.
      // The player sat on a loading message and was then dropped into a hand
      // with nine calls already in its log, several of them their own
      // partner's, with the stakes already at vale cuatro.
      //
      // The views were never lost — that same file queues messages sent
      // during `onJoin` and flushes them once the client has joined
      // (src/Room.ts:1694) — which is exactly why the hand arrived all at
      // once instead of unfolding. The bots' thinking delay exists so a
      // player can WATCH them think; awaiting it turned that into a wait.
      //
      // Safe for the same reason `handleAction`'s own fire-and-forget return
      // is: `advance()` never rejects (see its doc comment), and the chain is
      // `.catch()`-guarded, so nothing here can become an unhandled
      // rejection. `onDispose` still returns `advanceChain`, so a room torn
      // down mid-opening waits for it exactly as before.
      void this.advance();
    }
  }

  /** The lowest seat index not already occupied by a bot (from `onCreate`)
   * or an earlier human join — human seats fill in join order around
   * whichever seats single-player mode pre-claimed for a bot. */
  private freeSeat(seatCount: number): number {
    for (let seat = 0; seat < seatCount; seat += 1) {
      if (!this.controllers.has(seat)) return seat;
    }
    throw new Error("MatchRoom: onJoin called with no free seat");
  }

  private controllerFor(client: Client): Controller | undefined {
    const seat = this.seatOfClient(client);
    return seat !== undefined ? this.controllers.get(seat) : undefined;
  }

  /** Matches on `sessionId`, never object identity: verified in the
   * installed `@colyseus/core` source that a reconnected client is a NEW
   * `Client` INSTANCE — `allowReconnection` only mutates the OLD instance's
   * `.ref`/`.reconnectionToken` fields, it never makes the two references
   * equal, and every message/hook after a successful reconnect (including
   * `onReconnect` itself) arrives with the new instance. `sessionId` is the
   * one thing colyseus keeps stable across the swap (the reconnection
   * mechanism is keyed by it), so it is what this room correlates on too. */
  private seatOfClient(client: Client): number | undefined {
    for (const [seat, controller] of this.controllers) {
      if (controller.kind === "human" && controller.client.sessionId === client.sessionId) return seat;
    }
    return undefined;
  }

  /**
   * Spec: "Disconnect, Reconnection Window, and Bot Takeover". Colyseus
   * calls this for BOTH a consented leave and an abrupt drop when `onDrop`
   * is not separately defined (verified in the installed source, same
   * discipline as obs 2952) — this room deliberately defines only `onLeave`,
   * so every disconnect gets the SAME reconnection window; there is no
   * "quit" affordance yet that should skip it.
   *
   * `allowReconnection` does NOT re-run `onAuth`: it authenticates the
   * returning socket by requiring the exact random `reconnectionToken`
   * issued to THIS client at join time (verified in `@colyseus/core`'s own
   * source, `Room.mjs` — a per-connection secret generated by `generateId()`
   * server-side, never client-suppliable), not by trusting anything the
   * client re-asserts about its own identity. This is a different mechanism
   * from the `reserveSeatFor(..., authData)` shortcut flagged in obs 2952:
   * that one skips `onAuth` by trusting CALLER-supplied claims; this one
   * skips it by requiring proof of a server-issued bearer secret — the same
   * trust model as a session cookie, not a hole of the same shape.
   */
  override async onLeave(client: Client): Promise<void> {
    const seat = this.seatOfClient(client);
    if (seat === undefined) return;
    try {
      await this.allowReconnection(client, this.reconnectionWindowSeconds);
      // Reconnected within the window: `onReconnect` below is what actually
      // updates this seat's stored client to the new connection.
    } catch (error) {
      // Colyseus rejects a reconnection window on a room that is going away in
      // TWO different shapes, from two different code paths, and BOTH must be
      // matched here. Verified by reading the installed `@colyseus/core@0.17.46`
      // source itself (same discipline as obs 2952) — line numbers below are
      // from that exact version's `src/Room.ts` and `src/MatchMaker.ts`:
      //
      // (a) `allowReconnection()` CALLED on a room that is ALREADY DISPOSING
      //     returns `Promise.reject(new Error("disposing"))` (Room.ts:1345-1347).
      //     A bare `Error`: no subclass, no code, nothing but the message to key
      //     off. This half is therefore an unavoidable STRING CONTRACT with an
      //     external library — if upstream renames that literal, this check goes
      //     silently false and case (a) regresses to taking a seat over
      //     mid-teardown. No compiler will catch that; only the `onLeave` tests
      //     in `match-room.test.ts`, which drive the REAL `Room`, would.
      //
      // (b) a window that was ALREADY OPEN when the room started going away is
      //     rejected down a different path entirely: `_rejectPendingReconnections()`
      //     settles it with `new ServerError(CloseCode.NORMAL_CLOSURE, message)`
      //     (Room.ts:1086-1092). Matched STRUCTURALLY rather than by message,
      //     because here a structural discriminator exists and is strictly
      //     sturdier: `CloseCode.NORMAL_CLOSURE` (1000) is used for exactly ONE
      //     rejection in the whole package — that line — whereas the message is
      //     a caller-supplied parameter with two upstream values already,
      //     `"disconnecting"` from `Room#disconnect()` (Room.ts:1069) and
      //     `"devmode_restart"` from the matchmaker's devMode restart/hot-reload
      //     (MatchMaker.ts:732 and :779). Matching the code covers both plus any
      //     future one; matching the strings would have covered one and left
      //     this same bug open. `instanceof` is safe against pnpm's duplicated
      //     copies because `Room` and `ServerError` are imported from the SAME
      //     `colyseus` specifier in this file, so the class we test against is
      //     by construction the one the base class we extend throws.
      //
      // Deliberately NOT a bare `catch`-and-return: a window EXPIRING for real
      // rejects with a bare `false` (Room.ts:1372) — neither an `Error` nor a
      // `ServerError` — so a genuine expiry still reaches the takeover below,
      // and so does any unrelated failure. This guard is exactly two shapes
      // wide; `onLeave` catches for the disposal race, not to suppress errors.
      //
      // Why either case must skip the takeover: driving a bot against a room
      // that is about to vanish is never useful, and for a module whose legal
      // actions never terminate (this file's OWN test-only fixtures are exactly
      // that shape) it can recurse `advance()` without bound.
      if (error instanceof Error && error.message === "disposing") return;
      if (error instanceof ServerError && error.code === CloseCode.NORMAL_CLOSURE) return;
      this.takeOverSeat(seat);
    }
  }

  /** Two jobs, both necessary: (1) replace the seat's stored `client` with
   * THIS new instance — `seatOfClient` still finds the seat via `sessionId`
   * (stable across the swap), but every send from here on must target the
   * live connection, not the dead one; (2) resend the current view.
   * `MatchRoom` never used Colyseus `state`/`StateView` (design's
   * deliberate choice, see class docstring), so nothing is automatically
   * replayed to a socket that just reattached — without this, a reconnected
   * player would see nothing until the next broadcast, failing the spec's
   * "resume ... with current match state" scenario. */
  override onReconnect(client: Client): void {
    const module = this.module;
    const seat = this.seatOfClient(client);
    const controller = seat !== undefined ? this.controllers.get(seat) : undefined;
    if (module === undefined || this.matchState === undefined || seat === undefined || controller === undefined || controller.kind !== "human") return;
    this.controllers.set(seat, { kind: "human", playerId: controller.playerId, client });
    client.send("view", this.viewMessageFor(module, controller.playerId));
    // Explicit hook (design D3): reconnecting AS the consult's partner
    // re-sends the open ask, rather than leaving it for the cap to expire.
    const pending = this.pendingConsult;
    if (pending !== null && pending.partnerSeat === seat) {
      client.send("consult-ask", { about: pending.about, options: pending.options, deadline: pending.deadline });
    }
  }

  /**
   * "The room mutates one map entry — human -> bot. The game state is
   * untouched" (design §9). The seat's `playerId` is carried over UNCHANGED
   * (never a fresh identity): the engine's own turn/ownership checks and
   * this room's `actorOf` matching both key off it, so swapping only WHO
   * chooses the next action never requires touching `matchState`.
   * `void this.advance()` immediately after is what closes spec 6.4: if the
   * disconnect happened mid pending call, that call is exactly what
   * `getLegalActions` offers this seat next, and the SAME bot-driving loop
   * every seat already goes through (no second rules path) resolves it
   * before any further play — no dedicated "resolve pending call" code path
   * exists, or needs to.
   */
  /**
   * A player who is LEAVING, as distinct from a player who DROPPED.
   *
   * `onLeave` gives every departure the same reconnection window, which is
   * right for a dropped connection and wrong for a decision: the remaining
   * players sit waiting out a window for someone who already walked away.
   * This is the "quit affordance" that docstring names as missing, and the
   * client sends it just before closing its own connection.
   *
   * The seat is taken over IMMEDIATELY, and that is also what makes the
   * disconnect that follows harmless: `seatOfClient` only matches a
   * controller still marked `kind: "human"`, so once the bot holds the seat
   * the closing socket finds nothing in `onLeave` and returns before
   * `allowReconnection` is ever reached. No "who quit" bookkeeping to keep
   * in step with the controllers, and no second path through the window.
   *
   * Deliberately NOT a forfeit DECIDED HERE. Bot takeover is what this room
   * already does for an absent human, and it is the outcome that costs the
   * OTHER players least — a resignation would end their match too, on one
   * person's decision. Whether truco should also offer a real resignation is a
   * rules question for the module, not a transport one — and `takeOverSeat`
   * below is now where that question gets ASKED. A game that answers it ends
   * the match; a game that does not gets the bot, unchanged.
   *
   * ONE CONSEQUENCE WORTH KNOWING before changing either: a quit that the
   * module ANSWERS leaves the seat's controller human, so unlike the bot path
   * above the closing socket does find a seat and does open a window. It costs
   * nothing — the expiry re-enters `takeOverSeat`, which finds a match
   * `getOutcome` already calls over and does nothing at all.
   *
   * Public for the same reason `handleAction` is: `@colyseus/testing` pulls
   * a subdependency this workspace's supply-chain policy blocks, so the
   * message handlers are driven directly in tests.
   */
  handleQuit(client: Client): void {
    const seat = this.seatOfClient(client);
    if (seat === undefined) return; // never seated, or already taken over
    this.takeOverSeat(seat);
  }

  /**
   * THE MODULE IS ASKED FIRST, and the order is the whole decision.
   *
   * Handing the seat to a bot is this room's own answer to "somebody is gone",
   * and it is a good one for a game with an opponent: the table plays on. It
   * is the wrong answer for a game without one, where the same line turns a
   * solitaire into a headless auto-solver — a board being cleared by a bot
   * that nobody will ever see, in a match nobody is playing.
   *
   * `handleQuit`'s own docstring above is what licenses the seam rather than a
   * new rule invented here: quitting is deliberately not a forfeit in this
   * room, because "whether truco should also offer a real resignation is a
   * rules question FOR THE MODULE, not a transport one". So the question is
   * asked of the module, through the registry pairing every other
   * game-specific behaviour already uses, and the bot takeover is what happens
   * when it has no answer.
   *
   * DELIBERATELY NOT `seatCount === 1`, and not `createBot === undefined`
   * either. Both are transport-side guesses at a rules question: the first
   * conflates "has one seat" with "ends when its player leaves", and the
   * second says a game may only end this way if it has nobody to play it. A
   * two-seat game that wants a real resignation registers the provider and
   * gets one; a one-seat game that wants a bot to finish the board can still
   * have that. The transport asks and applies; it never decides.
   */
  private takeOverSeat(seat: number): void {
    const module = this.module;
    const controller = this.controllers.get(seat);
    if (module === undefined || controller === undefined || controller.kind !== "human") return;
    if (this.endMatchOnAbandonedSeat(controller.playerId)) return;
    // THE ONE CASE STILL LEFT OPEN, and it is named rather than hidden: a
    // module with no bot AND no answer of its own leaves the seat exactly as
    // it was — the match sits there with nobody in it. Nothing registers that
    // shape today, and it is now a module's own omission rather than something
    // this room decides on its behalf. What would close it for good is a
    // composition-time guard in `createGameModuleRegistry` ("a module with no
    // `createBot` must say what an abandoned seat means"), which is a separate
    // change with its own fence.
    const createBot = module.createBot;
    if (createBot === undefined) return;
    this.controllers.set(seat, { kind: "bot", playerId: controller.playerId, strategy: createBot(this.takeoverTier) });
    // Explicit hook (design D3): the PARTNER's seat is taken over — resolved
    // right away, marked `from: "fallback"` (never "partner": that would
    // hide that the human is gone), through the SAME queued path the cap
    // uses. Useful, so the asker does not sit out the rest of the window for
    // someone who left; honest, because the mark still says nobody answered.
    const pending = this.pendingConsult;
    if (pending !== null && pending.partnerSeat === seat) this.queueConsultFallback(pending.id);
    void this.advance();
  }

  /**
   * Asks the game what a seat left for good means, applies whatever it is
   * handed through the module's OWN `applyAction`, and then finds out what
   * happened by asking `getOutcome`.
   *
   * TERMINALITY IS DERIVED, NEVER STORED, and never inferred from the fact
   * that a provider answered at all. `getOutcome` is already this room's
   * single authority on "has this match ended" — `runAdvanceOnce`,
   * `armTurnTimer` and `playOneBotActionFor` each ask it rather than remember
   * anything — and reading it here is what keeps a module's answer honest: a
   * game may legitimately answer "this player concedes the current hand" and
   * mean the match should carry on, in which case the seat still needs
   * somebody in it and the ordinary bot takeover is still right.
   *
   * Three separate ways to come away with `false`, all of them meaning "do
   * what you would have done":
   *   - the game registered no provider (truco, escoba: unchanged);
   *   - the provider declined for this state;
   *   - the answer was ILLEGAL for this state, which is no answer at all. A
   *     misbehaving provider must not strand a seat, the same contract
   *     `runAdvanceOnce` already holds for `requestSystemAction`.
   *
   * @returns true when the match is over — either it already was, or the
   * module's answer just ended it. An already-decided match returns true
   * WITHOUT asking: there is nothing left to abandon, and nothing a bot could
   * usefully be given. That is what makes the second entry into this seam a
   * no-op — a quit ends the match, the socket closes, `onLeave` opens its
   * window, and the expiry finds a match that is already over.
   */
  private endMatchOnAbandonedSeat(playerId: PlayerId): boolean {
    const module = this.module;
    const registry = this.registry;
    const gameId = this.gameId;
    if (module === undefined || registry === undefined || gameId === undefined || this.matchState === undefined) return false;
    if (module.getOutcome(this.matchState) !== null) return true;
    const abandoned = registry.getAbandonedSeatAction(gameId, this.matchState, playerId);
    if (abandoned === null) return false;
    const result = module.applyAction(this.matchState, abandoned);
    if (!result.ok) return false;
    this.matchState = result.state;
    // The state changed, so every client owes a fresh view — including the one
    // that just quit, which is still connected at that instant and is exactly
    // who needs to be told the match ended. `broadcastViews` also re-enters
    // `armTurnTimer`, which is what clears the clock of a game that HAD one.
    this.broadcastViews();
    return module.getOutcome(this.matchState) !== null;
  }

  /**
   * Public rather than private, so the unit tests can drive a room without a
   * live WebSocket transport — same behavior, no framing/socket layer to
   * fake.
   *
   * IT USED TO BE FORCED, and the reason is gone: this package depended on
   * the `colyseus` umbrella, which pulled a git-hosted exotic subdependency
   * (`@colyseus/uwebsockets-transport` -> `uWebSockets.js`, 114 MB of
   * prebuilt native binaries with no integrity hash) that the workspace's
   * pnpm supply-chain policy blocks. Depending on `@colyseus/core` and
   * `@colyseus/ws-transport` directly removed it — along with
   * `@colyseus/auth`, `playground` and `monitor`, none of which this server
   * uses. `@colyseus/testing` is available again; these tests stay on the
   * direct call because it is the smaller, faster thing to assert against,
   * not because anything forbids the harness.
   */
  handleAction(client: Client, action: unknown): Promise<void> | void {
    const module = this.module;
    if (module === undefined || this.matchState === undefined) {
      client.send("action-rejected", { code: "match-not-started", message: "the match has not started yet" });
      return;
    }
    const controller = this.controllerFor(client);
    const claimedActor = actorOf(action);
    if (controller === undefined || claimedActor !== controller.playerId) {
      client.send("action-rejected", { code: "actor-mismatch", message: "action does not belong to the authenticated seat" });
      return; // never reaches the module: state deliberately untouched
    }

    let result;
    try {
      // Safe cast: the actor-mismatch check above already proved `action`
      // structurally carries a `playerId` matching the authenticated seat.
      result = module.applyAction(this.matchState, action as ErasedAction);
    } catch (error) {
      client.send("action-rejected", { code: "malformed-action", message: error instanceof Error ? error.message : String(error) });
      return; // state deliberately untouched
    }
    if (!result.ok) {
      client.send("action-rejected", result.violation);
      return; // state deliberately untouched: the server-authoritative guarantee
    }
    this.matchState = result.state;
    this.broadcastViews();
    // `advance()` never rejects (see its own doc comment) — this fire-and-
    // forget return is safe: Colyseus's `onMessage` dispatch never awaits or
    // catches a handler's return value unless this room defines its own
    // `onUncaughtException`, which it deliberately does not.
    return this.advance();
  }

  /**
   * Applies the action exactly as `handleAction` would — same authentication,
   * same legality, same broadcast, same rejection messages — and then sends
   * the ASKING CLIENT ALONE whatever the module has to say about it.
   *
   * Routed through `handleAction` rather than reimplementing its checks: a
   * second copy of "is this really your seat" is a second place for that
   * check to rot, and this one guards a message that spends a resource.
   *
   * The advice is never broadcast. What the other seats see is only the cost,
   * which is ordinary public state — in truco the question spends a seña, and
   * the counter moves for everyone.
   */
  async handleConsult(client: Client, action: unknown): Promise<void> {
    const before = this.matchState;
    await this.handleAction(client, action);
    // Nothing changed: `handleAction` already told the client why, and asking
    // the module about a request that was refused would be answering a
    // question nobody was allowed to put.
    if (this.matchState === before) return;

    const registry = this.registry;
    const gameId = this.gameId;
    const controller = this.controllerFor(client);
    const askerSeat = this.seatOfClient(client);
    if (registry === undefined || gameId === undefined || controller === undefined || askerSeat === undefined || this.matchState === undefined) return;

    // The subject travels on the question the player actually sent. Read off
    // the action rather than re-derived, because re-deriving is exactly what
    // could only ever pick one of two open windows.
    const about = subjectOf(action);
    // Design D1/D7: opens a window for a live human teammate, or falls
    // through to today's synchronous bot opinion either way.
    if (this.openConsult(askerSeat, controller.playerId, about)) return;

    const advice = await this.adviceFor(controller.playerId, about);
    // `from: "partner"` even for a bot: that seat is answering for itself (D6).
    if (advice !== null) client.send("consult-advice", { advice, from: "partner" });
  }

  /**
   * The inbound half of a consult — design D4's four guards, run in order,
   * ANY failure dropping the answer SILENTLY:
   *
   * 1. A consult is actually open (`pendingConsult !== null`).
   * 2. The sender's seat IS the asked partner's own seat. `seatOfClient`
   *    matches only `kind: "human"` controllers by `sessionId`, so a bot
   *    seat, an opponent, the asker themselves, and an unseated socket all
   *    fail this check IDENTICALLY — there is no second, weaker path for any
   *    of the four.
   * 3. The claimed subject matches the open consult's own subject — answering
   *    a different question is not answering this one.
   * 4. The answer is strictly `===` one of the options THIS room itself
   *    issued in `openConsult`. No module round-trip: forgery is decided
   *    entirely inside the transport, and neither display vocabulary (D10's
   *    "Dale"/"No" button labels, nor the "Quiere"/"No quiere" report words)
   *    is ever a valid answer — only the wire value the module handed out.
   *
   * Silent rather than `action-rejected`, on purpose: an answer is not an
   * action, it never reaches `applyAction`, and an identical silence on every
   * guard keeps a forger from learning which one they tripped — the same
   * posture `onAuth` already takes on a join. A legitimate late answer (the
   * window already resolved) needs no message either: the next view already
   * took the ask away.
   *
   * Guards pass through to `resolveConsult`, the SAME resolve-once primitive
   * the 30s cap and a partner takeover already call (design D2) — this
   * becomes its third caller, not a second implementation of "close it".
   */
  handleConsultAnswer(client: Client, message: unknown): void {
    const pending = this.pendingConsult;
    if (pending === null) return; // guard 1: nothing open to answer
    const seat = this.seatOfClient(client);
    if (seat === undefined || seat !== pending.partnerSeat) return; // guard 2
    if (subjectOf(message) !== pending.about) return; // guard 3
    const answer = answerOf(message);
    if (!pending.options.some((option) => option === answer)) return; // guard 4
    this.resolveConsult(pending.id, answer as JsonValue, "partner");
  }

  /**
   * The module's answer to a question one seat asked, or `null` when there
   * is none — for a human on their socket, and for a bot into `boughtAnswers`.
   *
   * ONE PATH FOR BOTH, deliberately: the whole claim this feature rests on is
   * that a bot receives the same information as the human in that seat, at
   * the same price. Two call sites forming that answer differently is how
   * that claim quietly stops being true.
   *
   * A module that throws while forming an opinion must not take the room with
   * it: the action has already been applied, and the asker simply gets no
   * answer. Deliberately silent for the same reason `runAdvanceOnce` swallows
   * — this is one seat's question, not the match's integrity.
   */
  private async adviceFor(playerId: PlayerId, about?: string): Promise<JsonValue | null> {
    const registry = this.registry;
    const gameId = this.gameId;
    if (registry === undefined || gameId === undefined || this.matchState === undefined) return null;
    try {
      return await registry.getConsultAdvice(gameId, this.matchState, playerId, this.botTier, about);
    } catch {
      return null;
    }
  }

  /** The seat/controller holding a `playerId` — `getConsultAsk`'s partner is
   * never guaranteed to be the CLIENT `controllerFor`/`seatOfClient` key off. */
  private controllerEntryFor(playerId: PlayerId): { readonly seat: number; readonly controller: Controller } | undefined {
    for (const [seat, controller] of this.controllers) {
      if (controller.playerId === playerId) return { seat, controller };
    }
    return undefined;
  }

  /** Opens a pending consult when the module names a LIVE HUMAN teammate on
   * a timed table, or refuses — one at a time (design D1). `turnDeadline` is
   * read AFTER `handleAction` re-armed it; `null` means untimed, so this
   * falls through rather than inventing an unbounded window. */
  private openConsult(askerSeat: number, askerPlayerId: PlayerId, about: string | undefined): boolean {
    const registry = this.registry;
    const gameId = this.gameId;
    if (this.pendingConsult !== null || registry === undefined || gameId === undefined || this.matchState === undefined || this.turnDeadline === null) return false;
    const ask = registry.getConsultAsk(gameId, this.matchState, askerPlayerId, about);
    if (ask === null) return false;
    const partner = this.controllerEntryFor(ask.partnerId);
    if (partner === undefined || partner.controller.kind !== "human") return false;

    const id = ++this.consultSeq;
    const deadline = Math.min(Date.now() + CONSULT_CAP_MS, this.turnDeadline);
    const timer = setTimeout(() => this.queueConsultFallback(id), Math.max(0, deadline - Date.now()));
    timer.unref?.(); // same discipline as `armTurnTimer`'s own timer — never the reason a process stays alive
    this.pendingConsult = { id, askerSeat, askerPlayerId, partnerSeat: partner.seat, about, options: ask.options, deadline, timer };
    try {
      partner.controller.client.send("consult-ask", { about, options: ask.options, deadline });
    } catch {
      // Same posture as `resolveConsult`'s send below: one seat's question.
    }
    // Pushes `view.pendingConsult`. `armTurnTimer` (called first, inside
    // this) sees the SAME seat still on the clock and returns early without
    // clearing, so the window just opened survives its own broadcast.
    this.broadcastViews();
    return true;
  }

  /** The resolve-once guard (design D2): checked and cleared with no `await`
   * in between — atomic by construction. The cap fallback below is one
   * caller; slice 2b's answer handler is the other, calling this only after
   * its own guards pass. Cleared BEFORE the send: a throw on a dead socket
   * after the clear leaves nothing open; before it would strand the
   * consult with its timer already spent. */
  private resolveConsult(id: number, advice: JsonValue, from: "partner" | "fallback"): void {
    const pending = this.pendingConsult;
    if (pending === null || pending.id !== id) return;
    this.clearPendingConsult();
    const asker = this.controllers.get(pending.askerSeat);
    if (asker?.kind === "human") {
      try {
        asker.client.send("consult-advice", { advice, from });
      } catch {
        // One seat's question, not the match's integrity — same posture as `adviceFor`.
      }
    }
    this.broadcastViews(); // the badge returns to the turn
  }

  /** Cancels with no send at all — a consult that dies with its asker's
   * turn (design D3) was never answered, it was withdrawn. */
  private clearPendingConsult(): void {
    if (this.pendingConsult === null) return;
    if (this.pendingConsult.timer !== undefined) clearTimeout(this.pendingConsult.timer);
    this.pendingConsult = null;
  }

  /** Queued on `advanceChain`, exactly as `onTurnExpired` queues its timed-
   * out turn: forming the fallback awaits `adviceFor` and must never race a
   * decision already in flight. */
  private queueConsultFallback(id: number): void {
    const scheduled = this.advanceChain.then(() => this.runConsultFallbackOnce(id));
    this.advanceChain = scheduled.catch(() => {
      // Same defensive contract as `advance()`/`onTurnExpired`:
      // `runConsultFallbackOnce` already swallows its own exceptions.
    });
  }

  private async runConsultFallbackOnce(id: number): Promise<void> {
    const pending = this.pendingConsult;
    if (this.disposed || pending === null || pending.id !== id) return; // re-check after the chain wait
    const advice = await this.adviceFor(pending.askerPlayerId, pending.about);
    if (advice === null || this.pendingConsult?.id !== id) return; // re-check after adviceFor
    this.resolveConsult(id, advice, "fallback");
  }

  /**
   * The `advance()` entry point every trigger calls (`handleAction`,
   * `onJoin`'s seat-fill, `takeOverSeat`). Closes the disclosed overlap
   * debt (apply-progress obs 2927/2925): "a human action arriving while a
   * bot decision is in flight ... starts a second, concurrent `advance()`
   * chain on the same room." Every call is appended to `advanceChain` via
   * `.then()` — not gated by a checked-then-set boolean flag, which is the
   * shape that invites the classic "two calls interleave in the same
   * instant" bug. Promise chaining instead makes the ordering a property
   * of the promise graph itself: `runAdvanceOnce()` for call N+1 is not
   * even CONSTRUCTED as a pending job until call N's `runAdvanceOnce()`
   * promise has settled, because `.then()`'s callback cannot run before
   * its receiver settles. At most one `runAdvanceOnce()` body is ever
   * executing at a time — this makes overlap structurally IMPOSSIBLE, not
   * merely unlikely, given the current single-process, single-event-loop
   * deployment (see this method's own return value note on multi-process
   * deployments).
   *
   * Liveness (the property a naive "if busy, return" guard risks losing):
   * every call still gets its OWN link appended to the chain, so its own
   * `runAdvanceOnce()` invocation WILL run — only ever deferred until its
   * predecessor finishes, never dropped. The trigger that arrived while a
   * bot was mid-decision still gets driven; it simply runs after.
   *
   * `advanceChain` is reassigned synchronously (before this method returns
   * to its caller, no `await` in between) with a `.catch()`-guarded copy of
   * the same promise, so a later caller's own `.then()` is never chained
   * onto a promise that could reject — `runAdvanceOnce()` itself never
   * throws past its own boundary (see its doc comment), and this is a
   * second, defensive layer in case that contract is ever violated by a
   * future edit.
   *
   * Scope note: this guarantee holds for THIS room instance within ONE
   * Node.js process/event loop, which is this project's actual deployment
   * shape (design §1: a single generic `MatchRoom`, no cross-process
   * sharding of one match). It says nothing about two different processes
   * racing on the same match — not a real risk here, since a Colyseus room
   * always lives in exactly one process for its whole lifetime.
   */
  private advance(): Promise<void> {
    const scheduled = this.advanceChain.then(() => this.runAdvanceOnce());
    this.advanceChain = scheduled.catch(() => {
      // Nothing to do here: `runAdvanceOnce()` already logs and swallows
      // every exception itself. This catch exists purely so a violation of
      // that contract can never poison the chain for callers queued after
      // it.
    });
    return scheduled;
  }

  /**
   * The actual stepping logic: a bot's own turn, then (design's
   * system-action note) "nobody can act, but the match must advance".
   * Loops so one step can unblock the next — a bot's move can reveal the
   * next system action, exactly the sequence a disconnect-takeover bot
   * reuses to resolve a pending call before further human play (spec 6.4).
   * Deliberately a `for(;;)` loop rather than the recursive `await
   * this.advance()` this method used to use: recursing into the PUBLIC
   * `advance()` from here would re-enter the promise chain above and
   * deadlock — call N would await a link that cannot settle until call N's
   * OWN `runAdvanceOnce()` (the thing doing the awaiting) finishes. Looping
   * locally keeps every step of one triggered advance in a single
   * uninterrupted execution, which is exactly the serialization guarantee
   * `advance()` promises its callers.
   *
   * THE OUTER try/catch IS THE FIX for the disclosed intermittent
   * single-player stall (apply-progress, obs 2973/2925): a "frozen" match
   * (score/turn/hand byte-identical for the FULL multi-minute E2E timeout,
   * not merely slow) was never a stuck game-state — it was a CRASHED SERVER
   * PROCESS. Every caller of `advance()` treats its returned promise as
   * fire-and-forget: `handleAction` returns it uncaught to Colyseus's
   * `onMessage` dispatch (verified in the installed `@colyseus/core` source,
   * `Room.mjs`'s `_onMessage`/`onMessageEvents.emit`: a registered listener's
   * return value is never awaited, and it is only ever wrapped in a
   * try/catch when a room defines its OWN `onUncaughtException` — this room
   * deliberately does not, matching every other room this framework ships);
   * `takeOverSeat` explicitly discards it via `void`. Node.js has treated an
   * unhandled promise rejection as FATAL by default since v15 (prints the
   * error and calls `process.exit(1)`) — so ANY exception anywhere in this
   * method's own async chain (a bot strategy's `chooseAction`, most
   * concretely: `truco-bot`'s `easy`/`normal`/`hard` tiers all THROW when
   * handed an empty legal-action list, a real and current code path, not a
   * hypothetical one) took down the ENTIRE server process, not just this one
   * match. That is why the E2E's own diagnostic saw state frozen for the
   * FULL timeout rather than merely delayed: nothing was left running to
   * ever answer. This method already applied the identical defensive
   * contract to ONE failure mode below (a misbehaving `requestSystemAction`
   * "must not crash the room") — the outer try/catch extends that SAME
   * contract to every other failure mode in this method, closing the gap.
   */
  private async runAdvanceOnce(): Promise<void> {
    try {
      for (;;) {
        // Checked before every other loop exit because it is the only one that
        // means "stop SPENDING". `broadcastViews`'s fence already makes what
        // follows harmless, but harmless is not free: a bot decision is a real
        // ~1s `withThinkingDelay` in production, and `onDispose` returns
        // `advanceChain`, so teardown sits and waits through every step this
        // loop still chooses to take. Both resume points come back through
        // here — the `continue` after a bot action, and a step that was queued
        // behind an in-flight one and only starts once disposal has happened.
        if (this.disposed) return;
        const module = this.module;
        const registry = this.registry;
        const gameId = this.gameId;
        const rng = this.rng;
        if (module === undefined || registry === undefined || gameId === undefined || rng === undefined || this.matchState === undefined) return;
        if (module.getOutcome(this.matchState) !== null) return;

        const actingBot = this.findActingBot();
        if (actingBot !== undefined) {
          const view = module.getViewFor(this.matchState, actingBot.playerId);
          // The bot's OWN options, already stripped of whatever its human
          // teammate is being asked to decide (findActingBot).
          const legal = actingBot.legal;
          const bought = this.boughtAnswers.get(actingBot.playerId);
          const action = await actingBot.strategy.chooseAction(view, legal, BOT_BUDGET_MS, bought);
          const result = module.applyAction(this.matchState, action);
          if (result.ok) {
            this.matchState = result.state;
            // The answer lives for exactly one decision. Asking replaces it;
            // doing anything else spends it. Resolved only for an action the
            // GAME calls a paid question — handing advice over after any bot
            // move would give a bot what it never paid for.
            if (registry.isPaidQuestion(gameId, action)) {
              this.boughtAnswers.set(actingBot.playerId, await this.adviceFor(actingBot.playerId, subjectOf(action)));
            } else {
              this.boughtAnswers.delete(actingBot.playerId);
            }
            this.broadcastViews();
          }
          continue;
        }

        const anySeatCanAct = [...this.controllers.values()].some((controller) => module.getLegalActions(this.matchState, controller.playerId).length > 0);
        if (anySeatCanAct) return;
        const systemAction = registry.getSystemAction(gameId, this.matchState, rng);
        if (systemAction === null) return;
        // THE TABLE SITS STILL FOR A MOMENT. Everything above this line
        // happens the instant the last card lands; dealing again in the same
        // breath is what made the winning card vanish before anyone could
        // read it. The pause is here rather than on the client because the
        // server is what decides when the next hand exists -- a client-side
        // hold would just be showing a table that is already gone.
        if (this.handEndPauseMs > 0) await new Promise((resolve) => setTimeout(resolve, this.handEndPauseMs));
        if (this.matchState === undefined) return; // the room may have emptied while it waited
        const result = module.applyAction(this.matchState, systemAction);
        if (!result.ok) return; // a misbehaving requestSystemAction must not crash the room
        this.matchState = result.state;
        this.broadcastViews();
      }
    } catch (error) {
      // NEVER re-throw: an exception escaping here becomes a fatal,
      // whole-process-crashing unhandled rejection (see this method's own
      // doc comment above), not merely a rejected `handleAction` call. This
      // turn's own driving step is abandoned, but the room (and every OTHER
      // in-flight match on this process) survives; the next real client
      // action or reconnection still calls `advance()` again from a fresh,
      // consistent `this.matchState`.
      console.error("MatchRoom.advance(): caught an exception mid-turn — the room stays alive, only this turn's own driving step is abandoned:", error);
    }
  }

  /**
   * Spec-adjacent hardening, not a spec requirement by name: room disposal
   * must not leave an `advance()` chain running past teardown, or its
   * promise dangling with no one awaiting it. Colyseus's own `#_dispose()`
   * (verified in the installed `@colyseus/core` source, `Room.mjs`) awaits
   * exactly `onDispose() ?? Promise.resolve()` BEFORE clearing this room's
   * clock/intervals — returning `advanceChain` here means any `advance()`
   * work queued or in flight at the moment of disposal is given the chance
   * to finish first, instead of continuing to run against a room the
   * framework already considers torn down. `advanceChain` is always a
   * settled-eventually, `.catch()`-guarded promise (see `advance()`'s own
   * doc comment), so this can never hang disposal indefinitely.
   */
  override onDispose(): Promise<void> {
    // Synchronously, BEFORE returning the chain: a pending turn timer is the
    // one piece of this room that can still fire after teardown on its own
    // initiative (every other trigger needs a live client). Clearing it here
    // is what makes "no timer outlives the room" true rather than merely
    // likely — a timer left armed would wake up a minute later, drive a bot
    // against a disposed room, and send on dead connections.
    //
    // The flag first, and it is the half that actually earns that sentence:
    // the clear alone only covers a timer armed RIGHT NOW. Work already in
    // flight returns after this method and re-arms one (see the field's own
    // doc comment); `broadcastViews` is where the flag stops it. The same flag
    // is also what keeps the chain returned below SHORT: `runAdvanceOnce` and
    // `playOneBotActionFor` read it and stop taking steps, so teardown never
    // waits out a bot decision whose result this method's own fence discards.
    this.disposed = true;
    this.clearTurnTimer();
    return this.advanceChain;
  }

  /**
   * A REAL, reproduced deadlock this method closes (see
   * `platform-core`'s `NonBlockingActionClassifier` for the full story):
   * "this bot has ANY legal action" used to mean "auto-drive it now" — but
   * a non-blocking action (2v2's `send-sena`) is legal continuously,
   * independent of whose real turn it is. A bot whose ONLY legal action was
   * non-blocking kept getting picked forever, starving the actual pending
   * decision. This method now only returns a bot whose legal-action set
   * includes at least one BLOCKING action — never a bot that could only
   * take a skippable side action. A bot simply never proactively uses a
   * non-blocking action on its own initiative; that is an acceptable,
   * disclosed limitation (see apply-progress's own bot-honesty section),
   * not a correctness gap — nothing depends on a bot ever sending one.
   */
  private findActingBot(): { readonly playerId: PlayerId; readonly strategy: BotStrategy<unknown, ErasedAction>; readonly legal: readonly ErasedAction[] } | undefined {
    const module = this.module;
    const registry = this.registry;
    const gameId = this.gameId;
    if (module === undefined || registry === undefined || gameId === undefined || this.matchState === undefined) return undefined;
    const held = this.decisionsAHumanIsWaitingOn();
    for (const controller of this.controllers.values()) {
      if (controller.kind !== "bot") continue;
      const all = module.getLegalActions(this.matchState, controller.playerId);
      // HELD BACK BY TYPE, not wholesale. Everything the human is being
      // offered right now is theirs to decide; anything else this bot can do
      // is its own, and taking it away was costing the team calls only the
      // bot could make. See decisionsAHumanIsWaitingOn for the two reports
      // that shaped this.
      const legal = held === undefined ? all : all.filter((action) => !held.has(typeOf(action) ?? ""));
      const blocking = legal.filter((action) => !registry.isNonBlockingAction(gameId, action));
      if (blocking.length === 0) continue;
      // THE HUMAN GETS THE FIRST WORD. When this bot is offered a decision
      // the game marks as human-priority AND a human seat is offered it too,
      // the bot stands down — all of it, not just that one action. In truco
      // that is answering a call: the engine offers the response to BOTH
      // members of the answering team, so a bot partner used to win the race
      // every time and its human teammate never decided anything.
      //
      // "HAS ONE", NOT "HAS ONLY ONES", and the difference is a real defect
      // this started out with. A pending ENVIDO offers the answering side its
      // two responses AND every higher call it could escalate to; a pending
      // TRUCO offers only the two responses. Requiring every blocking action
      // to be human-priority therefore held for truco and quietly failed for
      // envido, where the escalations were enough to make the bot act — which
      // is exactly how it was reported: "espera para mi respuesta de si
      // quiero o no el truco pero no lo hace para el envido".
      //
      // It cannot starve a bot that has real work of its own, because there
      // is none to have: `getLegalCardPlayActions` requires the hand's calls
      // to be settled, so while anything is pending nobody is playing a card.
      // A bot with a genuinely private move has no human-priority action at
      // all and never reaches this line.
      return { playerId: controller.playerId, strategy: controller.strategy, legal };
    }
    return undefined;
  }

  /**
   * Whether a HUMAN seat is currently being offered a decision the game
   * marks as theirs first.
   *
   * Asked once per `findActingBot` rather than per bot: it is a property of
   * the table, not of the bot being considered, and every bot in the same
   * loop would otherwise recompute the same answer.
   *
   * This is deliberately about the KIND of decision and not about teams.
   * `MatchRoom` has no team concept and must not grow one (the port keeps
   * `SeatAssignment` team-free on purpose); it does not need one either,
   * because a pending call is answerable by exactly one side at a time —
   * so "a human is being offered this kind of decision" and "the human on
   * the answering side is being offered it" are the same statement here.
   */
  private someHumanCanTakePriorityAction(): boolean {
    return this.decisionsAHumanIsWaitingOn() !== undefined;
  }

  /**
   * The action TYPES a human seat is currently being offered, when one of
   * them is a decision the game marks as the human's to make first --
   * `undefined` when no human is waiting on anything.
   *
   * WHY TYPES, AND NOT JUST A BOOLEAN. A bot standing down used to stand down
   * from EVERYTHING, and that was too blunt in both directions at once.
   *
   * It was right for a pending envido: the engine offers the answering side
   * its two responses AND every higher call it could escalate to, to BOTH
   * teammates, so a bot allowed to escalate takes the decision away just as
   * surely as one allowed to answer. Reported exactly that way once.
   *
   * It was wrong for a pending truco whose human teammate has already played
   * a card. The human is offered only the two responses; the pie who has not
   * played is ALSO offered the envido -- "el envido esta primero" -- and the
   * blanket stand-down swallowed it. The team simply lost the call, which is
   * how it was reported: "no puedo cantar envido y mi compañero tampoco lo
   * canta".
   *
   * Holding back exactly what the human is holding covers both: the
   * escalations disappear when the human has them too, and the envido
   * survives when they do not.
   */
  private decisionsAHumanIsWaitingOn(): ReadonlySet<string> | undefined {
    const module = this.module;
    const registry = this.registry;
    const gameId = this.gameId;
    if (module === undefined || registry === undefined || gameId === undefined || this.matchState === undefined) return undefined;
    for (const controller of this.controllers.values()) {
      if (controller.kind !== "human") continue;
      const legal = module.getLegalActions(this.matchState, controller.playerId);
      if (!legal.some((action) => registry.isHumanPriorityAction(gameId, action))) continue;
      return new Set(legal.map((action) => typeOf(action)).filter((type): type is string => type !== undefined));
    }
    return undefined;
  }

  /**
   * The "view" message's wire shape: the redacted view, that seat's own
   * legal actions, AND the match's own outcome, together. Same rationale as
   * `legalActions` extends to `outcome`: a client only ever has its own
   * REDACTED view, never the full `matchState` `getOutcome` needs, so it
   * structurally cannot re-derive "has this match ended, and who won" from
   * `view.teams`/`view.config.pointsToWin` (architectural rule: match
   * termination comes from the module's own `getOutcome`, never re-derived
   * in the UI). Sent as one message, not separate ones, so a client's view,
   * legal actions, and outcome are always in sync with each other by
   * construction.
   */
  private viewMessageFor(
    module: GameModule<unknown, ErasedAction, unknown, unknown>,
    playerId: PlayerId,
  ): {
    readonly view: unknown;
    readonly legalActions: readonly ErasedAction[];
    readonly outcome: MatchOutcome | null;
    readonly turnDeadline: number | null;
    readonly pendingConsult: { readonly askerSeat: number; readonly deadline: number } | null;
  } {
    return {
      view: module.getViewFor(this.matchState, playerId),
      legalActions: module.getLegalActions(this.matchState, playerId),
      outcome: module.getOutcome(this.matchState),
      // Deliberately the SAME field for every client, not a per-seat one:
      // only one seat is ever on the clock, so "visible to everyone" is one
      // deadline all four see. A seat that is not on the clock still needs it
      // — that is how the table shows the countdown on the ACTIVE seat's own
      // badge. This is also the piece that keeps `truco-engine` untouched:
      // the deadline rides on the view MESSAGE, never inside the engine's
      // `PlayerView`, so the engine stays a pure reducer with no clock.
      turnDeadline: this.turnDeadline,
      // Not the full record: no subject/options/advice, only the badge's
      // needs (design D5), same "same field for every client" rationale.
      pendingConsult: this.pendingConsult === null ? null : { askerSeat: this.pendingConsult.askerSeat, deadline: this.pendingConsult.deadline },
    };
  }

  /**
   * THE single place a turn deadline is started, and therefore the single
   * answer to "when does a turn begin". Called at the top of
   * `broadcastViews`, which is the one funnel every accepted mutation already
   * passes through — so a deadline is set exactly when the previous action
   * RESOLVED, and every "view" message a client receives already carries the
   * deadline matching the state in that same message (view, legal actions,
   * outcome and deadline stay in sync by construction, with no extra
   * per-turn message on the wire).
   *
   * The seat on the clock is the first HUMAN seat owing at least one BLOCKING
   * action — the exact mirror of `findActingBot`'s own rule, and it is what
   * makes a pending call answered by seat B restart B's clock rather than A's:
   * while the call is open, B is the seat that owes the blocking response.
   *
   * A live clock is left ALONE when the same seat is still the one owing a
   * blocking action. That is what stops a NON-blocking action (2v2's
   * `send-sena`, the only one in this codebase) from resetting the thinking
   * seat's clock: a partner signalling — or signalling repeatedly — can
   * neither buy that seat more time nor cut it short.
   *
   * A bot-driven seat never gets a deadline, and not merely because this
   * method skips non-human controllers: by the time any broadcast happens,
   * `runAdvanceOnce` has already driven every bot that owed a blocking
   * action, so a bot seat structurally cannot be the seat on the clock. Bots
   * act immediately; there is nothing to wait for.
   *
   * A GAME WITH NO BOT GETS NO CLOCK AT ALL, and that is DERIVED here rather
   * than declared anywhere. An expired turn has exactly one effect in this
   * room — `playOneBotActionFor` — so for a module with no `createBot` the
   * clock would count down to a silence, take the turn away from the only
   * person at the table and hand it to nobody. `turnDeadline` stays `null`,
   * which the client already reads as "nothing is being timed" — its own
   * declaration says exactly that of `null`, and "renders an untimed table"
   * of a payload missing the field entirely (`game-ui-registry.ts`). So
   * nothing about this reaches a client that did not already handle it: no
   * wire change, no new field, no migration.
   *
   * IT HAS A SECOND EFFECT, AND IT IS RECORDED HERE RATHER THAN FOUND LATER:
   * clock off means CONSULTS OFF for that game. `openConsult` bounds its
   * window by `this.turnDeadline` and refuses outright when there is none
   * rather than inventing an unbounded one — so a game that arms no clock can
   * never open a consult. For a game with no opponent that is the right
   * answer arrived at honestly (a consult asks a TEAMMATE, and there is
   * none), but it is a consequence of this method, not of that one, and
   * whoever changes either should be able to see it from here.
   */
  private armTurnTimer(): void {
    const module = this.module;
    // No match, or a match already decided — a finished match must never keep
    // a clock running, and `getOutcome` is the module's own authority on that.
    if (module === undefined || this.matchState === undefined || module.getOutcome(this.matchState) !== null) {
      this.clearTurnTimer();
      return;
    }
    // No bot, no clock — see the derivation above. `clearTurnTimer` rather
    // than a bare `return`, so a module that somehow lost its bot mid-match
    // does not leave a live timer behind.
    if (module.createBot === undefined) {
      this.clearTurnTimer();
      return;
    }
    const seat = this.seatOnTheClock();
    if (seat === undefined) {
      this.clearTurnTimer();
      return;
    }
    // Same seat, clock already running: this broadcast is a state change that
    // did not end that seat's turn, so its deadline stands untouched.
    if (seat === this.turnTimerSeat && this.turnTimer !== undefined) return;
    this.clearTurnTimer();
    const timeoutMs = this.turnTimeoutSeconds * 1000;
    this.turnTimerSeat = seat;
    this.turnDeadline = Date.now() + timeoutMs;
    this.turnTimer = setTimeout(() => this.onTurnExpired(seat), timeoutMs);
    // A pending turn timer must never be the reason a Node process stays
    // alive: a real server is held open by its own listening sockets, and a
    // test process should exit the moment its assertions are done rather than
    // waiting out a minute-long game clock. `unref` is optional-chained
    // because only Node's `Timeout` has it (`@types/node` is a devDependency
    // here, so the type is right, but the guard costs nothing and keeps this
    // honest if the timer type ever changes).
    this.turnTimer.unref?.();
  }

  private clearTurnTimer(): void {
    if (this.turnTimer !== undefined) clearTimeout(this.turnTimer);
    this.turnTimer = undefined;
    this.turnTimerSeat = undefined;
    this.turnDeadline = null;
    // Cancellation funnel (design D3): every caller already covers exactly
    // the moments an open consult must die, so it never outlives its clock.
    this.clearPendingConsult();
  }

  /** Public for the same reason `handleAction` is: it is the only way a test
   * can prove a timer does not OUTLIVE the room, which a purely behavioural
   * assertion can only ever prove by waiting and seeing nothing happen. */
  hasPendingTurnTimer(): boolean {
    return this.turnTimer !== undefined;
  }

  /** The human mirror of `findActingBot`: the seat owing a real decision. The
   * BLOCKING filter is what keeps a continuously-legal side action (2v2's
   * `send-sena`) from being mistaken for "this seat owes the table a move" —
   * the same deadlock this codebase already reproduced once on the bot side. */
  private seatOnTheClock(): number | undefined {
    const module = this.module;
    const registry = this.registry;
    const gameId = this.gameId;
    if (module === undefined || registry === undefined || gameId === undefined || this.matchState === undefined) return undefined;
    for (const [seat, controller] of this.controllers) {
      if (controller.kind !== "human") continue;
      const legal = module.getLegalActions(this.matchState, controller.playerId);
      if (legal.some((action) => !registry.isNonBlockingAction(gameId, action))) return seat;
    }
    return undefined;
  }

  /**
   * The deadline passed. A bot resolves THIS ONE TURN and nothing more — the
   * seat's controller is deliberately NOT swapped, which is the whole
   * difference between this and `takeOverSeat`: a disconnect means nobody is
   * there, so the seat changes hands; a timeout means somebody looked away for
   * a minute, so the seat stays theirs and the very next turn is theirs again
   * with a fresh clock.
   *
   * Chained onto `advanceChain` exactly the way `advance()` is, for exactly
   * the same reason: a timer firing while a bot decision is already in flight
   * must queue behind it, never run concurrently against the same
   * `matchState`.
   */
  private onTurnExpired(seat: number): void {
    this.clearTurnTimer();
    const scheduled = this.advanceChain.then(() => this.runTimedOutTurnOnce(seat));
    this.advanceChain = scheduled.catch(() => {
      // Same defensive contract as `advance()`: `runTimedOutTurnOnce` already
      // swallows its own exceptions, and this keeps a violation of that
      // contract from poisoning the chain for whoever is queued behind it.
    });
  }

  private async runTimedOutTurnOnce(seat: number): Promise<void> {
    await this.playOneBotActionFor(seat);
    // The turn the bot just resolved can unblock the rest of the table (a bot
    // seat's reply, a system action). That is the SAME stepping logic every
    // other trigger uses — called directly rather than through `advance()`,
    // because we are already inside the serialized chain and re-entering it
    // from here would deadlock (see `runAdvanceOnce`'s own doc comment).
    await this.runAdvanceOnce();
  }

  /**
   * One action, for one seat, from a bot — the timeout's entire effect.
   *
   * Only BLOCKING actions are offered to the strategy. A timeout must resolve
   * the obligation that stalled the table without gambling anything the
   * player did not choose to gamble: handing over the full legal list would
   * let a tier fall through to a `send-sena` and silently spend one of the
   * player's three per-hand señas on their behalf.
   */
  private async playOneBotActionFor(seat: number): Promise<void> {
    try {
      // Same exit as `runAdvanceOnce`'s own first one, and this is where it
      // saves the most: `onTurnExpired` chains onto `advanceChain`, so a turn
      // that expired while a bot decision was in flight does not start until
      // that decision returns — which is easily after disposal. Without this,
      // teardown would wait out a SECOND `chooseAction` below just to apply an
      // action into a room nobody will ever see again.
      if (this.disposed) return;
      const module = this.module;
      const registry = this.registry;
      const gameId = this.gameId;
      const controller = this.controllers.get(seat);
      if (module === undefined || registry === undefined || gameId === undefined || this.matchState === undefined) return;
      // Anything may have changed while this timer sat queued behind an
      // in-flight advance: the seat may have been taken over by a disconnect,
      // the match may have ended, or the player may have acted after all.
      if (controller === undefined || controller.kind !== "human") return;
      if (module.getOutcome(this.matchState) !== null) return;
      // Unreachable by derivation, and kept anyway. `armTurnTimer` refuses to
      // arm a clock for a module with no `createBot`, so no deadline can
      // expire and this method has no caller for such a game — but the two
      // facts live 100 lines apart, and a guard that depends on a distant
      // invariant staying true is a guard worth spending one line on.
      const createBot = module.createBot;
      if (createBot === undefined) return;
      const blocking = module.getLegalActions(this.matchState, controller.playerId).filter((action) => !registry.isNonBlockingAction(gameId, action));
      if (blocking.length === 0) return;
      this.timeoutBot ??= createBot(this.takeoverTier);
      const view = module.getViewFor(this.matchState, controller.playerId);
      const action = await this.timeoutBot.chooseAction(view, blocking, BOT_BUDGET_MS);
      const result = module.applyAction(this.matchState, action);
      if (!result.ok) return; // a misbehaving strategy must not crash the room
      this.matchState = result.state;
      // Re-arms the clock for whoever owes the next action — which, after a
      // timeout, is normally the OTHER seat, and after their move is this
      // player again with a full fresh minute.
      this.broadcastViews();
    } catch (error) {
      // NEVER re-throw: this runs from a timer callback, so an escaping
      // exception is an unhandled rejection, which Node treats as fatal to
      // the WHOLE process (see `runAdvanceOnce`'s own doc comment for the
      // real crash this contract exists to prevent).
      console.error("MatchRoom: caught an exception resolving a timed-out turn — the room stays alive, only this one turn is left unplayed:", error);
    }
  }

  private broadcastViews(): void {
    const module = this.module;
    if (module === undefined || this.matchState === undefined) return;
    // The fence a disposed room needs, and the reason it belongs HERE: this is
    // the single funnel through which a clock is ever armed (`armTurnTimer` has
    // no other caller) and the single place a view is ever BROADCAST. Every
    // path that resumes after teardown — the expired turn's bot, an `advance()`
    // mid-decision — comes back through this method, so one check covers them
    // all, and neither a fresh timer nor a send on dead connections gets past
    // it. Guarding `armTurnTimer` instead would leave the sends, and would be
    // unreachable code besides.
    //
    // Deliberately NOT "the single place anything is sent to a client": five
    // other `client.send` calls in this file are unfenced, and the honest
    // reason the fence is still complete is a SECOND fact, not this check.
    // Four are `handleAction`'s `action-rejected` replies, which exist only as
    // answers to an inbound client message — a torn-down room has no live
    // socket to carry one, and a rejection arms no clock and carries no state
    // regardless. The fifth is a view: `onReconnect`. What keeps THAT one out
    // is the framework. `onReconnect` fires only for a reconnection this room
    // is already holding open, and a pending `allowReconnection` both reserves
    // a seat (so `#_disposeIfEmpty`, which requires zero reserved seats, can
    // never fire underneath it) and is rejected outright by `disconnect()`
    // before disposal — both verified in the installed `@colyseus/core` source
    // (`Room.ts`), the same discipline `onLeave` already used to lean on that
    // guarantee for its own `Error("disposing")` early return.
    if (this.disposed) return;
    // BEFORE the sends, never after: this is what makes every message below
    // carry the deadline belonging to the state it describes.
    this.armTurnTimer();
    for (const controller of this.controllers.values()) {
      if (controller.kind === "human") controller.client.send("view", this.viewMessageFor(module, controller.playerId));
    }
  }
}
