import { Room, type AuthContext, type Client } from "colyseus";
import type { BotStrategy, BotTier, GameId, GameModule, PlayerId, RandomSource, SeatAssignment } from "@hexdev/platform-contract";
import type { GameModuleRegistry, JtiReplayGuard, RateLimiter, SessionTokenIssuer, TenantRepository } from "@hexdev/platform-core";

/** Everything `onAuth` needs to verify a join, injected per-room instead of
 * imported directly: `transport-colyseus` must not know HOW tokens are
 * signed or tenants are stored, only that it can ask. */
export interface MatchRoomAuthOptions {
  readonly issuer: SessionTokenIssuer;
  readonly repository: TenantRepository;
  readonly replayGuard: JtiReplayGuard;
  /** Per-IP join throttle (hardening, obs 2945: room join had no rate
   * limiting at all). Checked BEFORE token verification, so even a flood of
   * token-less connection attempts from one address is bounded. */
  readonly joinRateLimiter: RateLimiter;
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
}

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
  private readonly controllers = new Map<number, Controller>();

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
    if (ip !== undefined && !auth.joinRateLimiter.tryConsume(ip)) {
      throw new Error("MatchRoom: join rejected, too many join attempts from this address");
    }
    if (typeof options.token !== "string") {
      throw new Error("MatchRoom: join rejected, no session token presented");
    }
    const claims = await auth.issuer.verify(options.token);
    if (claims === undefined) {
      throw new Error("MatchRoom: join rejected, invalid or expired session token");
    }
    // Origin re-validation, spec-mandated and explicitly NOT redundant with
    // the mint-time check: a captured token could be replayed from a page
    // the tenant never allowlisted. `Origin` is spoofable by a hand-rolled
    // WS client — this raises the bar, it is not a cryptographic boundary
    // (see apply-progress security posture).
    const tenant = auth.repository.findById(claims.tenantId);
    const origin = context.headers.get("origin");
    if (tenant === undefined || origin === null || !tenant.allowedOrigins.includes(origin)) {
      throw new Error("MatchRoom: join rejected, origin not allowed for this tenant");
    }
    if (!tenant.entitledGames.includes(module.id)) {
      throw new Error("MatchRoom: join rejected, tenant is not entitled to this game");
    }
    if (!auth.replayGuard.consume(claims.jti)) {
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
    for (const controller of this.controllers.values()) {
      if (controller.kind === "human" && controller.client === client) return controller;
    }
    return undefined;
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
    return this.advance();
  }

  /**
   * Drives the match through every step nobody at a keyboard needs to
   * trigger: a bot's own turn, then (design's system-action note) "nobody
   * can act, but the match must advance". Recurses so one step can unblock
   * the next — a bot's move can reveal the next system action, exactly the
   * loop a disconnect-takeover bot reuses to resolve a pending call before
   * further human play (spec 6.4): takeover only ever mutates ONE
   * `controllers` entry; this loop is what makes that entry actually play.
   */
  private async advance(): Promise<void> {
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
      await this.advance();
      return;
    }

    const anySeatCanAct = [...this.controllers.values()].some((controller) => module.getLegalActions(this.matchState, controller.playerId).length > 0);
    if (anySeatCanAct) return;
    const systemAction = registry.getSystemAction(gameId, this.matchState, rng);
    if (systemAction === null) return;
    const result = module.applyAction(this.matchState, systemAction);
    if (!result.ok) return; // a misbehaving requestSystemAction must not crash the room
    this.matchState = result.state;
    this.broadcastViews();
    await this.advance();
  }

  private findActingBot(): { readonly playerId: PlayerId; readonly strategy: BotStrategy<unknown, ErasedAction> } | undefined {
    const module = this.module;
    if (module === undefined || this.matchState === undefined) return undefined;
    for (const controller of this.controllers.values()) {
      if (controller.kind === "bot" && module.getLegalActions(this.matchState, controller.playerId).length > 0) return controller;
    }
    return undefined;
  }

  private broadcastViews(): void {
    const module = this.module;
    if (module === undefined || this.matchState === undefined) return;
    for (const controller of this.controllers.values()) {
      if (controller.kind === "human") controller.client.send("view", module.getViewFor(this.matchState, controller.playerId));
    }
  }
}
