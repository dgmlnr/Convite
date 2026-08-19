import { SENA_SIGNALS } from "@hexdev/truco-engine";
import type { Action, Card, PlayerView, SenaSignal, SendSenaAction } from "@hexdev/truco-engine";
import type { RandomSource } from "@hexdev/platform-contract";

/**
 * The card a signal honestly CLAIMS, inverted: which signal (if any) does
 * holding `card` entitle the bot to make truthfully. The vocabulary's own
 * semantics (senas.ts): the two matas by exact suit, the two strong sevens by
 * exact suit, and rank-level "tres"/"dos" for any suit. Everything else in
 * the deck has no signal — real tables don't flash a 12 de copa either.
 */
function signalForCard(card: Card): SenaSignal | undefined {
  if (card.rank === 1 && card.suit === "espada") return "asDeEspada";
  if (card.rank === 1 && card.suit === "basto") return "asDeBasto";
  if (card.rank === 7 && card.suit === "espada") return "sieteDeEspada";
  if (card.rank === 7 && card.suit === "oro") return "sieteDeOro";
  if (card.rank === 3) return "tres";
  if (card.rank === 2) return "dos";
  return undefined;
}

/** Per-tier knobs, so the SHARED mechanics below never hardcode a tier's
 * personality: how eagerly the tier signals at all, and how often an emission
 * claims something the hand does not actually hold (0 = always honest). */
export interface SenaEmissionPolicy {
  readonly emitRate: number;
  readonly bluffRate: number;
}

/**
 * The one seña-emission gate every signalling tier runs BEFORE its decision
 * ladder. Returns a legal `send-sena` to emit now, or `undefined` for "say
 * nothing — decide as before". The structural exits come first, in an order
 * chosen so that every state where nothing could be said costs ZERO rng
 * draws:
 *
 *  - No `send-sena` in `legalActions`: the engine's own legality gate
 *    (`getLegalSenaActions`) already folds in "has a teammate", "hand in
 *    progress" and the per-hand quota — so 1v1 (never offered) and a spent
 *    quota both land here. Exiting before ANY draw is what keeps a 1v1
 *    seeded line byte-identical to pre-emission behavior: the tier's later
 *    draws (hard's sampling) see exactly the stream they always saw.
 *  - Señas are the ONLY thing on offer: refuse. A seña is volunteered only
 *    alongside a blocking action the same call could take instead — the
 *    mirror of the transport's `findActingBot` rule, and half the
 *    termination argument below. (`send-sena` is the codebase's only
 *    non-blocking action, so "any non-seña" and "any blocking" coincide.)
 *  - Nothing claimable in hand: the honest tiers have nothing to say, and
 *    the bluffing tier deliberately stays quiet too — a bluff rides on a
 *    real decision to signal, it is not a reason to invent one.
 *
 * Only then the rng speaks: one draw against `emitRate` decides WHETHER to
 * signal; a bluffing tier spends up to two more deciding WHAT (cross the
 * bluff rate, then index the vocabulary — short-circuited so an honest tier
 * with `bluffRate` 0 never draws them). The honest claim is the STRONGEST
 * held signalable card: `SENA_SIGNALS` is already ordered by card power
 * (matas, strong sevens, tres, dos), so the first vocabulary hit is the one
 * worth announcing.
 *
 * The final guard never re-buys a standing claim: re-sending the signal the
 * bot's own `lastSena` already shows costs quota to say nothing new
 * (`applySenaAction` replaces per player), so an identical claim falls
 * through to the ladder instead.
 *
 * TERMINATION, argued once for every caller: the driving loop re-invokes a
 * bot after applying a non-blocking action, so a gate that kept answering
 * "seña" would spin forever. It cannot. Each accepted send spends quota, and
 * at `MAX_SENAS_PER_HAND` the engine stops offering `send-sena` at all — the
 * first exit above then fires on every subsequent call. That bound is
 * ABSOLUTE (at most three extra drives per bot per hand, whatever the rng
 * does); the emit-rate draw and the lastSena guard only make convergence
 * fast in practice, they are not what guarantees it.
 */
export function chooseSenaEmission(
  view: PlayerView,
  legalActions: readonly Action[],
  rng: RandomSource,
  policy: SenaEmissionPolicy,
): SendSenaAction | undefined {
  const senas = legalActions.filter((action): action is SendSenaAction => action.type === "send-sena");
  if (senas.length === 0) return undefined;
  if (senas.length === legalActions.length) return undefined;
  const held = SENA_SIGNALS.find((signal) => view.self.hand.some((card) => signalForCard(card) === signal));
  if (held === undefined) return undefined;

  if (rng() >= policy.emitRate) return undefined;
  const signal =
    policy.bluffRate > 0 && rng() < policy.bluffRate
      ? // Clamped, not asserted (native review SUGGESTION): a RandomSource
        // that ever returned exactly 1 would index one past the vocabulary
        // and silently decline the emission — the clamp makes the edge a
        // valid last-entry pick instead of an unenforced contract assumption.
        SENA_SIGNALS[Math.min(Math.floor(rng() * SENA_SIGNALS.length), SENA_SIGNALS.length - 1)]!
      : held;
  if (view.self.lastSena?.signal === signal) return undefined;
  // The engine offers the vocabulary all-or-nothing (senas.ts: the cap
  // limits HOW MANY, never WHICH), so whatever signal was chosen has its
  // action in the list; `find` rather than an index keeps that an engine
  // fact this gate relies on, not one it re-implements.
  return senas.find((action) => action.signal === signal);
}
