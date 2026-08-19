import { buildDeck, cardId } from "@hexdev/truco-engine";
import type { Card, PlayerView, SenaSignal, TeammateView } from "@hexdev/truco-engine";
import type { RandomSource } from "@hexdev/platform-contract";

/**
 * The cards this seat can already account for, and therefore the ones no
 * determinization may deal to anybody: the bot's own remaining hand, plus
 * EVERY card played this hand — the tricks already resolved
 * (`HandView.resolvedTrickPlays`, one entry per trick, hence the flatten) and
 * the one in progress (`HandView.currentTrickPlays`).
 *
 * "Seen" means exactly the same thing in 1v1 and 2v2, and that is a fact
 * about the engine rather than a convenience: a card play is public the
 * instant it lands (`HandPlay`'s own docstring — "the redaction constraint
 * only covers UNPLAYED hand cards"), so who played it never changes whether
 * this seat watched it. That covers the bot's OWN spent cards too, which is
 * the least obvious entry here: a played card leaves `self.hand`, so the
 * trick log is the only place it still exists.
 *
 * What 2v2 adds is on the other side of the line and deliberately NOT here: a
 * partner's UNPLAYED cards. Watching a partner play is not seeing their hand,
 * so their remaining cards stay in the pool as legitimate candidates — for
 * the PARTNER's own sampled hand as much as for an opponent's. Who may end up
 * holding them is `sampleHiddenHands`'s business, not this set's.
 */
function seenCards(view: PlayerView): readonly Card[] {
  const played = [...(view.hand?.resolvedTrickPlays.flat() ?? []), ...(view.hand?.currentTrickPlays ?? [])];
  return [...view.self.hand, ...played.map((play) => play.card)];
}

/** The 40-card deck minus everything `seenCards` accounts for — the set a
 * hidden hand could still be drawn from. Returned mutable and fresh per call
 * because the samplers below `splice` out of it as they deal. */
function unseenPool(view: PlayerView): Card[] {
  const seen = new Set<string>(seenCards(view).map(cardId));
  return buildDeck().filter((card) => !seen.has(cardId(card)));
}

/** Deals `count` cards out of `pool` (mutating it — that is the whole point:
 * a card dealt to one hand is gone for the next). One rng call per card,
 * uniform over what the pool still holds — the exact draw mechanics every
 * sampler in this file has always used, extracted so they provably stay
 * IDENTICAL across all of them (the 1v1 rng-stream identity below depends on
 * it). Stops early on an exhausted pool rather than inventing cards. */
function dealFrom(pool: Card[], count: number, rng: RandomSource): Card[] {
  const hand: Card[] = [];
  for (let i = 0; i < count && pool.length > 0; i += 1) {
    const index = Math.floor(rng() * pool.length);
    hand.push(pool.splice(index, 1)[0]!);
  }
  return hand;
}

/**
 * Samples one plausible full hand for the (single, v1) opponent, consistent
 * with everything this bot can legally observe: its own hand, plus every card
 * already face up on the table this deal — both the trick in progress and the
 * tricks already resolved (`seenCards`). This is "determinization" for the
 * hard tier's search: hidden state is never read, only sampled from what a
 * human in this seat could also infer.
 *
 * The pool is used for card IDENTITIES, not just for a count — `hard.ts`
 * scores each sample through `handPower`/`envidoPoints`/`cardPower` — so what
 * is in it is a correctness question, not a difficulty knob. A card the bot
 * watched being played is not a card an opponent might hold, and reasoning as
 * if it were is simply wrong, not "cautious".
 *
 * DISCLOSED SIMPLIFICATION: this reads `opponents[0]` only, so it is
 * 1v1-shaped by construction — `sampleAllOpponentHands` below is the
 * multi-opponent form. Beyond that, the pool is uniform over the unseen
 * cards: nothing here reads the public CALL log, so an opponent who just
 * called truco is still modelled as holding an average hand rather than a
 * strong one. That is unmodelled inference, not a false claim about what
 * `PlayerView` carries.
 */
export function sampleOpponentHand(view: PlayerView, rng: RandomSource): readonly Card[] {
  const opponent = view.opponents[0];
  if (opponent === undefined) return [];

  return dealFrom(unseenPool(view), opponent.cardsRemaining, rng);
}

