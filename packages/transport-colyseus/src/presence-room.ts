import { Room, matchMaker, type Client } from "@colyseus/core";
import type { BotTier, GameId } from "@hexdev/platform-contract";
import type { GameModuleRegistry, MatchmakingPool, ModalityConfig, PresenceSweeper, SeatGroup } from "@hexdev/platform-core";
import { createPresenceSweeper, deriveModalities, modalityKey } from "@hexdev/platform-core";

export interface PresenceRoomCreateOptions {
  readonly gameId: GameId;
  readonly registry: GameModuleRegistry;
  readonly pool: MatchmakingPool;
  /** Cross-tenant by default (`GLOBAL_POOL_KEY` in `MatchmakingPool` if
   * omitted) — a per-tenant deployment passes the tenant id here, a config
   * value, never a redesign (design §8). */
  readonly poolKey?: string;
  readonly sweeper?: PresenceSweeper;
  readonly sweepTickMs?: number;
  /** The Colyseus room name a pairing is handed off into — the SAME name
   * `createMatchServer` registers `MatchRoom` under (default `"match"`).
   * A config value only: `PresenceRoom` never imports `MatchRoom`, keeping
   * the lobby ignorant of any specific game-room implementation. */
  readonly matchRoomName?: string;
  /** PR-2b: how long the OLDEST waiter in a modality whose game needs MORE
   * than 2 seats may wait before the queue degrades — the humans present are
   * handed off and the remaining seats bot-filled (default 30). A duration
   * in seconds, deliberately the same shape as `MatchRoom`'s own
   * `reconnectionWindowSeconds`: tests make this fast by passing a tiny
   * value (`0.05`) exactly the way the reconnection tests already pass
   * `0.01`, never by faking a clock. A 2-seat queue NEVER degrades — its
   * lone waiter already has the client-side bot CTA (zero-counter UX rule),
   * so 1v1 behavior stays byte-for-byte. */
  readonly botFillAfterSeconds?: number;
}

interface PresenceJoinOptions {
  /** THE DEFENSE-IN-DEPTH HALF of this unit's fix (apply-progress obs
   * 2925/2927, roadmap obs 2943). `apps/server`'s own `gameServer.define`
   * registers this room with `.filterBy(["gameId"])`, which is what steers a
   * REAL client's `joinOrCreate` to the right already-open room in the first
   * place — but `filterBy` only governs colyseus's own room SELECTION; it
   * says nothing about a client that already targets a specific `roomId`
   * directly (`joinById`, a stale client from a future refactor, or a
   * hand-crafted join). `onJoin` below compares this field against the
   * room's OWN `gameId` (fixed at `onCreate`, never client-suppliable at
   * that point) and rejects a mismatch outright — the same "fails closed"
   * convention `MatchRoom.onAuth` already established, not a new one
   * invented here. Previously this field was never even read (the disclosed
   * defect this unit closes): every real client already sends it
   * (`@hexdev/transport-colyseus-client`'s `watchPresence`/
   * `joinMatchmakingQueue`), so making it load-bearing costs nothing on the
   * wire, only in this room's own trust boundary. */
  readonly gameId: GameId;
  /** Omitted entirely = watch-only (spec: the selection screen must show
   * live counts for every modality of a game BEFORE a player has committed
   * to any one of them). Present = queue for that exact modality, unchanged
   * behavior. `@hexdev/transport-colyseus-client`'s `watchPresence`/
   * `joinMatchmakingQueue` are the two client-side callers of these two
   * shapes respectively — never the same join call. */
  readonly modality?: ModalityConfig;
  readonly playerId: string;
  /** The player's own session token (design §7), forwarded UNVALIDATED into
   * the eventual `MatchRoom` seat reservation so `MatchRoom.onAuth` — not
   * this room — stays the ONLY place identity is ever verified (signature,
   * origin, entitlement, replay). `PresenceRoom` still performs NO join-time
   * auth of its own (unchanged v1 scope boundary, obs 2927): this field is
   * custodied, never inspected, never trusted for anything presence-side. */
  readonly token?: string;
}

