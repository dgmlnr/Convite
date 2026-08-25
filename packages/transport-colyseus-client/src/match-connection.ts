import type { BotTier, GameId, PlayerId, RuleViolation } from "@hexdev/platform-contract";
import type { ClientLike, Unsubscribe } from "./ports.js";

/** Matches `apps/server`'s `gameServer.define("match", MatchRoom, ...)` and
 * `PresenceRoom.handOffToMatch`'s default `matchRoomName` — one config value
 * owned by this file, same discipline as `presence-connection.ts`'s
 * `PRESENCE_ROOM_NAME`. */
const MATCH_ROOM_NAME = "match";

/** The erased action shape every conformant `GameModule` requires
 * structurally (`platform-contract`'s `TAction extends {playerId}` bound) —
 * this package never knows a specific game's real action union, only that
 * every action carries its actor's identity, matching `MatchRoom`'s own
 * `ErasedAction` on the server side. */
export type ErasedAction = { readonly playerId: PlayerId } & Record<string, unknown>;

/**
 * The game-agnostic connection to a live `MatchRoom` — the port
 * `apps/widget-app` depends on. `TView` stays a type parameter the CALLER
 * supplies (the widget knows which game it is joining and what shape its
 * own view is); this package never inspects the view's contents, only
 * relays whatever `MatchRoom.broadcastViews` already sent.
 */
export interface MatchConnection<TView = unknown> {
  readonly roomId: string;
  readonly reconnectionToken: string;
  /** Fires on every `"view"` message — `MatchRoom` sends one after every
   * mutation the module accepts (own-seat redaction already applied
   * server-side, this package never re-derives it). */
  onView(callback: (view: TView) => void): Unsubscribe;
  /** Fires on every `"action-rejected"` message — the server-authoritative
   * rejection path (spec: "Server-Authoritative Multiplayer State"). */
  onActionRejected(callback: (violation: RuleViolation) => void): Unsubscribe;
  onDisconnected(callback: (code: number, reason?: string) => void): Unsubscribe;
  sendAction(action: ErasedAction): void;
  /**
   * Send an action AND ask to be told what the game makes of it, privately.
   *
   * Separate from `sendAction` because the two are not the same request: this
   * one is a question, and a question expects an answer addressed to the
   * asker alone. Everything else about it is identical — same authentication,
   * same legality, same rejection path through `onActionRejected` — so a
   * refused consult is refused exactly like any other action.
   */
  sendConsult(action: ErasedAction): void;
  /** Fires on every `"consult-advice"` message: the private answer to a
   * consult this client sent. Never broadcast, so it arrives only here. */
  onConsultAdvice(callback: (advice: unknown) => void): Unsubscribe;
  leave(consented?: boolean): Promise<void>;
  /**
   * Leave the match ON PURPOSE — the player chose to walk away, as opposed
   * to a reload, a teardown or a lost connection.
   *
   * Distinct from `leave()` because the SERVER has to be able to tell them
   * apart: `MatchRoom.onLeave` holds a departing seat open for its
   * reconnection window, which is right for a drop and wrong for a decision
   * — the remaining players would wait out a window for someone who already
   * walked. This announces the intent while the socket is still open, so the
   * room hands the seat to a bot at once, and only then closes.
   */
  quit(): Promise<void>;
}

