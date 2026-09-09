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
 * it without reading English out of `message`, and it is CLOSED: with both
 * reducers landed, every way this engine can say no is listed here.
 *
 * `malformed-face` and `malformed-hold` are the pair, and the pairing is the
 * point. Each of them refuses a payload whose TYPE already claims to be well
 * formed — `DieFace` and an index into five dice are both erased before a
 * single value moves — so both are the runtime half of a compile-time promise
 * this engine cannot make its callers keep.
 *
 * `box-not-open` and `cross-out-of-order` are the other pair, and they are two
 * refusals rather than one because they are two different facts: the first says
 * a box is gone for good, the second that a box is open but a zero may not go
 * in it YET. A caller switching on the code can tell "never" from "not now"
 * without reading English out of `message`.
 */
export interface RuleViolation {
  readonly code: "not-awaiting-roll" | "wrong-face-count" | "malformed-face" | "not-deciding" | "not-on-turn" | "no-rolls-left" | "malformed-hold" | "box-not-open" | "cross-out-of-order";
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