interface WaitingClient {
  readonly client: Client;
  readonly modality: ModalityConfig;
  readonly playerId: string;
  readonly token: string | undefined;
  /** When this client entered the queue — `Date.now()`, the same wall clock
   * `createPresenceSweeper` already defaults to in this transport layer
   * (never a clock inside any game engine). Read only by the degradation
   * sweep's age check. */
  readonly enqueuedAt: number;
}

const DEFAULT_BOT_FILL_AFTER_SECONDS = 30;

/** The tier a degradation-fill bot plays at: "normal" — deliberately the
 * SAME value (and the same obs-2919 rationale: easy would hand the match
 * over, hard would punish a wait that was never the player's fault) as
 * `match-room.ts`'s `DEFAULT_TAKEOVER_TIER`, but DUPLICATED rather than
 * imported: `PresenceRoom` never imports `MatchRoom` (see
 * `PresenceRoomCreateOptions.matchRoomName`'s own docstring — the lobby
 * stays ignorant of any specific game-room implementation), and exporting
 * the constant from match-room.ts just to share one string would create
 * exactly the coupling that boundary exists to prevent. */
const DEGRADED_FILL_TIER: BotTier = "normal";

/** One seat of a formed group, paired with the `WaitingClient` (if still
 * tracked) that is about to be handed off into the match room. */
interface PairedSeat {
  readonly playerId: string;
  readonly entry: WaitingClient | undefined;
}

/**
 * The lobby presence channel (design §8), separate from any `MatchRoom` —
 * clients here are waiting for a match, not playing one. Holds zero
 * game-specific knowledge: every modality is derived from
 * `registry.get(gameId).configOptions`, the SAME generic mechanism a
 * `GameModule` already exposes for truco's point target. Nothing in this
 * file reads a modality field by name (roadmap constraint, obs 2943).
 *
 * Deliberately no join-time auth (unlike `MatchRoom`): this room reveals
 * only aggregate counts and pairs anonymous connections, never game state.
 *
 * GAME ISOLATION (this unit, apply-progress obs 2925/2927): a real client's
 * `joinOrCreate` is steered to the correct already-open room by
 * `.filterBy(["gameId"])` on this room's registration (`apps/server`'s
 * composition root) — that is colyseus's own SELECTION mechanism, necessary
 * but not sufficient. `onJoin` below is the second, independent layer: it
 * compares a joining client's CLAIMED `gameId` against this room's OWN
 * `gameId` (fixed at `onCreate`, never client-suppliable at that point) and
 * rejects any mismatch, so a join that bypasses `filterBy` entirely (a
 * specific `roomId` targeted directly, a stale client, a hand-crafted join)
 * still cannot silently inherit the wrong game.
 */
export class PresenceRoom extends Room {
  private gameId: GameId | undefined;
  private registry: GameModuleRegistry | undefined;
  private pool: MatchmakingPool | undefined;
  private poolKey: string | undefined;
  private sweeper: PresenceSweeper | undefined;
  private matchRoomName = "match";
  private botFillAfterMs = DEFAULT_BOT_FILL_AFTER_SECONDS * 1000;
  private sweepInterval: ReturnType<typeof setInterval> | undefined;
  private readonly waiting = new Map<string, WaitingClient>();

