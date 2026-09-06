import { describe, expect, it } from "vitest";
import { CUP_HEIGHT, CUP_VIEWBOX, CUP_WIDTH } from "./geometry.js";
import { DICE_THEME_DEFAULTS } from "./theme-tokens.js";
import { cupBodySvg } from "./cup-body.js";

describe("cup-body: the cup is drawn as a cup, not a box wearing a die's shape", () => {
  it("renders an svg on the cup's own viewBox", () => {
    const markup = cupBodySvg();
    expect(markup).toContain("<svg");
    expect(markup).toContain("</svg>");
    expect(markup).toContain(`viewBox="${CUP_VIEWBOX}"`);
  });

  it("draws a silhouette that reaches the cup's full width and height", () => {
    const markup = cupBodySvg();
    expect(markup).toContain(`0,${String(CUP_HEIGHT)}`);
    expect(markup).toContain(`${String(CUP_WIDTH)},${String(CUP_HEIGHT)}`);
  });

  it("colours nothing with a hardcoded literal, so a tenant can theme it", () => {
    const markup = cupBodySvg();
    expect(markup).not.toMatch(/(?:fill|stroke)="#[0-9a-fA-F]/);
    expect(markup).not.toMatch(/(?:fill|stroke)="rgb/);
  });

  it("lights one pair of edges and shades the other, the same bevel argument as the die", () => {
    const markup = cupBodySvg();
    expect(markup).toContain("var(--dice-cup-bevel-light)");
    expect(markup).toContain("var(--dice-cup-bevel-shade)");
  });

  it("carries no defs — no gradient, so no defs, the same rule as die-body.ts", () => {
    expect(cupBodySvg()).not.toContain("<defs");
  });

  it("is narrower at the rim than at the base — the one silhouette fact that makes it read as a cup", () => {
    const markup = cupBodySvg();
    const rim = /^<svg[^>]*>\s*<polygon points="(\d+),0 (\d+),0/.exec(markup);
    expect(rim).not.toBeNull();
    const [, rimLeftX, rimRightX] = rim!;
    const rimWidth = Number(rimRightX) - Number(rimLeftX);
    expect(rimWidth).toBeLessThan(CUP_WIDTH);
  });

  it("uses only tokens theme-tokens actually defaults, so nothing renders unpainted", () => {
    const used = [...cupBodySvg().matchAll(/var\((--[a-z-]+)/g)].map((match) => match[1]);
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((token) => !(token in DICE_THEME_DEFAULTS)), "used but never defaulted").toEqual([]);
  });

  /**
   * THE MOUTH IS HOLLOW, NOT A LID — the second pass's whole point
   * (`cup-body.ts`'s own header). Two different interior fills is what
   * proves two separate half-ellipses exist rather than one flat opening
   * repainted a single dark colour, the same "a bevel is two colours or it
   * is not a bevel" argument `die-body.test.ts` already makes for the
   * exterior.
   */
  it("draws the interior in two different tones — a far half that catches light and a near half in shadow", () => {
    const markup = cupBodySvg();
    expect(markup).toContain("var(--dice-cup-interior-light)");
    expect(markup).toContain("var(--dice-cup-interior-shade)");
  });

  it("draws a visible rim wall — the interior ellipse is strictly smaller than the outer one it sits inside", () => {
    const markup = cupBodySvg();
    const ellipse = /<ellipse[^>]*rx="(\d+(?:\.\d+)?)"/.exec(markup);
    const interior = /<path d="M(\d+(?:\.\d+)?)[^"]*" fill="var\(--dice-cup-interior-light\)"/.exec(markup);
    expect(ellipse, "expected the outer rim ellipse").not.toBeNull();
    expect(interior, "expected the interior's far half-ellipse path").not.toBeNull();
    const outerRadiusX = Number(ellipse![1]);
    // The interior path's `M` starts at its own left edge (cx - rx); the
    // outer ellipse is centred the same as the interior, so a strictly
    // smaller interior radius pushes that starting x strictly to the right
    // of the outer ellipse's own left edge — the annular ring `CUP_RIM_WALL`
    // is meant to leave visible.
    const ellipseMatch = /<ellipse[^>]*cx="(\d+(?:\.\d+)?)"/.exec(markup)!;
    const outerLeftEdge = Number(ellipseMatch[1]) - outerRadiusX;
    expect(Number(interior![1])).toBeGreaterThan(outerLeftEdge);
  });
});
