import { buildDeck, cardId } from "@hexdev/truco-engine";
import type { Card, PlayerView } from "@hexdev/truco-engine";
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
 * so their remaining cards stay in the pool as legitimate candidates — see
 * `sampleAllOpponentHands` for the approximation that leaves behind.
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

  const pool = unseenPool(view);
  const sample: Card[] = [];
  for (let i = 0; i < opponent.cardsRemaining && pool.length > 0; i += 1) {
    const index = Math.floor(rng() * pool.length);
    sample.push(pool.splice(index, 1)[0]!);
  }
  return sample;
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
 * DISCLOSED SIMPLIFICATION (2v2 only): the bot's own partner's UNPLAYED
 * cards are hidden from this seat, so they stay in the shared pool and an
 * opponent can be dealt a card the partner actually holds. This one is a
 * choice, not a missing field — `TeammateView.cardsRemaining` is a real
 * count, so the pool could reserve that many cards for the partner. It does
 * not, because WHICH cards to reserve is itself a guess: sampling a partner
 * hand only moves the error from "an opponent might hold the partner's card"
 * to "the partner might hold the opponent's card". Opponent hand SIZES stay
 * exact either way (`cardsRemaining`, per opponent), so the cost is a
 * mis-attributed unseen card, never a miscounted hand.
 */
export function sampleAllOpponentHands(view: PlayerView, rng: RandomSource): readonly (readonly Card[])[] {
  const pool = unseenPool(view);

  return view.opponents.map((opponent) => {
    const hand: Card[] = [];
    for (let i = 0; i < opponent.cardsRemaining && pool.length > 0; i += 1) {
      const index = Math.floor(rng() * pool.length);
      hand.push(pool.splice(index, 1)[0]!);
    }
    return hand;
  });
}
