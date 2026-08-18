/**
 * The per-turn countdown's arithmetic and wording, kept apart from the DOM
 * that shows it.
 *
 * The server sends an ABSOLUTE deadline on every "view" message
 * (`transport-colyseus`'s `viewMessageFor`), never a remaining count and never
 * a per-second tick: a countdown is a number the client can derive on its own,
 * and ticking it server-side would be per-match-per-second traffic for
 * something arithmetic already answers. This module is that arithmetic — plus
 * the two coarse sentences a screen reader gets instead of the pill (the pill
 * itself is aria-hidden; `table.ts`'s `appendTurnBadge` argues why).
 */
import { TABLE_STRINGS } from "./strings.js";

/** Milliseconds remaining -> whole seconds, the ONE rounding rule every face
 * of this clock shares.
 *
 * Rounds UP, deliberately. A clock armed for exactly one minute must read
 * "1:00" on its first frame — `Math.floor` would show "0:59" before the
 * player had even looked at it, and would spend the final whole second
 * showing "0:00" while the turn was in fact still live.
 *
 * Clamps at zero rather than going negative: once a deadline has passed there
 * is a real window (the server's own bot decision is in flight) during which
 * the client still holds the stale deadline, and "-0:03" would read as a bug.
 */
export function remainingWholeSeconds(remainingMs: number): number {
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

/** Milliseconds remaining -> the pill's text. */
export function formatCountdown(remainingMs: number): string {
  const totalSeconds = remainingWholeSeconds(remainingMs);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** How low the clock gets before the ONE spoken warning. Ten whole seconds:
 * late enough to be genuinely about running out (the default turn is 60s —
 * `transport-colyseus`'s DEFAULT_TURN_TIMEOUT_SECONDS), early enough that a
 * polite region — which waits for the reader to finish whatever it is saying
 * — still gets the sentence out while acting on it remains possible. There is
 * deliberately no second warning at 5: it would land INSIDE the most
 * time-critical window and queue behind whatever the table is announcing. */
export const TURN_CLOCK_WARNING_SECONDS = 10;

/** The sentence for a turn STARTING on the clock — the total, said once.
 * Wording lives here with the feature, not in announcer.ts (which has no
 * opinion about Spanish), the same split `turn.ts`'s `describeTurn` uses. */
export function describeTurnClockStart(remainingMs: number): string {
  return TABLE_STRINGS.turnClockStart(remainingWholeSeconds(remainingMs));
}

/** The one low-time warning. Takes no argument on purpose: it always names
 * the threshold itself — a coarse "10 left", never the live number, which
 * would be stale by the time a polite region got around to saying it. */
export function describeTurnClockWarning(): string {
  return TABLE_STRINGS.turnClockWarning(TURN_CLOCK_WARNING_SECONDS);
}
