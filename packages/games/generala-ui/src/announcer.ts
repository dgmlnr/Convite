import { createDiceAnnouncer } from "@hexdev/dice-ui";
import { CATEGORY_IDS } from "@hexdev/generala-engine";
import type { CategoryId, PlayerView, SeatView, Turn } from "@hexdev/generala-engine";

import { CATEGORY_LABELS, seatLabel } from "./scorecard.js";

/** The region, and the one call that keeps it truthful. Mounted once by the
 * board and mutated afterwards — never rebuilt, which is the whole reason
 * this is a factory holding a node instead of a render that makes one. */
export interface GeneralaAnnouncer {
  readonly announcerEl: HTMLElement;
  readonly announce: (view: PlayerView) => void;
}

/**
 * Which throw of the turn is on the table, or `null` when the dice are not
 * showing.
 *
 * THE SEAT IS NOT PART OF THIS, AND ITS ABSENCE WAS MEASURED. The first draft
 * keyed on `seat:rollsUsed`, on the reasoning that "throw 1" happens once per
 * turn and the seat is what tells two of them apart. Deleting the seat left
 * the whole suite green, and the reason is structural rather than a missing
 * test: a turn only passes to the next seat by WRITING a box, so any pair of
 * views that straddles a seat change also straddles a filled box — a question
 * this region answers before it ever reaches this one. The seat could not be
 * observed because it can never decide anything.
 *
 * THE COUNTER CAN, and it needed a test of its own to prove it, because on
 * the ordinary path a hold sits between two throws and this reads the same
 * number on both sides of it. What it is for is a board that renders only the
 * LATER of two broadcasts: the hold is never drawn, the region sees two
 * `deciding` views in a row, and without the counter the second throw is not
 * a new event.
 *
 * `servida-win` IS THE ONLY ARM WITHOUT ONE, and that is the type's doing
 * rather than a case chosen here: a match won off the cup ends before
 * anybody is at a throw, so the arm carries no counter to read. Narrowing it
 * to `deciding` instead was the first draft and measured as unobservable —
 * `awaiting-roll` carries the counter of the throw that already happened, so
 * it never equals the next one either way.
 */
function throwNumberOf(turn: Turn): number | null {
  return turn.phase === "servida-win" ? null : turn.rollsUsed;
}

/**
 * THE THROW, BY NUMBER AS WELL AS BY FACE — and the number is not decoration.
 *
 * `dice-ui` already ships this sentence: `announceRoll` writes
 * "Tirada: 3, 5, 5, 2, 6" and guards on equality so an identical re-announce
 * stays silent. That guard is right for the cup it was written for, which
 * throws all five dice and can only repeat itself if a caller re-announces
 * the same event. Generala re-rolls a SUBSET, so two consecutive throws can
 * genuinely land on the same five faces — keep three sixes, throw the other
 * two, get the same two back — and there the guard swallows a real event: a
 * player who cannot see the dice is told nothing about a throw that just
 * happened, while a sighted player watched it. Measured in
 * `announcer.browser.test.ts` rather than reasoned about.
 *
 * So this package writes its own sentence and imports the REGION rather than
 * the wording (D8 names both; this is the half of it that does not transfer,
 * and it is recorded as a deviation rather than taken quietly). The throw
 * counter is something everybody at a real table is keeping anyway — it is
 * what decides whether a juego is servida or armada — so saying it costs a
 * word and carries a rule.
 */
function throwSentence(turn: Extract<Turn, { phase: "deciding" }>): string {
  return `Tirada ${String(turn.rollsUsed)}: ${turn.dice.join(", ")}`;
}

/** What this seat is CALLED to the seat reading the region — "Vos", "Rival",
 * "Rival 2" — asked of the planilla's own naming so the two surfaces cannot
 * disagree about a column. A seat index that is not at this table cannot
 * reach here: the view is built from every seat, and the only indices this
 * file has come out of that same view. */
function labelForSeat(view: PlayerView, seat: number): string {
  const seats: readonly SeatView[] = [view.self, ...view.others];
  return seatLabel(seats.find((candidate) => candidate.seat === seat) ?? view.self, view.self, view.others.length);
}

