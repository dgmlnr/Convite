import type { MatchState } from "./state.js";

/**
 * Why a reducer said no, and what the caller gets back when it says yes.
 *
 * Re-declared locally, same shape as `platform-contract`'s `RuleViolation` /
 * `ApplyResult` — NOT imported, because `generala-engine` is L0 and may not
 * reach for a workspace package at all. `escoba-engine/src/capture.ts:21-31`
 * makes the same call for the same reason.
 *
 * ONE result type for the whole engine, in a file of its own rather than in
 * whichever reducer happened to need it first. Generala has two reducers with
 * genuinely different jobs — `roll.ts` applies the server's throw and takes no
 * actor at all, `play.ts` applies what a seat chose — and the module above them
 * hands both back through a single `applyAction`. Two result types would have
 * to be unified there by hand, and a `code` union living inside `roll.ts` would
 * be declaring codes that file can never produce.
 *
 * `code` is a closed union rather than a bare string so a caller can switch on
 * it without reading English out of `message`. It is PARTIAL for the same
 * reason `index.ts` is a partial barrel: the score reducer's own refusals
 * arrive with the score reducer.
 */
export interface RuleViolation {
  readonly code: "not-awaiting-roll" | "wrong-face-count" | "not-deciding" | "not-on-turn" | "no-rolls-left" | "malformed-hold";
  readonly message: string;
}

export type ApplyResult =
  | { readonly ok: true; readonly state: MatchState }
  | { readonly ok: false; readonly violation: RuleViolation };

/**
 * A refusal, and the state the caller handed in is never part of it.
 *
 * That absence is the server-authoritative guarantee stated in a type: a
 * refused action cannot return a "mostly applied" state, because there is
 * nowhere in this shape to put one.
 */
export function reject(code: RuleViolation["code"], message: string): ApplyResult {
  return { ok: false, violation: { code, message } };
}
