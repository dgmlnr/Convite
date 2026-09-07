import { afterEach, describe, expect, it } from "vitest";
import { renderErrorWithRetry, renderStatusMessage } from "./status-view.js";
import { renderUnsupportedGame } from "./unsupported-game-view.js";
import { renderGameSelection } from "./game-screen.js";
import type { GameId } from "@hexdev/platform-contract";
import type { CatalogEntry } from "./bootstrap-data.js";
import type { LobbyDisplayEntry } from "@hexdev/platform-core";

/**
 * Text legibility on the chrome's own coloured surfaces.
 *
 * The status/error card paints itself with --gx-color-primary and takes
 * --gx-color-on-primary for its text, which is why its heading and body copy
 * read correctly on the deep green. That explicit override was written
 * against a base chrome BUTTON rule that, at the time, read
 * --gx-color-on-surface: near-black on deep green measured 2.91:1, under
 * half of what small text needs. Reported from a real screenshot ("el texto
 * negro sobre ese verde pierde legibilidad"), then measured here rather than
 * eyeballed. The base rule later moved to --hx-felt-ink for an unrelated
 * reason (chrome-styles.ts's own "the surface is ours" note) -- the override
 * stayed, correctly: on-primary/primary is still the deliberately right
 * pairing for a primary-coloured card, not an artifact of whichever token
 * the base rule happened to use that day.
 *
 * FOUR MORE READERS OF --gx-color-on-surface were found the same way this
 * comment was corrected -- by mapping every consumer of the token instead of
 * trusting what a docstring already claimed about it, during the admin
 * panel's own invisible-text investigation. .hexdev-chrome-empty,
 * .hexdev-chrome-loading, .hexdev-about-toggle and .hexdev-about-panel all
 * painted on-surface's near-black directly, but none of them sit on the raw
 * --gx-color-surface -- they sit on the FELT, tinted by at most 14% of it
 * (--hx-felt-tint). Measured across the felt's own gradient stops: 2.67:1 at
 * the lightest, 1.26:1 at the deepest, never once at 4.5:1 for any tenant
 * theme, because no surface colour can lighten the felt enough to rescue it.
 * Fixed by reading --hx-felt-ink instead -- the token the status card's own
 * body copy and the lobby's quiet copy already use -- and fenced below
 * (second describe block) so it cannot recur.
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

/**
 * A computed colour as [r, g, b, a], with r/g/b on 0-255.
 *
 * TWO SERIALISATIONS, and assuming one of them was this file's real bug.
 * `getComputedStyle` returns "rgb(240, 245, 242)" for an ordinary colour —
 * but for anything built with `color-mix()` Chromium returns
 * "color(srgb 0.951059 0.966118 0.958588 / 0.05)": the SAME numbers on a 0-1
 * scale, in a different function. Reading those floats as 0-255 turns every
 * mixed colour into near-black, so text and backdrop both came out black and
 * the ratio came out 1:1 — a number that looks like a catastrophic failure
 * and is actually a broken ruler.
 *
 * It went unnoticed because until the lobby's quiet copy arrived, everything
 * this suite measured was a plain rgb() colour. The first `color-mix` element
 * it was ever pointed at is the one that exposed it.
 */
function parseColour(colour: string): readonly [number, number, number, number] {
  const parts = colour.match(/-?\d*\.?\d+(e-?\d+)?/gi);
  if (parts === null || parts.length < 3) throw new Error(`unparseable computed colour: ${colour}`);
  const scale = colour.startsWith("color(") ? 255 : 1;
  const [r, g, b] = [Number(parts[0]) * scale, Number(parts[1]) * scale, Number(parts[2]) * scale];
  return [r, g, b, parts.length >= 4 ? Number(parts[3]) : 1];
}

/** `over` composited onto `under` at `alpha` — the colour an eye actually
 * receives, which is what 1.4.3 is a statement about. */
