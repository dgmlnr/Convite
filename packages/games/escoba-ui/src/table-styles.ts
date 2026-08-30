export const TABLE_STYLE_ID = "hexdev-escoba-table-styles";

/**
 * The face-up table's own stylesheet, generated as a string (not a .css
 * file) for the same reason truco-ui's table-styles.ts is: this package
 * builds via plain tsc -b, with no bundler to resolve a stylesheet import.
 * Injected once via ensureTableStyles. Slice P added the player's own hand
 * and the interactive (markable/marked/playable) card states on top of the
 * same base rules -- one stylesheet for the whole surface, not two.
 *
 * ONE CONTAINER FOR BOTH SURFACES, and that is this sheet's own root. The
 * card tiers used to hang off a container declared on .hexdev-escoba-table
 * itself, which meant they only ever reached the cards INSIDE the table: the
 * hand is a SIBLING of it (game-ui-registry.ts appends table, hand, piles and
 * sum side by side under the felt), so no query ever resolved for it and its
 * cards stayed at the 72px default at every width. At 375px that drew a 72px
 * hand under a 44px table -- the shared surface the whole game is played on
 * rendered as an afterthought under three cards you already know. The root is
 * therefore .hexdev-escoba-felt, the nearest box that is an ancestor of BOTH,
 * and it is declared here rather than in rail-styles.ts (which owns the felt's
 * PLACE in the layout) so that the sheet asking the question is the sheet that
 * creates the container -- ensureTableStyles alone is enough for a card to be
 * sized correctly, with no cross-file injection order to get right.
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
/* THE CARD-SIZING CONTAINER for every band on this felt (see the header). Its
   layout -- flex column, the rail's neighbour -- belongs to rail-styles.ts;
   only the container declaration is ours, and neither file restates a
   property the other already sets.

   INLINE-SIZE AND NOT SIZE: the felt's HEIGHT must keep coming from what it
   holds, since .hexdev-escoba-match hugs its content when the host gives it no
   height of its own. Inline-size containment still zeroes the felt's intrinsic
   width contribution, which is why rail-styles.ts gives it flex-grow: whatever
   the layout has left over after the rail is the felt's, and no card row's
   max-content width gets a vote in that any more. */
.hexdev-escoba-felt {
  container-type: inline-size;
  container-name: hexdev-escoba-felt;
}

.hexdev-escoba-table {
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
   * what everything else reads. They differ in two ways: fullscreen, where the
   * FULLSCREEN FIT block at the bottom of this sheet caps the tier by the
   * height actually available, and in the hand, which takes a fraction of the
   * tier rather than a tier of its own. Splitting them is what lets either
   * exist at all: a custom property cannot be defined in terms of itself, so
   * min(the tier, the fit) needs the tier to still have a name of its own
   * after the @container blocks below have spoken. The same split, for the
   * same reason, as truco-ui's --truco-card-tier.
   *
   * THE ORDER OF IMPORTANCE IS THE ORDER OF SIZE, and it runs table > hand >
   * piles. The table is the shared surface a capture is decided on and it gets
   * the tier outright; the hand is three cards you already hold, so it gets
   * four fifths of it; a pile is a RECORD of what was taken, so piles-styles.ts
   * keeps its own smaller fixed widths (28/40px) and stays under the hand at
   * every tier below. One scale for the hand rather than a second set of tiers:
   * the two rows then move together, and there is one number to argue with.
   *
   * --escoba-hand-scale is declared on EVERY card, not only on the ones in the
   * hand, because the fit model at the bottom of this sheet has to read it too
   * -- the two card rows cost 1 + the scale of a row between them, and a
   * literal restated there could drift from this one. */
  /* THE ART'S OWN PIXELS, named once and read three times: by the aspect
   * ratio below, and by the fullscreen row model at the foot of this sheet.
   * Every one of the forty fronts in spanish-deck-ui/assets/fronts is exactly
   * 329x520 — measured, all forty, not sampled — and the number was already
   * hard-coded in the budget, so this only gives the two readers one place to
   * disagree in instead of two. */
  --escoba-art-width: 329;
  --escoba-art-height: 520;
  --escoba-hand-scale: 0.8;
  --escoba-card-scale: 1;
  --escoba-card-tier: 76px;
  --escoba-card-width: calc(var(--escoba-card-tier) * var(--escoba-card-scale));
  flex: 0 0 auto;
  width: var(--escoba-card-width);
}

