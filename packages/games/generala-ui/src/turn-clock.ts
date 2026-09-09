import { createDiceAnnouncer, ensureDiceStyles } from "@hexdev/dice-ui";
import type { PlayerView, SeatView } from "@hexdev/generala-engine";

import { seatLabel } from "./scorecard.js";
import { ensureTurnClockStyles } from "./turn-clock-styles.js";

/**
 * Milliseconds remaining -> whole seconds, the ONE rounding rule every face of
 * this clock shares.
 *
 * Rounds UP, deliberately. A clock armed for exactly one minute must read
 * "1:00" on its first frame — `Math.floor` would show "0:59" before the player
 * had even looked at it, and would spend the final whole second showing "0:00"
 * while the turn was in fact still live.
 *
 * Clamps at zero rather than going negative: once a deadline has passed there
 * is a real window — the server's own bot decision is in flight — during which
 * this client still holds the stale deadline, and "-0:03" reads as a bug
 * rather than as a turn being taken over.
 */
export function remainingWholeSeconds(remainingMs: number): number {
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

/** Milliseconds remaining -> what the strip says. */
export function formatCountdown(remainingMs: number): string {
  const total = remainingWholeSeconds(remainingMs);
  return `${String(Math.floor(total / 60))}:${String(total % 60).padStart(2, "0")}`;
}

/** How low the clock gets before the ONE spoken warning. Ten whole seconds:
 * late enough to be genuinely about running out (`transport-colyseus`'s
 * `DEFAULT_TURN_TIMEOUT_SECONDS` is 60), early enough that a polite region —
 * which waits for the reader to finish whatever it is saying — still gets the
 * sentence out while acting on it is possible. Deliberately no second warning
 * at five: it would land inside the most time-critical window and queue behind
 * whatever the table is announcing. */
export const TURN_CLOCK_WARNING_SECONDS = 10;

/** How often the countdown redraws itself between broadcasts. A countdown
 * changes once a second and there is nothing to gain from asking more often —
 * the number is recomputed from an absolute deadline every time, so a coarse
 * cadence costs accuracy nothing. */
export const TURN_CLOCK_TICK_MS = 1000;

/** `tickMs` exists so a test need not wait real seconds to watch the number
 * move, the same injection `truco-ui`'s own clock takes; `now` is the real
 * clock, injected so an assertion can name an exact string and a scene can
 * freeze one. */
export interface GeneralaTurnClockOptions {
  readonly now: () => number;
  readonly tickMs?: number;
}

export interface GeneralaTurnClock {
  /** The one element the board mounts. It holds the visible strip AND the
   * region that speaks for it, because the two are one feature and a board
   * that mounted the strip and forgot the region would ship a clock only half
   * the table can read. */
  readonly clockEl: HTMLElement;
  readonly render: (view: PlayerView, deadline: number | null) => void;
  /** Kills the repeating timer outright. The tick guards below already stop a
   * clock whose node has left the document, but a board that KNOWS it is
   * throwing this away should say so rather than wait for the next tick to
   * find out. */
  readonly stop: () => void;
}

/** Seat order, which is the order the planilla's columns are in — asked the
 * same way `scorecard.ts` asks it, so the two per-seat surfaces on this board
 * cannot disagree about which side somebody is on. */
function seatsInOrder(view: PlayerView): readonly SeatView[] {
  return [view.self, ...view.others].sort((left: SeatView, right: SeatView) => left.seat - right.seat);
}

/**
 * WHICH SEAT THE CLOCK IS ON, or none — DERIVED here rather than sent.
 *
 * `viewMessageFor` puts ONE `turnDeadline` on the wire, deliberately the same
 * field for every client and deliberately without a seat: "only one seat is
 * ever on the clock". Which seat that is, this view already answers.
 * `MatchRoom.seatOnTheClock` picks the first human seat owing a blocking
 * action, and in Generala exactly one seat is ever owed anything.
 *
 * `outcome` is the guard that matters most here: `applyScore` hands the turn on
 * whether or not any card still has room, so a FINISHED match arrives with
 * `turn.seat` naming somebody who will never play again. A clock is the one cue
 * on this board that would keep MOVING under the verdict overlay, so a stale
 * deadline plus a live turn is the one combination that must produce nothing.
 */
function seatOnTheClock(view: PlayerView): number | null {
  return view.outcome === null ? view.turn.seat : null;
}

function buildSeatCell(doc: Document, seat: SeatView, view: PlayerView, onTurn: boolean): { readonly node: HTMLElement; readonly time: HTMLElement } {
  const cell = doc.createElement("div");
  cell.className = "hexdev-generala-turn-clock-seat";
  cell.dataset.seat = String(seat.seat);
  if (onTurn) cell.dataset.turn = "active";

  const name = doc.createElement("span");
  name.className = "hexdev-generala-turn-clock-name";
  name.textContent = seatLabel(seat, view.self, view.others.length);

  const time = doc.createElement("span");
  time.className = "hexdev-generala-turn-clock-time";

  cell.append(name, time);
  return { node: cell, time };
}

/**
 * THE TURN CLOCK, VISIBLE, ON BOTH SEATS.
 *
 * The server has armed a per-turn timer since long before this board existed
 * — `MatchRoom.armTurnTimer` — and a player could not see one second of it.
 * When it ran out the bot played their turn and the first they knew was a box
 * they had not chosen.
 *
 * BOTH SEATS GET A CELL, AND ONLY ONE EVER COUNTS. That the rival's time is
 * running is information about the game, not noise, so their cell is drawn the
 * same way and carries their number when it is their go. The empty cell keeps
 * its box, so nothing on the strip moves as the turn passes back and forth.
 *
 * THE SERVER'S ABSOLUTE DEADLINE IS THE ONLY AUTHORITY, and the timer below
 * never decrements anything. Every tick recomputes `deadline - now()` from the
 * last deadline a broadcast carried, which is what makes this clock correct
 * after a backgrounded tab throttles the interval, after a slow frame, and
 * after a broadcast that arrives late — three cases a local countdown gets
 * silently wrong and none of which a test would notice. It is also why the
 * wire carries no per-second tick: a countdown is arithmetic a client can do,
 * and ticking it server-side would be per-match-per-second traffic for
 * something subtraction already answers.
 *
 * THREE THINGS STOP IT, each a way a `setInterval` outlives what it was drawing
 * for, and each argued at its own guard below: no deadline, a finished match,
 * and a node that has left the document. Every render also clears the previous
 * interval before arming, so a broadcast storm leaves one timer and not one
 * per packet.
 *
 * THE TICKING NUMBER IS `aria-hidden`, WHICH IS NOT A DETAIL. A live region is
 * announced every time its content changes, so a per-second number inside one
 * is read out sixty times a minute — not a degraded experience but an unusable
 * one. The strip is hidden from assistive tech entirely and the region beside
 * it says two coarse sentences instead, the total once and one warning, and
 * only for the seat reading this board: a rival's countdown announced every
 * turn is spam rather than access.
 *
 * THE REGION IS `dice-ui`'S (D8), exactly as `announcer.ts` borrows it. THE
 * WORDING AND THE ARITHMETIC ARE NOT: `truco-ui/turn-clock.ts` has the same two
 * functions and this file may not import them, because both packages are L1
 * game presentation and neither may reach across. What is shared between the
 * copies is the DISCIPLINE, not the module — the trade `dice-announcer.ts`
 * records for its own ten lines.
 *
 * IT LEARNS NO RULE, AND NEITHER DOES `dice-ui`. A turn and a clock are facts
 * about a game; the dice are props. This is the tier that knows both.
 */
export function createGeneralaTurnClock(doc: Document, options: GeneralaTurnClockOptions): GeneralaTurnClock {
  ensureDiceStyles(doc);
  ensureTurnClockStyles(doc);
  const tickMs = options.tickMs ?? TURN_CLOCK_TICK_MS;

  const clockEl = doc.createElement("div");
  clockEl.className = "hexdev-generala-turn-clock";
  const row = doc.createElement("div");
  row.className = "hexdev-generala-turn-clock-row";
  // THE STRIP IS HIDDEN FROM ASSISTIVE TECH, AND THE REGION IS NOT — which is
  // why the attribute goes on the ROW and never on the element the board
  // mounts: `aria-hidden` on an ancestor takes its whole subtree out of the
  // accessibility tree, and the region is in that subtree.
  row.setAttribute("aria-hidden", "true");
  const announcerEl = createDiceAnnouncer(doc);
  // NAMED, BECAUSE THIS BOARD NOW HAS TWO VOICES. `announcer.ts`'s region
  // narrates what HAPPENED; this one says two coarse things about time. A fence
  // asking for "the live region" picks whichever comes first in the DOM and
  // asserts about the wrong one — which is what happened the first time the
  // strip was mounted beside it. `truco-ui` marks its nine the same way.
  announcerEl.dataset.announces = "turn-clock";
  clockEl.append(row, announcerEl);

  let timer: ReturnType<typeof setInterval> | undefined;
  /** The node the countdown is written into and the deadline it counts to —
   * read at FIRE time, never closed over per render, so a timer that outlives
   * the row it was armed for writes into nothing. */
  let ticking: HTMLElement | null = null;
  let deadlineNow: number | null = null;
  /** Which deadline has had its total said, and which has had its warning —
   * so a re-render of the same turn repeats neither. */
  let announced: number | null = null;
  let warned: number | null = null;

  const stop = (): void => {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  };

  /** The one warning, at the threshold and never with the live number in it: a
   * polite region says it when the reader is free, and by then a number would
   * be stale. */
  const warnIfLow = (deadline: number): void => {
    const remaining = deadline - options.now();
    if (announced !== deadline || warned === deadline) return;
    if (remaining <= 0 || remainingWholeSeconds(remaining) > TURN_CLOCK_WARNING_SECONDS) return;
    warned = deadline;
    announcerEl.textContent = `Quedan ${String(TURN_CLOCK_WARNING_SECONDS)} segundos`;
  };

  const render = (view: PlayerView, deadline: number | null): void => {
    stop();
    const onTurn = seatOnTheClock(view);
    const cells = seatsInOrder(view).map((seat) => ({ seat: seat.seat, ...buildSeatCell(doc, seat, view, seat.seat === onTurn) }));
    row.replaceChildren(...cells.map((cell) => cell.node));

    const live = onTurn === null ? null : deadline;
    ticking = live === null ? null : (cells.find((cell) => cell.seat === onTurn)?.time ?? null);
    deadlineNow = live;
    if (live === null || ticking === null) return;

    ticking.textContent = formatCountdown(live - options.now());

    // THE SPOKEN HALF IS THE READING SEAT'S ONLY. Everything above is drawn
    // for both.
    if (onTurn === view.self.seat) {
      if (announced !== live) {
        announced = live;
        announcerEl.textContent = `Tenés ${String(remainingWholeSeconds(live - options.now()))} segundos para jugar`;
      }
      warnIfLow(live);
    }

    timer = setInterval(() => {
      const node = ticking;
      const until = deadlineNow;
      // ALL THREE, EVERY TICK. `node === null` and `until === null` are the
      // states a render left behind; `isConnected` is the one nothing on this
      // board can tell us about — a container emptied underneath, a match
      // left, a widget torn down — and it is the guard that keeps a clock from
      // running in a screen that is gone.
      if (node === null || until === null || !node.isConnected) {
        stop();
        return;
      }
      node.textContent = formatCountdown(until - options.now());
      if (onTurn === view.self.seat) warnIfLow(until);
    }, tickMs);
  };

  return { clockEl, render, stop };
}