/** The box somebody just wrote, or `null`. At most one is written per turn —
 * `applyScore` fills exactly one — so the first difference IS the event, and
 * the scan stops at it rather than pretending to collect a list. */
function boxWritten(before: PlayerView, after: PlayerView): { readonly seat: number; readonly category: CategoryId; readonly value: number } | null {
  for (const [seat, card] of after.cards.entries()) {
    const previous = before.cards[seat];
    if (previous === undefined) continue;
    for (const category of CATEGORY_IDS) {
      const value = card[category];
      if (value === null || previous[category] !== null) continue;
      return { seat, category, value };
    }
  }
  return null;
}

/**
 * What was written, where, and by whom — with the NUMBER in it.
 *
 * "Anotaste en Seises" is the sentence this is written against: it names the
 * event and withholds the only thing a player needs from it. A zero is spoken
 * out loud for the same reason the planilla strikes the box through rather
 * than leaving it looking like any other number — crossing a category out is
 * a decision somebody made, and it is exactly what a rival plans around.
 *
 * The box's name comes from `scorecard.ts` so the region and the card cannot
 * call the same row two different things. The VERB does not: "Anotaste" is
 * the second person the reading seat is addressed in everywhere else on this
 * board ("Tirar los 5 dados", "Anotar 18 en Seises"), and a rival is spoken
 * about in the third.
 */
function scoreSentence(view: PlayerView, written: { readonly seat: number; readonly category: CategoryId; readonly value: number }): string {
  const label = CATEGORY_LABELS[written.category];
  if (written.seat === view.self.seat) return `Anotaste ${String(written.value)} en ${label}.`;
  return `${labelForSeat(view, written.seat)} anotó ${String(written.value)} en ${label}.`;
}

/**
 * WHO THE TABLE IS WAITING ON NOW.
 *
 * THE BOARD GREW TWO CUES FOR THIS AND THIS IS THE THIRD. A shaded column on
 * the planilla says WHO, a dimmed tray says NOT NOW, and both of them are
 * light on purpose — which leaves a player who is not looking at the screen
 * with nothing at all. "Rival anotó 0 en Cincos." reports what happened and
 * withholds the only part of it anybody has to act on.
 *
 * APPENDED TO THE BOX, NEVER ANNOUNCED ON ITS OWN, and that is not the same
 * compromise this file refuses elsewhere. A throw and a written box are two
 * INDEPENDENT events that a coalescing board can deliver together, which is
 * why the box wins and the throw is dropped. A turn passing is not an event
 * beside the box: `applyScore` is the only transition that moves the seat, so
 * the two arrive in one broadcast, from one action, as a fact and its
 * consequence. Announcing it separately is not even available — it would land
 * in the same render and overwrite the sentence it belongs to.
 *
 * "Juega Rival", with the planilla's own column name, so the region and the
 * card do not invent two words for one seat — the same sharing
 * `scoreSentence` makes for a box, and the reason `seatLabel` is imported at
 * all.
 */
function nowPlayingSentence(view: PlayerView): string {
  if (view.turn.seat === view.self.seat) return "Es tu turno.";
  return `Juega ${labelForSeat(view, view.turn.seat)}.`;
}

/**
 * A GENERALA SERVIDA IS A MATCH-ENDING EVENT AND NOT A SCORE, and the
 * sentence has to be shaped like one.
 *
 * The ruleset's `§Generala servida` wins "en el acto": no card is written,
 * the generala box holds no number afterwards, and `getOutcome` reads the win
 * off the turn rather than off any total. A region that said "Anotaste 50 en
 * Generala" would send a player looking for a box that is still empty, and
 * the planilla beside it would contradict what they just heard.
 */
function servidaWinSentence(view: PlayerView, seat: number): string {
  if (seat === view.self.seat) return "Generala servida: ganaste la partida.";
  return `Generala servida: ${labelForSeat(view, seat)} ganó la partida.`;
}

