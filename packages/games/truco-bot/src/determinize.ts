import { buildDeck, cardId } from "@hexdev/truco-engine";
import type { Card, PlayerView } from "@hexdev/truco-engine";
import type { RandomSource } from "@hexdev/platform-contract";

/**
 * Samples one plausible full hand for the (single, v1) opponent, consistent
 * with everything this bot can legally observe: its own hand, plus any
 * cards already visible in the trick currently in progress
 * (`HandView.currentTrickPlays` — public once played). This is
 * "determinization" for the hard tier's search: hidden state is never read,
 * only sampled from what a human in this seat could also infer.
 *
 * DISCLOSED SIMPLIFICATION: `TrickOutcome` (the engine's record of a
 * COMPLETED trick) only carries `winnerTeamId`, never the cards played — so
 * cards spent in an EARLIER, already-resolved trick this hand are not
 * individually recoverable from `PlayerView` and are NOT excluded from the
 * sampling pool here. The opponent's exact `cardsRemaining` count is still
 * respected, so this never over- or under-samples the hand SIZE; it can
 * only occasionally resample a card that, in the real hidden state, was
 * already played in a prior trick. See apply-progress for why this is an
 * accepted v1 gap rather than an assumed-away one.
 */
export function sampleOpponentHand(view: PlayerView, rng: RandomSource): readonly Card[] {
  const opponent = view.opponents[0];
  if (opponent === undefined) return [];

  const alreadyVisible = new Set<string>(
    [...view.self.hand, ...(view.hand?.currentTrickPlays.map((play) => play.card) ?? [])].map(cardId),
  );
  const pool = buildDeck().filter((card) => !alreadyVisible.has(cardId(card)));

  const sample: Card[] = [];
  for (let i = 0; i < opponent.cardsRemaining && pool.length > 0; i += 1) {
    const index = Math.floor(rng() * pool.length);
    sample.push(pool.splice(index, 1)[0]!);
  }
  return sample;
}
