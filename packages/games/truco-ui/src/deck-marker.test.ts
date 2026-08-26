import { describe, expect, it } from "vitest";
import { manoSeatFor } from "@hexdev/truco-engine";
import { dealerSeatOf } from "./deck-marker.js";

describe("dealerSeatOf — the inverse of the engine's own mano rule", () => {
  it.each([2, 4])("round-trips against manoSeatFor at every seat of a %i-seat table", (seatCount) => {
    // Checked against the ENGINE's function rather than against a second copy
    // of the arithmetic: the two must agree, and the only way to be sure is
    // to ask the one that decides.
    for (let dealer = 0; dealer < seatCount; dealer += 1) {
      expect(dealerSeatOf(manoSeatFor(dealer, seatCount), seatCount), `dealer ${String(dealer)} of ${String(seatCount)}`).toBe(dealer);
    }
  });

  it("wraps rather than going negative when the mano is seat zero", () => {
    // The one case a subtraction gets wrong if nobody adds the seat count
    // back: seat 0's dealer is the LAST seat, not seat -1.
    expect(dealerSeatOf(0, 4)).toBe(3);
    expect(dealerSeatOf(0, 2)).toBe(1);
  });
});
