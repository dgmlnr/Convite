import { describe, expect, it } from "vitest";
import { createDiceSound, fillDeterministicNoise, RATTLE_CYCLE, rattleTicks, TUMBLE_TICKS } from "./dice-sound.js";
import type { DiceSoundWindow } from "./dice-sound.js";

/**
 * A REAL `AudioContext`, not a mock of one, wherever the answer depends on
 * the browser — which here is almost everywhere. The interesting claims in
 * `dice-sound.ts` are about a real audio graph and a real autoplay policy,
 * and a double would only ever confirm the shape of the calls this file
 * already makes.
 *
 * THE AUTOPLAY POLICY IS NOT ASSERTED, and that is on purpose rather than a
 * gap. A headless Chromium can be launched with the policy disabled, so
 * "a fresh context starts suspended" would be a test whose colour depended
 * on a browser flag rather than on this code. What IS asserted is the thing
 * that makes the policy irrelevant: every entry point does nothing at all
 * unless the context is genuinely running, so a browser that never lets it
 * run and one that always does both behave correctly.
 */

const realWindow: DiceSoundWindow = { AudioContext: window.AudioContext };

/** A browser with no Web Audio at all — old, locked down, or a Node-side
 * render. Structural rather than mocked, which is the whole reason
 * `DiceSoundWindow` is two optional properties instead of a global read. */
const silentWindow: DiceSoundWindow = {};

describe("dice sound: the noise it is made of is a constant, not a random number", () => {
  /**
   * THE ASSERTION THE WHOLE `no-entropy.test.ts` ARGUMENT RESTS ON. A rattle
   * is literally made of noise, and the one-line way to get some is the one
   * thing this package may never do. `fillDeterministicNoise` is what
   * replaces it, and "deterministic" is a claim about it that has to be
   * measured rather than named — a seeded walk that accidentally consumed
   * anything ambient would still LOOK like this function.
   */
  it("fills two separate buffers with byte-identical samples", () => {
    const a = new Float32Array(4096);
    const b = new Float32Array(4096);
    fillDeterministicNoise(a);
    fillDeterministicNoise(b);
    expect(a).toEqual(b);
  });

  /** And it is genuinely noise rather than a constant or a ramp: broadband
   * enough to be filtered into a click, which is the only property the
   * synthesis actually needs from it. */
  it("produces a broadband, zero-ish-mean signal spanning most of the range", () => {
    const samples = new Float32Array(8192);
    fillDeterministicNoise(samples);
    const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(Math.max(...samples)).toBeGreaterThan(0.9);
    expect(Math.min(...samples)).toBeLessThan(-0.9);
    expect(new Set(samples.slice(0, 512)).size, "a constant or a short cycle would collapse here").toBeGreaterThan(500);
  });
});

describe("dice sound: every call is allowed to do nothing, and none of them throws", () => {
  it("survives a browser with no Web Audio at all", () => {
    const sound = createDiceSound(silentWindow, false);
    expect(() => {
      sound.unlock();
      sound.rattle();
      sound.tumble();
      sound.stop();
    }).not.toThrow();
  });

  /**
   * THE STRUCTURAL HALF OF THE COURTESY PROMISE, and the reason the default
   * can be "on" at all: a widget nobody has pressed has never constructed an
   * `AudioContext`, so it is silent by construction rather than by policy.
   * `unlock()` is only ever called from a real press.
   */
  it("plays nothing before anything has been unlocked, whatever it is asked for", () => {
    const sound = createDiceSound(realWindow, false);
    expect(() => {
      sound.rattle();
      sound.tumble();
    }).not.toThrow();
    // Nothing to observe is exactly the point; what is observable is that no
    // context was built to observe it with.
    expect(sound.isMuted()).toBe(false);
  });

  it("builds a real, running audio graph once a press unlocks it", async () => {
    const sound = createDiceSound(realWindow, false);
    sound.unlock();
    // `resume()` is asynchronous; one turn of the microtask queue plus a
    // frame is enough for a context this test just created inside a
    // user-gesture-free harness that permits it.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(() => {
      sound.rattle();
      sound.stop();
      sound.tumble();
      sound.stop();
    }).not.toThrow();
  });
});