  /**
   * The clients that joined to WATCH, by session id — the audience `counts`
   * is written for.
   *
   * A SECOND MAP AND NOT A FLAG ON `waiting`, because the two are disjoint by
   * construction: `onJoin` returns early for a watch-only join and never
   * reaches the enqueue below it, so a client is in exactly one of these for
   * its whole life in this room. A single map with a discriminant would have
   * to be read carefully at four call sites to say the same thing this says
   * by existing.
   *
   * WHY IT HAD TO EXIST AT ALL. `counts` used to go out as a room-wide
   * broadcast, so it also reached the clients that had enqueued — and
   * `presence-connection.ts`'s `joinMatchmakingQueue` listens for `paired`
   * and `pairing-failed`, and for nothing else. Every one of those was a
   * message with nowhere to land, which the colyseus SDK reports in the
   * player's own console, once per broadcast.
   *
   * The obvious repair — broadcast to everyone EXCEPT those still waiting —
   * is wrong at the moment that matters: `tryFormGroup` removes a paired
   * player from `waiting` and only THEN publishes the new numbers, so the
   * player it just paired is no longer excluded while still being connected.
   * "The clients that asked to watch" is the only description that stays
   * true at both the join and the pairing.
   */
  private readonly watchers = new Map<string, Client>();

  override onCreate(options: PresenceRoomCreateOptions): void {
    if (options.registry.get(options.gameId) === undefined) {
      throw new Error(`PresenceRoom: no GameModule registered for gameId "${options.gameId}"`);
    }
    this.gameId = options.gameId;
    this.registry = options.registry;
    this.pool = options.pool;
    this.poolKey = options.poolKey;
    this.matchRoomName = options.matchRoomName ?? "match";
    this.sweeper = options.sweeper ?? createPresenceSweeper();
    this.botFillAfterMs = (options.botFillAfterSeconds ?? DEFAULT_BOT_FILL_AFTER_SECONDS) * 1000;
    // Counters do not need 20Hz sync (design §8).
    this.setPatchRate(1000);
    // One tick, two sweeps: the zombie backstop and PR-2b's degradation
    // check share one cadence — no second interval to reason about. A RAW
    // Node interval (the same raw-timer idiom `MatchRoom.armTurnTimer`
    // already uses), NOT `this.clock.setInterval`, and the switch is a bug
    // fix, not a style choice: the room's own clock is constructed with
    // autoStart=false and only ever ticked from `broadcastPatch()` (verified
    // in the installed `@colyseus/core@0.17.46` source — Room.ts:177
    // `new Clock()`, Room.ts:928 the tick), so with this room's 1000ms patch
    // rate any sub-second `sweepTickMs` was silently quantized to ~1s —
    // exactly what a test passing a tiny `botFillAfterSeconds` cannot absorb.
    // `unref` so a pending tick never holds a test process open; cleared in
    // `onDispose` because colyseus's teardown only clears ITS clock's timers.
    // Both sweeps contained: a transient pool failure (a Redis blip, most
    // concretely) must skip THIS tick and let the next one retry — never
    // escape a timer callback as an unhandled rejection, which Node treats
    // as fatal to the whole process (the exact crash class MatchRoom's
    // `runAdvanceOnce` docstring documents). `sweepZombies` was equally
    // uncontained before PR-2b added this second sweep; one shared fix.
    this.sweepInterval = setInterval(() => {
      void this.sweepZombies().catch(() => undefined);
      void this.degradeLongWaits().catch(() => undefined);
    }, options.sweepTickMs ?? 1000);
    this.sweepInterval.unref?.();
  }

  override onDispose(): void {
    if (this.sweepInterval !== undefined) clearInterval(this.sweepInterval);
    this.sweepInterval = undefined;
  }

