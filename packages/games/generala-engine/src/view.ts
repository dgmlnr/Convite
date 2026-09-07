import type { PlayerId } from "./ids.js";
import { getOutcome, totalFor } from "./outcome.js";
import type { MatchOutcome } from "./outcome.js";
import { CATEGORY_IDS } from "./state.js";
import type { CategoryId, MatchState, Scorecard, Turn } from "./state.js";

/** One seat, named and numbered. Nothing else: the cards and the totals are the table's, not a seat's. */
export interface SeatView {
  readonly playerId: PlayerId;
  readonly seat: number;
}

/**
 * What one seat is told about the match.
 *
 * GENERALA REDACTS NOTHING, AND THIS TYPE IS WHERE THAT IS TRUE RATHER THAN
 * CLAIMED. Compare escoba, whose `HandView` turns `stock` into a bare
 * `stockCount` because its `MatchState` structurally contains cards nobody has
 * seen — `escoba-engine/src/view.ts:20-24` calls that "a redaction bug is a
 * COMPILE ERROR, not a runtime leak". Generala's state holds no unseen value at
 * all: the scorecards are public (proposal Q4), `turn.dice` and `turn.slots`
 * are the faces physically showing, and `rollsUsed` is something everybody at
 * the table counts. There is no unrevealed randomness BECAUSE entropy is
 * materialized and applied inside the same `runAdvanceOnce` step, which is
 * exactly why exploration Design C (pre-roll all three throws) was rejected: it
 * would have manufactured the hidden state escoba has to strip.
 *
 * So this is a PROJECTION, not a redaction (D6). It re-keys the seats into
 * `self` / `others` so a UI does not have to find itself by index, and it adds
 * the two facts the state deliberately does not store — `totals` and `outcome`
 * — so a consumer reads them instead of re-deriving them, the same call escoba
 * makes for its `HandOutcome` (`view.ts:32-35`).
 *
 * `cards` and `totals` are parallel to the seats, and every seat sees the same
 * two arrays and the same `turn`. That equality is what breaks the day a field
 * becomes secret: a redacted field is by definition not equal across seats.
 */
export interface PlayerView {
  readonly self: SeatView;
  readonly others: readonly SeatView[];
  readonly cards: readonly Scorecard[];
  readonly totals: readonly number[];
  readonly turn: Turn;
  readonly outcome: MatchOutcome | null;
}

/**
 * The turn, rebuilt arm by arm rather than handed through.
 *
 * `turn: state.turn` would satisfy every key assertion a test can write today
 * and publish, unasked, whatever a later change adds to one of these arms — a
 * pre-rolled face being the exact thing the spec says must never exist in a
 * view. Naming each field is what makes that impossible instead of unlikely,
 * and the `switch` over `phase` is exhaustive by the type, so a fourth arm
 * fails to compile here rather than falling through to a partial projection.
 */
function projectTurn(turn: Turn): Turn {
  switch (turn.phase) {
    case "awaiting-roll":
      return { phase: "awaiting-roll", seat: turn.seat, rollsUsed: turn.rollsUsed, slots: turn.slots };
    case "deciding":
      return { phase: "deciding", seat: turn.seat, rollsUsed: turn.rollsUsed, dice: turn.dice };
    case "servida-win":
      return { phase: "servida-win", seat: turn.seat };
  }
}

/**
 * The eleven boxes, and only the eleven boxes.
 *
 * The least obvious of the three pass-throughs this file refuses: `cards:
 * state.cards` reads as harmless because a scorecard IS public in full. It is
 * the boxes that are public, though, not whatever a later change parks beside
 * them — and `CATEGORY_IDS` is the same list `emptyScorecard` builds from, so
 * the two cannot drift.
 */
function projectCard(card: Scorecard): Scorecard {
  const projected: Partial<Record<CategoryId, number | null>> = {};
  for (const category of CATEGORY_IDS) projected[category] = card[category];
  return projected as Scorecard;
}

/**
 * Everything this seat is entitled to know, which for this game is everything.
 *
 * Every field is built explicitly from primitives and `MatchState` is never
 * spread — the escoba discipline kept even though there is nothing to strip, so
 * the day a hidden field does appear it cannot leak by accident.
 *
 * An id belonging to no seat at this table THROWS rather than resolving to seat
 * 0, the same refusal `escoba-engine/src/view.ts:58-60` and
 * `truco-engine/src/view.ts:131-133` make: a view handed to a stranger would
 * claim to be somebody's.
 *
 * TWO SEATS SHARING AN ID ARE NOT DISTINGUISHABLE HERE, and that is named
 * rather than patched over: `indexOf` resolves to the first of them. The place
 * that could refuse it is `createMatch`, which is where a table is built, and
 * no task in this change asks for that guard — no shipped engine has one
 * either. Carried, not freelanced.
 */
export function getViewFor(state: MatchState, playerId: PlayerId): PlayerView {
  const seat = state.players.indexOf(playerId);
  if (seat === -1) throw new Error(`unknown player: ${playerId}`);

  const seats: readonly SeatView[] = state.players.map((id, index) => ({ playerId: id, seat: index }));
  return {
    self: seats[seat]!,
    others: seats.filter((_, index) => index !== seat),
    cards: state.cards.map(projectCard),
    totals: state.cards.map(totalFor),
    turn: projectTurn(state.turn),
    outcome: getOutcome(state),
  };
}
