export { withThinkingDelay } from "@hexdev/platform-core";
export type { Sleep } from "@hexdev/platform-core";

/**
 * escoba's OWN latency module. `withThinkingDelay` used to be a copy of
 * `truco-bot/src/latency.ts`'s own function — importing it directly would
 * have made escoba-bot depend on truco-bot, the same argument
 * `l0-spanish-deck-ui-no-workspace-deps`'s own comment makes for the shared
 * deck art: escoba must not know truco exists. Hoisting it to
 * `platform-core` was rejected at the time (design §D1) — a
 * shared-abstraction extraction is a non-goal until a THIRD game needs one.
 * `generala-bot` was that third game, and the extraction has now happened:
 * `withThinkingDelay`/`Sleep` live in `@hexdev/platform-core`
 * (`thinking-delay.ts`), which is where the mechanism's own reasoning
 * (concurrency via `Promise.all`/max-not-sum, throw-through) lives now. This
 * file just re-exports it, plus escoba's own constant below.
 *
 * Escoba has no "spoken" moves (no calls, no señas — design §D3: no consult
 * channel registered at all), so unlike `truco-bot`'s split
 * (`DEFAULT_THINKING_DELAY_MS` / `SPOKEN_MOVE_DELAY_MS`) this package needs
 * only ONE pause: a card landing on the table is self-evident the instant
 * it lands.
 */
export const DEFAULT_THINKING_DELAY_MS = 2400;