  override async onJoin(client: Client, options: PresenceJoinOptions): Promise<void> {
    const pool = this.pool;
    const gameId = this.gameId;
    if (pool === undefined || gameId === undefined) return;
    // Defense in depth (see `PresenceJoinOptions.gameId`'s own docstring):
    // this room's OWN gameId, fixed at `onCreate`, is the only trusted
    // source — a joining client's CLAIMED gameId is checked against it and
    // rejected on any mismatch, BEFORE it can ever reach the pool/queue
    // below. Thrown here, `onJoin` throwing disconnects the client with an
    // error (verified in the installed `@colyseus/core` source, `Room.ts`'s
    // `_onJoin`: an exception here calls `_onLeave` and re-throws), the exact
    // same fail-closed shape `MatchRoom.onAuth` already uses for every
    // rejection.
    if (options.gameId !== gameId) {
      throw new Error(`PresenceRoom: join rejected, claimed gameId "${options.gameId}" does not match this room's game "${gameId}"`);
    }
    // Watch-only: broadcast the CURRENT snapshot so a freshly-connected
    // watcher does not wait for someone else's queue activity to see its
    // first "counts" message, but never track/enqueue/pair this client.
    if (options.modality === undefined) {
      // Registered BEFORE the publish below, so the snapshot that publish
      // exists to deliver actually reaches the client it is for.
      this.watchers.set(client.sessionId, client);
      // FORCED: this is the watcher's first snapshot, and "nothing changed
      // since the last watcher" is precisely when it still needs sending.
      void this.broadcastCounts(true);
      return;
    }
    await pool.join(gameId, options.modality, { connectionId: client.sessionId, playerId: options.playerId }, this.poolKey);
    this.waiting.set(client.sessionId, { client, modality: options.modality, playerId: options.playerId, token: options.token, enqueuedAt: Date.now() });
    await this.broadcastCounts();
    await this.tryFormGroup(options.modality);
  }

  override async onLeave(client: Client): Promise<void> {
    // FIRST, and above the early return below it. That return is written for
    // a client with no queue entry, which is exactly what a watcher is — so
    // anything filed after it never runs for one, and a watcher that left
    // would be published to forever.
    this.watchers.delete(client.sessionId);
    const entry = this.waiting.get(client.sessionId);
    const pool = this.pool;
    const gameId = this.gameId;
    if (entry === undefined || pool === undefined || gameId === undefined) return;
    await pool.leave(gameId, entry.modality, client.sessionId, this.poolKey);
    this.waiting.delete(client.sessionId);
    await this.broadcastCounts();
  }

  /**
   * On a formed group: remove all of its members from the queue (unchanged,
   * exactly once — `MatchmakingPool.tryPairSeats` pops atomically), THEN
   * hand off into a real `MatchRoom` via Colyseus's own seat-reservation
   * mechanism. The group size is the game's OWN `metadata.seatCount` — the
   * exact field `MatchRoom.onCreate` sizes its seats from, read from the
   * same registry — so a 2-seat and a 4-seat game need zero lobby changes
   * and can never disagree with the room they are handed into. Reading it
   * dynamically is safe with no guard here: `createGameModuleRegistry`
   * rejects any module whose seatCount is not an integer >= 2 at
   * composition time, so `tryPairSeats`'s own validation (a strictly wider
   * predicate since PR-2b: it admits >= 1, for the degradation sweep's
   * arity-k claims below) can never reject a registry-resolved value — a
   * misregistered game fails the boot, never a player's join.
   */
  private async tryFormGroup(modality: ModalityConfig): Promise<void> {
    const pool = this.pool;
    const gameId = this.gameId;
    const module = gameId !== undefined ? this.registry?.get(gameId) : undefined;
    if (pool === undefined || gameId === undefined || module === undefined) return;
    const group: SeatGroup | null = await pool.tryPairSeats(gameId, modality, module.metadata.seatCount, this.poolKey);
    if (group === null) return;
    const seats: readonly PairedSeat[] = group.players.map((player) => {
      const entry = this.waiting.get(player.connectionId);
      this.waiting.delete(player.connectionId);
      return { playerId: player.playerId, entry };
    });
    await this.broadcastCounts();
    await this.handOffToMatch(gameId, modality, seats);
  }

