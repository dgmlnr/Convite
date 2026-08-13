import type { PlayerId, PlayerView, SenaSignal } from "@hexdev/truco-engine";
import { SENA_LABELS, TABLE_STRINGS } from "./strings.js";

/** A seña a TEAMMATE just made, between two consecutive view snapshots — the
 * point-in-time moment worth showing, never an ongoing view field. `seq` is
 * carried through unchanged from `SenaView`; it is what the derivation below
 * compares, and keeping it on the event makes "which claim is this" answerable
 * without re-reading the view. */
export interface PartnerSenaEvent {
  readonly playerId: PlayerId;
  readonly signal: SenaSignal;
  readonly seq: number;
}

/**
 * Compares two consecutive `PlayerView` snapshots and derives whether a
 * teammate signaled on THIS transition.
 *
 * WHY AN ORDINAL AND NOT THE SIGNAL: `TeammateView.lastSena` holds only the
 * latest claim per teammate (the engine replaces, it does not append), so a
 * partner who re-sends the SAME signal produces two identical snapshots. A
 * signal-only diff would read that as "nothing happened" and stay silent —
 * which is precisely the case a player most needs to see, because a partner
 * repeating themselves is a partner insisting. `SenaEvent.seq` (truco-engine)
 * exists for this comparison.
 *
 * WHY `dealerSeat` IS CONSULTED: ordinals are hand-scoped and restart at 1
 * with every deal, so a new hand's first seña can legitimately carry a LOWER
 * ordinal than the previous hand's last one. `dealerSeat` rotating is this
 * codebase's own established "different hand" signal (`deriveHandOutcomeEvent`
 * uses the same fact for the opposite purpose — to stop re-announcing), so a
 * rotated dealer means the ordinals are simply not comparable and any standing
 * seña in the new hand is new. This cannot invent an announcement: a fresh
 * deal clears `senas`, so a teammate with no claim projects `null` and is
 * skipped before the comparison is ever reached.
 *
 * The viewer's OWN `self.lastSena` is deliberately never considered — a player
 * does not need telling what they just claimed (the picker they clicked is
 * the confirmation), and announcing it would put their own bluff on screen.
 */
export function derivePartnerSenaEvent(previous: PlayerView | null, current: PlayerView): PartnerSenaEvent | null {
  if (previous === null) return null;
  const sameHand = previous.dealerSeat === current.dealerSeat;

  let newest: PartnerSenaEvent | null = null;
  for (const teammate of current.teammates) {
    const sena = teammate.lastSena;
    if (sena === null) continue;
    const before = previous.teammates.find((candidate) => candidate.playerId === teammate.playerId)?.lastSena ?? null;
    if (sameHand && before !== null && before.seq >= sena.seq) continue;
    // The banner lane holds ONE notice, so when several teammates signal
    // between two snapshots the highest ordinal — the most recent claim —
    // takes it. Unreachable in 2v2 (one teammate); written for the shape
    // `TeammateView[]` actually has, not the size it happens to be today.
    if (newest === null || sena.seq > newest.seq) {
      newest = { playerId: teammate.playerId, signal: sena.signal, seq: sena.seq };
    }
  }
  return newest;
}

export interface SenaNoticeProps {
  readonly signal: SenaSignal;
}

/**
 * Renders the transient partner-seña notice — a real, SOLID-background chip,
 * the same anti-opacity discipline as everything else that sits on the cloth,
 * cleared by `table.ts`'s own timer rather than by this function. `null`
 * clears it back to empty, matching `renderHandOutcomeBanner`'s and
 * `renderPendingCallBanner`'s own `:empty { display: none }` convention.
 *
 * A COLUMN, not a row: this chip shares the fixed-height banner lane with the
 * pending-call banner, and unlike the hand-outcome banner it is NOT mutually
 * exclusive with it in time (señas stay legal while a call is open — see
 * `getLegalSenaActions`). Stacking its two lines keeps it narrow enough that
 * both chips fit the lane side by side at the narrowest tier, which is what
 * `table-zone-overlap.browser.test.ts` fences.
 */
export function renderSenaNotice(container: HTMLElement, props: SenaNoticeProps | null): void {
  container.replaceChildren();
  container.className = "hexdev-truco-sena-notice";
  if (props === null) return;

  const source = document.createElement("span");
  source.className = "hexdev-truco-sena-notice-source";
  source.textContent = TABLE_STRINGS.senaFromPartner;
  container.appendChild(source);

  const signal = document.createElement("span");
  signal.className = "hexdev-truco-sena-notice-signal";
  signal.textContent = SENA_LABELS[props.signal];
  container.appendChild(signal);
}

/**
 * The same notice as ONE spoken sentence, for the live region `table.ts`
 * keeps mounted (see `announcer.ts`). Comma-joined rather than concatenated
 * from the rendered spans: read out with no separator, "Seña del
 * compañero7 de oro" is what a reader would actually say.
 *
 * Lives here, beside the render function, for the same reason the labels do —
 * this module owns how a seña is worded; `announcer.ts` owns only the
 * mechanism and has no Spanish in it at all.
 */
export function describeSenaNotice(props: SenaNoticeProps): string {
  return `${TABLE_STRINGS.senaFromPartner}, ${SENA_LABELS[props.signal]}`;
}
