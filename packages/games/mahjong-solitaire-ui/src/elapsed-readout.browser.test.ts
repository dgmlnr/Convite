import { afterEach, describe, expect, it } from "vitest";
import { createChronometer } from "./chronometer.js";
import type { ElapsedReadoutTicker } from "./elapsed-readout.js";
import { ELAPSED_READOUT_CLASS, ELAPSED_READOUT_STYLE_ID, ensureElapsedReadoutStyles, startElapsedReadout } from "./elapsed-readout.js";

/**
 * THE PART OF THE CLOCK THAT IS ACTUALLY ABOUT THE DOM: that it keeps saying
 * the time, and that it stops on its own when nobody is watching.
 *
 * `elapsed-readout.test.ts` in the node suite owns every question about WHAT
 * it says. What is left here cannot be asked of a value — whether an element
 * still in the document gets repainted, and whether one that was removed
 * stops being ticked at all.
 *
 * THE TICKER IS INJECTED AND STEPPED BY HAND. Waiting out real seconds would
 * make this file slow and flaky in exchange for testing the browser's own
 * `setInterval`, which is not the thing at risk. What is at risk is the
 * self-stop, and stepping it by hand is the only way to observe a tick that
 * SHOULD NOT have happened.
 */

/** A ticker whose "interval" is a function this test calls. It also counts its
 * own stops, because "stopped itself" and "never ticked again" are different
 * claims and only one of them is about leaking a timer. */
function manualTicker(): ElapsedReadoutTicker & { fire: () => void; stops: () => number } {
  let scheduled: (() => void) | null = null;
  let stops = 0;
  return {
    start: (tick) => {
      scheduled = tick;
      return 1;
    },
    stop: () => {
      stops += 1;
    },
    fire: () => {
      scheduled?.();
    },
    stops: () => stops,
  };
}

function clockAt(readings: readonly number[]): () => number {
  let index = 0;
  return () => readings[Math.min(index++, readings.length - 1)] ?? 0;
}

let mounted: HTMLElement[] = [];

function mount(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  mounted.push(el);
  return el;
}

afterEach(() => {
  for (const el of mounted) el.remove();
  mounted = [];
  document.getElementById(ELAPSED_READOUT_STYLE_ID)?.remove();
});

describe("the readout on the felt", () => {
  it("says the time at mount, before any tick has happened", () => {
    const el = mount();
    const chronometer = createChronometer({ resumed: false, now: clockAt([0, 0]) });
    startElapsedReadout(el, chronometer, manualTicker());

    expect(el.className).toBe(ELAPSED_READOUT_CLASS);
    expect(el.hidden).toBe(false);
    expect(el.textContent).toBe("0:00");
  });

  it("repaints on every tick while it is on screen", () => {
    const el = mount();
    const ticker = manualTicker();
    // FOUR readings for three paints, and the first two are not a typo: one is
    // the start instant and one is the paint `startElapsedReadout` does before
    // it schedules anything. A fixture that forgot the mount paint would slide
    // every later assertion by one and still look plausible.
    startElapsedReadout(el, createChronometer({ resumed: false, now: clockAt([0, 0, 7000, 65_000]) }), ticker);
    expect(el.textContent).toBe("0:00");

    ticker.fire();
    expect(el.textContent).toBe("0:07");
    ticker.fire();
    expect(el.textContent).toBe("1:05");
  });

  it("stops itself once its element leaves the document, with no teardown call from anybody", () => {
    // THE WHOLE REASON THIS SHAPE EXISTS. `GameUiEntry`'s renderer has no
    // teardown hook, so nothing is ever going to come back and clear this
    // interval — the readout has to notice on its own that the board it was
    // drawn for is gone.
    const el = mount();
    const ticker = manualTicker();
    startElapsedReadout(el, createChronometer({ resumed: false, now: clockAt([0, 1000, 2000, 3000]) }), ticker);

    el.remove();
    ticker.fire();
    expect(ticker.stops()).toBe(1);

    // And a tick that somehow arrives after that changes nothing, rather than
    // repainting an element nobody can see.
    const after = el.textContent;
    ticker.fire();
    expect(el.textContent).toBe(after);
    expect(ticker.stops()).toBe(1);
  });

  it("holds no timer at all for a resumed match", () => {
    // A resumed match has no chronometer BY DESIGN, so there is nothing to
    // count and nothing to schedule. Scheduling a tick that would paint an
    // empty string once a second forever is the shape this rules out.
    const el = mount();
    const ticker = manualTicker();
    const stop = startElapsedReadout(el, null, ticker);

    expect(el.hidden).toBe(true);
    expect(el.textContent).toBe("");
    ticker.fire();
    expect(el.textContent).toBe("");
    // R6: firing a ticker nothing registered with is vacuous unless the stop
    // it returns is also inert, which is what a caller will actually call.
    stop();
    expect(ticker.stops()).toBe(0);
  });

  it("can be stopped by a caller that knows before the DOM does", () => {
    const el = mount();
    const ticker = manualTicker();
    const stop = startElapsedReadout(el, createChronometer({ resumed: false, now: clockAt([0, 9000]) }), ticker);

    stop();
    expect(ticker.stops()).toBe(1);
    stop();
    expect(ticker.stops(), "stopping twice must not clear a handle somebody else now owns").toBe(1);
  });
});

describe("its sheet", () => {
  it("goes in once and does not swallow presses meant for the tiles under it", () => {
    ensureElapsedReadoutStyles(document);
    ensureElapsedReadoutStyles(document);
    expect(document.querySelectorAll(`#${ELAPSED_READOUT_STYLE_ID}`)).toHaveLength(1);

    const el = mount();
    startElapsedReadout(el, createChronometer({ resumed: false, now: clockAt([0, 0]) }), manualTicker());
    expect(getComputedStyle(el).pointerEvents).toBe("none");
    expect(getComputedStyle(el).position).toBe("absolute");
  });
});
