import { afterEach, describe, expect, it } from "vitest";
import { renderErrorWithRetry, renderStatusMessage } from "./status-view.js";
import { renderUnsupportedGame } from "./unsupported-game-view.js";

/**
 * Text legibility on the chrome's own coloured surfaces.
 *
 * The status/error card paints itself with --gx-color-primary and takes
 * --gx-color-on-primary for its text, which is why its heading and body copy
 * read correctly on the deep green. The base chrome BUTTON rule, however,
 * takes --gx-color-on-surface -- correct for a button on the plain surface,
 * and wrong for the very same button sitting INSIDE that primary-coloured
 * card: near-black on deep green measures 2.91:1, under half of what small
 * text needs. Reported from a real screenshot ("el texto negro sobre ese
 * verde pierde legibilidad"), then measured here rather than eyeballed.
 *
 * The threshold is WCAG 2.1 AA for normal-size text (1.4.3). This suite is
 * deliberately about the pairings a player actually reads on a coloured
 * surface; it is the first fence of its kind in this package and the natural
 * home for the rest of the standing accessibility work.
 */

const AA_NORMAL_TEXT = 4.5;

let mounted: HTMLElement[] = [];

afterEach(() => {
  for (const el of mounted) el.remove();
  mounted = [];
});

function freshContainer(): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  mounted.push(container);
  return container;
}

/** One sRGB channel, gamma-expanded to linear light (WCAG 2.1 relative
 * luminance, step 1). */
function toLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance([r, g, b]: readonly [number, number, number]): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (lighter! + 0.05) / (darker! + 0.05);
}

/** getComputedStyle always serialises a resolved colour as rgb()/rgba(). */
function parseRgb(colour: string): readonly [number, number, number] {
  const channels = colour.match(/\d+(\.\d+)?/g);
  if (channels === null || channels.length < 3) throw new Error(`unparseable computed colour: ${colour}`);
  return [Number(channels[0]), Number(channels[1]), Number(channels[2])];
}

/** The colour a player actually sees BEHIND this element: its own background
 * if it paints one, otherwise the nearest ancestor that does. A transparent
 * button (every chrome button is) shows its card's fill, not the page's --
 * comparing against its own "background" would compare text to nothing. */
function paintedBackgroundOf(el: HTMLElement): readonly [number, number, number] {
  for (let node: HTMLElement | null = el; node !== null; node = node.parentElement) {
    const background = getComputedStyle(node).backgroundColor;
    const isTransparent = background === "transparent" || background === "rgba(0, 0, 0, 0)";
    if (!isTransparent) return parseRgb(background);
  }
  throw new Error("no painted background anywhere up the ancestor chain");
}

function ratioFor(el: HTMLElement): number {
  return contrastRatio(parseRgb(getComputedStyle(el).color), paintedBackgroundOf(el));
}

describe("chrome text stays legible on the card's own coloured surface (WCAG 2.1 AA, 1.4.3)", () => {
  it("the unsupported-game card's back-to-lobby button reads against the card, not against a surface it is not on", () => {
    const el = freshContainer();

    renderUnsupportedGame(el, { onBackToLobby: () => {} });

    const button = el.querySelector<HTMLButtonElement>('button[data-action="back-to-lobby"]');
    expect(button).not.toBeNull();
    expect(ratioFor(button!), "back-to-lobby text vs the card it sits on").toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it("the error card's retry button reads too — and it is NOT inside the card, which is why the fix must stay scoped", () => {
    const el = freshContainer();

    renderErrorWithRetry(el, "No pudimos conectarte a la partida.", () => {});

    const button = el.querySelector<HTMLButtonElement>('button[data-action="retry"]');
    expect(button).not.toBeNull();
    // status-view.ts appends retry to .hexdev-chrome-content as a SIBLING of
    // the card, never a child of it, so what shows through this transparent
    // button is the plain content surface -- where the base rule's
    // --gx-color-on-surface is exactly the right token and already passes.
    // Asserted here so a future fix that repaints EVERY chrome button
    // on-primary would break this case instead of quietly making retry
    // illegible on the surface it really sits on.
    expect(button!.closest(".hexdev-chrome-status"), "retry is a sibling of the card, not a child").toBeNull();
    expect(ratioFor(button!), "retry text vs the surface it actually sits on").toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it("the status card's own message copy already reads correctly — the control, proving the card itself was never the problem", () => {
    const el = freshContainer();

    renderStatusMessage(el, "Buscando rival…");

    const card = el.querySelector<HTMLElement>("p.hexdev-chrome-status");
    expect(card).not.toBeNull();
    expect(ratioFor(card!), "status card copy vs the card").toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
});
