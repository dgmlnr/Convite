import type { Card } from "./card.js";
import { cardValue } from "./values.js";
import type { MatchState } from "./state.js";

const FIFTEEN = 15;
const DOUBLE_FIFTEEN = 30;

function sumValues(cards: readonly Card[]): number {
  return cards.reduce((total, next) => total + cardValue(next), 0);
}

/**
 * True iff SOME non-empty, PROPER subset of `cards` sums to exactly
 * `target` — an existence check over a small, fixed 4-card set (the
 * opening table), so an exhaustive bitmask walk is cheap and simple.
 * "Proper" excludes both the empty subset and the full set: with a
 * 4-card table that sums to `DOUBLE_FIFTEEN`, any subset summing to
 * `FIFTEEN` automatically means its complement does too (30 - 15 = 15),
 * which is exactly art. 16.2's "quince (15) y quince (15)" partition.
 */
function hasProperSubsetSummingTo(cards: readonly Card[], target: number): boolean {
  const n = cards.length;
  for (let mask = 1; mask < (1 << n) - 1; mask += 1) {
    let sum = 0;
    for (let i = 0; i < n; i += 1) {
      if ((mask & (1 << i)) !== 0) sum += cardValue(cards[i]!);
    }
    if (sum === target) return true;
  }
  return false;
}

/**
 * Escoba de muestra (art. 16.1 / 16.2, `escoba/reglas-verificadas`, design
 * §D5). Applied once, right after the opening deal (`deal.ts`), against the
 * table's ENTIRE four-card contents:
 *
 *   sum(table) === 15                     -> single escoba: the DEALER's
 *                                             team sweeps the table and
 *                                             scores ONE escoba (16.1).
 *   sum(table) === 30 AND some proper      -> DOUBLE escoba: the regulation
 *   subset also sums to 15 (so its           VOIDS both — "no se anotará
 *   complement does too)                     ninguna de las dos escobas"
 *                                             (16.2). The table is NOT
 *                                             swept: a reading, not a
 *                                             quote (design §D5) — the
 *                                             article voids the SCORING,
 *                                             and sweeping would leave an
 *                                             empty opening table no
 *                                             source describes.
 *   anything else                          -> nothing special; ordinary
 *                                             play continues with the
 *                                             table as dealt.
 *
 * This is a PARTITION test, not a "sums to 30" test: `{10,10,9,1}` (by
 * value) sums to 30 but has no 15-subset at all, so there was never an
 * escoba here (design row 12 — the distinction a random deal almost never
 * exercises, which is why this unit's tests hand-build every opening).
 */
export function applyOpeningEscoba(state: MatchState): MatchState {
  const hand = state.hand;
  if (hand === null) return state;
  const total = sumValues(hand.table);

  if (total === FIFTEEN) {
    const dealer = state.players.find((player) => player.seat === state.dealerSeat);
    if (dealer === undefined) return state;
    const teamId = dealer.teamId;
    const piles = { ...hand.piles, [teamId]: [...hand.piles[teamId], ...hand.table] };
    const escobas = { ...hand.escobas, [teamId]: hand.escobas[teamId] + 1 };
    return { ...state, hand: { ...hand, table: [], piles, escobas, lastCapturer: teamId } };
  }

  if (total === DOUBLE_FIFTEEN && hasProperSubsetSummingTo(hand.table, FIFTEEN)) {
    return state; // void, not swept (art. 16.2) — a reading, see design §D5.
  }

  return state;
}

/**
 * Leftover table cards at hand end (art. 15 + pagat, adopted BY ABSENCE of
 * a local rule — see `escoba/reglas-verificadas`, design's "Open Questions"
 * #1). Art. 15 gives only the ARITHMETIC (40 cards sum to 220 = 14*15 + 10,
 * so leftovers always sum to at least 10) and never names a recipient;
 * pagat does: the LAST team that captured takes them, and — unlike a
 * regular capture — it is explicitly NOT recorded as an escoba.
 *
 * Called once the caller has already recognized hand end (stock and every
 * hand empty, cards still on the table) — detecting that moment is a later
 * unit's concern (aggregate scoring); this function only performs the
 * transfer. If nobody ever captured this hand (`lastCapturer === null`,
 * structurally rare), the leftovers are left in place rather than guessed
 * at.
 */
export function settleLeftovers(state: MatchState): MatchState {
  const hand = state.hand;
  if (hand === null || hand.table.length === 0 || hand.lastCapturer === null) return state;
  const teamId = hand.lastCapturer;
  const piles = { ...hand.piles, [teamId]: [...hand.piles[teamId], ...hand.table] };
  return { ...state, hand: { ...hand, table: [], piles } };
}
