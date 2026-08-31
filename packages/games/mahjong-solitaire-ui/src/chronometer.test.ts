import { describe, expect, it } from "vitest";
import { createChronometer, elapsedWholeSeconds, formatElapsed } from "./chronometer.js";
import type { ChronometerClock } from "./chronometer.js";

/**
 * A clock somebody drives by hand. Every fence below reads its numbers from
 * this and never from the machine — which is the whole point of the injection
 * and is fenced directly by "the clock is the injected one" further down.
 */
function scriptedClock(start: number): { readonly now: ChronometerClock; readonly advance: (ms: number) => void } {
  let instant = start;
  return {
    now: () => instant,
    advance: (ms) => {
      instant += ms;
    },
  };
}

describe("the rounding rule", () => {
  /**
   * R6 sized against the rule itself: if `formatElapsed` ignored its argument
   * every other case here would still agree with a constant. These two say
   * the function reads what it is handed.
   */
  it("different durations read differently", () => {
    expect(formatElapsed(0)).not.toBe(formatElapsed(1_000));
    expect(elapsedWholeSeconds(0)).not.toBe(elapsedWholeSeconds(1_000));
  });

  it("the brief's own example", () => {
    expect(formatElapsed(272_000)).toBe("4:32");
  });

  it("seconds are padded and minutes are not", () => {
    expect(formatElapsed(65_000)).toBe("1:05");
    expect(formatElapsed(9_000)).toBe("0:09");
  });

  it("minutes are not carried into hours", () => {
    // A board that took an hour and a quarter reads 75:12, not 1:15:12.
    // Unbounded minutes, the same shape `truco-ui`'s own `formatCountdown`
    // produces, and one less unit for a player to parse on a screen whose
    // whole message is a single sentence.
    expect(formatElapsed(4_512_000)).toBe("75:12");
  });

  describe("it FLOORS, and that is the opposite of the clock this repository already ships", () => {
    /**
     * `truco-ui`'s `remainingWholeSeconds` rounds UP and clamps at zero, on
     * two arguments that are both about a COUNTDOWN: a clock armed for one
     * minute must read "1:00" on its first frame, and a passed deadline must
     * not read "-0:03" while the server's own decision is still in flight.
     *
     * Neither argument survives the direction change, so neither rule is
     * copied. A chronometer reports time that has ALREADY PASSED, and it may
     * never report more of it than there was: at 4:32.999 the player has not
     * yet spent 4 minutes and 33 seconds, and rounding up would credit them
     * with a second they did not take. The same rule read from the other end
     * is what makes the first second honest — a board cleared 1ms in reads
     * 0:00, because that is how long it took, and "0:01" would be a lie about
     * a number nobody can dispute.
     */
    it("a fraction of a second is not a second", () => {
      expect(formatElapsed(272_999)).toBe("4:32");
      expect(formatElapsed(1)).toBe("0:00");
      expect(formatElapsed(999)).toBe("0:00");
    });

    it("the whole second below is where it changes", () => {
      expect(formatElapsed(999)).toBe("0:00");
      expect(formatElapsed(1_000)).toBe("0:01");
    });
  });

  describe("it does NOT clamp, and that is the other half of the same decision", () => {
    /**
     * A negative elapsed time means the clock handed to this closure went
     * BACKWARDS between the start of the match and its end. That is a defect
     * in whoever supplied the clock, and clamping it to "0:00" would dress
     * that defect up as the fastest game anybody has ever played — a result,
     * presented to a player, produced by a bug.
     *
     * `truco-ui` clamps for a reason that genuinely applies THERE: a passed
     * deadline is an ordinary, expected state of a countdown. There is no
     * ordinary state of a chronometer in which time runs backwards.
     */
    it("a clock that ran backwards reads as a negative, not as zero", () => {
      expect(formatElapsed(-2_000)).toBe("-0:02");
      expect(formatElapsed(-272_000)).toBe("-4:32");
    });

    it("the floor keeps going in the same direction below zero", () => {
      expect(elapsedWholeSeconds(-1_500)).toBe(-2);
      expect(elapsedWholeSeconds(1_500)).toBe(1);
    });
  });
});

