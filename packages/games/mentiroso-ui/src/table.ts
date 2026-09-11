import type { MentirosoAction, PlayerView } from "@hexdev/mentiroso-engine";

import { renderMentirosoBidPicker } from "./bid-picker.js";
import { createMentirosoCups } from "./cups.js";
import { renderMentirosoShowdown } from "./showdown.js";
import { ensureMentirosoTableStyles } from "./table-styles.js";

/**
 * The real mentiroso table (SDD `mentiroso`, work unit E5/task 5.5, closing
 * Stage E) — the first file in this package that COMPOSES what E1-E4 built
 * (`table-layout.ts` via `cups.ts`, `cups.ts` itself, `bid-picker.ts`,
 * `showdown.ts`) into one screen, rather than rendering any one of them
 * standalone.
 *
 * COMPOSES, NEVER LEARNS A RULE — the launch prompt's own constraint,
 * verbatim: "la mesa compone; las piezas reciben". Every fact this file
 * reads (whose turn it is, what is legal, who won a showdown) already lives
 * in `PlayerView`/`legalActions`, computed once by the engine/module layers.
 * `dice-ui` is not imported here at all, and is not touched by this unit —
 * see `cups.ts`'s own note that every difference mentiroso needs is already
 * reachable through `DiceCupHandle`.
 *
 * BOTH PANELS ARE MOUNTED UNCONDITIONALLY, AND THIS FILE GATES NEITHER: it
 * would be a THIRD place a phase check could drift from the two pieces that
 * already have it right. `renderMentirosoBidPicker` already renders nothing
 * when `legalActions` is empty (any phase but this seat's own turn to bid);
 * `renderMentirosoShowdown` already renders nothing outside the showdown
 * phase (`describeShowdown` returns `null`). Mounting both, always, and
 * letting each answer for itself is the whole of what "composes" means here.
 *
 * ONE FELT PER MOUNT, cups NEVER SHARE THEIR OWN CONTAINER WITH THE PANELS:
 * `createMentirosoCups`'s own `mount` calls `container.replaceChildren()`
 * whenever the seat count changes, which would silently wipe the bid-picker
 * and showdown panels too if they were siblings inside the SAME node cups
 * are mounted into. A dedicated `.hexdev-mentiroso-cups-layer`, a sibling of
 * both panels rather than their parent, is what keeps that remount from ever
 * touching either one.
 */
export type MentirosoTableRender = (
  container: HTMLElement,
  view: PlayerView,
  legalActions: readonly MentirosoAction[],
  onAction: (action: MentirosoAction) => void,
) => void;

/**
 * Builds a fresh renderer with its own per-mount state — the same closure
 * shape `createMentirosoCups`/`createMatchTableRenderer` (truco-ui) already
 * use, so a caller mounts this once and calls the returned function again on
 * every fresh `PlayerView`.
 */
export function createMentirosoTableRenderer(): MentirosoTableRender {
  const cups = createMentirosoCups();
  let mountedDocument: Document | null = null;
  let cupsLayer: HTMLElement | null = null;
  let bidSlot: HTMLElement | null = null;
  let showdownSlot: HTMLElement | null = null;

  return (container, view, legalActions, onAction) => {
    ensureMentirosoTableStyles(container.ownerDocument);

    if (mountedDocument !== container.ownerDocument) {
      container.replaceChildren();
      container.className = "hexdev-mentiroso-table-shell";
      const felt = container.appendChild(container.ownerDocument.createElement("div"));
      felt.className = "hexdev-mentiroso-table";

      cupsLayer = felt.appendChild(container.ownerDocument.createElement("div"));
      cupsLayer.className = "hexdev-mentiroso-cups-layer";
      // Panel order decides paint layering only — never which one is
      // visible. At most one of the two is ever non-empty for a given
      // `PlayerView`: bidding and showdown are mutually exclusive phases.
      bidSlot = felt.appendChild(container.ownerDocument.createElement("div"));
      showdownSlot = felt.appendChild(container.ownerDocument.createElement("div"));
      mountedDocument = container.ownerDocument;

      // FOUND BY LOOKING (work unit E5/task 5.5's own throwaway phone-width
      // scene): the felt's own fixed 1280px (`table-styles.ts`) is wider
      // than a phone shell, and a fresh scrollable box defaults to its LEFT
      // edge. The viewer's own seat and both panels sit at the felt's
      // horizontal CENTER (`table-layout.ts`'s own `positionFor`; the panel
      // rule in `table-styles.ts`) — so an uncorrected shell opens on a wide
      // slice of bare felt with nothing on it, not merely a partial view.
      // Centering the shell's scroll position ONCE, at this same first mount
      // that just built the felt, is what puts the viewer's own seat in
      // view by default; a shell at least as wide as the felt computes a
      // center of 0 here and scrolls nowhere, so a desktop-width host is
      // unaffected.
      container.scrollLeft = (container.scrollWidth - container.clientWidth) / 2;
    }

    cups(cupsLayer!, view);
    renderMentirosoBidPicker(bidSlot!, legalActions, onAction);
    renderMentirosoShowdown(showdownSlot!, view);
  };
}