/**
 * Generalizes `sampleOpponentHand` to EVERY real opponent (`sampleOpponentHand`
 * itself stays untouched, single-opponent-shaped, for its existing 1v1
 * callers/tests) — the fix for hard.ts's own disclosed "assumes exactly one
 * opponent" gap. In 1v1 this returns exactly one hand, identical in every
 * respect to `sampleOpponentHand`'s own result shape. In 2v2 it returns one
 * sampled hand PER opponent, drawn from a SHARED pool (each opponent's own
 * sample excludes cards already dealt to an earlier opponent in the SAME
 * round) so one physical card is never double-counted into two hands in a
 * single determinization.
 *
 * Same `seenCards` pool as `sampleOpponentHand`, for the reason given there:
 * every play is public to every seat, so 2v2 needs no wider or narrower
 * notion of "seen" than 1v1 does.
 *
 * FORMERLY DISCLOSED SIMPLIFICATION, NOW CLOSED (2v2 only): this function
 * leaves the partner's unplayed cards in the shared pool, so an opponent
 * sample can be dealt a card the partner actually holds. The old defence —
 * sampling a partner hand "only moves the error from 'an opponent might hold
 * the partner's card' to 'the partner might hold the opponent's card'" —
 * dissolved the moment the hard tier started needing the partner's hand
 * ITSELF (team truco/envido strength): once a partner hand is sampled anyway,
 * dealing everybody from one shared pool models both sides of that trade at
 * once, and no card can be double-counted in either direction.
 * `sampleHiddenHands` below is that sampler, and `hard.ts` now reads it; this
 * function stays exactly as it was for its existing callers and tests, which
 * want the opponents-only shape.
 */
export function sampleAllOpponentHands(view: PlayerView, rng: RandomSource): readonly (readonly Card[])[] {
  const pool = unseenPool(view);
  return view.opponents.map((opponent) => dealFrom(pool, opponent.cardsRemaining, rng));
}

/** One determinization round's worth of hidden hands: the partner's (or
 * `null` where no partner exists — 1v1) and one per opponent, all dealt
 * disjointly from a single shared pool. */
export interface HiddenHands {
  readonly partner: readonly Card[] | null;
  readonly opponents: readonly (readonly Card[])[];
}

/**
 * How often the partner's standing seña is BELIEVED when their hand is
 * sampled — the weight of the slice-4 bias, deliberately a coin and not a
 * rule, because a seña is a CLAIM (senas.ts's own contract) and the hard
 * tier lies on it 15% of the time (`SENA_BLUFF_RATE`, hard.ts).
 *
 * WHY 0.85 AND NOT SOMETHING CLEVERER. The number is the complement of the
 * one bluff rate this codebase actually ships, which makes it the honest
 * base-rate estimate of "a claim I just saw is true" against a hard-tier
 * partner — and a mild UNDERestimate everywhere else: the normal tier's
 * bluff rate is 0, and even a hard-tier bluff draws its signal uniformly
 * from the vocabulary, so it occasionally tells the truth by accident. The
 * bot cannot see its partner's tier (nothing in `PlayerView` carries it,
 * correctly), so one conservative constant beats a per-tier table it has no
 * data to index into. Not 1.0, because trusting a claim absolutely turns
 * every partner bluff into a poisoned sample; not tuned finer than two
 * digits, because the decision thresholds downstream (`> 0.5` win rates
 * over 24 rounds) cannot resolve differences that small anyway.
 */
const SENA_TRUST = 0.85;

/**
 * The seña vocabulary inverted: does `card` back the claim `signal` makes?
 * This is `signalForCard` (sena-emission.ts) read in the other direction,
 * with the same semantics as the engine's own vocabulary (senas.ts): the two
 * matas and the two strong sevens name EXACT cards, "tres"/"dos" name a
 * RANK — four cards each, any suit. Exhaustive over `SenaSignal`, so a
 * vocabulary change is a compile error here, not a silently ignored claim.
 */
function matchesClaim(signal: SenaSignal, card: Card): boolean {
  switch (signal) {
    case "asDeEspada":
      return card.rank === 1 && card.suit === "espada";
    case "asDeBasto":
      return card.rank === 1 && card.suit === "basto";
    case "sieteDeEspada":
      return card.rank === 7 && card.suit === "espada";
    case "sieteDeOro":
      return card.rank === 7 && card.suit === "oro";
    case "tres":
      return card.rank === 3;
    case "dos":
      return card.rank === 2;
  }
}