function composite(over: readonly [number, number, number, number], under: readonly [number, number, number]): readonly [number, number, number] {
  const alpha = over[3];
  return [0, 1, 2].map((i) => over[i]! * alpha + under[i]! * (1 - alpha)) as unknown as readonly [number, number, number];
}

/** The colour a player actually sees BEHIND this element: its own background
 * if it paints one, otherwise the nearest ancestor that does. A transparent
 * button (every chrome button is) shows its card's fill, not the page's --
 * comparing against its own "background" would compare text to nothing. */
function paintedBackgroundOf(el: HTMLElement): readonly [number, number, number] {
  // Collected outward first, then composited inward: a SEMI-transparent fill
  // does not hide what is behind it, it tints it. The modality block is
  // exactly that (--gx-color-on-surface at 5%), so stopping at the first
  // non-transparent layer would take a 5% wash for an opaque surface.
  const stack: (readonly [number, number, number, number])[] = [];
  for (let node: HTMLElement | null = el; node !== null; node = node.parentElement) {
    const layer = parseColour(getComputedStyle(node).backgroundColor);
    if (layer[3] === 0) continue;
    stack.push(layer);
    if (layer[3] === 1) break;
  }
  const opaque = stack.pop();
  if (opaque === undefined) throw new Error("no painted background anywhere up the ancestor chain");
  let resolved: readonly [number, number, number] = [opaque[0], opaque[1], opaque[2]];
  for (const layer of [...stack].reverse()) resolved = composite(layer, resolved);
  return resolved;
}