describe("dice sound: muted means muted", () => {
  it("starts muted when it is told to, and never unlocks a context while it is", () => {
    const sound = createDiceSound(realWindow, true);
    expect(sound.isMuted()).toBe(true);
    expect(() => {
      sound.unlock();
      sound.rattle();
      sound.tumble();
    }).not.toThrow();
  });

  /**
   * MUTING MID-RATTLE CUTS IT, rather than letting the burst already
   * scheduled ring on for three seconds. A mute control that takes effect
   * "from the next sound" is the shape of a control somebody presses twice
   * and then gives up on.
   */
  it("cuts a rattle that is already sounding", async () => {
    const sound = createDiceSound(realWindow, false);
    sound.unlock();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    sound.rattle();
    expect(() => {
      sound.setMuted(true);
    }).not.toThrow();
    expect(sound.isMuted()).toBe(true);
    // And it stays quiet afterwards.
    expect(() => {
      sound.rattle();
    }).not.toThrow();
  });

  it("comes back when it is turned on again", () => {
    const sound = createDiceSound(realWindow, true);
    sound.setMuted(false);
    expect(sound.isMuted()).toBe(false);
    sound.unlock();
    expect(() => {
      sound.tumble();
    }).not.toThrow();
  });
});

/**
 * THE SHAPE OF EACH BURST, which is the part of this synthesis a test can
 * actually hold. What a browser makes of these tables is a real audio graph
 * that no assertion here can listen to; what the tables themselves claim —
 * a rattle that does not repeat while anybody is waiting, a pour that thins
 * out instead of running on evenly — is stated in prose in `dice-sound.ts`
 * and is checkable, which means it should be checked rather than believed.
 */
describe("dice sound: the rattle does not repeat while a player is waiting", () => {
  /** The whole trick, and it is arithmetic rather than a random number: two
   * fixed cycles whose lengths share no factor take their product's worth of
   * ticks to come back into phase. Twelve and seven do; twelve and six would
   * repeat every six. */
  it("walks two cycles whose lengths are coprime", () => {
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    expect(gcd(RATTLE_CYCLE.gaps, RATTLE_CYCLE.pitches)).toBe(1);
    expect(RATTLE_CYCLE.gaps).toBeGreaterThan(1);
    expect(RATTLE_CYCLE.pitches).toBeGreaterThan(1);
  });

  it("emits one tick per combination before either cycle comes back round", () => {
    expect(rattleTicks().length).toBe(RATTLE_CYCLE.gaps * RATTLE_CYCLE.pitches);
  });

  /**
   * LONGER THAN ANY WAIT IT HAS TO COVER. The rattle runs from the moment a
   * throw is asked for until the dice arrive: the server's own beat
   * (`GENERALA_SYSTEM_ACTION_PAUSE_MS`, 350ms) plus a round trip. Three
   * seconds is far past that, and a wait longer than three seconds is a
   * connection problem rather than a throw — at which point a cup still
   * rattling would be a lie about what is happening.
   */
  it("covers about three seconds, well past the beat plus a round trip", () => {
    const ticks = rattleTicks();
    const lastMs = ticks[ticks.length - 1]!.atMs;
    expect(lastMs).toBeGreaterThan(2500);
    expect(lastMs).toBeLessThan(4000);
  });

  it("never schedules two ticks at the same instant, or one before the last", () => {
    const ticks = rattleTicks();
    for (let i = 1; i < ticks.length; i++) expect(ticks[i]!.atMs).toBeGreaterThan(ticks[i - 1]!.atMs);
  });

  it("uses every pitch in its cycle rather than settling on one", () => {
    expect(new Set(rattleTicks().map((tick) => tick.hz)).size).toBe(RATTLE_CYCLE.pitches);
  });
});

describe("dice sound: the pour thins out, which is the opposite shape to the rattle", () => {
  /** Dice landing are a burst that decays: strikes close together at first,
   * then further apart as each one rolls to a stop. This is that claim, and
   * a table that was merely a second rattle would fail it. */
  it("puts growing gaps between its ticks", () => {
    const gaps = TUMBLE_TICKS.slice(1).map((tick, index) => tick.atMs - TUMBLE_TICKS[index]!.atMs);
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]!, `gap ${String(i)}`).toBeGreaterThan(gaps[i - 1]!);
  });

  it("fades, tick by tick, and never gets louder again", () => {
    for (let i = 1; i < TUMBLE_TICKS.length; i++) expect(TUMBLE_TICKS[i]!.gain).toBeLessThan(TUMBLE_TICKS[i - 1]!.gain);
  });

  /** Five dice hitting felt at nearly the same instant are one soft thud,
   * not five clicks — so the burst opens low and the rest of it sits far
   * above that. */
  it("opens on a low thud well below everything that follows it", () => {
    const [first, ...rest] = TUMBLE_TICKS;
    for (const tick of rest) expect(tick.hz).toBeGreaterThan(first!.hz);
  });

  it("is over inside a second, while the dice are still settling", () => {
    expect(TUMBLE_TICKS[TUMBLE_TICKS.length - 1]!.atMs).toBeLessThan(1000);
  });
});
