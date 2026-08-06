/**
 * The current time, in epoch milliseconds, shaped exactly like `Date.now`.
 * Lives here (L0, zero deps) for the same reason `RandomSource` does: a
 * rate limiter or replay guard (`platform-core`) needs to be testable
 * without real time passing, and injecting `Clock` instead of calling
 * `Date.now()` directly inside those modules' own logic is what makes
 * that possible.
 */
export type Clock = () => number;
