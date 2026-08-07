import { describe, expect, it } from "vitest";
import { ANCHOR_ORDER, resolveSeatPositions } from "./seat-position.js";

describe("resolveSeatPositions (obs 2970: the table is always relative to the local player)", () => {
  it("puts the local seat at 'bottom' in a 2-seat match, the opponent at 'top'", () => {
    const positions = resolveSeatPositions({ mySeat: 0, seatCount: 2 });

    expect(positions.get(0)).toBe("bottom");
    expect(positions.get(1)).toBe("top");
  });

  it("still puts the local seat at 'bottom' when the engine assigned it seat 1, not seat 0", () => {
    const positions = resolveSeatPositions({ mySeat: 1, seatCount: 2 });

    expect(positions.get(1)).toBe("bottom");
    expect(positions.get(0)).toBe("top");
  });

  it("v2 shape: 4 seats puts the partner (seat+2) opposite, at 'top', and the other two at the sides", () => {
    const positions = resolveSeatPositions({ mySeat: 0, seatCount: 4 });

    expect(positions.get(0)).toBe("bottom");
    expect(positions.get(2)).toBe("top"); // partner, per obs 2970: "se sienta opuesto"
    expect(positions.get(1)).toBe("right");
    expect(positions.get(3)).toBe("left");
  });

  it("rotates the same way for any local seat in a 4-seat match", () => {
    const positions = resolveSeatPositions({ mySeat: 2, seatCount: 4 });

    expect(positions.get(2)).toBe("bottom");
    expect(positions.get(0)).toBe("top");
    expect(positions.get(3)).toBe("right");
    expect(positions.get(1)).toBe("left");
  });

  it("exposes the four anchors in a stable, documented clockwise order starting at bottom", () => {
    expect(ANCHOR_ORDER).toEqual(["bottom", "right", "top", "left"]);
  });
});
