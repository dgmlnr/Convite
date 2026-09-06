import type { DieFace } from "./geometry.js";
import { DIE_VIEWBOX } from "./geometry.js";
import { dieBodySvg } from "./die-body.js";
import { diePipsSvg } from "./die-pips.js";

/** Strips a standalone `<svg viewBox="…" xmlns="…">…</svg>` fragment down to
 * its inner markup, so two independently-testable fragments can be re-merged
 * under one shared root. */
function innerMarkup(svg: string): string {
  return svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
}

/**
 * One face, fully drawn: the bone underneath, the pips on top of it, as ONE
 * `<svg>` root — the same composition `mahjong-solitaire-ui/card-art.ts`
 * already does for a lobby-card tile ("the same two drawing functions,
 * reused, rather than re-implemented"), merged rather than left as two
 * stacked documents. `die.ts`'s 3D cube calls this once per facelet; a
 * future flat use (a results strip, a lobby icon) can call it again without
 * duplicating either the body or the pip layout.
 *
 * ONE ROOT, NOT TWO STACKED ONES — measured to matter, not a style
 * preference. A first version kept `dieBodySvg()` and `diePipsSvg()` as two
 * separate `<svg>` siblings, each absolutely positioned over the other via
 * CSS. It rendered correctly in some scenes and came up with every pip
 * missing in another, at a wider viewport, over the exact same 3D cube —
 * caught by `dice.scene.test.ts`'s desktop capture, not by any assertion,
 * because pixel presence at one specific layout was never something a unit
 * test here checked. Rather than chase which Chromium/Playwright layering
 * quirk between a `preserve-3d` ancestor and two absolutely-positioned SVG
 * roots caused that, this merges both into ONE svg document — no second
 * root for a compositor to place independently, so there is no "the second
 * one didn't line up" left to happen. `dieBodySvg()`/`diePipsSvg()` still
 * each return a complete, independently testable standalone fragment; this
 * function is the only place that tears their wrappers back off.
 */
export function dieFaceSvg(face: DieFace): string {
  return `<svg viewBox="${DIE_VIEWBOX}" xmlns="http://www.w3.org/2000/svg">${innerMarkup(dieBodySvg())}${innerMarkup(diePipsSvg(face))}</svg>`;
}
