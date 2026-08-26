import { describe, expect, it } from "vitest";
import { manoSeatFor } from "@hexdev/truco-engine";
import { dealDurationMs, dealOrderFrom, dealerSeatOf } from "./deck-marker.js";

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

describe("the deal's own shape", () => {
  it("serves the mano first and goes round from there", () => {
    expect(dealOrderFrom(2, 4)).toEqual([2, 3, 0, 1]);
    expect(dealOrderFrom(1, 2)).toEqual([1, 0]);
  });

  it("stays short enough that no bot can act through it", () => {
    // truco-bot's own DEFAULT_THINKING_DELAY_MS is 2400ms. That margin is
    // what makes "the deal blocks the start of the hand" true without the
    // client having to hold the server back — so it is worth a fence rather
    // than a comment, because a slower deal would silently stop blocking.
    expect(dealDurationMs(4), "a 2v2 deal runs into a bot's thinking floor").toBeLessThan(2000);
    expect(dealDurationMs(2)).toBeLessThan(2000);
  });

  it("takes longer with more seats, because there are more cards to serve", () => {
    expect(dealDurationMs(4)).toBeGreaterThan(dealDurationMs(2));
  });
});
