import { Room, type Client } from "colyseus";
import type { GameId, GameModule, PlayerId, SeatAssignment } from "@hexdev/platform-contract";
import type { GameModuleRegistry } from "@hexdev/platform-core";

export interface MatchRoomCreateOptions {
  readonly gameId: GameId;
  readonly config: unknown;
  readonly registry: GameModuleRegistry;
}

interface MatchRoomJoinOptions {
  readonly playerId: string;
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
  private readonly seats: SeatedClient[] = [];

  override onCreate(options: MatchRoomCreateOptions): void {
    const module = options.registry.get(options.gameId);
    if (module === undefined) {
      throw new Error(`MatchRoom: no GameModule registered for gameId "${options.gameId}"`);
    }
    this.module = module;
    this.config = options.config;
    this.maxClients = module.metadata.seatCount;
    this.onMessage("action", (client, message: unknown) => this.handleAction(client, message));
  }

  override onJoin(client: Client, options: MatchRoomJoinOptions): void {
    const module = this.module;
    if (module === undefined) {
      throw new Error("MatchRoom: onJoin called before onCreate registered a module");
    }
    const playerId = options.playerId as PlayerId;
    this.seats.push({ client, playerId });
    if (this.seats.length === module.metadata.seatCount) {
      const seatAssignments: SeatAssignment[] = this.seats.map((seated, seat) => ({ seat, playerId: seated.playerId }));
      this.matchState = module.createMatch(this.config, seatAssignments);
      this.broadcastViews();
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
  }

  private broadcastViews(): void {
    const module = this.module;
    if (module === undefined || this.matchState === undefined) return;
    for (const seated of this.seats) {
      seated.client.send("view", module.getViewFor(this.matchState, seated.playerId));
    }
  }
}
