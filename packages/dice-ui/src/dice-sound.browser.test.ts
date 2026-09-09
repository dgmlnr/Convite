import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import { createDiceSound, fillDeterministicNoise, RATTLE_CYCLE, rattleTicks, TUMBLE_TICKS } from "./dice-sound.js";
import type { DiceSoundWindow } from "./dice-sound.js";

/**
 * A REAL `AudioContext`, not a mock of one, wherever the answer depends on
 * the browser — which here is almost everywhere. The interesting claims in
 * `dice-sound.ts` are about a real audio graph and a real autoplay policy,
 * and a double would only ever confirm the shape of the calls this file
 * already makes.
 *
 * THE AUTOPLAY POLICY IS REAL IN THIS HARNESS, and that was checked rather
 * than assumed — it is the reason half this file is shaped the way it is.
 * The first draft asserted nothing about it, on the theory that a headless
 * Chromium might have it disabled by a flag and the test's colour would
 * depend on the browser rather than on this code. Then a fence that needed a
 * RUNNING context sat at `suspended` through four hundred milliseconds of
 * polling, which answered the question: this browser enforces it.
 *
 * So the policy is asserted, with a real Playwright-driven press
 * (`userEvent.click`, which dispatches a trusted event where a synthetic
 * `.click()` does not) — and `dice-sound.ts` still never depends on it,
 * because every entry point checks `state === "running"` and otherwise does
 * nothing. A browser with a stricter policy, a looser one, or none at all
 * behaves correctly either way. What the policy buys is not a mechanism but
 * a PROPERTY: a widget nobody has pressed is silent by construction.
 */

const realWindow: DiceSoundWindow = { AudioContext: window.AudioContext };

/** A browser with no Web Audio at all — old, locked down, or a Node-side
 * render. Structural rather than mocked, which is the whole reason
 * `DiceSoundWindow` is two optional properties instead of a global read. */
const silentWindow: DiceSoundWindow = {};

/**
 * A REAL `AudioContext` THAT COUNTS WHAT PASSES THROUGH IT — a subclass, not
 * a mock, so everything under it is still the browser's own audio graph and
 * only the bookkeeping is ours.
 *
 * It exists because the interesting promises this module makes are about
 * things that leave no trace an assertion can reach: a rattle that stops, a
 * gesture that schedules nothing. `createBufferSource` is the one call every
 * voice goes through, so wrapping it is what turns "did it stop" from an
 * opinion into a number.
 */
function spyingWindow(): { readonly windowLike: DiceSoundWindow; readonly context: () => AudioContext | null; readonly created: () => number; readonly stopped: () => number } {
  let created = 0;
  let stopped = 0;
  let built: AudioContext | null = null;
  class Counting extends window.AudioContext {
    constructor() {
      super();
      // The widened annotation is what `no-this-alias` accepts here; it is
      // the same object either way, and a subclass instance is trivially its
      // own base type. Recording it is the only way a test can ask the
      // context this module built what state it is in.
      built = this as AudioContext;
    }
    override createBufferSource(): AudioBufferSourceNode {
      const node = super.createBufferSource();
      created++;
      const realStop = node.stop.bind(node);
      node.stop = (when?: number): void => {
        stopped++;
        realStop(when);
      };
      return node;
    }
  }
  return { windowLike: { AudioContext: Counting }, context: () => built, created: () => created, stopped: () => stopped };
}

const closing: AudioContext[] = [];
afterEach(async () => {
  // A browser caps how many audio contexts one page may hold, and this file
  // builds one per case. Closing them keeps the last tests in the file from
  // failing for a reason none of them is about.
  while (closing.length > 0) await closing.pop()!.close().catch(() => undefined);
});

/**
 * A REAL, TRUSTED PRESS — `userEvent.click` drives Playwright's own input,
 * where a synthetic `element.click()` produces an untrusted event the
 * autoplay policy correctly ignores. This is the only way to get a running
 * context in this harness, and proving that is itself one of the cases below.
 */