describe("a match started in this page session gets a chronometer", () => {
  it("it exists", () => {
    const clock = scriptedClock(1_000);
    expect(createChronometer({ resumed: false, now: clock.now })).not.toBeNull();
  });

  it("it measures from the instant it was created to the instant the board was cleared", () => {
    const clock = scriptedClock(1_000);
    const chronometer = createChronometer({ resumed: false, now: clock.now });
    clock.advance(272_000);
    expect(chronometer?.finish()).toBe(272_000);
  });

  it("THE CLOCK IS THE INJECTED ONE, and this is the assertion that says so", () => {
    /**
     * The scripted clock's epoch is 1,000 — a number no wall clock has read
     * since 1970. A `Date.now()` call anywhere inside the closure produces an
     * elapsed near 1.7e12 instead of the 272,000 below, so this single
     * equality is what stands between the finished board and a figure the
     * machine invented. It is also what lets a visual baseline freeze one: a
     * chronometer counting UP is exactly as nondeterministic in a screenshot
     * as `truco-ui`'s countdown, and its own docblock says so.
     */
    const clock = scriptedClock(1_000);
    const chronometer = createChronometer({ resumed: false, now: clock.now });
    clock.advance(272_000);
    expect(chronometer?.finish()).toBeLessThan(1_000_000);
    expect(formatElapsed(chronometer!.finish())).toBe("4:32");
  });

  describe("the figure freezes at the finish and never at the repaint", () => {
    /**
     * The board is repainted after it is cleared — the completion message
     * sits on screen while the player reads it, and any later view redraws
     * it. If the elapsed time were read on each of those, the number would
     * keep climbing while nobody was playing, and the figure the player
     * finally looked away from would be "how long the message was open",
     * not "how long the board took".
     *
     * So the first call decides, and every later call repeats it.
     */
    it("later calls return the first answer", () => {
      const clock = scriptedClock(1_000);
      const chronometer = createChronometer({ resumed: false, now: clock.now })!;
      clock.advance(272_000);
      const first = chronometer.finish();
      clock.advance(600_000);
      expect(chronometer.finish()).toBe(first);
      expect(chronometer.finish()).toBe(272_000);
    });

    it("the fixture would notice a clock that kept running", () => {
      // R6 for the freeze: if the second advance were zero, "frozen" and
      // "recomputed" would agree and the fence above would be vacuous.
      const clock = scriptedClock(1_000);
      const chronometer = createChronometer({ resumed: false, now: clock.now })!;
      clock.advance(272_000);
      chronometer.finish();
      clock.advance(600_000);
      expect(clock.now()).toBe(873_000);
    });
  });
});

describe("a RESUMED match gets no chronometer at all", () => {
  /**
   * THE HONESTY GATE, and it is structural rather than a rule somebody has to
   * remember downstream. A match in this repository survives a page reload
   * (`identity-storage.ts`'s `PersistedMatchSession`), and a closure started
   * at first render on the resume path measures TIME SINCE THE RELOAD. Shown
   * as a result, that is a shorter number than the truth wearing the truth's
   * clothes — and the player who reads it has no way to tell.
   *
   * There is no partial mode and no smaller font. `null` is the whole answer:
   * a caller holding nothing cannot render a figure by mistake, and the
   * message it produces instead is fenced in `match-over.test.ts`.
   */
  it("nothing to start, so nothing to show", () => {
    const clock = scriptedClock(1_000);
    expect(createChronometer({ resumed: true, now: clock.now })).toBeNull();
  });

  it("the same clock and the same instants would have produced a figure on the fresh path", () => {
    // The discriminator, in one test: the two calls differ ONLY in
    // `resumed`, so "returns null for everything" cannot pass this file.
    const clock = scriptedClock(1_000);
    const resumed = createChronometer({ resumed: true, now: clock.now });
    const joined = createChronometer({ resumed: false, now: clock.now });
    clock.advance(272_000);
    expect(resumed).toBeNull();
    expect(joined?.finish()).toBe(272_000);
  });
});
