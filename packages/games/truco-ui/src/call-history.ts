import type { CallEvent, EnvidoState } from "@hexdev/truco-engine";

/**
 * One hand's worth of calls, kept after the hand itself is over.
 *
 * The events alone are not enough to draw a closed round later: a call-log
 * entry is rendered against the hand's OWN `manoSeat` (who leads the envido
 * row) and its own `envido` (where the declared tantos live -- the events
 * carry markers only, never numbers, by design D-1/D-5). A round that kept
 * just its events would be re-rendered against whatever hand happens to be
 * running now, and would quietly start attributing last hand's tantos to this
 * hand's mano.
 */
export interface CallRound {
  readonly events: readonly CallEvent[];
  readonly manoSeat: number;
  readonly envido: EnvidoState;
}

/**
 * What a mount has seen so far, with the hand in play kept apart from the
 * hands that are over.
 *
 * The split is not bookkeeping: between hands there IS no open round -- the
 * live list is empty and the last hand is finished -- so a single list whose
 * last element is "the live one" has no way to say that, and slicing it off
 * throws away a real finished hand. Measured as exactly that bug: the calls
 * of the hand just played disappeared on the next deal.
 */
export interface CallHistory {
  /** Finished hands, oldest first. Each is drawn closed with its own mark. */
  readonly closed: readonly CallRound[];
  /** The hand being played, if anyone has called in it yet. */
  readonly open: CallRound | undefined;
}

/**
 * Whether `events` is this round continuing, rather than a new hand.
 *
 * THE PROBLEM THIS SOLVES. `PlayerView` carries no hand number -- there is
 * nothing in it that says "this is the third hand". What there is: within one
 * hand the call list only ever GROWS, one event appended at a time, and a new
 * hand starts it again from empty. So "the list I am looking at starts with
 * the list I had" is exactly the shape of a hand continuing, and anything
 * else is a new one. No counter to keep in sync with the server, no guess
 * about timing, and it holds even if a render is missed entirely.
 *
 * Compared by VALUE and not by reference: the view is rebuilt on every
 * broadcast, so the same call arrives as a fresh object every time.
 */
function continues(previous: readonly CallEvent[], events: readonly CallEvent[]): boolean {
  if (events.length < previous.length) return false;
  return previous.every((event, index) => sameEvent(event, events[index]));
}

function sameEvent(a: CallEvent, b: CallEvent | undefined): boolean {
  if (b === undefined) return false;
  if (a.kind !== b.kind || a.seat !== b.seat || a.playerId !== b.playerId) return false;
  // The one field that varies by kind, compared without narrowing each
  // variant by hand: two events of the same kind from the same seat differ
  // only in what they said.
  return detailOf(a) === detailOf(b);
}

function detailOf(event: CallEvent): string {
  switch (event.kind) {
    case "truco-call":
      return event.level;
    case "envido-call":
      return event.level;
    case "truco-response":
      return event.response;
    case "envido-response":
      return event.response;
    case "envido-declaration":
      return event.declaration;
  }
}

/**
 * Fold this render's calls into what the mount has already seen.
 *
 * Pure on purpose: everything hard about persisting a log across hands is in
 * deciding WHERE one hand stops, and that decision is worth testing without a
 * DOM anywhere near it.
 */
export function advanceHistory(previous: CallHistory | undefined, round: CallRound): CallHistory {
  const closed = previous?.closed ?? [];
  const open = previous?.open;

  // Nothing open, and nothing to record: a hand nobody has called in opens no
  // round at all, so the panel grows no divider before a word is said.
  if (open === undefined) return { closed, open: round.events.length === 0 ? undefined : round };

  if (continues(open.events, round.events)) {
    // REPLACED rather than appended to, so manoSeat and envido track the hand
    // as it develops: the tantos land on the envido state well after the
    // declaration events that point at them.
    return { closed, open: round };
  }

  // The list started over, so the open hand is over. It closes whether or not
  // anything has been called in the hand that follows -- which is the case
  // that runs between every pair of hands, when the live list is empty.
  return { closed: [...closed, open], open: round.events.length === 0 ? undefined : round };
}
