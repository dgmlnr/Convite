import type { CallEvent, EnvidoState, HandView } from "@hexdev/truco-engine";
import { callEventText } from "./call-log.js";

/**
 * WHO said it, shown where they are sitting.
 *
 * THE PROBLEM, reported from real 2v2 play against bots: "los cantos de los
 * bots son descontrolados". Three seats can speak, and the only thing that
 * said anything about a call as it happened was the centre banner, which
 * names a TEAM ("Cantó: Ellos") and not a seat. So a player could not tell
 * which opponent had called, and consecutive calls replaced each other in
 * that one banner faster than anyone could read them.
 *
 * The side panel already keeps the full record with speakers attached. What
 * was missing is the MOMENT: a mark on the seat that just spoke, held long
 * enough to read, before the table moves on. That is all this is.
 *
 * NO ANNOUNCER, deliberately, unlike the other three transient notices in
 * this package. The call itself is already spoken by the pending-call
 * announcer in `table.ts`, and a second live region repeating the same call
 * would make a screen reader say it twice. This notice adds SEAT ATTRIBUTION
 * to a visual channel that had none; the audio channel never had the
 * ambiguity, because it speaks one call at a time by nature.
 */
export interface SeatCallEvent {
  /** The seat that spoke. `table.ts` maps it to a screen anchor through the
   * same `resolveSeatPositions` map every other seat-attributed surface uses,
   * so this never has to know about table geometry. */
  readonly seat: number;
  /** The Spanish for the call, from `call-log.ts`'s own `callEventText` --
   * one source for these words, never a second copy. */
  readonly text: string;
}

/**
 * Derives the call that was JUST made, between two consecutive event lists.
 *
 * WHY LENGTH AND NOT CONTENT: `HandView.callEvents` is append-only within a
 * hand (the engine's own contract for it), so a new call is exactly a longer
 * list, and the newest call is exactly its last element. A re-deal resets the
 * list to empty, which is shorter -- correctly reporting no call rather than
 * re-announcing whatever the previous hand ended on.
 *
 * A null `previous` returns null, and that is the same rule
 * `envido-reveal-notice.ts` states for itself: a renderer mounted into a hand
 * already in progress (a reconnect) has no transition to report, and marking
 * a seat as having "just" called would be a lie about when.
 */
export function deriveSeatCallEvent(
  previous: readonly CallEvent[] | null,
  current: readonly CallEvent[],
  /** Needed for the declaration round and only for it: a declaration event is
   * marker-only, so the NUMBER lives in the envido's own list. Passing it here
   * keeps that one home rather than duplicating tantos onto the event. */
  envido?: EnvidoState,
): SeatCallEvent | null {
  if (previous === null) return null;
  if (current.length <= previous.length) return null;
  const newest = current[current.length - 1];
  if (newest === undefined) return null;
  return { seat: newest.seat, text: callEventText(newest, envido) };
}

/**
 * Renders the chip into `container`, or empties it when `props` is null.
 *
 * Empties rather than hides, matching this package's established `:empty`
 * convention (`renderSenaNotice`, `renderHandOutcomeBanner`, `renderCallLog`):
 * the stylesheet's own `:empty` rule is what takes the box out of the
 * picture, so there is one way to make a transient surface disappear here
 * rather than a second one invented per notice.
 */
export function renderSeatCallNotice(container: HTMLElement, texts: readonly string[]): void {
  container.replaceChildren();
  container.className = "hexdev-truco-seat-call";
  // Set unconditionally, not only when there is something to show: this host
  // is decorative whether it is full or empty, and an attribute that appears
  // and disappears with the content is a second piece of state to keep right
  // for no gain. See the module docblock for why it is hidden at all.
  container.setAttribute("aria-hidden", "true");

  // MORE THAN ONE, when a seat is claiming more than one thing. Envido is
  // legal on top of an unanswered truco, so a single seat can genuinely have
  // two calls open at once -- and it does, in the exact state this was
  // reported from. One chip replacing the other read as the calls stepping on
  // each other ("se pisan entre ellos los cantos"), which is a fair
  // description of what a last-one-wins mark does.
  for (const text of texts) {
    const chip = container.appendChild(document.createElement("span"));
    chip.className = "hexdev-truco-seat-call-chip";
    chip.textContent = text;
  }
}

/**
 * EVERY CALL THAT IS STILL OPEN, on the seat that made it.
 *
 * The event above is a MOMENT and lasts two seconds, which is right for a
 * call that has already been settled. A call still waiting for an answer is
 * not a moment: it is the state of the table, and it is precisely while it
 * stands that a player needs to know who made it. Reported from real play as
 * exactly that -- a pending TRUCO on screen with nothing anywhere saying
 * which of the three other seats had called it, because the chip had come and
 * gone half a minute earlier and the banner only ever named a TEAM.
 *
 * PLURAL, and that is not defensive coding. Envido is legal ON TOP of an
 * unanswered truco (the engine freezes the truco chain until the envido
 * resolves, it does not cancel it), so two calls really can stand at once --
 * from one seat or from two. A single mark meant the newer one silently
 * replaced the older, reported as the calls stepping on each other.
 *
 * Derived from the events rather than from the chain state fields, and that
 * is the whole reason this exists: those fields carry the calling TEAM, never
 * the seat. The events are the only record of who spoke. The STATUS fields
 * are what say whether a chain is still open, so both are read -- one for
 * "is it open", the other for "who opened it".
 *
 * Ordered oldest first, so a seat holding two claims shows them in the order
 * it made them.
 */
export function derivePendingCallMarks(hand: HandView | null): readonly SeatCallEvent[] {
  if (hand === null) return [];

  const open: { readonly index: number; readonly mark: SeatCallEvent }[] = [];
  const lastOfKind = (kind: CallEvent["kind"]): { index: number; event: CallEvent } | null => {
    for (let index = hand.callEvents.length - 1; index >= 0; index -= 1) {
      const event = hand.callEvents[index];
      if (event !== undefined && event.kind === kind) return { index, event };
    }
    return null;
  };

  if (hand.truco.status === "pending") {
    const found = lastOfKind("truco-call");
    if (found !== null) open.push({ index: found.index, mark: { seat: found.event.seat, text: callEventText(found.event) } });
  }
  if (hand.envido.status === "pending") {
    const found = lastOfKind("envido-call");
    if (found !== null) open.push({ index: found.index, mark: { seat: found.event.seat, text: callEventText(found.event) } });
  }

  return open.sort((a, b) => a.index - b.index).map((entry) => entry.mark);
}
