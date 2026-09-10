import type { MatchState } from "./state.js";

/**
 * Why a reducer said no, and what the caller gets back when it says yes
 * (SDD `mentiroso`, work unit B3/task 2.3).
 *
 * Re-declared locally, same shape as `platform-contract`'s `RuleViolation`/
 * `ApplyResult` but NOT imported — this package is L0 and must not reach for
 * a workspace package at all (`l0-game-engine-no-workspace-deps`), the same
 * reasoning `generala-engine/src/violation.ts` and `escoba-engine/src/capture.ts`
 * already state for their own local copies.
 *
 * ONE result type for the whole engine, in a file of its own rather than in
 * whichever reducer happened to need it first — `apply.ts` has two reducers
 * with genuinely different jobs (the opening-draw system action takes no
 * seated actor at all; the bid-submission reducer takes a seated player's
 * action), mirroring `generala-engine`'s own `roll.ts`/`play.ts` split behind
 * one shared `violation.ts` file exactly.
 *
 * `code` is a closed union rather than a bare string so a caller can switch
 * on it without reading English out of `message`.
 */
export interface RuleViolation {
  readonly code:
    | "not-opening-draw"
    | "wrong-face-count"
    | "malformed-face"
    | "not-bidding"
    | "illegal-raise"
    | "illegal-doubt"
    | "not-showdown";
  readonly message: string;
}

export type ApplyResult =
  | { readonly ok: true; readonly state: MatchState }
  | { readonly ok: false; readonly violation: RuleViolation };

/**
 * A refusal, and the state the caller handed in is never part of it — the
 * same server-authoritative guarantee `generala-engine/src/violation.ts`
 * documents for its own `reject`: a refused action cannot return a
 * "mostly applied" state, because there is nowhere in this shape to put one.
 */
export function reject(code: RuleViolation["code"], message: string): ApplyResult {
  return { ok: false, violation: { code, message } };
}
