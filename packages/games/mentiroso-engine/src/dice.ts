import type { DieFace } from "./state.js";

/**
 * Every face a die can show, ascending (SDD `mentiroso`, work unit A3).
 *
 * `DieFace` itself was already declared in `state.ts` (work unit A2), because
 * `Player.dice` needed the type before this file existed. This is the VALUE
 * counterpart — the same derive-don't-restate split `generala-engine/src/dice.ts`
 * already made for its own five-sided union: `ceilingFor` (`bids.ts`) reads its
 * highest face off this array instead of restating "six" a second time.
 */
export const DIE_FACES: readonly DieFace[] = [1, 2, 3, 4, 5, 6];
