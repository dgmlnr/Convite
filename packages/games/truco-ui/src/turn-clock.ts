/**
 * The per-turn countdown's arithmetic, kept apart from the DOM that shows it.
 *
 * The server sends an ABSOLUTE deadline on every "view" message
 * (`transport-colyseus`'s `viewMessageFor`), never a remaining count and never
 * a per-second tick: a countdown is a number the client can derive on its own,
 * and ticking it server-side would be per-match-per-second traffic for
 * something arithmetic already answers. This module is that arithmetic.
 */

/** Milliseconds remaining -> the pill's text.
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
export function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
