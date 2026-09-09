import type { PlayerView, SeatView } from "@hexdev/generala-engine";

import { ensureMatchOverStyles } from "./match-over-styles.js";
import { seatLabel } from "./scorecard.js";

/** The two ways out, and they are deliberately not one callback. A rematch
 * and a return to the lobby are different intentions, and a board that has
 * nowhere to go back to simply omits the second. `focusOnOpen` is true only
 * on the render that OPENS the overlay — the caller tracks that transition,
 * the same convention `truco-ui` and `escoba-ui` both state. */
export interface GeneralaMatchOverActions {
  readonly onPlayAgain: () => void;
  readonly onLeaveMatch?: () => void;
  readonly focusOnOpen?: boolean;
}

export type GeneralaMatchOverRender = (container: HTMLElement, view: PlayerView, actions: GeneralaMatchOverActions) => void;

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
 * THE VERDICT, IN THE SIZE A PLAYER ACTUALLY READS.
 *
 * A SHARED WIN IS ITS OWN OUTCOME AND NOT A WIN WITH A FOOTNOTE. `getOutcome`
 * returns the full argmax set, so two seats level at the top are both winners
 * (O-2, closed) — and until this line every one of them was handed the same
 * "¡Ganaste la partida!" a solo winner gets. It was TRUE, which is why no
 * assertion here could ever have seen it: the sentence underneath already
 * said "Empataron Vos y Rival con 40 puntos.", and the two lines were
 * consistent. What was missing is that a headline is what gets read, and this
 * one withheld the single fact that made the ending unusual. A player could
 * take a shared victory and never learn they shared it.
 *
 * SO THE TIE IS IN THE HEADLINE, and both halves of it are: "Ganaste" is the
 * win, "Victoria compartida" is the tie, and neither can be read without the
 * other. The alternative — "¡Ganaste la partida, empatados!" — was rejected
 * for putting a gendered adjective on the reader, which this surface has no
 * way to know and no business guessing.
 *
 * THE COUNT IS ASKED INSIDE THE WIN, never beside it. A losing seat with two
 * winners above it is already told so by `winnersSentence`, and its headline
 * is the one it has always been; nesting is what makes "more than one winner"
 * a question that can only be asked about a seat that IS one, instead of a
 * clause that has to remember to also check.
 */
function headlineFor(won: boolean, winners: number): string {
  if (!won) return "Perdiste la partida";
  return winners > 1 ? "¡Ganaste! Victoria compartida" : "¡Ganaste la partida!";
}

/** The final line, drawn in seat order so it reads like the planilla's own
 * totals row. */
function finalScoreLine(view: PlayerView): string {
  const columns = seatsInOrder(view).map((seat) => `${seatLabel(seat, view.self, view.others.length)} ${String(view.totals[seat.seat] ?? 0)}`);
  return `Resultado final: ${columns.join(" — ")}`;
}

function makeAction(doc: Document, action: string, label: string, onPress: () => void): HTMLButtonElement {
  const button = doc.createElement("button");
  button.type = "button";
  button.dataset.action = action;
  button.textContent = label;
  button.addEventListener("click", onPress);
  return button;
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
 * inline style to get one. An earlier draft wrote `position: relative` onto
 * the container — the very element the sheet makes `position: absolute;
 * inset: 0` — so the overlay cancelled itself and laid out in flow, pushing
 * the board down the page while every text assertion passed.
 *
 * REAL MODAL SEMANTICS, because it is the most disruptive thing this UI does.
 * Focus moves here on the render that opens it and Escape is the way out —
 * both skipped when there is no lobby to return to, because a rematch is not
 * a way out and an Escape that closed the overlay would only have it redrawn
 * by the next broadcast.
 *
 * EVERY ONE OF THOSE IS UNDONE WHEN THE OVERLAY CLEARS, and each undoing is
 * its own fence. An attribute outlives the children that justified it: a
 * `role="dialog"` on an emptied container is a dialog assistive tech can be
 * told about with nothing on screen, and a `keydown` handler left behind
 * throws a player back to the lobby for pressing Escape mid-turn in the NEXT
 * match.
 */
export const renderGeneralaMatchOver: GeneralaMatchOverRender = (container, view, actions) => {
  const doc = container.ownerDocument;
  ensureMatchOverStyles(doc);
  container.className = "hexdev-generala-match-over";
  container.replaceChildren();
  container.onkeydown = null;

  const outcome = view.outcome;
  if (outcome === null) {
    delete container.dataset.result;
    delete container.dataset.winners;
    container.removeAttribute("role");
    container.removeAttribute("aria-modal");
    container.removeAttribute("tabindex");
    return;
  }

  const winners = seatsInOrder(view).filter((seat) => outcome.winnerIds.includes(seat.playerId));
  const won = winners.some((seat) => seat.seat === view.self.seat);
  container.dataset.result = won ? "won" : "lost";
  container.dataset.winners = String(winners.length);
  container.setAttribute("role", "dialog");
  container.setAttribute("aria-modal", "true");
  container.tabIndex = -1;

  // ONE PANEL, AND EVERY WORD OF THE VERDICT ON IT. Found by looking: over a
  // finished planilla the veil alone let the card's own rows read straight
  // through the sentences — two layers of pale text at similar sizes, and the
  // verdict was the one that lost. The panel is what makes the veil able to
  // stay light enough to keep the planilla legible around it.
  const panel = doc.createElement("div");
  panel.className = "hexdev-generala-match-over-panel";
  container.appendChild(panel);

  const headline = doc.createElement("h2");
  headline.className = "hexdev-generala-match-over-headline";
  headline.textContent = headlineFor(won, winners.length);
  panel.appendChild(headline);

  const winnersLine = doc.createElement("p");
  winnersLine.className = "hexdev-generala-match-over-winners";
  winnersLine.textContent = winnersSentence(view, winners, view.totals[winners[0]!.seat] ?? 0);
  panel.appendChild(winnersLine);

  const score = doc.createElement("p");
  score.className = "hexdev-generala-match-over-score";
  score.textContent = finalScoreLine(view);
  panel.appendChild(score);

  const row = doc.createElement("div");
  row.className = "hexdev-generala-match-over-actions";
  row.appendChild(makeAction(doc, "play-again", "Jugar de nuevo", actions.onPlayAgain));

  const leave = actions.onLeaveMatch;
  if (leave !== undefined) {
    row.appendChild(makeAction(doc, "leave-match", "Volver al lobby", leave));
    container.onkeydown = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      leave();
    };
  }
  panel.appendChild(row);

  if (actions.focusOnOpen === true) container.focus();
};
