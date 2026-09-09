/**
 * THE ONLY SOUND IN THIS PRODUCT, AND IT SHIPS NO BYTES OF AUDIO.
 *
 * Nothing in these four games has ever made a noise. This is the first, and
 * what it makes is the one sound the product owner asked for by name — «un
 * sonido de revolver dados».
 *
 * SYNTHESIZED, NOT A FILE, and the reason is the same budget every other
 * decision in this package answers to. A rattle is a stream of short, sharp
 * transients over a body of filtered noise; that is a description a browser
 * can execute in a few hundred bytes of code, where the shortest honest
 * recording of it is tens of kilobytes a tenant's visitor downloads. The
 * bundle is measured on every push (`scripts/bundle-budget.mjs`) precisely
 * because things like this arrive one at a time.
 *
 * NO ENTROPY, IN A PACKAGE THAT HAS NEVER HAD ANY. `dice-ui` calls
 * `Math.random` in no file, and the reason is load-bearing rather than
 * stylistic: the face a die lands on is decided by `generala-module` through
 * the platform's one entropy door, counted call by call, and this package
 * exists downstream of that decision to draw it. A sound is theatre for the
 * identical reason the toss is.
 *
 * That is a real constraint here, because noise is what a rattle is MADE of.
 * It is met by making the noise a CONSTANT — one that is computed rather than
 * typed out, byte-identical on every load and every machine, exactly as
 * `FACE_ROTATION` is a table rather than a calculation about a die.
 * `no-entropy.test.ts` scans this package's own source for every way a
 * program can ask for a random number, and `dice-sound.browser.test.ts`
 * builds the buffer twice and compares it sample for sample.
 *
 * IT NEVER QUEUES AND IT NEVER THROWS. Every call below is allowed to do
 * nothing: no `AudioContext` in this browser, a context the autoplay policy
 * is still holding suspended, a player who has muted it. The answer in all
 * three is silence, right now, with no retry and no promise anybody has to
 * handle — a game that stalled or logged because a sound effect did not play
 * would be a far worse defect than the missing sound.
 */

/**
 * The two things this needs from a real `Window`, declared structurally so a
 * test can hand it a double — the same `StorageLike`/`FetchLike` convention
 * `identity-storage.ts` and `match-flow.ts` already use, and the reason this
 * module reads no global directly: `node-import.test.ts` proves every export
 * of this package is importable with no DOM at all.
 */
export interface DiceSoundWindow {
  readonly AudioContext?: typeof AudioContext;
}

export interface DiceSound {
  /**
   * MUST BE CALLED FROM INSIDE A REAL USER GESTURE, and everything about the
   * autoplay policy is concentrated in this one method.
   *
   * A browser starts an `AudioContext` created outside a user gesture in the
   * `suspended` state and keeps it there; `resume()` inside a handler for a
   * genuine press is what moves it to `running`, and once it is running it
   * stays running — later scheduling needs no further gesture. So this is
   * called from the press, and the sounds themselves are played from a
   * server broadcast hundreds of milliseconds later.
   *
   * NOTHING HERE DEPENDS ON THAT POLICY BEING TRUE. `rattle` and `tumble`
   * check `state === "running"` and otherwise do nothing at all, so a browser
   * with a stricter policy, a looser one, or a headless flag that disables it
   * entirely all behave correctly without this file knowing which. What the
   * policy buys is a PROPERTY rather than a mechanism: a widget nobody has
   * pressed has never created a context, so it is silent by construction.
   */
  unlock(): void;
  /** Dice being worked inside the cup. Loops itself for about three seconds
   * and then stops; `stop()` ends it sooner. */
  rattle(): void;
  /** Dice leaving the cup and coming to rest on the table. */
  tumble(): void;
  /** Cuts whatever is sounding, immediately. */
  stop(): void;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
}

/**
 * ONE WAVEFORM, COMPUTED ONCE — this package's noise, and the whole of it.
 *
 * A xorshift32 walk seeded with a fixed constant. It is deliberately NOT a
 * random number generator being used as one: nothing here consumes it as a
 * choice, it is never reseeded, and for a buffer of any given length it
 * produces the identical samples on every load in every browser — measured,
 * in `dice-sound.browser.test.ts`, by filling two of them and comparing.
 * (The buffer's LENGTH does depend on the device's own sample rate, which is
 * why the fence compares two fills rather than pinning a count.) Writing
 * those tens of thousands of samples out as a literal would be the same
 * constant and hundreds of kilobytes larger, which is the bundle budget's
 * answer to why this is a loop.
 */