/**
 * Deals the PARTNER's sampled hand, biased toward their standing seña —
 * the slice-4 read side of the seña channel. `teammates[0].lastSena` is
 * legitimately visible to this seat (señas are team-internal by the engine's
 * own redaction fence — `OpponentView` has no field that could even carry
 * one), so reading it is table legality, not peeking.
 *
 * THE TRUST MODEL. A seña is a claim, not truth: the hard tier bluffs on the
 * channel, so with probability `SENA_TRUST` the claim is believed — ONE card
 * consistent with it is forced into the sample — and with probability
 * 1−SENA_TRUST the deal falls through to today's unbiased draw (the bluff
 * branch, byte-identical to the no-seña deal modulo the one trust draw
 * already spent). Exact-card signals force the one named card; rank-level
 * signals force one uniformly-indexed card among the rank's SURVIVORS in the
 * pool (one extra selection draw, clamped at the last entry for an rng edge
 * of exactly 1 — same clamp, same reason as sena-emission.ts's bluff pick).
 *
 * DEAD CLAIMS COST NOTHING. When no pool card backs the claim, the claim is
 * dead — provably false (the card is in the bot's own hand), already spent
 * (played face up), or, per round, already dealt to an opponent sample this
 * very round — and the deal is simply unbiased, with NO trust draw consumed.
 * A partner with zero cards left is the same case by size. This ordering
 * (candidates first, coin second) is what lets the dead-claim path keep the
 * exact draw count of the no-seña path.
 *
 * WHERE THE TRUST DRAW SITS IN THE STREAM, argued once: at the HEAD of the
 * partner deal, which the slice-2 contract already places LAST — after every
 * opponent draw. So opponent samples consume the exact stream positions they
 * always did (their alignment argument is untouched), a 1v1 decision has no
 * teammate and therefore no seña and consumes zero extra draws
 * (byte-identical by construction), and a 2v2 partner with no standing seña
 * draws exactly the slice-2 stream. Only a LIVE claim moves the stream — one
 * trust draw, plus one selection draw on a believed rank claim, minus one
 * deal draw when a card is forced — and that movement is the same
 * expected-and-disclosed 2v2 shift the emission gate's own draws already
 * introduced in slice 3: a seed replays differently-but-equally-valid
 * rounds, never a different contract.
 */
function dealPartnerHand(teammate: TeammateView, pool: Card[], rng: RandomSource): Card[] {
  const claim = teammate.lastSena;
  if (claim === null || teammate.cardsRemaining === 0) return dealFrom(pool, teammate.cardsRemaining, rng);

  const candidates: number[] = [];
  for (let index = 0; index < pool.length; index += 1) {
    if (matchesClaim(claim.signal, pool[index]!)) candidates.push(index);
  }
  if (candidates.length === 0) return dealFrom(pool, teammate.cardsRemaining, rng);

  if (rng() >= SENA_TRUST) return dealFrom(pool, teammate.cardsRemaining, rng);

  const pick =
    candidates.length === 1
      ? candidates[0]!
      : candidates[Math.min(Math.floor(rng() * candidates.length), candidates.length - 1)]!;
  const claimed = pool.splice(pick, 1)[0]!;
  return [claimed, ...dealFrom(pool, teammate.cardsRemaining - 1, rng)];
}

/**
 * The full-table determinization: ONE draw per round that deals, from ONE
 * shared unseen pool, a hand for the bot's PARTNER (sized by
 * `TeammateView.cardsRemaining` — at most one teammate exists, this engine's
 * teams are two seats) AND a hand per opponent — all disjoint. This closes
 * `sampleAllOpponentHands`'s disclosed simplification: an opponent sample can
 * no longer be dealt a card the very same round says the partner holds, and
 * hand SIZES stay exact for every seat because each is dealt from its own
 * real `cardsRemaining` count.
 *
 * DRAW ORDER IS A CONTRACT: opponents first, in `view.opponents` order —
 * exactly the sequence `sampleAllOpponentHands` has always drawn — and the
 * partner LAST. In 1v1 there is no partner, so this function consumes the
 * rng stream byte-for-byte as the old sampler did and every 1v1 decision
 * built on it replays identically (proven by the shadowed-decision probe at
 * slice time: 0 diffs over seeded full matches). The order costs nothing in
 * exchange: dealing disjoint hands from a uniform pool is exchangeable, so
 * WHEN the partner's cards leave the pool never changes what they could be.
 *
 * `partner: null` means "no teammate exists" (1v1); a teammate with zero
 * cards left samples to `[]` — present and empty, the same distinction
 * `view.teammates` itself draws.
 *
 * SLICE 4: the partner deal is seña-aware — `dealPartnerHand` biases it
 * toward the teammate's standing `lastSena` claim (its own docstring argues
 * the trust model, the dead-claim rule, and the rng-stream placement). With
 * no teammate or no standing seña it IS `dealFrom`, draw for draw, so every
 * pre-slice caller and every 1v1 line replays byte-identically.
 */
export function sampleHiddenHands(view: PlayerView, rng: RandomSource): HiddenHands {
  const pool = unseenPool(view);
  const opponents = view.opponents.map((opponent) => dealFrom(pool, opponent.cardsRemaining, rng));
  const teammate = view.teammates[0];
  return {
    partner: teammate === undefined ? null : dealPartnerHand(teammate, pool, rng),
    opponents,
  };
}
