export const MENTIROSO_TABLE_STYLE_ID = "hexdev-mentiroso-table-styles";

/**
 * The felt's own real dimensions (SDD `mentiroso`, work unit E5/task 5.5) —
 * the first decision the launch prompt asked this unit to settle, generated
 * as a string rather than a `.css` file for the same reason
 * `truco-ui/table-styles.ts`/`dice-ui/dice-styles.ts` already do: this
 * package builds via plain `tsc -b`, with nowhere for a `.css` import to
 * resolve to.
 *
 * A FIXED SIZE, NOT A RESPONSIVE ONE — and that is the decision, not an
 * oversight. `cups.browser.test.ts`'s own six-seat, fully-revealed showdown
 * fence ("keeps every seat's wrapper clear of every other seat's") is the
 * ONLY existing proof that `SEAT_FRAGMENT_SCALE` (`cups.ts`) does not
 * overlap, and it measures that at exactly `1280x800`. A container that
 * shrinks proportionally with the viewport (a plain `min(94vw, 1280px)`,
 * this file's own first draft) looks responsive and is not: `dice-ui`'s own
 * tray shrinks its NATIVE size in exactly two discrete steps, tied to the
 * real browser viewport (`--dice-scene-scale`, `dice-styles.ts`), not
 * continuously with an arbitrary ancestor's width. Computed against a felt
 * that shrinks smoothly down toward a real phone width, the two curves cross
 * well before 700px — every six-seat showdown at a plausible phone width
 * would silently reintroduce the exact overlap `cups.ts` (task 5.2) already
 * found and fixed once by looking, undoing that fix by composing it into a
 * differently-sized box nobody had measured.
 *
 * So the felt keeps its ONE proven size, and the shell around it scrolls
 * horizontally instead of shrinking it. A player on a narrow phone pans the
 * table rather than trading legibility for width — the same trade this
 * file's own launch prompt offered as a valid outcome ("se acepta y se
 * declara por qué"), not silently avoided.
 */
const FELT_WIDTH_PX = 1280;
const FELT_HEIGHT_PX = 800;

/**
 * The status label ("N dados"/"Sin dados") is `cups.ts`'s OWN element, never
 * `dice-ui`'s — see this unit's own fix on `cups.ts`'s `status.style.fontSize`
 * (declared, measured, and kept beside `SEAT_FRAGMENT_SCALE` there, since the
 * two numbers only make sense read together) for the second half of this
 * decision: a label with no font-size of its own shrinks alongside the whole
 * fragment, `SEAT_FRAGMENT_SCALE`, down to an illegible ~5px, and declaring
 * its PRE-shrink size independently is the fix — without making the cup or
 * its dice one pixel bigger, and without touching this file's own proven felt
 * geometry above at all.
 */

export function buildMentirosoTableStylesheet(): string {
  return `
.hexdev-mentiroso-table-shell {
  /* THE DECLARED TRADE-OFF: this box, never the felt inside it, is what
   * shrinks or scrolls. A phone narrower than the felt's own ${String(FELT_WIDTH_PX)}px
   * pans it horizontally instead of silently re-introducing the overlap
   * this file's own top docblock argues against. */
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  box-sizing: border-box;
}

.hexdev-mentiroso-table {
  position: relative;
  width: ${String(FELT_WIDTH_PX)}px;
  height: ${String(FELT_HEIGHT_PX)}px;
  box-sizing: border-box;
  border-radius: 24px;
  overflow: hidden;
  /* A plain felt-green vignette — the same two-layer "lit centre, deeper
   * edge" shape truco-ui/table-styles.ts already established for its own
   * cloth, at that file's own colour stops, reused rather than re-invented:
   * this package has adopted no theming-token layer of its own yet
   * (cups.ts's own note on --hx-felt-text/--gx-color-on-surface
   * applies equally here). */
  background: radial-gradient(ellipse 120% 90% at 50% 42%, #1d6a4d, #123f2f 55%, #0d3325 100%);
}

.hexdev-mentiroso-cups-layer {
  position: absolute;
  inset: 0;
}

/* Both panels share one screen position — the ellipse's exact CENTER, which
 * table-layout.ts's own positionFor never assigns to any seat, at any
 * registered seat count (2, 4, or 6 — all even, so a TOP-CENTER placement,
 * this unit's own first instinct, collides with the seat every even seat
 * count always places at the very top; found by rendering in task 5.4's own
 * throwaway scene, recorded there for whoever composed the real table next).
 * Centering here is that finding acted on, not merely noted. */
.hexdev-mentiroso-bid-picker,
.hexdev-mentiroso-showdown {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 2;
  box-sizing: border-box;
  max-width: min(80%, 420px);
  max-height: 70%;
  overflow: auto;
  padding: 0.75rem 1rem;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.6);
  color: #f2f2f2;
  text-align: center;
}

/* Neither panel owns a background when it has nothing to show — both
 * pieces already clear their own children outside their own phase
 * (bid-picker.ts's own "not this seat's turn" branch,
 * showdown.ts's own facts === null branch), so an empty box here would
 * be a floating dark rectangle over the felt for no reason. */
.hexdev-mentiroso-bid-picker:empty,
.hexdev-mentiroso-showdown:empty {
  display: none;
  padding: 0;
}
`;
}

export function ensureMentirosoTableStyles(doc: Document): void {
  if (doc.getElementById(MENTIROSO_TABLE_STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = MENTIROSO_TABLE_STYLE_ID;
  style.textContent = buildMentirosoTableStylesheet();
  doc.head.appendChild(style);
}