const NOISE_SECONDS = 0.4;
const NOISE_SEED = 0x9e3779b9;

export function fillDeterministicNoise(samples: Float32Array): void {
  let state = NOISE_SEED;
  for (let i = 0; i < samples.length; i++) {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    samples[i] = (state / 0xffffffff) * 2 - 1;
  }
}

/** One transient: where in the burst it lands, what it is centred on, how
 * loud, and how fast it dies. A die striking leather or wood is almost all
 * attack and almost no tail, which is what the very short decays below are.
 *
 * EXPORTED FOR A FENCE, the same way `buildDiceStylesheet` is: the claims
 * this file makes in prose about the SHAPE of each burst — a rattle that
 * takes 84 ticks to repeat, a pour whose gaps grow and whose gains fall —
 * are exactly the claims a reader would want checked, and they are checkable
 * against these tables and against nothing else. What a browser does with
 * them afterwards is a real audio graph and is not something a test can
 * listen to. */
export interface Tick {
  readonly atMs: number;
  readonly hz: number;
  readonly gain: number;
  readonly decayMs: number;
}

/**
 * THE RATTLE'S IRREGULARITY, AS TWO CYCLES THAT DO NOT DIVIDE EACH OTHER.
 *
 * Dice in a cup do not click on a beat, and a rattle that does sounds like a
 * machine within about two repetitions — which matters here because this
 * loops for as long as the table is waiting. The cheap, entropy-free way to
 * an irregular stream is two fixed cycles of COPRIME length walked together:
 * twelve gaps and seven pitches take 84 ticks to come back into phase, which
 * at these gaps is about three seconds. Nobody waits that long for a roll.
 */
const RATTLE_GAPS_MS: readonly number[] = [26, 41, 19, 58, 31, 22, 47, 35, 17, 63, 29, 38];
const RATTLE_HZ: readonly number[] = [2400, 3100, 1900, 2750, 3400, 2150, 2900];
export const RATTLE_CYCLE = { gaps: RATTLE_GAPS_MS.length, pitches: RATTLE_HZ.length } as const;
const RATTLE_TICKS = RATTLE_GAPS_MS.length * RATTLE_HZ.length;

export function rattleTicks(): readonly Tick[] {
  const ticks: Tick[] = [];
  let atMs = 0;
  for (let i = 0; i < RATTLE_TICKS; i++) {
    atMs += RATTLE_GAPS_MS[i % RATTLE_GAPS_MS.length]!;
    // Alternating strength rather than a flat stream: a shaken cup throws its
    // dice against the far wall harder than they fall back.
    ticks.push({ atMs, hz: RATTLE_HZ[i % RATTLE_HZ.length]!, gain: i % 3 === 0 ? 0.5 : 0.28, decayMs: 26 });
  }
  return ticks;
}

/**
 * THE POUR, WHICH IS THE OPPOSITE SHAPE TO THE RATTLE.
 *
 * A rattle is even because a hand keeps working; dice landing are a burst
 * that thins out — several strikes at once as they hit, then fewer and
 * quieter as each one rolls to a stop. So the gaps GROW and the gains fall,
 * and the first two ticks are lower and louder: five dice hitting felt at
 * nearly the same instant read as one soft thud rather than five clicks.
 */
export const TUMBLE_TICKS: readonly Tick[] = [
  { atMs: 0, hz: 320, gain: 0.55, decayMs: 90 },
  { atMs: 14, hz: 1500, gain: 0.5, decayMs: 34 },
  { atMs: 33, hz: 2600, gain: 0.45, decayMs: 28 },
  { atMs: 72, hz: 2100, gain: 0.4, decayMs: 26 },
  { atMs: 128, hz: 3000, gain: 0.34, decayMs: 24 },
  { atMs: 205, hz: 2300, gain: 0.27, decayMs: 22 },
  { atMs: 310, hz: 2800, gain: 0.2, decayMs: 20 },
  { atMs: 448, hz: 2500, gain: 0.14, decayMs: 18 },
  { atMs: 620, hz: 3200, gain: 0.09, decayMs: 16 },
];

