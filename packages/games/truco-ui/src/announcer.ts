/**
 * A screen-reader announcer: a visually-hidden ARIA live region whose NODE is
 * created once per mount and never rebuilt.
 *
 * WHY THIS IS A MODULE AND NOT AN ATTRIBUTE. `table.ts`'s `render` rebuilds
 * the entire table on every broadcast — `container.replaceChildren()`, then a
 * fresh `createElement` for every node beneath it. A live region is announced
 * because its CONTENT CHANGED while it sat in the accessibility tree; a
 * brand-new region that happens to contain text is not a change to anything,
 * it is a new region. So an `aria-live` attribute placed on a node inside that
 * render path announces nothing at all, however correct it looks in the DOM.
 * (`.hexdev-truco-turn-indicator` in `table.ts` is exactly that shape today —
 * see this module's own note in the apply report.) The only way to make an
 * announcement real here is for the element to OUTLIVE the render, which is
 * what `createAnnouncer` is for and what `table.browser.test.ts` fences by
 * asserting node identity across renders rather than attribute presence.
 *
 * ONE mechanism, deliberately shared by the hand-outcome banner and the
 * partner-seña notice: both are point-in-time events, both are cleared by
 * their own timer, and both would otherwise re-invent the same live region
 * slightly differently. Each gets its OWN instance rather than sharing one
 * region, so a hand ending and a partner's seña arriving close together can
 * never overwrite each other's message mid-announcement. The WORDING stays
 * with each feature (`hand-outcome.ts`, `sena-notice.ts` own their own copy —
 * this module has no opinion about Spanish).
 */

/**
 * Builds one announcer. `name` becomes `data-announces`, which is how tests
 * and a debugging human tell the two apart; nothing about behaviour reads it.
 *
 * POLITE, never assertive: neither message is an emergency, and `assertive`
 * interrupts a screen reader mid-sentence — during play that would talk over
 * the very card or call the player is listening to.
 *
 * ATOMIC: "Seña del compañero, 7 de oro" is ONE statement. Without
 * `aria-atomic`, a reader may announce only the fragment that changed, which
 * for these messages is the half that makes no sense alone.
 *
 * `aria-relevant` is pinned to its own DEFAULT ("additions text") rather than
 * left implicit. That default is precisely what keeps CLEARING the region
 * silent — a removal is not in the relevant set, so emptying it at the end of
 * a notice's life says nothing — and this feature depends on that. Stated
 * explicitly so a future edit cannot quietly add `removals` and turn every
 * expiry into a second, meaningless announcement.
 */
export function createAnnouncer(doc: Document, name: string): HTMLElement {
  const announcer = doc.createElement("p");
  announcer.className = "hexdev-truco-announcer";
  announcer.dataset.announces = name;
  announcer.setAttribute("aria-live", "polite");
  announcer.setAttribute("aria-atomic", "true");
  announcer.setAttribute("aria-relevant", "additions text");
  return announcer;
}

/**
 * Says `message`, or falls silent when it is `null`.
 *
 * The equality guard is load-bearing, not an optimization: `render` runs on
 * every broadcast, so without it the same sentence would be rewritten into the
 * region many times while a notice is up, and a reader that treats each write
 * as a change would repeat it on every packet. Writing only on a real change
 * makes the announcement track the EVENT, exactly like the visible chip.
 *
 * The consequence, stated rather than hidden: a partner who re-sends the SAME
 * signal while the previous notice is still up is not re-announced. That
 * matches what the screen shows — the chip is identical too, only its timer is
 * re-armed — so the two experiences agree instead of diverging.
 */
export function announce(announcer: HTMLElement, message: string | null): void {
  const next = message ?? "";
  if (announcer.textContent === next) return;
  announcer.textContent = next;
}
