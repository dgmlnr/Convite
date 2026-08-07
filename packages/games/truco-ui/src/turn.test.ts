import { describe, expect, it } from "vitest";
import { describeTurn, isMyTurn } from "./turn.js";

describe("isMyTurn / describeTurn (spec: whose turn it is must be obvious without reading)", () => {
  it("isMyTurn is true when the hand's turnSeat matches the local seat", () => {
    expect(isMyTurn(0, 0)).toBe(true);
    expect(isMyTurn(1, 0)).toBe(false);
  });

  it("isMyTurn is false when there is no hand in progress (between hands)", () => {
    expect(isMyTurn(0, null)).toBe(false);
  });

  it("describeTurn gives distinct Spanish copy for my turn vs. the opponent's", () => {
    expect(describeTurn(0, 0)).toBe("Tu turno");
    expect(describeTurn(0, 1)).toBe("Turno del rival");
  });

  it("describeTurn is blank (nothing to announce) between hands", () => {
    expect(describeTurn(0, null)).toBe("");
  });
});