  /**
   * PR-2b: the degradation path `handOffToMatch`'s docstring names rather
   * than silently absorbs. When the OLDEST waiter of a modality has aged
   * past `botFillAfterSeconds` AND the game needs MORE than 2 seats, the k
   * humans present are handed off with the remaining seats bot-filled —
   * through the SAME two-phase hand-off, into the SAME `MatchRoom`, via its
   * EXISTING `botTier`/`humanSeatsNeeded` options. Never a second system,
   * and never for a 2-seat game: that guard is strict (`> 2`) so 1v1
   * behavior stays byte-for-byte (its lone waiter already has the
   * client-side bot CTA; a 2-seat queue is never bot-filled server-side).
   *
   * k is THIS room's tracked waiting count for the modality, and a count
   * that already reached seatCount is SKIPPED, not capped: it means an
   * in-flight `onJoin`'s `tryFormGroup` is about to pop the full group, and
   * popping seatCount-1 of them here would strand the last joiner alone in
   * the queue while seating their would-be partners with a bot — strictly
   * worse than letting the normal path take all N (any residue is simply
   * re-examined next tick). The pool pop is the port's own atomic arity-k
   * claim (`assertValidSeatCount` admits >= 1 exactly for this caller), so
   * a concurrent pop can never double-claim a waiter; a popped connection
   * this room does not track fails the WHOLE group inside `handOffToMatch`,
   * the same containment `tryFormGroup` already relies on.
   *
   * Ages come from `WaitingClient.enqueuedAt` (`Date.now()`, the transport
   * layer's own idiom — see that field's docstring); the engine never sees
   * a clock. Grouping is by `modalityKey`, the same canonical key the pool
   * itself queues by — no modality field is ever read by name.
   */
  private async degradeLongWaits(): Promise<void> {
    const pool = this.pool;
    const gameId = this.gameId;
    const module = gameId !== undefined ? this.registry?.get(gameId) : undefined;
    if (pool === undefined || gameId === undefined || module === undefined) return;
    const seatCount = module.metadata.seatCount;
    if (seatCount <= 2) return;
    const byModality = new Map<string, { readonly modality: ModalityConfig; readonly entries: WaitingClient[] }>();
    for (const entry of this.waiting.values()) {
      const key = modalityKey(entry.modality);
      const bucket = byModality.get(key) ?? { modality: entry.modality, entries: [] };
      bucket.entries.push(entry);
      byModality.set(key, bucket);
    }
    const now = Date.now();
    for (const { modality, entries } of byModality.values()) {
      // `waiting` is insertion-ordered (a Map), so the first tracked entry
      // of a modality IS its oldest waiter.
      if (now - entries[0]!.enqueuedAt < this.botFillAfterMs) continue;
      const k = entries.length;
      if (k >= seatCount) continue; // the normal tryFormGroup path's group — see docstring
      const group: SeatGroup | null = await pool.tryPairSeats(gameId, modality, k, this.poolKey);
      if (group === null) continue;
      const seats: readonly PairedSeat[] = group.players.map((player) => {
        const entry = this.waiting.get(player.connectionId);
        this.waiting.delete(player.connectionId);
        return { playerId: player.playerId, entry };
      });
      await this.broadcastCounts();
      await this.handOffToMatch(gameId, modality, seats, { botTier: DEGRADED_FILL_TIER, humanSeatsNeeded: k });
    }
  }