/** How loud the whole thing is against everything else on the page. Low on
 * purpose: this is a widget inside somebody else's site, and a sound effect
 * that arrives at the same level as the host's own media is an intrusion
 * whatever the volume knob says. */
const MASTER_GAIN = 0.34;

export function createDiceSound(windowLike: DiceSoundWindow, initiallyMuted: boolean): DiceSound {
  let muted = initiallyMuted;
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let voices: AudioBufferSourceNode[] = [];

  /**
   * Builds the context the first time anything asks, and never again. A
   * browser with no `AudioContext` and one that refuses to construct a fifth
   * of them both land in the same place: `null`, forever, silently.
   */
  const ensureContext = (): AudioContext | null => {
    if (context !== null) return context;
    const Ctor = windowLike.AudioContext;
    if (Ctor === undefined) return null;
    try {
      context = new Ctor();
    } catch {
      return null;
    }
    noise = context.createBuffer(1, Math.floor(context.sampleRate * NOISE_SECONDS), context.sampleRate);
    fillDeterministicNoise(noise.getChannelData(0));
    master = context.createGain();
    master.gain.value = MASTER_GAIN;
    master.connect(context.destination);
    return context;
  };

  const silence = (): void => {
    for (const voice of voices) {
      // A source that has already finished throws nothing on `stop()`, but a
      // browser is entitled to disagree about a source in some other state,
      // and a sound effect must never be the thing that breaks a turn.
      try {
        voice.stop();
      } catch {
        /* already over, which is the outcome this wanted anyway */
      }
    }
    voices = [];
  };

  const play = (ticks: readonly Tick[]): void => {
    const ctx = context;
    if (ctx === null || master === null || noise === null) return;
    const startAt = ctx.currentTime;
    for (const tick of ticks) {
      const at = startAt + tick.atMs / 1000;
      const source = ctx.createBufferSource();
      source.buffer = noise;
      // A DIFFERENT SLICE OF THE SAME BUFFER PER TICK, so two ticks at the
      // same pitch are not the identical waveform twice — the thing that
      // makes a synthesized stream read as a loop rather than as an object.
      const offset = ((tick.atMs % 97) / 97) * (NOISE_SECONDS / 2);

      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = tick.hz;
      band.Q.value = 1.4;

      const envelope = ctx.createGain();
      // A hard attack and an exponential fall — the shape of something struck.
      // `exponentialRampToValueAtTime` refuses a target of zero, so it ramps
      // to an inaudible floor and the source's own `stop` does the rest.
      envelope.gain.setValueAtTime(tick.gain, at);
      envelope.gain.exponentialRampToValueAtTime(0.0001, at + tick.decayMs / 1000);

      source.connect(band);
      band.connect(envelope);
      envelope.connect(master);
      source.start(at, offset, tick.decayMs / 1000);
      source.stop(at + tick.decayMs / 1000);
      voices.push(source);
      source.onended = (): void => {
        voices = voices.filter((voice) => voice !== source);
      };
    }
  };

  /** Silence is the answer to every one of these, and none of them is an
   * error: no audio in this browser, a context the page has not earned the
   * right to sound through yet, or a player who asked for quiet. */
  const canSound = (): boolean => !muted && context !== null && context.state === "running";

  return {
    unlock(): void {
      if (muted) return;
      const ctx = ensureContext();
      if (ctx === null) return;
      // A rejected `resume()` is the autoplay policy declining, which is a
      // legitimate answer and never something to surface. `void` plus a
      // swallowing catch is what keeps it from becoming an unhandled
      // rejection in a tenant's console.
      void ctx.resume().catch(() => undefined);
    },
    rattle(): void {
      if (!canSound()) return;
      silence();
      play(rattleTicks());
    },
    tumble(): void {
      if (!canSound()) return;
      silence();
      play(TUMBLE_TICKS);
    },
    stop(): void {
      silence();
    },
    setMuted(next: boolean): void {
      muted = next;
      if (muted) silence();
    },
    isMuted(): boolean {
      return muted;
    },
  };
}
