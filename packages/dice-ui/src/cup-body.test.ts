import { describe, expect, it } from "vitest";
import { CUP_HEIGHT, CUP_VIEWBOX, CUP_WIDTH } from "./geometry.js";
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
});
