import { describe, expect, it } from "vitest";
import { splitMalasBuenas } from "./scoreboard.js";

describe("splitMalasBuenas (presentational grouping only — the score itself is never re-derived, only how it's drawn)", () => {
  it("keeps every point in 'malas' until the halfway point is reached", () => {
    expect(splitMalasBuenas(4, 30)).toEqual({ malas: 4, buenas: 0 });
  });

  it("splits at half the target — points beyond half go to 'buenas'", () => {
    expect(splitMalasBuenas(20, 30)).toEqual({ malas: 15, buenas: 5 });
  });

  it("never exceeds the target", () => {
    expect(splitMalasBuenas(30, 30)).toEqual({ malas: 15, buenas: 15 });
  });

  it("handles a 15-point match the same way, just with a smaller half", () => {
    expect(splitMalasBuenas(10, 15)).toEqual({ malas: 7, buenas: 3 });
  });

  it("a score of 0 has nothing in either group", () => {
    expect(splitMalasBuenas(0, 30)).toEqual({ malas: 0, buenas: 0 });
  });
});
