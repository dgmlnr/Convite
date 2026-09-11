import type { RandomSource } from "@hexdev/platform-contract";
import type { PlayerId } from "@hexdev/mentiroso-engine";

/**
 * Shared test-only helpers (SDD `mentiroso`, work unit D4/task 4.4) — never
 * barrelled, never imported by production code, the same "test data, not
 * public API" convention `mentiroso-engine/src/fixtures.ts` already
 * documents for this repo.
 *
 * `normal.test.ts`/`easy.test.ts` (tasks 4.2/4.3) each already grew their own
 * local copies of `fixedRng`/`SELF`/`RIVAL_A` before this file existed; both
 * are left untouched here (already shipped, unmerged, in PRs #369/#370) — this
 * file exists so `determinize.test.ts`, `hard.test.ts`, and
 * `round-robin.test.ts` (this unit's own three new test files) do not each
 * grow a FOURTH independent copy of the same helpers.
 */

export const SELF = "self-player" as PlayerId;
export const RIVAL_A = "rival-a" as PlayerId;
export const RIVAL_B = "rival-b" as PlayerId;
export const RIVAL_C = "rival-c" as PlayerId;

/** A `RandomSource` fixed at one value — `[0, 1)` per its own contract
 * (`platform-contract/src/random.ts`). */
export function fixedRng(value: number): RandomSource {
  return () => value;
}

/** A `RandomSource` that plays back a scripted sequence of draws, one call
 * per array entry, and repeats the last entry once exhausted — the same
 * shape `easy.test.ts`'s own local `scriptedRng` already uses. */
export function scriptedRng(values: readonly number[]): RandomSource {
  let index = 0;
  return () => {
    const value = values[Math.min(index, values.length - 1)];
    index += 1;
    return value ?? 0;
  };
}

/** Wraps a `RandomSource`, counting every call — the same counting-wrapper
 * shape `mentiroso-module/src/roll.test.ts` and `generala-module/src/roll.test.ts`
 * already use to assert an exact rng budget. */
export function counting(source: RandomSource): { readonly rng: RandomSource; readonly calls: () => number } {
  let count = 0;
  return {
    rng: () => {
      count += 1;
      return source();
    },
    calls: () => count,
  };
}

/** A `RandomSource` that throws if ever called — proves a code path spends
 * NO entropy at all, the same `forbidden(reason)` shape
 * `mentiroso-module/src/roll.test.ts` already uses for its own zero-entropy
 * assertions. */
export function forbiddenRng(reason: string): RandomSource {
  return () => {
    throw new Error(`rng() must not be called: ${reason}`);
  };
}

/**
 * A seeded, deterministic `RandomSource` (mulberry32) — the SAME generator
 * shape already used across this repo's own seeded tournaments
 * (`truco-module/src/tournament.test.ts`, `transport-colyseus/src/match-room.test.ts`,
 * `mahjong-solitaire-module/src/module.test.ts`), reused rather than
 * reinvented so `round-robin.test.ts`'s own seeds behave identically to
 * every other seeded test in this codebase.
 */
export function seededRng(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