  /**
   * Two strict phases, so "reserving EVERY seat before any client even
   * receives the `paired` message" is literal truth for N seats — never a
   * second, lighter identity path: each reservation carries only the
   * player's own token, UNVALIDATED here (never `authData`), so
   * `MatchRoom.onAuth` alone still decides whether the eventual live join
   * is accepted.
   *
   * PHASE A reserves ALL N seats before ANY member learns the room exists.
   * That closes the seat-theft window a naive "tell them the roomId, let
   * them self-join" hand-off would leave open: colyseus counts reserved
   * seats in `hasReachedMaxClients()` and LOCKS the room the moment they
   * reach `maxClients`, so an outsider — even one holding a valid token —
   * can never join in between.
   *
   * PHASE B, only entered once every reservation exists, sends `paired` to
   * all N. All-or-nothing on purpose IN PHASE A: one vanished member (left
   * between the pool pop and here) or one failed reservation fails the
   * WHOLE group with `pairing-failed` to every member still reachable —
   * seating the survivors instead would strand them in a room whose
   * remaining seat can never be filled by its intended human (its
   * predecessor silently skipped a vanished 2-seat member and still paired
   * the survivor: exactly that hang). The `paired` roster is one shared
   * fact — the full group in formation order, recipient included — never a
   * per-recipient "opponent" view, which stops meaning anything once
   * teammates exist (2v2).
   *
   * Phase B failures are deliberately NOT all-or-nothing: each send is
   * contained per member, so a connection that died during phase A's
   * awaits can neither escape `onJoin` as an unhandled rejection nor
   * starve the members AFTER it in delivery order of seats they genuinely
   * hold. Before reservations exist the group can still be aborted
   * cleanly; after, the others' seats are real, and revoking them because
   * a third party's socket hiccuped would be strictly worse. Nobody is
   * told `pairing-failed` either — the hand-off SUCCEEDED for everyone
   * reachable, and the unreachable member's reservation is colyseus's own
   * problem, with a verified answer: a never-consumed reservation expires
   * after `seatReservationTimeout` (default 15s — Room.ts:41 in the
   * installed `@colyseus/core@0.17.46`), its expiry timer deletes the seat
   * and decrements the client count (Room.ts:1498-1502), and that
   * decrement UNLOCKS a maxClients-locked room (Room.ts:1792-1806) — the
   * match is never left unstartable-forever by colyseus itself. The
   * residual — a room waiting on a human who will never arrive — is the
   * degradation path PR-2b's timeout owns (`degradeLongWaits` above), named
   * here rather than silently absorbed.
   *
   * `botFill` (PR-2b) keeps degradation on THIS one hand-off path: when
   * present it rides into `createRoom`'s options, where `MatchRoom.onCreate`
   * already knows how to pre-seat bots (`botTier`/`humanSeatsNeeded` — the
   * exact mechanism single-player mode uses, not a parallel one). Everything
   * else — both phases, per-member containment, the shared `paired` roster
   * (the k humans in formation order; bots mint their identities inside
   * `MatchRoom` and are never part of the lobby's shared fact) — is
   * byte-identical for a full-human and a degraded group.
   */
  private async handOffToMatch(
    gameId: GameId,
    modality: ModalityConfig,
    seats: readonly PairedSeat[],
    botFill?: { readonly botTier: BotTier; readonly humanSeatsNeeded: number },
  ): Promise<void> {
    const members: Array<{ readonly playerId: string; readonly entry: WaitingClient }> = [];
    for (const seat of seats) {
      if (seat.entry === undefined) {
        this.notifyHandoffFailure(seats, new Error("a paired member left before the hand-off could reserve their seat"));
        return;
      }
      members.push({ playerId: seat.playerId, entry: seat.entry });
    }
    let room: Awaited<ReturnType<typeof matchMaker.createRoom>>;
    try {
      room = await matchMaker.createRoom(this.matchRoomName, { gameId, config: modality, ...botFill });
    } catch (error) {
      this.notifyHandoffFailure(seats, error);
      return;
    }
    // Phase A. Sequential on purpose: N is tiny (a game's seatCount) and a
    // `Promise.all` would leave later reservations in flight after an
    // earlier rejection, when this hand-off is already committed to failing.
    const reservations: unknown[] = [];
    try {
      for (const member of members) {
        reservations.push(await matchMaker.reserveSeatFor(room, { token: member.entry.token }));
      }
    } catch (error) {
      this.notifyHandoffFailure(seats, error);
      // Best-effort only: the abandoned room disposes itself anyway once its
      // unconsumed reservations expire — this merely shortens that wait, so
      // a failure here is deliberately ignored.
      await matchMaker.remoteRoomCall(room.roomId, "disconnect").catch(() => undefined);
      return;
    }
    // Phase B: every seat is reserved (and the room therefore locked).
    // Per-member containment — see the docstring's phase B paragraph.
    const players: readonly string[] = members.map((member) => member.playerId);
    members.forEach((member, index) => {
      try {
        member.entry.client.send("paired", { players, modality, matchReservation: reservations[index] });
      } catch {
        // This member's connection died between its reservation and this
        // delivery. Its seat expires under colyseus's own reservation TTL;
        // the other members' deliveries must not be disturbed.
      }
    });
  }

