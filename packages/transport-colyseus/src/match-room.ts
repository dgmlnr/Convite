import { Room, type AuthContext, type Client } from "colyseus";
import type { GameId, GameModule, PlayerId, RandomSource, SeatAssignment } from "@hexdev/platform-contract";
import type { GameModuleRegistry, JtiReplayGuard, SessionTokenIssuer, TenantRepository } from "@hexdev/platform-core";

/** Everything `onAuth` needs to verify a join, injected per-room instead of
 * imported directly: `transport-colyseus` must not know HOW tokens are
 * signed or tenants are stored, only that it can ask. */
export interface MatchRoomAuthOptions {
  readonly issuer: SessionTokenIssuer;
  readonly repository: TenantRepository;
  readonly replayGuard: JtiReplayGuard;
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
}

interface MatchRoomJoinOptions {
  readonly token?: string;
}

/** What `onAuth` resolves and colyseus attaches to `client.auth` — the
 * ONLY source `onJoin` trusts for identity. Never `options.playerId`. */
interface MatchRoomAuth {
  readonly playerId: PlayerId;
}

interface SeatedClient {
  readonly client: Client;
  readonly playerId: PlayerId;
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
export class MatchRoom extends Room {
  private module: GameModule<unknown, { readonly playerId: PlayerId }, unknown, unknown> | undefined;
  private config: unknown;
  private matchState: unknown;
  private auth: MatchRoomAuthOptions | undefined;
  private registry: GameModuleRegistry | undefined;
  private gameId: GameId | undefined;
  private rng: RandomSource | undefined;
  private readonly seats: SeatedClient[] = [];

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
    this.maxClients = module.metadata.seatCount;
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

  override onJoin(client: Client & { auth?: MatchRoomAuth }): void {
    const module = this.module;
    if (module === undefined) {
      throw new Error("MatchRoom: onJoin called before onCreate registered a module");
    }
    const playerId = client.auth?.playerId;
    if (playerId === undefined) {
      throw new Error("MatchRoom: onJoin called without a resolved onAuth identity");
    }
    this.seats.push({ client, playerId });
    if (this.seats.length === module.metadata.seatCount) {
      const seatAssignments: SeatAssignment[] = this.seats.map((seated, seat) => ({ seat, playerId: seated.playerId }));
      this.matchState = module.createMatch(this.config, seatAssignments);
      this.broadcastViews();
      this.maybeAdvanceSystemAction();
    }
  }

  /**
   * Public rather than private: `@colyseus/testing`, the official
   * integration-test harness, pulls in a git-hosted exotic subdependency
   * (`@colyseus/uwebsockets-transport` -> `uWebSockets.js`) blocked by this
   * workspace's pnpm supply-chain policy (`blockExoticSubdeps`). This
   * method is invoked directly in tests instead of over a live WebSocket
   * transport — same behavior, no framing/socket layer to fake.
   */
  handleAction(client: Client, action: unknown): void {
    const module = this.module;
    if (module === undefined || this.matchState === undefined) {
      client.send("action-rejected", { code: "match-not-started", message: "the match has not started yet" });
      return;
    }
    const seated = this.seats.find((seat) => seat.client === client);
    const claimedActor = actorOf(action);
    if (seated === undefined || claimedActor !== seated.playerId) {
      client.send("action-rejected", { code: "actor-mismatch", message: "action does not belong to the authenticated seat" });
      return; // never reaches the module: state deliberately untouched
    }

    let result;
    try {
      // Safe cast: the actor-mismatch check above already proved `action`
      // structurally carries a `playerId` matching the authenticated seat.
      result = module.applyAction(this.matchState, action as { readonly playerId: PlayerId });
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
    this.maybeAdvanceSystemAction();
  }

  /**
   * "Nobody can act, but the match must advance" (design's system-action
   * note): fires whenever every seated player is legal-action-less AND the
   * match has not ended. Delegates entirely to `registry.getSystemAction`
   * (paired with the module by whoever registered it, e.g. `truco-module`'s
   * deal factory) — this room stays ignorant of WHAT the action is or WHY
   * it was needed, same as `handleAction`'s ordinary path. A `null` result
   * (no requestSystemAction registered, or the module decides none is
   * needed right now) is a legitimate no-op, not an error.
   */
  private maybeAdvanceSystemAction(): void {
    const module = this.module;
    const registry = this.registry;
    const gameId = this.gameId;
    const rng = this.rng;
    if (module === undefined || registry === undefined || gameId === undefined || rng === undefined || this.matchState === undefined) return;
    if (module.getOutcome(this.matchState) !== null) return;
    const anySeatCanAct = this.seats.some((seated) => module.getLegalActions(this.matchState, seated.playerId).length > 0);
    if (anySeatCanAct) return;
    const systemAction = registry.getSystemAction(gameId, this.matchState, rng);
    if (systemAction === null) return;
    const result = module.applyAction(this.matchState, systemAction);
    if (!result.ok) return; // a misbehaving requestSystemAction must not crash the room
    this.matchState = result.state;
    this.broadcastViews();
  }

  private broadcastViews(): void {
    const module = this.module;
    if (module === undefined || this.matchState === undefined) return;
    for (const seated of this.seats) {
      seated.client.send("view", module.getViewFor(this.matchState, seated.playerId));
    }
  }
}
