import { describe, expect, it } from "vitest";
import { formatCountdown } from "./turn-clock.js";

describe("formatCountdown", () => {
  it("shows a whole fresh minute as 1:00, never 0:59", () => {
    // `Math.ceil`, not `Math.floor`: a clock armed for exactly 60s that read
    // 0:59 on its very first frame would look like it had already lost a
    // second before the player even saw it.
    expect(formatCountdown(60_000)).toBe("1:00");
  });

  it("pads the seconds so the pill never jumps between one and two digits", () => {
    expect(formatCountdown(9_000)).toBe("0:09");
    expect(formatCountdown(45_000)).toBe("0:45");
  });

  it("rounds a part-second up, so the last visible number is 0:01 and not a flash of 0:00", () => {
    expect(formatCountdown(1)).toBe("0:01");
    expect(formatCountdown(999)).toBe("0:01");
    expect(formatCountdown(1_500)).toBe("0:02");
  });

  it("clamps at zero — an expired or already-past deadline never reads negative", () => {
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(-1)).toBe("0:00");
    expect(formatCountdown(-90_000)).toBe("0:00");
  });

  it("keeps counting in minutes above 60s, for a table configured with a longer limit", () => {
    expect(formatCountdown(125_000)).toBe("2:05");
  });
});