function ratioFor(el: HTMLElement): number {
  const backdrop = paintedBackgroundOf(el);
  return contrastRatio(composite(parseColour(getComputedStyle(el).color), backdrop), backdrop);
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
    // button is the felt -- where the base rule's --hx-felt-ink is the right
    // token and already passes. Asserted here so a future fix that repaints
    // EVERY chrome button on-primary would break this case instead of
    // quietly making retry illegible on the surface it really sits on.
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

/**
 * THE FOUR READERS THE FIRST DESCRIBE BLOCK'S OWN DOCSTRING NOW NAMES.
 *
 * Every one of these sits on the felt (.convite-chrome's own background),
 * never on a card of its own -- which is exactly why --gx-color-on-surface
 * was the wrong token for all four: on-surface pairs with the RAW
 * --gx-color-surface, and the felt is never that raw value, only a tint of
 * it (chrome-styles.ts's own "THE SURFACE IS OURS" note). Each case here
 * renders through the real widget-app entry points (renderGameSelection),
 * not a hand-built fixture, so a future edit to any of these four rules is
 * measured exactly as a player would see it.
 */
describe("chrome text stays legible on the felt itself, not just on a coloured card (WCAG 2.1 AA, 1.4.3)", () => {
  const TRUCO: CatalogEntry = {
    id: "truco-argentino" as GameId,
    gameFamily: "truco",
    section: "cartas",
    displayNameKey: "games.truco.name",
    seatCount: 2,
    configOptions: [{ key: "pointsToWin", labelKey: "games.truco.pointsToWin", values: [15, 30], defaultValue: 15 }],
  };
  const CALLBACKS = { onPlayVsPerson: () => undefined, onPlayVsBot: () => undefined };

  it("the empty-catalog message reads on the felt", () => {
    const el = freshContainer();
    renderGameSelection(el, [], TRUCO.gameFamily, new Map(), CALLBACKS);

    const empty = el.querySelector<HTMLElement>(".hexdev-chrome-empty");
    expect(empty, "fence setup: nothing matched .hexdev-chrome-empty").not.toBeNull();
    expect(ratioFor(empty!), "empty-catalog message vs the felt").toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it("the per-card loading placeholder reads on the felt", () => {
    const el = freshContainer();
    // An empty presence map: the catalog has one game, and nobody has
    // broadcast its presence yet, so renderGame takes the loading branch.
    renderGameSelection(el, [TRUCO], TRUCO.gameFamily, new Map(), CALLBACKS);

    const loading = el.querySelector<HTMLElement>(".hexdev-chrome-loading");
    expect(loading, "fence setup: nothing matched .hexdev-chrome-loading").not.toBeNull();
    expect(ratioFor(loading!), "loading placeholder vs the felt").toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it("the deck-credit disclosure control reads on the felt, closed", () => {
    const el = freshContainer();
    renderGameSelection(el, [TRUCO], TRUCO.gameFamily, new Map(), CALLBACKS);

    const toggle = el.querySelector<HTMLElement>(".hexdev-about-toggle");
    expect(toggle, "fence setup: nothing matched .hexdev-about-toggle").not.toBeNull();
    expect(ratioFor(toggle!), "credit toggle vs the felt").toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it("the deck-credit panel copy reads on the felt, open", () => {
    const el = freshContainer();
    renderGameSelection(el, [TRUCO], TRUCO.gameFamily, new Map(), CALLBACKS);

    const details = el.querySelector<HTMLDetailsElement>(".hexdev-about");
    if (details === null) throw new Error("fence setup: the credit disclosure never rendered");
    details.open = true;

    const panel = el.querySelector<HTMLElement>(".hexdev-about-panel");
    expect(panel, "fence setup: nothing matched .hexdev-about-panel").not.toBeNull();
    expect(ratioFor(panel!), "credit panel copy vs the felt").toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
});

/**
 * THE LOBBY'S QUIET TEXT, which is exactly the text that stops being legible.
 *
 * The hierarchy pass gave this screen three levels of secondary copy — a
 * tagline, a section marker, a caption over the difficulty row — and each is
 * dimmed with `color-mix(... N%, transparent)` because "quiet" is the whole
 * point of them. N is where legibility goes to die, silently: it is a design
 * dial, it looks fine to whoever turns it, and nothing in this suite watched
 * the lobby at all.
 *
 * IT ALREADY BIT. The caption shipped at 55%, which computes to 3.69:1 at
 * 12px — under 1.4.3's 4.5:1, and 12px is not large text under any reading.
 * It was caught by hand, and a hand check does not survive the next person who
 * wants the caption a little softer. This is that check, kept.
 */
describe("the lobby's secondary copy stays legible however quiet the design wants it", () => {
  const TRUCO: CatalogEntry = {
    id: "truco-argentino" as GameId,
    gameFamily: "truco",
    section: "cartas",
    displayNameKey: "games.truco.name",
    seatCount: 2,
    configOptions: [{ key: "pointsToWin", labelKey: "games.truco.pointsToWin", values: [15, 30], defaultValue: 15 }],
  };

  // Presence data is not optional here: without it the card renders a
  // "Cargando…" placeholder and the modality copy this fences never exists.
  const MODALITIES: readonly LobbyDisplayEntry[] = [{ modality: { pointsToWin: 15 }, waitingCount: 2, promoteBotFallback: false }];

  function lobby(): HTMLElement {
    const el = freshContainer();
    renderGameSelection(el, [TRUCO], TRUCO.gameFamily, new Map([[TRUCO.id, MODALITIES]]), { onPlayVsPerson: () => undefined, onPlayVsBot: () => undefined });
    return el;
  }

  it.each([
    [".hexdev-chrome-tagline", "the tagline under the title"],
    [".hexdev-modality-title", "the section marker over each modality"],
    [".hexdev-modality-cue", "the caption over the difficulty row"],
  ])("%s reads at 4.5:1 — %s", (selector) => {
    const el = lobby();
    const target = el.querySelector<HTMLElement>(selector);

    expect(target, `fence setup: nothing matched ${selector}`).not.toBeNull();
    // 4.5:1 flat, never the 3:1 large-text allowance: none of these is large
    // text. The marker is 11.2px, the caption 12px, the tagline 14.4px, and
    // 1.4.3 puts the large-text line at 18.66px bold or 24px.
    expect(ratioFor(target!), `${selector} is dimmed past legibility`).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
});
