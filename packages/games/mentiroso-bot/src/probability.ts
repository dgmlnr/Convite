import { DIE_FACES } from "@hexdev/mentiroso-engine";

/**
 * The probability primitives every bot tier (Phase 4, tasks 4.2-4.4) builds
 * its decisions on: how likely is it that at least `k` of the dice this seat
 * cannot see show a claimed face, given how many such dice remain and how
 * likely any ONE of them is to match.
 *
 * THIS FILE IS THE MAQUINARIA, NOT THE POLICY (SDD `mentiroso`, work unit
 * D1/task 4.1). `sdd/mentiroso/research` (#4086) reported that no doubt
 * threshold or difficulty cut exists in the published literature at any
 * probability convention, wild-ace or not — inventing one here would be
 * exactly the "clavar un umbral" this unit's own task brief warns against.
 * `tier.ts`/`normal.ts` (task 4.2) own that decision; this file only has to
 * compute the number correctly and cheaply enough to base one on.
 */

/**
 * THE TRAP THIS CONSTANT NAMES, WITHOUT FENCING IT HERE.
 *
 * One in six, not one in three. Almost every published Dudo/Perudo doubt
 * table assumes wild aces, where a rolled 1 matches EVERY claimed face and
 * each opponent die is therefore twice as likely to count toward a bid — a
 * true probability of `p = 1/3`, not `1/6`. This ruleset has no wildcard at
 * all (`convite/mentiroso/reglas-decididas`: "Sin comodines. Los ases (1) NO
 * son comodines. Un 1 cuenta como 1 y nada más"), and research C1
 * (`sdd/mentiroso/research`) states its own source's formula under the SAME
 * no-wildcard convention: `p = 1/6`. Reusing a wild-ace table against this
 * ruleset would understate every unseen die's true matching probability by
 * roughly half in exactly the tail this bot has to reason about.
 *
 * DERIVED from `DIE_FACES.length`, never restated as a literal `6` — the
 * same discipline `mentiroso-engine/src/bids.ts`'s own `HIGHEST_FACE` already
 * applies to this same array, so "a die has six faces" stays declared in
 * exactly one place across both packages.
 *
 * WHERE THE TRAP IS ACTUALLY FENCED. Design D7 places the guard against a
 * silent reversion to the wild-ace `1/3` at the DECISION level — a fixture
 * where a bot's actual choice (doubt vs. raise) flips between the two
 * conventions — deliberately NOT at this constant: a test asserting only
 * `DIE_FACE_PROBABILITY === 1/6` would pass right alongside a bug that
 * changed the constant AND the test in the same commit. `tier.ts` (task
 * 4.2) carries that fence, over a real bid evaluation; this file does not.
 */
export const DIE_FACE_PROBABILITY = 1 / DIE_FACES.length;