/**
 * THE ONE NEW FACT IN THIS VIEW, or nothing.
 *
 * THE TWO EVENTS ARE MUTUALLY EXCLUSIVE BY THE STATE MACHINE rather than by
 * preference: a score transitions the turn to `awaiting-roll` or ends the
 * match, and a roll transitions `awaiting-roll` to `deciding`. One applied
 * action produces one of them, and the room broadcasts per action. The ORDER
 * is what happens if a consumer ever coalesces two broadcasts into one
 * render: the more consequential fact survives, because `aria-atomic` means
 * the region is read whole and two events joined into one string is a
 * sentence nobody can follow.
 *
 * THE THIRD EVENT IS ASKED FIRST BECAUSE IT IS THE ONE THAT ENDS THINGS. A
 * generala servida fills no box and shows no dice, so it would fall through
 * both of the other questions in silence; it is also the only one of the
 * three after which nothing else can happen, so nothing it could be competing
 * with matters.
 *
 * THE PHASE IS ASKED WITHOUT A CAST. `deciding` is the only arm carrying
 * dice, so narrowing is what lets `throwSentence` receive a turn that HAS
 * five faces instead of one asserted to. The first draft read the counter
 * first and cast afterwards, which a wrong answer above turns into
 * `undefined.join(...)` at the player rather than an error at the compiler.
 */
function newsIn(before: PlayerView, after: PlayerView): string | null {
  if (after.turn.phase === "servida-win") {
    return before.turn.phase === "servida-win" ? null : servidaWinSentence(after, after.turn.seat);
  }
  const written = boxWritten(before, after);
  // A FINISHED MATCH IS THE ONE STATE WITH NO NEXT SEAT, and the turn does
  // not know it: `applyScore` hands `awaiting-roll` to `(seat + 1) %
  // players.length` whether or not any card still has room, so the last box
  // of the match leaves the turn pointing at somebody who will never play.
  // `outcome` is the engine's answer to "is this still a game", and asking it
  // is what keeps the region from ending twenty-two turns of play by telling
  // a player it is their go under a verdict overlay.
  if (written !== null) {
    const said = scoreSentence(after, written);
    return after.outcome === null ? `${said} ${nowPlayingSentence(after)}` : said;
  }
  const turn = after.turn;
  if (turn.phase !== "deciding") return null;
  if (turn.rollsUsed === throwNumberOf(before.turn)) return null;
  return throwSentence(turn);
}

/**
 * WHAT THE TABLE SAYS OUT LOUD.
 *
 * THE REGION IS `dice-ui`'S, ON PURPOSE (D8). `createDiceAnnouncer` builds the
 * polite, atomic, additions-only live region three packages in this repository
 * have now independently converged on, and `dice-styles.ts` already carries
 * the clip-rect rule that keeps `.hexdev-dice-announcer` visually hidden and
 * still in the accessibility tree. Borrowing the node is what makes this
 * package need no stylesheet of its own for it; rebuilding one here would be a
 * fourth copy of the same ten lines plus a fourth chance to write
 * `display: none` by reflex and silence the thing entirely.
 *
 * IT ANNOUNCES EVENTS, WHICH MEANS IT NEEDS THE PREVIOUS VIEW. A `PlayerView`
 * is a snapshot: "seat 1's Cincos holds 0" is true for the rest of the match,
 * and announcing a state on every broadcast would repeat the whole card
 * forever. The difference between two consecutive views is the event, so this
 * closure remembers the last one it was given — the same reason `tray.ts`
 * holds its pending selection rather than deriving it.
 *
 * THE FIRST VIEW IS NEVER AN EVENT. A board mounting mid-match — a reconnect,
 * a replay, a spectator arriving — hands over a position, not something that
 * just happened, and a region that greeted it with the last throw would
 * announce a sentence over whatever the player was already listening to.
 *
 * NOTHING IS WRITTEN WHEN THERE IS NO NEWS, and that is stronger than writing
 * the same string again: a reader that treats every write as a change would
 * repeat the sentence on every packet, which is exactly the defect
 * `truco-ui/announcer.ts`'s own equality guard exists for. Here the guard is
 * structural — no news produces no call — so a broadcast storm is silent.
 */
export function createGeneralaAnnouncer(doc: Document): GeneralaAnnouncer {
  const announcerEl = createDiceAnnouncer(doc);
  let previous: PlayerView | null = null;

  return {
    announcerEl,
    announce: (view) => {
      const before = previous;
      previous = view;
      if (before === null) return;
      const message = newsIn(before, view);
      if (message === null) return;
      announcerEl.textContent = message;
    },
  };
}
