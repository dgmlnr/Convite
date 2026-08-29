import type { OtherPlayerView, PlayerView } from "@hexdev/escoba-engine";

/**
 * WHAT THE TABLE WAS NOT SAYING, first half (slice R3a): whose turn it is,
 * and how many cards every other seat still holds.
 *
 * `PlayerView` already carried both — `hand.turn` and
 * `others[].cardsRemaining` — and no UI file read either. Nothing here
 * DERIVES a number: every value below is read straight off the view, the same
 * discipline `scoreboard.ts` states for the running score and
 * `renderEscobaHandBreakdown` states for the hand's categories.
 *
 * WHY ESCOBA NEEDS THIS MORE THAN TRUCO DOES: the score only moves when a
 * whole hand resolves, so mid-hand the scoreboard is frozen and a player
 * could see nothing at all of what they were achieving. Truco at least states
 * the turn in a badge and shows the opponents' card backs; escoba said
 * nothing at all, leaving the turn implied only by which buttons were
 * disabled.
 */

/**
 * Who another seat is, from the local player's chair.
 *
 * PARTNER IS DECIDED BY `teamId`, NOT BY GEOMETRY. The 4-seat game does seat
 * partners across (seat + 2), but the view already states the team, and a
 * label that read the seat arithmetic instead would be a second, weaker copy
 * of a fact the engine already sent.
 *
 * The two RIVALS are then distinguished by their offset in turn order, which
 * is also the order `renderEscobaStatus` lays the row out in — so "izq."/
 * "der." describe this row's own painted arrangement, not an imagined table
 * geometry that escoba (unlike `truco-ui`, which really does anchor seats)
 * never draws.
 */
export type SeatRole = "partner" | "rival" | "rival-left" | "rival-right";

/** Compact, for the chip. Same abbreviations `truco-ui`'s call log already
 * established for the identical distinction. */
const SEAT_LABELS: Readonly<Record<SeatRole, string>> = {
  partner: "Compañero",
  rival: "Rival",
  "rival-left": "Rival izq.",
  "rival-right": "Rival der.",
};

/** Spelled out, for the chip's accessible name: a count is information, so it
 * gets a name rather than being a digit next to an abbreviation nobody can
 * hear ("izq." is read aloud as a word, not as "izquierda"). */
const SEAT_SPOKEN: Readonly<Record<SeatRole, string>> = {
  partner: "Tu compañero",
  rival: "El rival",
  "rival-left": "El rival de la izquierda",
  "rival-right": "El rival de la derecha",
};

/** Whose turn it is, in words — never "de el rival", so this is its own map
 * rather than a prefix concatenated onto `SEAT_SPOKEN`. Voseo, matching
 * `i18n.ts`'s own voice and `truco-ui`'s "Tu turno". */
const TURN_LABELS: Readonly<Record<SeatRole, string>> = {
  partner: "Turno de tu compañero",
  rival: "Turno del rival",
  "rival-left": "Turno del rival de la izquierda",
  "rival-right": "Turno del rival de la derecha",
};

const YOUR_TURN = "Tu turno";

/** Seats ahead of the local player in turn order: 1 is whoever plays next,
 * and in the 4-seat game 2 is the partner and 3 whoever plays just before. */
function turnOffset(other: OtherPlayerView, view: PlayerView): number {
  const seatCount = view.others.length + 1;
  return (other.seat - view.self.seat + seatCount) % seatCount;
}

export function seatRole(other: OtherPlayerView, view: PlayerView): SeatRole {
  if (other.teamId === view.self.teamId) return "partner";
  if (view.others.length < 2) return "rival";
  return turnOffset(other, view) === 1 ? "rival-right" : "rival-left";
}

/**
 * Whose turn it is. `""` between hands (`PlayerView.hand` is `null` until the
 * next one is dealt) — the caller's own `:empty` rule hides the line, the
 * same convention `renderEscobaHandBreakdown` already uses for a panel with
 * nothing to say.
 */
export function describeTurn(view: PlayerView): string {
  if (view.hand === null) return "";
  const { turn } = view.hand;
  if (turn === view.self.playerId) return YOUR_TURN;
  const other = view.others.find((candidate) => candidate.playerId === turn);
  return other === undefined ? "" : TURN_LABELS[seatRole(other, view)];
}

export function describeCards(count: number): string {
  return `${String(count)} ${count === 1 ? "carta" : "cartas"}`;
}

/**
 * The persistent nodes, built ONCE per match by the composition root
 * (`game-ui-registry.ts`) and only ever mutated here.
 *
 * `turnEl` carries the `aria-live` region: announcing needs a CHANGE to a
 * node ALREADY in the accessibility tree, so it can never be rebuilt — the
 * exact precedent slice P set for `sumEl` and slice R1 for the breakdown
 * announcer. `seatsEl` holds no live region and is rebuilt freely.
 */
export interface EscobaStatusElements {
  readonly turnEl: HTMLElement;
  readonly seatsEl: HTMLElement;
}

function renderSeat(other: OtherPlayerView, view: PlayerView): HTMLElement {
  const role = seatRole(other, view);
  const seat = document.createElement("li");
  seat.className = "hexdev-escoba-seat";
  seat.dataset.role = role;
  seat.dataset.seat = String(other.seat);
  // Marked in WORDS by the turn line above, which names this very seat; this
  // attribute only drives a second, non-colour cue (WCAG 1.4.1).
  seat.dataset.turn = String(view.hand?.turn === other.playerId);
  seat.setAttribute("aria-label", `${SEAT_SPOKEN[role]}: ${describeCards(other.cardsRemaining)}`);

  const label = document.createElement("span");
  label.className = "hexdev-escoba-seat-label";
  label.textContent = SEAT_LABELS[role];

  const count = document.createElement("span");
  count.className = "hexdev-escoba-seat-count";
  count.dataset.cards = String(other.cardsRemaining);
  count.textContent = describeCards(other.cardsRemaining);

  seat.append(label, count);
  return seat;
}

/**
 * The turn line, and every other seat's remaining cards.
 *
 * The row is laid out in TABLE order rather than in `others` order: highest
 * turn-offset first, so the 4-seat game reads left rival, partner, right
 * rival across the screen — which is what makes "izq."/"der." true of the
 * thing a player is looking at.
 */
export function renderEscobaStatus(elements: EscobaStatusElements, view: PlayerView): void {
  const { turnEl, seatsEl } = elements;

  turnEl.className = "hexdev-escoba-turn";
  turnEl.dataset.self = String(view.hand !== null && view.hand.turn === view.self.playerId);
  const turn = describeTurn(view);
  // Only on a real change: rewriting the same text into a live region makes
  // some readers repeat themselves on every single broadcast.
  if (turnEl.textContent !== turn) turnEl.textContent = turn;

  seatsEl.replaceChildren();
  seatsEl.className = "hexdev-escoba-seats";
  const ordered = [...view.others].sort((a, b) => turnOffset(b, view) - turnOffset(a, view));
  for (const other of ordered) seatsEl.appendChild(renderSeat(other, view));
}
