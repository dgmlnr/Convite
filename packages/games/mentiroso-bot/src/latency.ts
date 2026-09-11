export { withThinkingDelay } from "@hexdev/platform-core";
export type { Sleep } from "@hexdev/platform-core";

/**
 * `mentiroso`'s OWN latency module (SDD `mentiroso`, task 3.6) — re-exports
 * the shared mechanism `@hexdev/platform-core` already hosts
 * (`thinking-delay.ts`), the same "hoist once a THIRD game needs it" history
 * `escoba-bot/src/latency.ts`'s own docblock records; mentiroso is simply
 * late enough to arrive after that hoist already happened, so this file only
 * ever needed to re-export, never to define, the mechanism itself.
 *
 * Mentiroso has no "spoken" move either (no calls, no señas — `bidding`'s own
 * two actions, raise and doubt, are both silent table moves), so — like
 * `escoba-bot` — this package needs only ONE pause, not `truco-bot`'s own
 * split (`DEFAULT_THINKING_DELAY_MS` / `SPOKEN_MOVE_DELAY_MS`).
 *
 * 2400ms, not `generala-bot`'s 600ms: a raise/doubt is a deliberated wager
 * against a rival's whole hidden hand — closer to truco's own call/response
 * cadence than to generala's own re-roll decision, which reasons about
 * nothing hidden from the decider. A house pacing decision, declared as one,
 * not a sourced number — the same posture every sibling constant here takes.
 */
export const DEFAULT_THINKING_DELAY_MS = 2400;
