/**
 * The whole fix for obs 2968 in one function: renew a session token FIRST,
 * then perform the join-shaped `action` WITH that fresh token — never with
 * whatever token the caller already had lying around. If renewal itself
 * rejects (rate-limited, disallowed origin, unknown tenant), `action` is
 * never called at all, so a join is never attempted with a stale or absent
 * token. `main.ts` wires this to `startBotMatch`/`joinMatchmakingQueue`; kept
 * here, decoupled from both the DOM and `@hexdev/transport-colyseus-client`,
 * so the sequencing itself is unit-testable without either.
 */
export async function withFreshToken<T>(renewToken: () => Promise<string>, action: (token: string) => Promise<T>): Promise<T> {
  const token = await renewToken();
  return action(token);
}

/**
 * Player identity survives a reload (design §7, apply prompt): a persisted
 * match session — if any — is attempted BEFORE the fresh catalog is ever
 * shown, but ONLY as an attempt: `resume` is `reconnectMatch`, which goes
 * through colyseus's OWN reconnection-window verification (the same
 * server-side proof `MatchRoom.onLeave`'s `allowReconnection` already
 * requires for an in-tab network blip, spec "Disconnect, Reconnection
 * Window, and Bot Takeover") — a rejection here (window already expired, a
 * bot already took the seat, the room is gone) is NOT transient and must
 * never surface as an error to the player; it simply means there is nothing
 * left to resume, so `main.ts` falls through to the ordinary catalog exactly
 * as if no persisted session had ever existed. Mirrors `withFreshToken`'s own
 * shape above: a tiny, DOM-decoupled sequencing helper, unit-testable
 * without either a real transport or a real `localStorage`.
 */
export async function tryResumeSession<TSession, TResult>(
  session: TSession | undefined,
  resume: (session: TSession) => Promise<TResult>,
): Promise<TResult | undefined> {
  if (session === undefined) return undefined;
  try {
    return await resume(session);
  } catch {
    return undefined;
  }
}

export interface DepartureGate {
  hasDeparted(): boolean;
  markDeparted(): void;
  /** The play-again path (spec: "a way to play again without hunting"):
   * once a finished match returns the player to the selection screen, live
   * presence updates should resume redrawing it exactly as they did before
   * the player ever departed. */
  reset(): void;
}

/**
 * Bug fix, found running a real live join (not assumed): the selection
 * screen's live presence watchers stay subscribed for the connection's whole
 * lifetime, and their "counts" handler unconditionally re-rendered the
 * PLAIN selection screen on every broadcast (roughly once a second) — INCLUDING
 * after the player had already moved past it, wiping out a connected-match
 * view or the retry-offering error view within about a second of it
 * appearing. Once a player commits to a join attempt there is nothing left
 * for a live count to usefully redraw — this gate is what `main.ts` checks
 * before honoring a presence broadcast's re-render.
 */
export function createDepartureGate(): DepartureGate {
  let departed = false;
  return {
    hasDeparted: () => departed,
    markDeparted: () => {
      departed = true;
    },
    reset: () => {
      departed = false;
    },
  };
}
