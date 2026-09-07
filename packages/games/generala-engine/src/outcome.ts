import type { PlayerId } from "./ids.js";
import { CATEGORY_IDS } from "./state.js";
import type { MatchState, Scorecard } from "./state.js";

/**
 * Who won, once somebody has.
 *
 * Shaped like `platform-contract`'s own `MatchOutcome`, which this package may
 * not import (L0) — the same re-declaration `mahjong-solitaire-engine`'s
 * `board.ts:42` makes, for the same reason and with the same shape, so
 * `generala-module` can hand this straight back through `getOutcome` with no
 * adapter and no cast.
 *
 * `winnerIds` IS A LIST, AND FOR GENERALA THAT IS LOAD-BEARING RATHER THAN
 * INCIDENTAL. Two seats can finish level, and both of them won; the contract's
 * own docstring says an empty list "may legitimately be empty — a draw, or a
 * solo match abandoned unsolved", which PERMITS an empty list without requiring
 * one. The two places that return an empty one today both mean nobody won at
 * all — a board left unsolved (`board.ts:123`) and a match with no winning team
 * (`escoba-module/src/index.ts:132`) — and reporting a tie that way would send
 * two winners the neutral "nothing happened" copy an empty list renders as
 * (`escoba-ui/src/match-outcome.ts:59`). A multi-id list is already ordinary:
 * escoba returns a whole team's `playerIds`.
 */
export interface MatchOutcome {
  readonly winnerIds: readonly PlayerId[];
}

/**
 * What this card is worth: the plain sum of the boxes that carry a number.
 *
 * An OPEN box contributes nothing rather than making the sum unanswerable,
 * because a running total is exactly what a scorecard shows mid-match — and
 * because `null` reaching an arithmetic sum produces `NaN`, which every
 * comparison downstream would silently swallow instead of refusing.
 *
 * THERE IS NO BONUS OF ANY KIND HERE. The chosen ruleset has no upper-section
 * threshold and no end-of-match award (`convite/generala/reglas-decididas`,
 * §Sección superior: "no hay bonus"), so a total is arithmetic over boxes
 * `scoreFor` already valued. Deriving it on demand is what keeps it off
 * `MatchState`: a stored total is a second source of truth every producer of a
 * state then has to remember to maintain.
 */
export function totalFor(card: Scorecard): number {
  return CATEGORY_IDS.reduce((sum, category) => sum + (card[category] ?? 0), 0);
}

/** Every box written, at any value — a box crossed out at zero counts as written. */
function isCardFull(card: Scorecard): boolean {
  return CATEGORY_IDS.every((category) => card[category] !== null);
}

/**
 * Is this match over, and if so who won — read off the cards every time, never
 * stored.
 *
 * TWO TERMINAL PATHS AND NO OTHER, in this order, and the order is the rule
 * rather than a preference. A generala servida wins "en el acto" with every
 * card still empty and every total still zero, so asking the cards first would
 * answer `null` for a match the ruleset says is already decided — and the
 * transport's loop would keep asking for rolls. It is also the one terminal
 * fact that is genuinely state (D2), because winning before anything is written
 * leaves no other trace to derive it from.
 *
 * THE WINNER IS THE FULL ARGMAX SET. Every seat holding the highest total is a
 * winner, in seat order; nobody is preferred by seat index, and no single-seat
 * shortcut is taken for the two-seat table that is registered today. That is
 * mechanism 3 of D11, and it is what makes a later three- or four-seat
 * registration need zero change here: `players` and `cards` are parallel
 * arrays, and this reads them by the same index at any length.
 *
 * `Math.max` over `totals` is total because `createMatch` refuses a table with
 * nobody at it, so `cards` is never empty by the time a state exists at all.
 */
export function getOutcome(state: MatchState): MatchOutcome | null {
  if (state.turn.phase === "servida-win") return { winnerIds: [state.players[state.turn.seat]!] };
  if (!state.cards.every(isCardFull)) return null;

  const totals = state.cards.map(totalFor);
  const best = Math.max(...totals);
  return { winnerIds: state.players.filter((_, seat) => totals[seat] === best) };
}
