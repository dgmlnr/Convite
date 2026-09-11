import { describe, expect, it } from "vitest";

import { TABLE_TILT_DEG, TABLE_TILT_PERSPECTIVE_PX, cupTiltTransform, depthScaleFor } from "./table-perspective.js";

/**
 * `table-perspective.ts`'s own tests (SDD `mentiroso`, work unit E5b/task
 * 5.6, owner decision after E5's rendered baselines).
 *
 * `depthScaleFor` is a REAL perspective-projection formula
 * (`perspective / (perspective - z)`, the identical arithmetic
 * `dice-ui/dice-styles.ts`'s own comment already uses for its resting cube,
 * "480 / (480 - 50)"), not a per-seat-count lookup table — table-layout.ts's
 * own `y` (unit-circle, +1 = the viewer's own seat, -1 = the farthest one) is
 * the only input, so it works unchanged at 2, 4, or 6 seats.
 */
describe("table-perspective: depthScaleFor is a real, continuous perspective projection", () => {
  it("scales the viewer's own seat (y=1, nearest) up, above 1", () => {
    expect(depthScaleFor(1)).toBeGreaterThan(1);
  });

  it("scales the farthest seat (y=-1) down, below 1", () => {
    expect(depthScaleFor(-1)).toBeLessThan(1);
  });

  it("leaves a side seat (y=0, neither near nor far) exactly unscaled", () => {
    expect(depthScaleFor(0)).toBe(1);
  });

  it("is monotonically increasing in y — nearer is always bigger than farther, never a tie or a reversal", () => {
    const ys = [-1, -0.6, -0.2, 0, 0.2, 0.6, 1];
    const scales = ys.map((y) => depthScaleFor(y));
    for (let index = 1; index < scales.length; index += 1) {
      expect(scales[index]!).toBeGreaterThan(scales[index - 1]!);
    }
  });

  /**
   * THE NEGATIVE CONTROL: a flat (non-perspective) reading would return `1`
   * for every `y`, indistinguishable from `SEAT_FRAGMENT_SCALE` alone. This
   * is the exact mutation "delete the depth effect" plants, and it is what
   * `cups.browser.test.ts`'s own "own seat ends up bigger than the flat
   * scale" assertion exists to catch on the render side.
   */
  it("is NOT the constant 1 — a flat reading would fail both the near and far assertions above", () => {
    expect(depthScaleFor(1)).not.toBe(1);
    expect(depthScaleFor(-1)).not.toBe(1);
  });
});

describe("table-perspective: cupTiltTransform is the one declared, shared tilt string", () => {
  it("names both the declared perspective depth and the declared tilt angle", () => {
    const css = cupTiltTransform();
    expect(css).toBe(`perspective(${String(TABLE_TILT_PERSPECTIVE_PX)}px) rotateX(${String(TABLE_TILT_DEG)}deg)`);
  });

  it("is a strictly positive tilt angle, never zero (a zero angle would be no tilt at all)", () => {
    expect(TABLE_TILT_DEG).toBeGreaterThan(0);
  });
});
