export const TABLE_STYLE_ID = "hexdev-escoba-table-styles";

/**
 * The face-up table's own stylesheet, generated as a string (not a .css
 * file) for the same reason truco-ui's table-styles.ts is: this package
 * builds via plain tsc -b, with no bundler to resolve a stylesheet import.
 * Injected once via ensureTableStyles. Slice P added the player's own hand
 * and the interactive (markable/marked/playable) card states on top of the
 * same base rules -- one stylesheet for the whole surface, not two.
 *
 * Container-query only, per this project's own rule: an embedded widget's
 * available width is its container's, never the viewport's, so no
 * ResizeObserver/matchMedia/innerWidth may appear here. flex-wrap is the
 * actual containment mechanism against the 20-card structural ceiling
 * (escoba/invariante-de-paridad-de-la-mesa) -- a fixed column count sized
 * for the common 3-8 card case is exactly the failure this guards against;
 * a card's own width shrinks at narrower container widths so more of them
 * still read comfortably per row, but wrapping alone is what keeps every
 * card inside the container regardless of count.
 *
 * WCAG 1.4.1 (marked state): never colour alone -- `aria-pressed` carries
 * it for assistive tech, and a marked card also gets a solid border AND a
 * lift, two non-colour cues together.
 */
export function buildTableStylesheet(): string {
  return `
.hexdev-escoba-table {
  container-type: inline-size;
  container-name: hexdev-escoba-table;
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  justify-content: center;
  gap: var(--escoba-card-gap, 6px);
  width: 100%;
  box-sizing: border-box;
  padding: var(--escoba-table-padding, 8px);
  /* THE HOST'S FONT, NOT THE BROWSER'S DEFAULT. \`createEscobaRenderer\`
   * replaces the match container's className wholesale (game-ui-registry.ts),
   * so this element does not sit under widget-app's own \`.convite-chrome\`
   * (which is where \`--gx-font-family\` is otherwise applied) once a match is
   * live — without its own declaration here this table silently fell back to
   * the UA default font instead of the embedding host's, the same class of
   * bug \`table-height-stability.browser.test.ts\` fences for truco-ui's own
   * table shell. Card art carries no text, so nothing here actually shifts
   * size under a differing font -- see font-independence.browser.test.ts --
   * but \`.hexdev-escoba-sum\`'s live announcement does, and it must not be
   * the one piece of this surface that looks like it belongs to someone
   * else's page. */
  font-family: var(--gx-font-family, system-ui, sans-serif);
}

.hexdev-escoba-card {
  /* --escoba-card-tier is the WIDTH tier's own choice; --escoba-card-width is
   * what everything else reads. They are the same value everywhere except
   * fullscreen, where the FULLSCREEN FIT block at the bottom of this sheet
   * caps the tier by the height actually available. Splitting them is what
   * lets that cap exist at all: a custom property cannot be defined in terms
   * of itself, so min(the tier, the fit) needs the tier to still have a name
   * of its own after the @container blocks below have spoken. The same split,
   * for the same reason, as truco-ui's --truco-card-tier. */
  --escoba-card-tier: 72px;
  --escoba-card-width: var(--escoba-card-tier);
  flex: 0 0 auto;
  width: var(--escoba-card-width);
}

.hexdev-escoba-card img {
  display: block;
  width: 100%;
  height: auto;
}

@container hexdev-escoba-table (width < 400px) {
  .hexdev-escoba-card { --escoba-card-tier: 44px; }
  .hexdev-escoba-table { gap: 4px; }
}

@container hexdev-escoba-table (min-width: 400px) and (width < 640px) {
  .hexdev-escoba-card { --escoba-card-tier: 56px; }
}

.hexdev-escoba-hand {
  container-type: inline-size;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--escoba-card-gap, 6px);
  width: 100%;
  box-sizing: border-box;
  padding: var(--escoba-table-padding, 8px);
  /* Same fix as .hexdev-escoba-table above, its own container-query root and
   * therefore its own declaration -- a sibling, never a descendant, of the
   * table (game-ui-registry.ts mounts table/hand/piles/sum side by side). */
  font-family: var(--gx-font-family, system-ui, sans-serif);
}

.hexdev-escoba-card--markable,
.hexdev-escoba-card--playable {
  appearance: none;
  background: transparent;
  font: inherit;
  padding: 0;
  border: 2px dashed transparent;
  border-radius: 6px;
  cursor: pointer;
}

.hexdev-escoba-card--markable:focus-visible,
.hexdev-escoba-card--playable:focus-visible {
  outline: 3px solid var(--escoba-focus-ring, #2563eb);
  outline-offset: 2px;
}

.hexdev-escoba-card--marked {
  border-style: solid;
  border-color: var(--escoba-mark-color, #f59e0b);
  transform: translateY(-6px);
}

.hexdev-escoba-card--playable:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.hexdev-escoba-sum {
  width: 100%;
  box-sizing: border-box;
  text-align: center;
  padding: 4px 8px;
  font-size: 0.9rem;
  /* The only element on this whole surface that renders TEXT -- the running
   * "Suma N" announcement -- so it is the one place a missing font-family
   * would actually be visible, not merely theoretical. */
  font-family: var(--gx-font-family, system-ui, sans-serif);
}

/* ==========================================================================
 * FULLSCREEN FIT -- the felt sizes itself to the window it was given.
 *
 * Until this rule escoba's height was a pure function of its WIDTH: the
 * @container blocks above pick a tier from inline-size alone and every row
 * below is derived from that card. On a rotated phone -- 844x390, 828
 * container-px -- the widget measured 391.48px inside 390px of screen. It
 * did not fit, it MISSED, by a pixel and a half, and no fence in the repo
 * could have said which side of the line it was on.
 *
 * THE BUDGET is the felt's own column solved for the card, so it tracks each
 * tier instead of restating its constants:
 *
 *     felt = rows x cardHeight + status + piles + sum + 4 paddings + R
 *
 * ROWS is two: the face-up table's row and the player's own hand's row. The
 * piles are NOT a third -- a pile card has its own fixed width
 * (piles-styles.ts) and does not move with this one -- so they enter as a
 * band, not as a row.
 *
 * THE PILES BAND IS THE FULL ONE, 160px and not the 79.22px a fresh hand
 * measures, and that is the whole difference between a cap and a
 * coincidence. Both capture piles start a hand EMPTY and finish it holding
 * all forty cards; budgeting against the empty ones buys a felt that fits
 * until somebody actually plays. escoba-viewport-fit.browser.test.ts spends
 * that growth up front rather than trusting it.
 *
 * THE HAND-END BREAKDOWN IS NOT SUBTRACTED, deliberately. It is seven rows
 * and 184px, and reserving it alongside the card rows would leave 39px for
 * both of them -- a 13px card, which is a worse bug than the overflow it
 * would prevent. It is not reserved because it cannot coexist with a card:
 * escoba-module's settleHandIfNeeded refuses to decide a hand until every
 * seat is empty and settleLeftovers sweeps the table on the way through, so
 * the panel appears in the very slot the two card rows have just vacated,
 * and 184px is comfortably less than the two rows it replaces. That is an
 * assumption a budget rests on, so it is fenced rather than commented: see
 * the last describe block of escoba-viewport-fit.browser.test.ts.
 *
 * 329 / 520 IS THE ART'S OWN RATIO AS RENDERED, not spanish-deck-ui's
 * CARD_WIDTH/CARD_HEIGHT (220x336). A card here is an img at width: 100%,
 * height: auto, so its height resolves against the BITMAP -- every front is
 * 329x520 -- and the 220x336 attributes only supply the ratio before the
 * bytes arrive. Using the logical box would under-reserve every row by 3.5%.
 *
 * WHY ONLY IN FULLSCREEN, and it must stay that way -- the same scope and
 * the same reason as truco-ui's own cap. main.ts's enterMatch calls
 * sendLayout("fullscreen") before a single card is drawn, so every live
 * escoba match is covered. INLINE the host sizes the iframe to the height
 * the widget just reported, which would make 100dvh a function of this very
 * layout: a feedback loop, not a ceiling. Every scene and every fence in
 * this package that mounts inline is therefore untouched.
 *
 * min() and not a replacement: on a window tall enough for the tier's own
 * card the tier still wins and nothing about the existing layout changes.
 * ========================================================================== */
:root[data-hexdev-layout="fullscreen"] .hexdev-escoba-card {
  --escoba-fit-rows: 2;
  --escoba-fit-status: 30px;
  --escoba-fit-piles: 160px;
  --escoba-fit-sum: 25px;
  /* The residual is exactly the slack, which is what makes it safe to tune:
     substituting the card back into the row model collapses to
     felt = H - (declared residual) + (real residual), so a declared residual
     one pixel above the real one leaves one pixel of headroom and one below
     overflows by one. */
  --escoba-fit-residual: 12px;
  --escoba-card-width: min(
    var(--escoba-card-tier),
    calc(
      (100dvh - var(--escoba-fit-status) - var(--escoba-fit-piles) - var(--escoba-fit-sum) - var(--escoba-table-padding, 8px) * 4 - var(--escoba-fit-residual)) * 329 / 520 /
        var(--escoba-fit-rows)
    )
  );
}
`;
}

/** Injects the stylesheet at most once per document -- same idempotence as
 * truco-ui's own ensureTableStyles, so re-mounting the table in a test never
 * duplicates the <style> element. */
export function ensureTableStyles(doc: Document): void {
  if (doc.getElementById(TABLE_STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = TABLE_STYLE_ID;
  style.textContent = buildTableStylesheet();
  doc.head.appendChild(style);
}