/**
 * `P(at least k matches among n unseen dice) = sum_{i=k}^{n} C(n,i) p^i (1-p)^(n-i)`
 * — the upper tail of a Binomial(n, p) distribution (research C1,
 * `sdd/mentiroso/research`, sourced to "Liar's Dice in R", Gradient
 * Descending — `p = 1/6`, no wildcards).
 *
 * `p` IS ALWAYS A PARAMETER, NEVER A LITERAL INSIDE THIS FUNCTION. This is
 * this file's own fence against the trap `DIE_FACE_PROBABILITY` names above,
 * one level down: a hardcoded `1/6` (or `1/3`) baked into the arithmetic
 * below would make every caller's own choice of `p` purely cosmetic. Every
 * call site passes `p` explicitly — `DIE_FACE_PROBABILITY` for a plain face,
 * or a caller-computed value for anything else this function is asked
 * about.
 *
 * OWN DICE ARE NOT RANDOM VARIABLES, AND THIS FUNCTION DOES NOT MODEL THEM
 * (research C2). A seat already knows its own dice with certainty, so they
 * never belong inside the tail — the correct way to fold them in is for the
 * CALLER to lower the target `k` by however many of its own dice already
 * match the claimed face, and to pass `n` as only the dice it cannot see
 * (`totalDice(state) - ownDiceCount`, `mentiroso-engine`'s own `totalDice`),
 * never the table's full count. This function stays a general `(k, n, p)`
 * primitive rather than growing a `MatchState`/`PlayerView` parameter of its
 * own — combining it with a real bid is `tier.ts`'s job (task 4.2), over the
 * shapes this package's engine actually exposes.
 *
 * `k <= 0` IS CERTAIN (`1`), SHORT-CIRCUITED RATHER THAN SUMMED — and this
 * is load-bearing for exactly the combination the paragraph above describes:
 * a seat that already holds enough matching dice on its own reduces `k` to
 * zero or BELOW zero, and the closed-form sum has no term at a negative
 * index to fall back on. Deleting this guard and letting a negative `k`
 * reach the loop below produces nonsense (verified: `atLeast(-3, 5, 1/6)`
 * without this guard evaluates to roughly 50, not 1 — probabilities cannot
 * exceed 1), which is exactly why `probability.test.ts` keeps this case
 * committed rather than only exercised once and discarded.
 *
 * `k > n` IS IMPOSSIBLE (`0`) — needing more matches than there are dice
 * left to check. For every `p`, `k`, and `n` this game actually calls with
 * (`p` is 1/6 or 1/3; `n` is at most `MAX_SEAT_COUNT * STARTING_DICE_PER_SEAT
 * = 30`), the multiplicative recurrence below would reach zero on its own
 * even without this guard, because one of its incremental factors is
 * exactly zero the moment `k` exceeds `n`. The guard stops being redundant
 * only once `p` sits close enough to `1` that `(1 - p) ** (n - k)` —a
 * NEGATIVE exponent, reached only when this guard is skipped — overflows to
 * `Infinity`, and `0 * Infinity` is `NaN`, not `0`. `probability.test.ts`
 * commits that extreme-`p` case precisely because it is the one input class
 * where this "redundant" guard is not redundant. Kept explicit because this
 * is a general-purpose primitive, not one hand-fitted to today's two
 * callers.
 *
 * `p === 1` (EVERY UNSEEN DIE CERTAINLY MATCHES) IS ALSO SHORT-CIRCUITED,
 * because the recurrence below divides by `q = 1 - p` once there is more
 * than one term to build, and `q = 0` there would divide by zero instead of
 * returning the correct answer of `1` (any `k` up to `n`, already guaranteed
 * by the guard above). Not a realistic call for this game — no face is
 * certain — but a `(k, n, p)` primitive should not produce `NaN` from a
 * mathematically valid `p`.
 *
 * CHEAP BY CONSTRUCTION, NOT BY A SPECIAL FUNCTION. Research C3/C4 report
 * that production libraries evaluate this same tail through the regularized
 * incomplete beta function specifically so it runs in time independent of
 * `n` — relevant because the bot answers on a millisecond budget (the
 * comparable `generala-bot` hard tier's own worst measured decision is
 * 8.87 ms, `generala-bot/src/latency.ts`). This game never needs that: `n`
 * is bounded by the table's own total dice count, which never exceeds 30,
 * so summing at most 31 terms — each one built from the last with one
 * multiplication and one division, never a freshly recomputed coefficient or
 * a fresh factorial — is already far inside budget without taking on a
 * special-function dependency this repo does not otherwise have.
 * `probability.test.ts` measures this directly rather than assuming it.
 */
export function atLeast(k: number, n: number, p: number): number {
  if (k <= 0) return 1;
  if (k > n) return 0;

  const q = 1 - p;
  if (q === 0) return 1;

  // C(n, k), built incrementally (never via a fresh factorial) so it stays
  // numerically stable at the table sizes this game reaches.
  let coefficient = 1;
  for (let i = 1; i <= k; i += 1) {
    coefficient = (coefficient * (n - i + 1)) / i;
  }

  let term = coefficient * p ** k * q ** (n - k);
  let sum = term;
  for (let i = k; i < n; i += 1) {
    // term_{i+1} from term_i via the standard binomial ratio
    // C(n,i+1)/C(n,i) * p/q = (n-i)/(i+1) * p/q — one multiplication and one
    // division per step, never a recomputed coefficient or a fresh power.
    term = (term * (n - i) * p) / ((i + 1) * q);
    sum += term;
  }
  return sum;
}