/* Higher specificity than the block above and than the fullscreen cap's own
   --escoba-card-width, which is exactly why the scale lives on its own
   property: the cap goes on setting the WIDTH for every card on the felt, and
   the hand still ends up four fifths of whatever it decided. */
.hexdev-escoba-hand .hexdev-escoba-card {
  --escoba-card-scale: var(--escoba-hand-scale);
}

/* THE BOX IS THE BITMAP'S SHAPE BEFORE THE BITMAP ARRIVES, and that is the
   whole of this rule. \`getCardArt\` stamps width="220" height="336" on every
   img — the baraja's LOGICAL box, spanish-deck-ui's own documented contract —
   while the file behind it is 329x520. Those are different ratios: 0.6548
   against 0.6327, 3.5% of height per unit of width. The attributes are what
   the browser lays out with until the bytes land, so every card on this felt
   was drawn 3.5% short and then GREW when its image decoded, twice over on a
   screen that stacks two card rows. Declaring the ratio the art actually has
   makes the first layout and the final one the same layout.

   IT IS ALSO THE RATIO THE HEIGHT BUDGET ALREADY ASSUMED (the FULLSCREEN FIT
   block below solves its rows against these same two numbers), so the box the
   budget reserves and the box the browser paints are now provably one box
   rather than two that happen to agree once loaded.

   object-fit: contain is the belt to that braces: with height: auto nothing
   can distort today, but the day any ancestor constrains this img's height —
   a stretch, a grid row, a max-height — contain shrinks the art instead of
   squashing it, which is what truco-ui's own card img rule buys for the same
   reason. */
.hexdev-escoba-card img {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: var(--escoba-art-width) / var(--escoba-art-height);
  object-fit: contain;
}

@container hexdev-escoba-felt (width < 400px) {
  .hexdev-escoba-card { --escoba-card-tier: 56px; }
  .hexdev-escoba-table,
  .hexdev-escoba-hand { gap: 4px; }
}

@container hexdev-escoba-felt (min-width: 400px) and (width < 640px) {
  .hexdev-escoba-card { --escoba-card-tier: 64px; }
}

.hexdev-escoba-hand {
  /* AS WIDE AS THE CARDS IN IT, AND NO WIDER — the property the turn ring
   * below is built on. Full width, the ring came out 676px across on a
   * rotated phone around 150px of cards, which is exactly the defect
   * truco-ui's own ring was moved off its anchor to fix ("most of the 'turn'
   * ring was drawn around empty cloth").
   *
   * WHICH IS WHY THIS BOX IS NO LONGER A CONTAINER-QUERY ROOT. An inline-size
   * container applies size containment, and a contained box's contents do not
   * contribute to its inline size -- fit-content under it resolves to zero,
   * not to the width of the cards. Nothing is lost by dropping it: every
   * @container query in this package is NAMED, an unnamed container matches
   * none of them, and nothing here was ever asking this box a question. The
   * cards inside it now DO ask one -- they are tiered like the table's -- and
   * they ask it of the felt above, which is the whole point of moving the root
   * up there: a box that is contained cannot be the box that answers.
   * max-width keeps the wrap: past the felt's width the row still breaks. */
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--escoba-card-gap, 6px);
  width: fit-content;
  max-width: 100%;
  margin-inline: auto;
  box-sizing: border-box;
  padding: var(--escoba-table-padding, 8px);
  /* Same fix as .hexdev-escoba-table above, and its own declaration for the
   * same reason -- a sibling, never a descendant, of the table
   * (game-ui-registry.ts mounts table/hand/piles/sum side by side). */
  font-family: var(--gx-font-family, system-ui, sans-serif);
}

