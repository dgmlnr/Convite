import type { Card, Suit } from "./card.js";
import type { HandState, MatchState } from "./state.js";
import type { TeamId } from "./ids.js";
import { scoreSetenta } from "./setenta.js";

// design §D5. Escoba's five per-hand scoring categories, in art. 8.1's own
// order: cartas, oros, setenta (Unit H's own module), siete de oro, and
// escobas. All five resolve over each team's COMBINED pile — never per
// player — so a 2-seat "team of one" and a 4-seat pair share this ONE code
// path (art. 5.1: the regulation is written for the pairs game).

const OROS_THRESHOLD = 6; // art. 10.1: "el que tenga como mínimo SEIS de ellos ganará" — a THRESHOLD a team crosses on its own count, NOT a majority comparison against the other team. Mutation row 13 targets this literal (>= 5 wrongly scores a 5-5 split).
const ORO_SUIT: Suit = "oro";
const SIETE_DE_ORO_RANK = 7;

function isSieteDeOro(card: Card): boolean {
  return card.rank === SIETE_DE_ORO_RANK && card.suit === ORO_SUIT;
}

function countOros(pile: readonly Card[]): number {
  return pile.filter((card) => card.suit === ORO_SUIT).length;
}

/**
 * Awards ONE point to whichever value is STRICTLY greater; an equal value
 * (including 0-0) awards nobody — art. 17.1's tie generalization. Used only
 * for cartas (art. 9.1) below; THE comparator mutation row 15 targets.
 */
function scoreByGreater(valueA: number, valueB: number, teamAId: TeamId, teamBId: TeamId): Record<TeamId, number> {
  const scores: Record<TeamId, number> = { [teamAId]: 0, [teamBId]: 0 };
  if (valueA > valueB) scores[teamAId] = 1;
  else if (valueB > valueA) scores[teamBId] = 1;
  return scores;
}

/**
 * art. 10.1: "el que tenga como mínimo seis de ellos ganará" — a THRESHOLD
 * each team crosses (or doesn't) on its OWN oro count, never a comparison
 * against the other team's count. With 10 oros total in the deck, at most
 * one team can ever cross six, so the distinction only bites at the
 * boundary: 5-5 ties under the correct threshold, but 5-5 wrongly scores
 * under mutation row 13's `>= 5`.
 */
function scoreOros(orosA: number, orosB: number, teamAId: TeamId, teamBId: TeamId): Record<TeamId, number> {
  const scores: Record<TeamId, number> = { [teamAId]: 0, [teamBId]: 0 };
  if (orosA >= OROS_THRESHOLD) scores[teamAId] = 1;
  else if (orosB >= OROS_THRESHOLD) scores[teamBId] = 1;
  return scores;
}

/**
 * art. 13.1: one point to whoever holds the 7 de oro. Unlike cartas, oros,
 * or setenta, this can never tie — exactly one such card exists in the
 * deck, so at most one team's pile ever contains it.
 */
function scoreSieteDeOro(pileA: readonly Card[], pileB: readonly Card[], teamAId: TeamId, teamBId: TeamId): Record<TeamId, number> {
  const scores: Record<TeamId, number> = { [teamAId]: 0, [teamBId]: 0 };
  if (pileA.some(isSieteDeOro)) scores[teamAId] = 1;
  else if (pileB.some(isSieteDeOro)) scores[teamBId] = 1;
  return scores;
}

/**
 * The aggregate per-hand score (design §D5, art. 8.1's category order):
 * cartas + oros + setenta (Unit H, `setenta.ts`) + siete de oro + escobas.
 * `hand.escobas` is read straight through, never re-detected here:
 * `capture.ts`'s in-play escobas and `escoba.ts`'s escoba de muestra both
 * already accumulate it as they happen, one point each (art. 14.1).
 *
 * Puntaje menor (art. 19.1) falls out of these five rules with NO special
 * case: when nobody swept (escobas 0-0) and cartas/oros/setenta all tie,
 * the only point left standing is siete de oro's — see `scoring.test.ts`'s
 * own dedicated fixture, the board most likely to expose an off-by-one.
 */
export function scoreHand(hand: HandState, teamIds: readonly [TeamId, TeamId]): Readonly<Record<TeamId, number>> {
  const [teamAId, teamBId] = teamIds;
  const pileA = hand.piles[teamAId];
  const pileB = hand.piles[teamBId];

  const cartas = scoreByGreater(pileA.length, pileB.length, teamAId, teamBId);
  const oros = scoreOros(countOros(pileA), countOros(pileB), teamAId, teamBId);
  const setenta = scoreSetenta(hand.piles, teamIds);
  const sieteDeOro = scoreSieteDeOro(pileA, pileB, teamAId, teamBId);

  return {
    [teamAId]: cartas[teamAId]! + oros[teamAId]! + setenta[teamAId]! + sieteDeOro[teamAId]! + hand.escobas[teamAId],
    [teamBId]: cartas[teamBId]! + oros[teamBId]! + setenta[teamBId]! + sieteDeOro[teamBId]! + hand.escobas[teamBId],
  };
}

/**
 * The match's winner, or `null` while it is still in progress (arts. 8.1,
 * 18.1). Reads ONLY `state.teams[].score` — never `state.hand` — so it is
 * structurally impossible for a hand still being played to end the match
 * before that hand's own scoring resolves into `teams[].score` (a later
 * layer's job: the module composes `scoreHand` + this function, mirroring
 * `truco-module`'s own `getMatchWinner` call site).
 *
 * An EQUAL score, even AT OR ABOVE `pointsToWin`, does NOT end the match:
 * art. 18.1, "se jugarán una o más vueltas hasta desempatar" — play
 * continues until the tie breaks, however many further hands that takes.
 */
export function getMatchWinner(state: MatchState): TeamId | null {
  const [teamA, teamB] = state.teams;
  if (teamA.score === teamB.score) return null;
  if (teamA.score < state.pointsToWin && teamB.score < state.pointsToWin) return null;
  return teamA.score > teamB.score ? teamA.id : teamB.id;
}
