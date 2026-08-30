import { DECK_THEME_DEFAULTS } from "@hexdev/spanish-deck-ui";

export const STATUS_STYLE_ID = "hexdev-escoba-status-styles";

/** The deck's own theme tokens, written out rather than restated — the same
 * one-line bridge `truco-ui`'s table-styles.ts uses, and for the same reason:
 * `cardBackSvg` paints from `--deck-back-bg`/`--deck-back-accent`, so a sheet
 * that renders a back and declares neither gets browser-initial black. */
function cssDeclarations(defaults: Readonly<Record<string, string>>): string {
  return Object.entries(defaults)
    .map(([name, value]) => `${name}: ${value};`)
    .join("\n  ");
}

/**
 * The turn line, the stock counter and the row of other seats (R3a/R3b).
 *
 * THESE THREE NO LONGER LIVE TOGETHER, and the split is deliberate. The turn
 * badge stays on the felt beside the cards, because you have to know whether
 * it is your turn without tapping anything; the stock and the seat chips moved
 * into the side rail (rail-styles.ts), which is what took the narrow table
 * from six chrome rows down to one. The rules below therefore have to hold in
 * BOTH places: nothing here assumes a full-width band, and the rail supplies
 * the column layout the seats take inside it.
 *
 * Container-query only, same rule as table-styles.ts/piles-styles.ts/
 * scoreboard-styles.ts: an embedded widget's available width is its
 * container's, never the viewport's — no ResizeObserver/matchMedia/
 * innerWidth anywhere here. Each block is a sibling container-query root
 * under createEscobaRenderer's mount rather than a descendant of anything
 * that already pins the host's font, so it pins its own (slice Q).
 *
 * NO --hx-* TOKEN IS DECLARED HERE, only READ. This package's only --hx-*
 * declarations live in match-styles.ts, where design-token-parity.test.ts
 * scans them and rejects a private name; everything tunable below is an
 * --escoba-* custom property, the same vocabulary piles-styles.ts and
 * scoreboard-styles.ts already use. The one other family is --deck-*, which
 * is L0's own and belongs to whoever draws a card back.
 *
 * COLOUR IS NEVER THE MESSAGE (WCAG 1.4.1). The active seat gets an outline
 * and the local player's turn gets a ring, but both only repeat what the turn
 * line already says in words one row above.
 */
export function buildStatusStylesheet(): string {
  return `
.hexdev-escoba-status {
  container-type: inline-size;
  container-name: hexdev-escoba-status;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: center;
  gap: var(--escoba-status-gap, 12px);
  width: 100%;
  box-sizing: border-box;
  padding: var(--escoba-status-padding, 4px 8px);
  font-family: var(--gx-font-family, system-ui, sans-serif);
}

.hexdev-escoba-turn {
  margin: 0;
  font-weight: 700;
}

/* THE TURN PILL, in the platform's own gold. Truco says "whose turn" with a
   solid accent chip in dark ink and a hairline of --hx-gold-edge along its
   lower edge; this is that treatment, re-declared here because escoba-ui is
   L1 and may not import truco-ui. Paint only: the padding and the radius are
   the ones this rule already had, so the status band's height — 30px, the
   number table-styles.ts's fullscreen cap reserves — does not move. */
.hexdev-escoba-turn[data-self="true"] {
  padding: 1px 10px;
  border-radius: 999px;
  background: var(--gx-color-accent, var(--hx-gold, #e8c877));
  color: var(--hx-ink, #1a1a1a);
  text-transform: uppercase;
  letter-spacing: var(--hx-tracking-label, 0.08em);
  box-shadow: var(--hx-elev-2), inset 0 -1px 0 var(--hx-gold-edge, #b8923f);
}

.hexdev-escoba-stock {
  margin: 0;
  opacity: 0.85;
  font-variant-numeric: tabular-nums;
}

/* Between hands there is no turn and no stock to report, so the whole row
   collapses instead of leaving two empty boxes holding vertical space --
   the same :empty convention renderEscobaHandBreakdown already relies on. */
.hexdev-escoba-turn:empty,
.hexdev-escoba-stock:empty {
  display: none;
}

.hexdev-escoba-seats {
  container-type: inline-size;
  container-name: hexdev-escoba-seats;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--escoba-seats-gap, 8px);
  width: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: var(--escoba-seats-padding, 2px 8px);
  list-style: none;
  font-family: var(--gx-font-family, system-ui, sans-serif);
  ${cssDeclarations(DECK_THEME_DEFAULTS)}
}

.hexdev-escoba-seat {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 2px 8px;
  /* A TILE, NOT A PILL, since the day the chip started holding real cards: a
     999px cap curves inward exactly where the last back's straight right edge
     is, so the card poked out of its own chip. Rendered, seen, corrected. */
  border-radius: var(--gx-radius, 10px);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16);
  font-size: 0.85em;
}

/* THE TURN RING, on the seat it belongs to — the same gold, at the same
   2px, as the ring table-styles.ts draws around your own hand, so one signal
   means one thing wherever it appears on this table. */
.hexdev-escoba-seat[data-turn="true"] {
  box-shadow: inset 0 0 0 2px var(--gx-color-accent, var(--hx-gold, #e8c877));
}

/* THE COUNT IS SAID, NOT DRAWN (status.ts carries the argument). Clipped to
   nothing rather than display: none, which would take it out of the
   accessibility tree and defeat the whole point; absolute, so it can never
   move a pixel the height budget is counting. */
.hexdev-escoba-seat-count {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* WHAT THE OTHER SEATS ACTUALLY HOLD, drawn as the cards they are. A hand in
   escoba is three cards at most (art. 6.1), so a whole rival's hand fits in a
   chip — this never becomes a row of twenty. They overlap, the way cards held
   in a hand do.

   BIG ENOUGH TO READ AS A CARD, which took two tries and a rendered screen:
   at 17px the back's own gold filet is a 4px stroke on a 220px viewBox, so it
   scales to a third of a pixel and the whole thing came out as a dark smudge
   on a dark panel. The back is only legible above roughly a card's own index
   corner, and 30px is where it starts looking like a card someone is holding.
   The rail scrolls before it pushes (rail-styles.ts), so the extra height is
   the drawer's to spend, never the felt's. */
.hexdev-escoba-seat-backs {
  display: flex;
  flex: 0 0 auto;
  /* Centred rather than on the chip's baseline: the backs carry no text, so a
     baseline would be their own bottom edge and the chip would grow. */
  align-self: center;
}

.hexdev-escoba-card-back {
  flex: 0 0 auto;
  width: var(--escoba-seat-back-width, 30px);
  margin-left: calc(-0.3 * var(--escoba-seat-back-width, 30px));
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.4));
}

.hexdev-escoba-card-back:first-child {
  margin-left: 0;
}

.hexdev-escoba-card-back svg {
  display: block;
  width: 100%;
  height: auto;
}

@container hexdev-escoba-seats (width < 400px) {
  .hexdev-escoba-seats { gap: 6px; }
  .hexdev-escoba-seat { gap: 4px; padding: 2px 6px; font-size: 0.76em; }
  .hexdev-escoba-card-back { --escoba-seat-back-width: 26px; }
}
`;
}

/** Injects the stylesheet at most once per document — same idempotence as
 * every other ensure* helper in this package. */
export function ensureStatusStyles(doc: Document): void {
  if (doc.getElementById(STATUS_STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = STATUS_STYLE_ID;
  style.textContent = buildStatusStylesheet();
  doc.head.appendChild(style);
}