  private notifyHandoffFailure(seats: readonly PairedSeat[], error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    for (const { entry } of seats) entry?.client.send("pairing-failed", { message });
  }

  /** Backstop for an `onLeave` a transport never delivered (design §8): a
   * connectionId this room is NOT tracking is never touched, so this only
   * ever affects entries owned by THIS presence channel, never another
   * game's queue sharing the same `pool` instance. */
  private async sweepZombies(): Promise<void> {
    const pool = this.pool;
    const sweeper = this.sweeper;
    if (pool === undefined || sweeper === undefined) return;
    await sweeper.maybeSweep(pool, (connectionId) => {
      if (!this.waiting.has(connectionId)) return true;
      const alive = this.clients.some((seated) => seated.sessionId === connectionId);
      if (!alive) this.waiting.delete(connectionId);
      return alive;
    });
    await this.broadcastCounts();
  }

  /**
   * The last payload actually sent, so an unchanged one is not sent again.
   * `undefined` until the first broadcast, which is why a fresh room always
   * sends once.
   */
  private lastCounts: string | undefined;

  /**
   * WHEN THE NUMBERS CHANGE, NOT ON A TIMER.
   *
   * The sweep runs once a second and used to broadcast on every tick, changed
   * or not. Each of those lands on every open lobby as a "counts" message, and
   * the widget rebuilds its whole selection view on each one -- so an idle
   * lobby with two games was torn down and rebuilt a couple of times a second
   * for numbers that had not moved. Measured with a 20ms tick: ten identical
   * broadcasts in 200ms of nothing happening.
   *
   * FIXED HERE AND NOT IN THE WIDGET, deliberately. `renderGameSelection` has
   * a documented reason for rebuilding unconditionally -- capture-then-restore
   * over skip-identical-rebuild, one mechanism covering both the same-data
   * broadcast and a changed one, with no second cache of presence state to
   * drift from the screen. That argument is about the CLIENT and it still
   * holds. What was wrong was sending a message that says nothing.
   *
   * `force` IS THE HALF THAT MAKES IT SAFE. A watch-only client gets its very
   * first snapshot from this same call (see `onJoin`), so on that path the
   * numbers being unchanged is exactly when it still has to be sent -- a lobby
   * opened during a quiet minute would otherwise show nothing at all.
   */
  private async broadcastCounts(force = false): Promise<void> {
    const gameId = this.gameId;
    const module = gameId !== undefined ? this.registry?.get(gameId) : undefined;
    const pool = this.pool;
    if (gameId === undefined || module === undefined || pool === undefined) return;
    const counts = await Promise.all(
      deriveModalities(module.configOptions).map(async (modality) => ({ modality, waitingCount: await pool.count(gameId, modality, this.poolKey) })),
    );
    const payload = JSON.stringify(counts);
    if (!force && payload === this.lastCounts) return;
    this.lastCounts = payload;
    // TO THE AUDIENCE, not to the room. See `watchers` for why the difference
    // is not cosmetic. One send per watcher is what `broadcast` does
    // internally anyway; what changes is who is on the list.
    for (const watcher of this.watchers.values()) watcher.send("counts", counts);
  }
}