function wrapMatchRoom<TView>(room: Awaited<ReturnType<ClientLike["join"]>>): MatchConnection<TView> {
  return {
    roomId: room.roomId,
    reconnectionToken: room.reconnectionToken,
    onView: (callback) => room.onMessage<TView>("view", callback),
    onActionRejected: (callback) => room.onMessage<RuleViolation>("action-rejected", callback),
    onDisconnected: (callback) => {
      room.onLeave(callback);
      return () => {
        /* `RoomLike.onLeave` (real @colyseus/sdk `Room`) has no per-callback
         * removal in this package's narrow port — matches `onLeave`'s own
         * real-SDK shape, which is a single-slot EventEmitter subscription
         * per room instance, not a re-subscribable list like onMessage. */
      };
    },
    sendAction: (action) => room.send("action", action),
    sendConsult: (action) => room.send("consult", action),
    onConsultAdvice: (callback) => room.onMessage<{ readonly advice: unknown }>("consult-advice", (message) => { callback(message.advice); }),
    // Defaults to `false`, the OPPOSITE of real @colyseus/sdk `Room.leave`'s
    // own default (`true`). Found running this live, not assumed: `true`
    // sends a LEAVE_ROOM protocol message and waits for the SERVER to close
    // the connection before resolving (verified in the SDK's own source) —
    // but `MatchRoom.onLeave` ALWAYS awaits the ~30s reconnection window
    // first, for EVERY departure, consented or not (its own docstring: "no
    // 'quit' affordance yet that should skip it"). A widget calling
    // `leave()` on a genuine exit would hang for up to 30s waiting on a
    // server-side window it has no way to skip. `false` closes THIS
    // client's own connection immediately — the server's reconnection
    // window is unaffected either way (`MatchRoom.onLeave` doesn't branch
    // on `consented`), so this default only changes when the CALLER'S OWN
    // promise resolves, not what the server does. A caller that specifically
    // wants the graceful, server-notified leave can still pass `true`.
    leave: (consented = false) => room.leave(consented).then(() => undefined),
    // Send first, close second — see the interface docstring. The payload is
    // empty on purpose: the room already knows which seat this connection
    // holds, and a client-supplied seat would be a claim to validate rather
    // than a fact to read.
    quit: async () => {
      room.send("quit", {});
      await room.leave(false);
    },
  };
}

/**
 * Consumes the OPAQUE seat reservation `PresenceRoom`'s "paired" message
 * carried (`presence-connection.ts`'s `PairedMatch.reservation`) — the
 * client's half of the lobby hand-off (obs 2952). This package never
 * inspects or validates the reservation's contents: only
 * `MatchRoom.onAuth`, server-side, decides whether the resulting live join
 * is actually accepted. A rejected reservation (e.g. an invalid token)
 * rejects this promise — the caller's job to surface that, never this
 * package's to retry blindly, since a rejected auth is not transient.
 */
export function joinMatchFromReservation<TView = unknown>(client: ClientLike, reservation: unknown): Promise<MatchConnection<TView>> {
  return client.consumeSeatReservation(reservation).then(wrapMatchRoom<TView>);
}

export interface StartBotMatchOptions {
  readonly gameId: GameId;
  readonly config: unknown;
  readonly botTier: BotTier;
  readonly playerId: string;
  readonly token?: string;
  /** How many real seats to wait for before bot-filling the rest
   * (`MatchRoomCreateOptions.humanSeatsNeeded`) — omitted for every existing
   * 1v1 caller, so the server-side default (1) applies unchanged. A 2v2
   * entry point (e.g. "2 real players vs 2 bot-filled seats") passes 2. */
  readonly humanSeatsNeeded?: number;
}

/**
 * Single-player vs bot (spec: "no lobby wait"). Deliberately `client.create`,
 * never `client.joinOrCreate` — `PresenceRoom`/`MatchRoom` are registered
 * with no `filterBy` (a pre-existing, disclosed gap, see this unit's own
 * report), so `joinOrCreate` could hand a client an UNRELATED already-open
 * room of the same Colyseus room name. `create` always makes a fresh room
 * server-side (`MatchRoomCreateOptions.gameId`/`config`/`botTier` win
 * because `server.ts`'s own `defaultOptions` merge only protects
 * `registry`/`auth`/`rng`, not these three — verified in that file's own
 * comment, obs 2941), so there is no ambiguity about which room is created.
 */
