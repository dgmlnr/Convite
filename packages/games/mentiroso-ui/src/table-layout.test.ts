import { describe, expect, it } from "vitest";
import { ANCHOR_ORDER, resolveSeatPositions } from "@hexdev/truco-ui";

import { positionFor, tableLayout } from "./table-layout.js";

const REGISTERED_SEAT_COUNTS = [2, 4, 6] as const;

describe("mentiroso-table: exactly one position per registered seat (R-TABLE-COUNT)", () => {
  it("a 6-seat table renders six positions, one per seat", () => {
    const positions = tableLayout(0, 6);

    expect(positions).toHaveLength(6);
    expect(new Set(positions.map((position) => position.seat)).size).toBe(6);
  });
});

describe("mentiroso-table: equal angular spacing (R-TABLE-ANGLE)", () => {
  it.each(REGISTERED_SEAT_COUNTS)("every adjacent gap equals 360/seatCount at %d seats", (seatCount) => {
    const expectedGap = 360 / seatCount;
    const angles = tableLayout(0, seatCount)
      .map((position) => position.angleDeg)
      .sort((a, b) => a - b);

    for (let index = 0; index < angles.length; index += 1) {
      const current = angles[index]!;
      const next = angles[(index + 1) % angles.length]!;
      const gap = index === angles.length - 1 ? next + 360 - current : next - current;
      expect(gap).toBeCloseTo(expectedGap, 10);
    }
  });

  /**
   * THE NEGATIVE CONTROL (design D5 / spec "A four-fixed-anchor layout fails
   * equal spacing at 6 seats"). `truco-ui`'s own `resolveSeatPositions` is
   * imported UNMODIFIED — not reimplemented, not paraphrased — and run at
   * seatCount=6, where `ANCHOR_ORDER.length / seatCount` (4/6) is not an
   * integer. This is deliberately NOT run at 4 seats: at 4, both this
   * package's polar layout and truco's four-anchor scheme land on the exact
   * same angles (0/90/180/270), so a control at 4 would prove nothing. The
   * discrepancy is structural and only shows up where 4 does not divide the
   * seat count evenly.
   */
  it("a four-fixed-anchor layout (truco's own resolveSeatPositions, unmodified) cannot satisfy equal spacing at 6 seats", () => {
    const adapted = resolveSeatPositions({ mySeat: 0, seatCount: 6 });

    // One map entry per seat...
    expect(adapted.size).toBe(6);
    // ...but `ANCHOR_ORDER[(offset * step) % ANCHOR_ORDER.length]` reads a
    // non-integer index for most seats when step = 4/6, so most "anchors"
    // are not one of the four real anchors at all.
    const anchors = Array.from(adapted.values());
    const realAnchors = anchors.filter((anchor) => ANCHOR_ORDER.includes(anchor));
    expect(realAnchors.length).toBeLessThan(6);
    // Which collapses distinctness too: several seats share the same
    // (undefined) value.
    expect(new Set(anchors).size).toBeLessThan(6);
  });
});

describe("mentiroso-table: pairwise-distinct positions (R-TABLE-DISTINCT)", () => {
  it.each(REGISTERED_SEAT_COUNTS)("no two seats share a position at %d seats", (seatCount) => {
    const positions = tableLayout(0, seatCount);

    for (let i = 0; i < positions.length; i += 1) {
      for (let j = i + 1; j < positions.length; j += 1) {
        const a = positions[i]!;
        const b = positions[j]!;
        const sameSpot = Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
        expect(sameSpot).toBe(false);
      }
    }
  });
});

describe("mentiroso-table: the viewer's own seat anchors at bottom (R-TABLE-SELF)", () => {
  it("own seat renders at bottom regardless of the assigned seat number", () => {
    // 6-seat table, viewer occupies seat 4 — not seat 0, so this cannot pass
    // by an accidental default.
    const own = positionFor(4, 4, 6);

    expect(own.angleDeg).toBe(0);
    expect(own.y).toBeCloseTo(1, 10);
    expect(own.x).toBeCloseTo(0, 10);
  });

  it("the remaining seats are distributed around the viewer's own seat, not stacked on it", () => {
    const positions = tableLayout(4, 6);
    const others = positions.filter((position) => position.seat !== 4);

    expect(others).toHaveLength(5);
    for (const other of others) {
      expect(other.angleDeg).not.toBe(0);
    }
  });
});