async function pressToUnlock(sound: { unlock: () => void }): Promise<void> {
  const button = document.createElement("button");
  button.textContent = "unlock";
  button.addEventListener("click", () => {
    sound.unlock();
  });
  document.body.appendChild(button);
  await userEvent.click(button);
  button.remove();
}

/**
 * Waits for a context to actually reach `running`. `resume()` is
 * asynchronous and this harness gives no user gesture to hang it on, so
 * "one animation frame" was not reliably enough — the first draft of the
 * mute fence below read zero scheduled voices for exactly that reason and
 * looked like a defect in `silence()`.
 */
async function running(context: AudioContext | null): Promise<boolean> {
  for (let attempt = 0; attempt < 40 && context !== null && context.state !== "running"; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return context?.state === "running";
}

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

  /**
   * TWO DIFFERENT LENGTHS, and the first version of this fence did not have
   * them. It filled two buffers of the SAME size and compared — which a walk
   * seeded from `NOISE_SEED + samples.length` passes perfectly, MEASURED by
   * planting exactly that. A device's sample rate decides how long this
   * buffer is (`NOISE_SECONDS * ctx.sampleRate`), so a seed that drifted with
   * length would give a 44.1kHz machine and a 48kHz one two different sounds
   * while every assertion stayed green.
   */
  it("starts from the same place whatever length it is asked for", () => {
    const short = new Float32Array(2048);
    const long = new Float32Array(8192);
    fillDeterministicNoise(short);
    fillDeterministicNoise(long);
    expect(long.slice(0, short.length)).toEqual(short);
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

  /**
   * THE AUTOPLAY POLICY, MEASURED IN THIS BROWSER RATHER THAN QUOTED FROM A
   * SPEC — and it is the single fact the whole «default on» decision leans on.
   * `unlock()` called with no gesture behind it builds a context and cannot
   * start it; the same call inside a trusted press does. That is what makes
   * "a widget nobody has touched is silent" a property of the platform and
   * not a promise this code is making about itself.
   */
  it("cannot start a context outside a user gesture, and can inside one", async () => {
    const idle = spyingWindow();
    const quiet = createDiceSound(idle.windowLike, false);
    quiet.unlock();
    const built = idle.context();
    expect(built, "the context is built either way — it is STARTING it the policy gates").not.toBeNull();
    closing.push(built!);
    expect(await running(built), "no gesture, so nothing should have started").toBe(false);
    quiet.rattle();
    expect(idle.created(), "and a suspended context schedules nothing at all").toBe(0);

    const pressed = spyingWindow();
    const loud = createDiceSound(pressed.windowLike, false);
    await pressToUnlock(loud);
    closing.push(pressed.context()!);
    expect(await running(pressed.context()), "a real press is what starts it").toBe(true);
    loud.rattle();
    expect(pressed.created(), "and now it schedules a voice per tick").toBe(rattleTicks().length);
  });

  /**
   * WHAT `resume()` IS ACTUALLY FOR, and it took a mutation to find out.
   *
   * Deleting the `resume()` call left every assertion green, which looked
   * like an unfenced line and turned out to be a fact about browsers: a
   * context CONSTRUCTED during user activation starts `running` on its own.
   * Since `unlock()` is the only thing that ever builds one, and it is only
   * ever called from a press, the first `resume()` in a session is genuinely
   * a no-op.
   *
   * It is not a no-op later. A browser suspends a running context on its own
   * — a backgrounded tab, an OS audio change — and the player who comes back
   * and presses "Tirar" is on exactly the path this fences: the context
   * already exists, so nothing constructs a fresh running one, and
   * `resume()` is the whole of what brings it back. Without it, a player who
   * switched tabs once would get a silent game for the rest of the match and
   * nothing anywhere would say why.
   */
  it("brings a context back after the browser has suspended it", async () => {
    const spy = spyingWindow();
    const sound = createDiceSound(spy.windowLike, false);
    await pressToUnlock(sound);
    const context = spy.context();
    closing.push(context!);
    expect(await running(context), "a press starts it").toBe(true);

    // What a backgrounded tab does to it.
    await context!.suspend();
    expect(context!.state).toBe("suspended");
    sound.rattle();
    expect(spy.created(), "a suspended context schedules nothing").toBe(0);

    // And the next press is what has to bring it back.
    await pressToUnlock(sound);
    expect(await running(context), "the next press must resume it").toBe(true);
    sound.rattle();
    expect(spy.created()).toBe(rattleTicks().length);
  });
});

describe("dice sound: muted means muted", () => {
  it("starts muted when it is told to, and builds no context at all while it is", async () => {
    const spy = spyingWindow();
    const sound = createDiceSound(spy.windowLike, true);
    expect(sound.isMuted()).toBe(true);
    // A REAL PRESS, and still nothing. Muting is a request for less, not a
    // reason to go and construct the machinery: a player who silenced the
    // dice must not have an audio context built for them by their next tap.
    await pressToUnlock(sound);
    sound.rattle();
    sound.tumble();
    expect(spy.context(), "muted means the machinery is never even built").toBeNull();
    expect(spy.created()).toBe(0);
  });

  /**
   * MUTING MID-RATTLE CUTS IT, rather than letting the burst already
   * scheduled ring on for three seconds. A mute control that takes effect
   * "from the next sound" is the shape of a control somebody presses twice
   * and then gives up on.
   */
  it("cuts a rattle that is already sounding", async () => {
    const spy = spyingWindow();
    const sound = createDiceSound(spy.windowLike, false);
    await pressToUnlock(sound);
    closing.push(spy.context()!);
    expect(await running(spy.context()), "expected a real press to start the context").toBe(true);
    sound.rattle();
    expect(spy.created(), "expected a rattle to have scheduled voices").toBeGreaterThan(0);

    // A `not.toThrow()` here was the whole assertion once, and it was green
    // with `silence()` deleted — MEASURED by deleting it. Nothing about a
    // rattle is observable from outside this module, so the seam it is
    // injected through is what has to do the observing: every voice this
    // schedules is a `BufferSource`, and cutting one means calling `stop` on
    // it a second time, now, rather than at the end it was already given.
    const stoppedBefore = spy.stopped();
    sound.setMuted(true);
    expect(spy.stopped(), "muting must stop every voice already in flight").toBeGreaterThan(stoppedBefore);
    expect(sound.isMuted()).toBe(true);

    const afterMute = spy.created();
    sound.rattle();
    expect(spy.created(), "and it schedules nothing new while muted").toBe(afterMute);
  });

  /**
   * THE POUR CUTS THE RATTLE, which is the one place `play`'s own `silence()`
   * is load-bearing rather than symmetric. A rattle is scheduled about three
   * seconds ahead and the dice land inside the first half-second of it, so
   * without this the cup would go on being shaken over the top of five dice
   * already lying on the table.
   */
  it("cuts the rattle when the dice land on top of it", async () => {
    const spy = spyingWindow();
    const sound = createDiceSound(spy.windowLike, false);
    await pressToUnlock(sound);
    closing.push(spy.context()!);
    expect(await running(spy.context())).toBe(true);

    sound.rattle();
    const rattleVoices = spy.created();
    expect(rattleVoices).toBe(rattleTicks().length);
    const stoppedBefore = spy.stopped();

    sound.tumble();
    // Every voice the rattle had in flight is stopped, on top of the ends the
    // pour's own voices are scheduled with.
    expect(spy.stopped() - stoppedBefore).toBeGreaterThanOrEqual(rattleVoices);
    expect(spy.created()).toBe(rattleVoices + TUMBLE_TICKS.length);
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
