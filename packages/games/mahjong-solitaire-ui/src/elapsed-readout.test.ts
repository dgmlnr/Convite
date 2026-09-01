import { describe, expect, it } from "vitest";
import { createChronometer } from "./chronometer.js";
import { elapsedReadoutText } from "./elapsed-readout.js";

/**
 * WHAT THE FELT SAYS WHILE SOMEBODY IS STILL PLAYING.
 *
 * The sentence on the completion panel is `match-over.ts`'s and is written
 * once, at the end, about a number that has stopped moving. This is the other
 * one: a figure the player watches, which has to keep moving and has to stop
 * being shown at exactly the moments a figure would be a lie.
 *
 * NODE, NOT THE BROWSER, for the same reason `chronometer.test.ts` is here:
 * every decision below is arithmetic over two numbers and a null, and a rule
 * that can only be read out of a rendered element can only be checked by
 * rendering one. `elapsed-readout.browser.test.ts` covers the part that is
 * genuinely about the DOM — the ticking and its own end.
 */

function clockAt(readings: readonly number[]): () => number {
  let index = 0;
  return () => readings[Math.min(index++, readings.length - 1)] ?? 0;
}

describe("the readout while the board is being played", () => {
  it("reads the clock again on every call, because a stopwatch that stops is not one", () => {
    const chronometer = createChronometer({ resumed: false, now: clockAt([1000, 4000, 9000, 273_000]) });
    expect(elapsedReadoutText(chronometer)).toBe("0:03");
    expect(elapsedReadoutText(chronometer)).toBe("0:08");
    expect(elapsedReadoutText(chronometer)).toBe("4:32");
  });

  it("shows nothing at all for a resumed match, on the same terms the panel does", () => {
    // `createChronometer` returns `null` for a resumed match deliberately —
    // a closure started at first render there would measure time since the
    // RELOAD, which is a shorter number than the truth wearing the truth's
    // clothes. A caller holding null must not be able to render a figure by
    // mistake, and that has to hold for the live readout as much as for the
    // sentence at the end.
    expect(elapsedReadoutText(null)).toBeNull();
  });

  it("stops at the figure the board finished on, rather than counting on past it", () => {
    // THE ONE PLACE THE TWO READOUTS COULD DISAGREE. The panel freezes on its
    // first `finish()`, and it then sits on screen while the player reads it.
    // A live readout still ticking underneath would say a bigger number than
    // the sentence above it, and the player would be looking at two answers to
    // one question.
    const chronometer = createChronometer({ resumed: false, now: clockAt([0, 60_000, 900_000, 900_000]) });
    expect(chronometer!.finish()).toBe(60_000);
    expect(elapsedReadoutText(chronometer)).toBe("1:00");
  });

  it("starts at zero rather than at nothing, so the readout has a shape before the first second", () => {
    // R6-adjacent: a readout that rendered empty until 0:01 would look broken
    // for exactly as long as a player spends deciding on their first pair.
    const chronometer = createChronometer({ resumed: false, now: clockAt([5000, 5000]) });
    expect(elapsedReadoutText(chronometer)).toBe("0:00");
  });

  it("shows a backwards clock as the negative it is, never as a fast game", () => {
    // `formatElapsed`'s own rule, restated at this seam because this is the
    // face a player actually sees. A clock that went backwards is a defect,
    // and clamping it here would dress that defect up as a result.
    const chronometer = createChronometer({ resumed: false, now: clockAt([10_000, 7000]) });
    expect(elapsedReadoutText(chronometer)).toBe("-0:03");
  });
});
