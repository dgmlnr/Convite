import type { PlayerView, SeatView } from "@hexdev/generala-engine";

import { ensureMatchOverStyles } from "./match-over-styles.js";
import { seatLabel } from "./scorecard.js";

export type GeneralaMatchOverRender = (container: HTMLElement, view: PlayerView) => void;

/** Seat order, the order the planilla's columns are in, so a name means the
 * same thing on both surfaces. */
function seatsInOrder(view: PlayerView): readonly SeatView[] {
  return [view.self, ...view.others].sort((left, right) => left.seat - right.seat);
}

/** "Vos y Rival", "Vos, Rival 2 y Rival 3" — the Spanish list, with the
 * conjunction on the last pair only. Written rather than reached for from a
 * formatter so the separator is the same one this repository's other prose
 * uses, and because `Intl.ListFormat`'s locale would be the page's rather
 * than this game's. */
function nameList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]!}`;
}

/**
 * WHO WON, AND THE CASE THIS SURFACE EXISTS FOR IS THE ONE WHERE MORE THAN
 * ONE SEAT DID.
 *
 * `getOutcome` returns the full argmax set: every seat holding the highest
 * total, in seat order, with nobody preferred by seat index (O-2, closed).
 * Two seats level at the top BOTH won, and both of them are told so — this is
 * where `escoba-ui`'s overlay is deliberately not copied. Its
 * `match-outcome.ts` reads an empty `winnerIds` as a draw and paints a
 * neutral "Partida finalizada", which is right for an engine whose empty list
 * means nobody won at all; Generala's tie arrives as a list of TWO, and
 * flattening it into "the match ended" would take a win away from both of
 * them.
 *
 * THERE IS NO EMPTY-LIST BRANCH, and its absence is the rule rather than an
 * oversight. `getOutcome` returns `null` while the match is running and a
 * non-empty argmax the moment it is not — `createMatch` refuses a table with
 * nobody at it, so `Math.max` always has something to chew on. A branch for
 * a list that cannot arrive is a clause with nothing to observe, which this
 * package has now deleted three times for the same reason.
 */
function winnersSentence(view: PlayerView, winners: readonly SeatView[], total: number): string {
  const points = `${String(total)} puntos`;
  if (winners.length > 1) {
    return `Empataron ${nameList(winners.map((seat) => seatLabel(seat, view.self, view.others.length)))} con ${points}.`;
  }
  const winner = winners[0]!;
  // SECOND PERSON WHEN IT IS THIS SEAT, and that is why there are two shapes
  // instead of one. A single template over the planilla's column names would
  // produce "Ganó Vos", which is not Spanish — the label is a column heading,
  // not a subject.
  if (winner.seat === view.self.seat) return `Ganaste con ${points}.`;
  return `Ganó ${seatLabel(winner, view.self, view.others.length)} con ${points}.`;
}

/**
 * THE END OF THE MATCH, ON TOP OF THE TABLE RATHER THAN INSTEAD OF IT.
 *
 * The planilla underneath is the thing a player wants to look at once it is
 * over — which box cost them the match, what the rival crossed out — so this
 * is an overlay and never a screen that replaces the board. Empty container
 * means no overlay, and `:empty { display: none }` is what hides it, so the
 * DOM and the paint cannot disagree about whether a match is finished.
 *
 * IT READS THE VIEW AND LEARNS NO RULE. `view.outcome` is `null` until the
 * game says otherwise, so this file never asks whether every box is full or
 * whether somebody threw a generala servida — the two terminal paths look
 * identical from here, which is the point. The same argument `tray.ts` makes
 * about the offer list.
 *
 * THE BOARD PROVIDES THE POSITIONING CONTEXT, and this renderer sets no
 * inline style to get one. The first draft wrote `position: relative` onto
 * the container — which is the very element the sheet makes
 * `position: absolute; inset: 0`, so it cancelled the overlay outright and
 * laid it out in flow, pushing the board down the page. No assertion here saw
 * it, because nothing measured where the overlay landed; the fence that does
 * is in `match-over.browser.test.ts` now.
 *
 * PARTIAL, AND SAYING SO: this states the result and offers no way out of it
 * yet. The final totals row, the rematch, the return to the lobby, Escape and
 * the modal semantics that make an overlay a dialog rather than a panel are
 * the next unit — a `role="dialog"` with nothing focusable inside it would be
 * a worse lie than no role at all.
 */
export const renderGeneralaMatchOver: GeneralaMatchOverRender = (container, view) => {
  const doc = container.ownerDocument;
  ensureMatchOverStyles(doc);
  container.className = "hexdev-generala-match-over";
  container.replaceChildren();

  const outcome = view.outcome;
  if (outcome === null) {
    delete container.dataset.result;
    delete container.dataset.winners;
    return;
  }

  const winners = seatsInOrder(view).filter((seat) => outcome.winnerIds.includes(seat.playerId));
  const won = winners.some((seat) => seat.seat === view.self.seat);
  container.dataset.result = won ? "won" : "lost";
  container.dataset.winners = String(winners.length);

  const headline = doc.createElement("h2");
  headline.className = "hexdev-generala-match-over-headline";
  headline.textContent = won ? "¡Ganaste la partida!" : "Perdiste la partida";
  container.appendChild(headline);

  const winnersLine = doc.createElement("p");
  winnersLine.className = "hexdev-generala-match-over-winners";
  winnersLine.textContent = winnersSentence(view, winners, view.totals[winners[0]!.seat] ?? 0);
  container.appendChild(winnersLine);
};