/* THE TURN RING. Truco wraps the hand on turn in a bright accent ring, and
 * that is the loudest thing either table says; escoba said it only in words,
 * in a line above the cards. Same signal, same gold, re-declared here because
 * escoba-ui is L1 and may not import truco-ui.
 *
 * :has() AND NOT A NEW ATTRIBUTE, because the fact is already on the page:
 * renderEscobaStatus writes data-self on the turn line every broadcast. A
 * second copy stamped on the hand would be a second thing to keep true.
 *
 * INSIDE THE HAND'S OWN BOX, unlike truco's, and that is this felt's own
 * constraint rather than a preference. Truco's ring hangs 13px outside its
 * anchor and one whole rule (--hx-ring-reach) exists to buy that room back;
 * escoba's bands are stacked flush, so a ring painted outside would cross the
 * piles below and the table above. The hand already carries 8px of padding
 * around its cards, so a 3px outline offset -5px lands 3px off the cards --
 * air around them, at zero layout cost, exactly the property that made truco
 * choose an outline in the first place. The inset wash fills the band between
 * the box edge and the ring, so it reads as a halo rather than a second line.
 *
 * AROUND THE CARDS AND NOT AROUND THE LANE, which is the same correction
 * truco made and the reason .hexdev-escoba-hand above now hugs its content.
 *
 * WCAG 1.4.1: never the message on its own. The turn line one band up already
 * says "Tu turno" in words, and says it into an aria-live region. */
.hexdev-escoba-felt:has(.hexdev-escoba-turn[data-self="true"]) .hexdev-escoba-hand {
  outline: 3px solid var(--gx-color-accent, var(--hx-gold, #e8c877));
  outline-offset: -5px;
  border-radius: var(--gx-radius, 12px);
  box-shadow: inset 0 0 0 5px rgba(232, 200, 119, 0.16);
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
 * ROWS IS NO LONGER TWO, and the fraction is the honest number rather than a
 * loosened one. There are still exactly two card rows -- the face-up table's
 * and the player's own hand's -- but they are no longer the same height: the
 * hand draws at --escoba-hand-scale of the table, so the pair costs
 * 1 + that scale of a table row, not 2. Written as a calc over the same
 * property the hand itself reads, so re-arguing the scale re-solves the budget
 * in one place. The piles are NOT a third row -- a pile card has its own fixed
 * width (piles-styles.ts) and does not move with this one -- so they enter as
 * a band, not as a row.
 *
 * THE CAP MULTIPLIES BY THE SCALE, exactly as the unfit width above does.
 * Without that the hand would keep the table's capped width in fullscreen and
 * the two rows would cost 2 again -- the budget would be right and the layout
 * would not, which is the worse of the two failures.
 *
 * THE PILES BAND IS THE FULL ONE, and it is now 80px where it used to be
 * 160. That is not a loosened budget: it is the same worst case costing half
 * as much. Both capture piles start a hand EMPTY and finish it holding all
 * forty cards, and budgeting against the empty ones would buy a felt that
 * fits until somebody actually plays — escoba-viewport-fit.browser.test.ts
 * spends that growth up front rather than trusting it. What changed is the
 * growth itself: the fan's step was a constant, so past 18 cards a pile grew
 * wider than half the line and the two of them wrapped onto a SECOND row,
 * 154.16px of piles under a 390px window. piles-styles.ts now spends the
 * room it has instead of the room it wants, so the full band is one row at
 * every width this repo tests — 77.08px measured, 80 reserved.
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
 * --escoba-art-* IS THE ART'S OWN RATIO AS RENDERED, not spanish-deck-ui's
 * CARD_WIDTH/CARD_HEIGHT (220x336). A card here is an img at width: 100%,
 * height: auto, so its height resolves against the BITMAP -- every front is
 * 329x520 -- and the 220x336 attributes only supply the ratio before the
 * bytes arrive. Using the logical box would under-reserve every row by 3.5%.
 * The card's own img now DECLARES that ratio rather than waiting to inherit
 * it from a decoded bitmap, so this budget and the painted card can no longer
 * be right at different moments.
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
  --escoba-fit-rows: calc(1 + var(--escoba-hand-scale));
  --escoba-fit-status: 30px;
  --escoba-fit-piles: 80px;
  --escoba-fit-sum: 25px;
  /* The residual is exactly the slack, which is what makes it safe to tune:
     substituting the card back into the row model collapses to
     felt = H - (declared residual) + (real residual), so a declared residual
     one pixel above the real one leaves one pixel of headroom and one below
     overflows by one. */
  --escoba-fit-residual: 12px;
  --escoba-card-width: calc(
    min(
      var(--escoba-card-tier),
      (100dvh - var(--escoba-fit-status) - var(--escoba-fit-piles) - var(--escoba-fit-sum) - var(--escoba-table-padding, 8px) * 4 - var(--escoba-fit-residual)) *
        var(--escoba-art-width) / var(--escoba-art-height) / var(--escoba-fit-rows)
    ) * var(--escoba-card-scale)
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
