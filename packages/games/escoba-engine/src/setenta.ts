import type { Card, Rank, Suit } from "./card.js";
import { SUITS } from "./card.js";
import type { TeamId } from "./ids.js";

/**
 * La setenta's OWN weighted-sum table (arts. 11.3, 12.1) — a DIFFERENT table
 * from `cardValue()`'s capture values (values.ts): here sota, caballo, and
 * rey are ALL worth 10 (they tie with each other), while `cardValue()`
 * gives them 8, 9, and 10 respectively for a completely different purpose
 * (forming 15 to capture). Reusing `cardValue()` here — or this table where
 * `cardValue()` belongs — is the single likeliest slip in this codebase;
 * see design mutation row 11 and `escoba/reglas-verificadas`. Kept as its
 * own small data table, isolated from the comparator below, so a future
 * rules correction is a one-line data change, not a logic change.
 */
export const SETENTA_VALUE: Readonly<Record<Rank, number>> = {
  7: 21,
  6: 18,
  1: 16,
  5: 15,
  4: 14,
  3: 13,
  2: 12,
  10: 10, // sota — ties with caballo/rey, unlike cardValue()'s 8
  11: 10, // caballo — ties with sota/rey, unlike cardValue()'s 9
  12: 10, // rey — ties with sota/caballo, same as cardValue()'s 10 (coincidence)
};

/**
 * A team's best card in each suit it holds (design §D2's own note: capture
 * piles can grow well past 4 cards over a hand, so this scans the whole
 * pile per suit, not just "the last card of that suit captured").
 */
function suitBestCards(cards: readonly Card[]): ReadonlyMap<Suit, Card> {
  const best = new Map<Suit, Card>();
  for (const card of cards) {
    const current = best.get(card.suit);
    if (current === undefined || SETENTA_VALUE[card.rank] > SETENTA_VALUE[current.rank]) {
      best.set(card.suit, card);
    }
  }
  return best;
}

/**
 * THE COMPARATOR (design mutation row 10's target): la setenta's per-team
 * rank is the weighted SUM of its four suit-best cards (art. 11.3), proved
 * a SUM — not "most sevens first" — by the regulation's own worked example
 * (art. 12.1): three sevens + a figure (73) loses to three sixes + a seven
 * (75). Art. 11.1's "tener la mayor cantidad de sietes" is a heuristic
 * sentence the regulation's own arithmetic contradicts; do not implement
 * it. Takes the already-suit-qualified map so this function's only job is
 * the arithmetic shape, isolated from suit-coverage eligibility below.
 */
function setentaRank(bestPerSuit: ReadonlyMap<Suit, Card>): number {
  let total = 0;
  for (const bestCard of bestPerSuit.values()) total += SETENTA_VALUE[bestCard.rank];
  return total;
}

/**
 * A team's setenta value, or `null` when the team does not hold at least
 * one card of every suit (arts. 11, 12 — "una carta por palo"). A team that
 * does not cover all four suits does not compete for the point at all; a
 * reading, not a quote (design §D5) — without it, three sevens across THREE
 * suits (63) would beat four low cards across all FOUR (48), which is not
 * what "una carta por palo" means.
 */
export function setentaValue(cards: readonly Card[]): number | null {
  const best = suitBestCards(cards);
  return best.size === SUITS.length ? setentaRank(best) : null;
}

/**
 * La setenta between the two teams (arts. 11, 12, 17.1). Equal values — or
 * both teams failing to cover all four suits — mean NOBODY scores the
 * point; a team that does not qualify loses automatically to one that does.
 */
export function scoreSetenta(
  piles: Readonly<Record<TeamId, readonly Card[]>>,
  teamIds: readonly [TeamId, TeamId],
): Readonly<Record<TeamId, number>> {
  const [teamAId, teamBId] = teamIds;
  const valueA = setentaValue(piles[teamAId]);
  const valueB = setentaValue(piles[teamBId]);
  const scores: Record<TeamId, number> = { [teamAId]: 0, [teamBId]: 0 };

  if (valueA === null && valueB === null) return scores;
  if (valueA === null) {
    scores[teamBId] = 1;
    return scores;
  }
  if (valueB === null) {
    scores[teamAId] = 1;
    return scores;
  }
  if (valueA === valueB) return scores;

  scores[valueA > valueB ? teamAId : teamBId] = 1;
  return scores;
}
