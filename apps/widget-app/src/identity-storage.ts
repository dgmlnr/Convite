/** The minimal structural shape this needs from `window.localStorage` — a
 * plain `Map`-backed double works in a node test, no real DOM required, the
 * same `FetchLike`/`LocationLike` convention `session-renewal.ts`/
 * `match-flow.ts` already use for the same reason. A real `localStorage`
 * satisfies this with zero adapter glue. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const PLAYER_ID_KEY = "convite:player-id";
const MATCH_SESSION_KEY = "convite:active-match";

/**
 * The reconnection-window bearer secret (`MatchConnection.reconnectionToken`
 * — a fresh, server-issued, single-use, ~30s-scoped colyseus secret, NOT the
 * anonymous player id) plus the `gameId` needed to pick the right renderer
 * on resume. Deliberately does NOT carry the anonymous `playerId`: reclaiming
 * a seat is proven by POSSESSING this secret (the exact same proof
 * `MatchRoom.onLeave`'s `allowReconnection` already requires for an in-tab
 * network blip — spec "Disconnect, Reconnection Window, and Bot Takeover"),
 * never by a client merely re-asserting an id.
 */
export interface PersistedMatchSession {
  readonly gameId: string;
  readonly reconnectionToken: string;
}

function isPersistedMatchSession(value: unknown): value is PersistedMatchSession {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { gameId?: unknown }).gameId === "string" &&
    typeof (value as { reconnectionToken?: unknown }).reconnectionToken === "string"
  );
}

/**
 * Merely TOUCHING `window.localStorage` can throw synchronously in a real
 * browser that blocks storage outright (a "block all site data" setting, or
 * a browser that treats this widget's own sandboxed cross-origin iframe as
 * permanently denied) — not only a subsequent read/write on it. This is the
 * ONE place that risk is absorbed: `main.ts` calls this once at boot and
 * every other function in this module takes the resulting `StorageLike |
 * undefined`, so no other call site needs its own try/catch. A probe read
 * (rather than trusting the property access alone) catches a browser that
 * only throws on the FIRST actual operation, not on property lookup.
 * Storage-unavailable is never distinguished from "first-ever visit, no
 * persisted identity" — the player-facing outcome is identical either way:
 * a fresh, ephemeral anonymous id for this one load, exactly today's
 * behavior.
 */
export function getBrowserStorage(windowLike: { readonly localStorage?: StorageLike }): StorageLike | undefined {
  try {
    const storage = windowLike.localStorage;
    if (storage === undefined) return undefined;
    storage.getItem(PLAYER_ID_KEY);
    return storage;
  } catch {
    return undefined;
  }
}

/** Reads the anonymous player id persisted by an EARLIER load, if any.
 * `undefined` covers both "nothing persisted yet" and "storage unavailable"
 * — `main.ts` falls back to this load's own fresh server-minted id in either
 * case, never distinguishing them. */
export function readPersistedPlayerId(storage: StorageLike | undefined): string | undefined {
  if (storage === undefined) return undefined;
  try {
    return storage.getItem(PLAYER_ID_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Best-effort — a write that fails mid-session (quota, a permission
 * revoked after boot) degrades exactly like storage never having been
 * available: this load's own id simply does not survive its own reload. */
export function persistPlayerId(storage: StorageLike | undefined, playerId: string): void {
  if (storage === undefined) return;
  try {
    storage.setItem(PLAYER_ID_KEY, playerId);
  } catch {
    // Degrade silently — see this module's own doc comment.
  }
}

/** `undefined` covers "nothing persisted", "storage unavailable", AND
 * "tampered/malformed JSON" — fails closed in every case: a reload never
 * crashes on a corrupted local value, it simply finds no match to resume. */
export function readPersistedMatchSession(storage: StorageLike | undefined): PersistedMatchSession | undefined {
  if (storage === undefined) return undefined;
  try {
    const raw = storage.getItem(MATCH_SESSION_KEY);
    if (raw === null) return undefined;
    const parsed: unknown = JSON.parse(raw);
    return isPersistedMatchSession(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function persistMatchSession(storage: StorageLike | undefined, session: PersistedMatchSession): void {
  if (storage === undefined) return;
  try {
    storage.setItem(MATCH_SESSION_KEY, JSON.stringify(session));
  } catch {
    // Degrade silently — see this module's own doc comment.
  }
}

/** Called once a match ends (`main.ts`'s `returnToSelection`) or a resume
 * attempt is rejected — a stale entry left behind would only cost one
 * doomed `reconnectMatch` attempt on a later boot (it fails closed, see
 * `main.ts`), never a security or correctness issue, but clearing it keeps
 * that later boot from wasting a round trip on a session that is already
 * over. */
export function clearPersistedMatchSession(storage: StorageLike | undefined): void {
  if (storage === undefined) return;
  try {
    storage.removeItem(MATCH_SESSION_KEY);
  } catch {
    // Degrade silently — see this module's own doc comment.
  }
}
