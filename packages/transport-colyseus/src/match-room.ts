import { Room, type AuthContext, type Client } from "colyseus";
import type { BotStrategy, BotTier, GameId, GameModule, MatchOutcome, PlayerId, RandomSource, SeatAssignment } from "@hexdev/platform-contract";
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
  /** Single-player mode (spec: "Single-Player vs Bot Mode"): when present,
   * the LAST seat is filled with a bot controller of this tier BEFORE any
   * human joins, and `maxClients` shrinks to the remaining human seat(s) —
   * the match starts the moment they fill, with no lobby wait (design §9:
   * bot substitution is a seat-controller concept, not a second code path;
   * this is the same mechanism a disconnect-takeover mutates later). */
  readonly botTier?: BotTier;
  /** Reconnection window (spec: "Disconnect, Reconnection Window, and Bot
   * Takeover"; design open question resolved to 30s, obs 2919/2921). */
  readonly reconnectionWindowSeconds?: number;
  /** The tier a takeover bot uses once the window expires (obs 2919: decided
   * as "normal" — easy would hand the match to the remaining player, hard
   * would punish them for a network drop that was never their fault). */
  readonly takeoverTier?: BotTier;
}

const DEFAULT_RECONNECTION_WINDOW_SECONDS = 30;
const DEFAULT_TAKEOVER_TIER: BotTier = "normal";

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
  private readonly controllers = new Map<number, Controller>();
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
    this.reconnectionWindowSeconds = options.reconnectionWindowSeconds ?? DEFAULT_RECONNECTION_WINDOW_SECONDS;
    this.takeoverTier = options.takeoverTier ?? DEFAULT_TAKEOVER_TIER;
    if (options.botTier !== undefined) {
      // Unguessable on purpose: `/embed?p=` is client-suppliable (design
      // §7), so a fixed or predictable bot id would be an identity a client
      // could pre-claim a token for. A fresh random UUID, generated only
      // once this room exists, never can be.
      const seat = module.metadata.seatCount - 1;
      this.controllers.set(seat, { kind: "bot", playerId: crypto.randomUUID() as PlayerId, strategy: module.createBot(options.botTier) });
    }
    this.maxClients = module.metadata.seatCount - this.controllers.size;
    this.onMessage("action", (client, message: unknown) => this.handleAction(client, message));
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
    const tenant = auth.repository.findById(claims.tenantId);
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
      await this.advance();
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
      // `allowReconnection` rejects with the LITERAL `Error("disposing")`
      // (verified in `@colyseus/core`'s own source, same discipline as obs
      // 2952) when the room itself is being torn down — e.g. server
      // shutdown with a match still in progress. A window EXPIRING for real
      // rejects with a bare `false`, never an `Error`. Taking over a seat
      // while the room is already disposing would start driving a bot
      // against a room that is about to vanish — never useful, and for a
      // module whose legal actions never terminate (this file's OWN
      // test-only fixtures are exactly that shape) it can recurse `advance()`
      // without bound. Only a genuine window expiry triggers a takeover.
      if (error instanceof Error && error.message === "disposing") return;
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
  private takeOverSeat(seat: number): void {
    const module = this.module;
    const controller = this.controllers.get(seat);
    if (module === undefined || controller === undefined || controller.kind !== "human") return;
    this.controllers.set(seat, { kind: "bot", playerId: controller.playerId, strategy: module.createBot(this.takeoverTier) });
    void this.advance();
  }

  /**
   * Public rather than private: `@colyseus/testing`, the official
   * integration-test harness, pulls in a git-hosted exotic subdependency
   * (`@colyseus/uwebsockets-transport` -> `uWebSockets.js`) blocked by this
   * workspace's pnpm supply-chain policy (`blockExoticSubdeps`). This
   * method is invoked directly in tests instead of over a live WebSocket
   * transport — same behavior, no framing/socket layer to fake.
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
        const module = this.module;
        const registry = this.registry;
        const gameId = this.gameId;
        const rng = this.rng;
        if (module === undefined || registry === undefined || gameId === undefined || rng === undefined || this.matchState === undefined) return;
        if (module.getOutcome(this.matchState) !== null) return;

        const actingBot = this.findActingBot();
        if (actingBot !== undefined) {
          const view = module.getViewFor(this.matchState, actingBot.playerId);
          const legal = module.getLegalActions(this.matchState, actingBot.playerId);
          const action = await actingBot.strategy.chooseAction(view, legal, BOT_BUDGET_MS);
          const result = module.applyAction(this.matchState, action);
          if (result.ok) {
            this.matchState = result.state;
            this.broadcastViews();
          }
          continue;
        }

        const anySeatCanAct = [...this.controllers.values()].some((controller) => module.getLegalActions(this.matchState, controller.playerId).length > 0);
        if (anySeatCanAct) return;
        const systemAction = registry.getSystemAction(gameId, this.matchState, rng);
        if (systemAction === null) return;
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
    return this.advanceChain;
  }

  private findActingBot(): { readonly playerId: PlayerId; readonly strategy: BotStrategy<unknown, ErasedAction> } | undefined {
    const module = this.module;
    if (module === undefined || this.matchState === undefined) return undefined;
    for (const controller of this.controllers.values()) {
      if (controller.kind === "bot" && module.getLegalActions(this.matchState, controller.playerId).length > 0) return controller;
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
  ): { readonly view: unknown; readonly legalActions: readonly ErasedAction[]; readonly outcome: MatchOutcome | null } {
    return {
      view: module.getViewFor(this.matchState, playerId),
      legalActions: module.getLegalActions(this.matchState, playerId),
      outcome: module.getOutcome(this.matchState),
    };
  }

  private broadcastViews(): void {
    const module = this.module;
    if (module === undefined || this.matchState === undefined) return;
    for (const controller of this.controllers.values()) {
      if (controller.kind === "human") controller.client.send("view", this.viewMessageFor(module, controller.playerId));
    }
  }
}