export function startBotMatch<TView = unknown>(client: ClientLike, options: StartBotMatchOptions): Promise<MatchConnection<TView>> {
  return client
    .create(MATCH_ROOM_NAME, {
      gameId: options.gameId,
      config: options.config,
      botTier: options.botTier,
      token: options.token,
      // Omitted entirely (not sent as `undefined`) when the caller doesn't
      // pass it, so the server-side default (1 human seat) applies exactly
      // as it did before this field existed — every 1v1 caller is unchanged.
      ...(options.humanSeatsNeeded !== undefined ? { humanSeatsNeeded: options.humanSeatsNeeded } : {}),
    })
    .then(wrapMatchRoom<TView>);
}

export interface ReconnectMatchOptions {
  /** Bounded retry budget for a TRANSIENT failure (a dropped network blip
   * during the server's reconnection window) — never unbounded, and never a
   * substitute for the window itself expiring server-side (design §9: the
   * server hands the seat to a bot once its own window elapses regardless
   * of how many client-side attempts remain). */
  readonly retries?: number;
  readonly retryDelayMs?: number;
}

const DEFAULT_RECONNECT_RETRIES = 3;
const DEFAULT_RECONNECT_RETRY_DELAY_MS = 500;

function delay(ms: number): Promise<void> {
  return ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * `@colyseus/sdk`'s own `reconnect()` DOES carry a distinguishing signal for
 * two specific, genuinely PERMANENT rejection reasons — verified by reading
 * `@colyseus/core`'s `MatchMaker.ts` (server-side `reconnect()`) and
 * `@colyseus/shared-types`' `Protocol.ts` source directly, not assumed: a
 * `MatchMakeError` whose `.code` is `522` (`ErrorCode.MATCHMAKE_INVALID_ROOM_ID`
 * — the room has been disposed, e.g. the server restarted since the token was
 * stored) or `524` (`MATCHMAKE_EXPIRED` — the reconnection token itself is
 * stale). Retrying either can never succeed: the room is gone for good, or
 * the token will never become valid again. A real session found a stale
 * stored token logging one console error PER retry attempt (four, matching
 * this function's own default retry budget) before correctly falling back to
 * the catalogue (apply prompt, round 4) — the fallback itself was already
 * correct (`tryResumeSession` swallows the final rejection), but every one
 * of those doomed retries was pure, avoidable noise. This package
 * deliberately never imports `@colyseus/sdk`'s own `MatchMakeError` CLASS
 * here (`ports.ts`'s own documented boundary: this file works only through
 * the narrow, structurally-typed `ClientLike` seam, so a plain
 * `{ code: 522 }`-shaped fake is equally valid to a real error) — a duck-typed
 * check on `.code` is enough and keeps that boundary intact.
 */
function isPermanentReconnectFailure(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const code = (error as { readonly code: unknown }).code;
  return code === 522 || code === 524;
}

/**
 * The client's half of the reconnection window (design §9,
 * `MatchRoom.onLeave`'s `allowReconnection`): resumes the SAME seat with
 * current match state (spec: "Player reconnects within the window"). Retries
 * a bounded number of times on a TRANSIENT failure (e.g. a network blip while
 * the tab was backgrounded) — a genuine PERMANENT rejection (the room is
 * disposed, or the token is expired — see `isPermanentReconnectFailure`'s own
 * doc comment) is never retried, surfacing immediately instead; any OTHER
 * rejection still retries up to the budget, then surfaces the last error —
 * the caller (a bot-takeover UI notice, or `tryResumeSession`'s own silent
 * fallback) decides what a final rejection means, this package only owns the
 * retry mechanics.
 */
export async function reconnectMatch<TView = unknown>(
  client: ClientLike,
  reconnectionToken: string,
  options: ReconnectMatchOptions = {},
): Promise<MatchConnection<TView>> {
  const retries = options.retries ?? DEFAULT_RECONNECT_RETRIES;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RECONNECT_RETRY_DELAY_MS;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const room = await client.reconnect(reconnectionToken);
      return wrapMatchRoom<TView>(room);
    } catch (error) {
      lastError = error;
      if (isPermanentReconnectFailure(error)) throw error;
      if (attempt < retries) await delay(retryDelayMs);
    }
  }
  throw lastError;
}
