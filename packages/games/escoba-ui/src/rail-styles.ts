export const RAIL_STYLE_ID = "hexdev-escoba-rail-styles";

/**
 * The two-shape rail and the felt beside it (rail.ts carries the WHY).
 *
 * CONTAINER QUERIES ONLY, the rule every stylesheet here follows: an embedded
 * widget's width is its container's, never the viewport's -- so the shape
 * switch queries the layout box and the drawer's width is cqw, not vw. NO
 * --hx-* TOKEN IS DECLARED HERE either: this package's felt tokens live in
 * match-styles.ts, where design-token-parity.test.ts scans them and rejects a
 * private name, so every tunable below is an --escoba-* property.
 *
 * OUTSIDE .convite-chrome ON PURPOSE, and the tab is the second reason why:
 * that stylesheet's ".convite-chrome button" is (0,1,1) and wraps EVERY
 * descendant button in pill geometry. It is what stopped a live escoba match
 * from wearing the shell's felt (match-styles.ts tells that story), and this
 * handle, a real button, would have been its next victim. Colour is never the
 * message either (WCAG 1.4.1): the handle carries a word, and the open state
 * rides on aria-expanded.
 */
export function buildRailStylesheet(): string {
  return `
.hexdev-escoba-layout {
  container-type: inline-size;
  container-name: hexdev-escoba-layout;
  /* The drawer's containing block: container-type establishes containment and
     never a positioning context, so without this the rail escapes to
     .hexdev-escoba-match, relative for the overlay and not for us. */
  position: relative;
  display: flex;
  align-items: stretch;
  width: 100%;
  box-sizing: border-box;
  font-family: var(--gx-font-family, system-ui, sans-serif);
}

.hexdev-escoba-felt {
  /* min-width: 0 is load-bearing: min-width auto refuses to shrink below the
     content, here a card row that would rather overflow than wrap. */
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
/* THE HANDLE'S LANE: the rail floats over the felt, so the felt gives back
   exactly the sliver the handle covers and not a pixel more. */
@container hexdev-escoba-layout (width < 640px) {
  .hexdev-escoba-felt { padding-right: var(--escoba-rail-handle-lane, 26px); }
}

.hexdev-escoba-side-rail {
  /* OUT OF FLOW ON A PHONE, the load-bearing half: a rail in flow at 375px is
     just another full-width band above the cards, the exact failure this
     undoes. Nothing in here has to be on screen while a card is being chosen,
     so where room is scarcest it costs the felt nothing. */
  position: absolute;
  inset: 0 0 0 auto;
  z-index: 2;
  /* row-reverse puts the handle on the OUTER edge, so opening grows inward. */
  display: flex;
  flex-direction: row-reverse;
  align-items: center;
  gap: 6px;
  min-height: 0;
  /* Markable cards are buttons under this box; it must not eat their taps. */
  pointer-events: none;
}

.hexdev-escoba-side-rail > * { pointer-events: auto; }
.hexdev-escoba-rail-body {
  align-self: center;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: var(--escoba-rail-gap, 8px);
  /* Scrolls before it pushes: min-height auto would overflow the felt. */
  min-height: 0;
  min-width: 0;
  max-height: 100%;
  overflow: auto;
  width: min(64cqw, var(--escoba-rail-drawer-width, 220px));
  padding: var(--escoba-rail-padding, 8px);
  border-radius: var(--gx-radius, 10px) 0 0 var(--gx-radius, 10px);
  /* A PANEL, NOT DARKER CLOTH. This was a 50%-black wash over --hx-cloth-deep
     -- opaque, which was the correction that mattered (at 34% the score was
     read THROUGH a sota, and a drawer covers what it covers), but still felt:
     the tanteador looked like a patch of the table rather than a thing lying
     on it. Truco's side panel is a real SURFACE, and this is that surface,
     re-declared here because escoba-ui is L1: the tenant's own surface colour
     where they sent one, a green of ours where they did not, and the two
     shadows -- one to sit it above the cloth, one to give it an edge -- that
     say so. Opaque either way. */
  background: var(--gx-color-surface, #26433a);
  color: var(--gx-color-on-surface, var(--hx-felt-text, #f2f2f2));
  box-shadow: var(--hx-elev-2), var(--hx-relief);
}
.hexdev-escoba-side-rail[data-open="false"] > .hexdev-escoba-rail-body { display: none; }

/* The handle: a way in, not a call to action, on a cloth where the loudest
   thing must always be the cards. Vertical text keeps it near 26px wide --
   the number --escoba-rail-handle-lane above sets aside. */
.hexdev-escoba-rail-tab {
  flex: 0 0 auto;
  align-self: center;
  writing-mode: vertical-rl;
  appearance: none;
  margin: 0;
  padding: 12px 5px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-right: 0;
  border-radius: var(--gx-radius, 10px) 0 0 var(--gx-radius, 10px);
  font: inherit;
  font-size: 0.72em;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: inherit;
  background: rgba(255, 255, 255, 0.09);
  cursor: pointer;
}

.hexdev-escoba-rail-tab:focus-visible { outline: 3px solid var(--escoba-focus-ring, #2563eb); outline-offset: 2px; }

/* IN THE RAIL EVERYTHING STACKS. Both are centred ROWS on the felt, right at
   full width and wrong in a 168px column: the teams would sit shoulder to
   shoulder at ~70px each, and the seat chips would wrap one per line but
   centred -- what made "Rival der." look abandoned in the first place. Higher
   specificity, so source order is not load-bearing. */
.hexdev-escoba-side-rail .hexdev-escoba-scoreboard,
.hexdev-escoba-side-rail .hexdev-escoba-seats {
  flex-direction: column;
  align-items: stretch;
  flex-wrap: nowrap;
  gap: var(--escoba-rail-row-gap, 6px);
  padding: 0;
}

.hexdev-escoba-side-rail .hexdev-escoba-scoreboard-team { align-items: stretch; }
.hexdev-escoba-side-rail .hexdev-escoba-stock { text-align: center; }

/* Only the seat chips get pushed apart, so label and count line up across the
   column. Score and escobas stay adjacent: 220px of drawer between them made
   two related numbers look unrelated. */
.hexdev-escoba-side-rail .hexdev-escoba-seat { justify-content: space-between; }

/* FROM 640 UP IT IS A COLUMN: in flow, always open, handle gone -- the same
   drawer, unfolded. The width lives on the rail and not on anything inside it,
   because the boxes it stacks must line up on one edge. */
@container hexdev-escoba-layout (min-width: 640px) {
  .hexdev-escoba-side-rail {
    position: static;
    flex-direction: column;
    flex: 0 0 auto;
    width: var(--escoba-rail-width, 168px);
    align-items: stretch;
    min-height: 0;
    overflow: hidden;
  }

  .hexdev-escoba-rail-tab { display: none; }

  /* A drawer shut on a phone must not stay shut where there is no drawer. */
  .hexdev-escoba-side-rail[data-open="false"] > .hexdev-escoba-rail-body { display: flex; }

  /* align-self back to stretch, undoing the drawer's centring: as a ROW that
     centring works down the edge, as a column it works ACROSS and would shrink
     the body to its content width. Same property, opposite axis. */
  .hexdev-escoba-rail-body { width: auto; flex: 1 1 auto; align-self: stretch; max-height: none; min-height: 0; border-radius: var(--gx-radius, 10px); }
}
/* AFTER the 640 block, never before: same specificity, so source order is the
   only thing letting this win -- the exact correction truco's table-styles.ts
   had to make for its own two rail-width bumps. */
@container hexdev-escoba-layout (min-width: 1280px) {
  .hexdev-escoba-side-rail { width: var(--escoba-rail-width-wide, 200px); }
}
`;
}

/** Injects the stylesheet at most once per document — same idempotence as
 * every other ensure* helper in this package. */
export function ensureRailStyles(doc: Document): void {
  if (doc.getElementById(RAIL_STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = RAIL_STYLE_ID;
  style.textContent = buildRailStylesheet();
  doc.head.appendChild(style);
}
