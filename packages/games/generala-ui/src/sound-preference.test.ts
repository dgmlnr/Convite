import { describe, expect, it } from "vitest";
import { readSoundPreference, writeSoundPreference } from "./sound-preference.js";
import type { SoundStorage } from "./sound-preference.js";

/** A `Map`-backed double, which is all `SoundStorage` was declared for — the
 * same shape `identity-storage.test.ts` uses next door, and the reason
 * neither module reads a global. */
function fakeStorage(seed?: Record<string, string>): SoundStorage & { readonly entries: Map<string, string> } {
  const entries = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
  };
}

/** A browser that blocks site data outright: touching the property throws,
 * which is the case `identity-storage.ts` records as real and NOT merely a
 * failing read. */
const hostileWindow = {
  get localStorage(): SoundStorage {
    throw new Error("the user blocked all site data");
  },
};

describe("sound preference: the default is on, and it survives a reload", () => {
  /**
   * THE PRODUCT DECISION, ASSERTED. `sound-preference.ts`'s own docblock has
   * the whole argument; this is the one line of it a test can hold. Note what
   * it is NOT: "the widget makes a noise on load". `dice-sound.ts` never
   * builds an `AudioContext` outside a real press, so on-by-default means
   * "on once you have touched it", and `tray.browser.test.ts` is where that
   * half is measured.
   */
  it("is not muted when nothing has ever been stored", () => {
    expect(readSoundPreference({ localStorage: fakeStorage() })).toBe(false);
  });

  it("remembers a mute across loads", () => {
    const storage = fakeStorage();
    writeSoundPreference({ localStorage: storage }, true);
    expect(readSoundPreference({ localStorage: storage })).toBe(true);
  });

  it("remembers turning it back on, rather than falling back to the default", () => {
    const storage = fakeStorage();
    writeSoundPreference({ localStorage: storage }, true);
    writeSoundPreference({ localStorage: storage }, false);
    expect(readSoundPreference({ localStorage: storage })).toBe(false);
  });

  /** Namespaced with the same prefix the anonymous player id already uses, so
   * everything this product leaves in a tenant's storage is findable under
   * one string. */
  it("writes under the product's own convite: namespace", () => {
    const storage = fakeStorage();
    writeSoundPreference({ localStorage: storage }, true);
    expect([...storage.entries.keys()]).toEqual(["convite:dice-muted"]);
  });
});

describe("sound preference: storage that is missing or hostile is never a defect", () => {
  it.each([
    ["no window at all", null],
    ["a window with no localStorage", {}],
  ] as const)("reads the default from %s", (_case, windowLike) => {
    expect(readSoundPreference(windowLike)).toBe(false);
  });

  it("reads the default from a browser that throws on the property itself", () => {
    expect(readSoundPreference(hostileWindow)).toBe(false);
  });

  /**
   * A WRITE THAT FAILS MUST NOT BREAK A PRESS. This is the half that would
   * otherwise turn a blocked-storage browser into a board where pressing the
   * sound control throws — the same failure `identity-storage.ts` absorbs for
   * the player id, and it absorbs it because it happened.
   */
  it.each([
    ["no window at all", null],
    ["a window with no localStorage", {}],
    ["a browser that throws on the property itself", hostileWindow],
  ] as const)("writes into %s without throwing", (_case, windowLike) => {
    expect(() => {
      writeSoundPreference(windowLike, true);
    }).not.toThrow();
  });

  /**
   * THE ANTI-VACUITY CONTROL for the three cases above: the double really
   * does record a write, so "did not throw" is not the same sentence as "did
   * nothing anywhere".
   */
  it("really does write when storage works, so the cases above mean something", () => {
    const storage = fakeStorage();
    writeSoundPreference({ localStorage: storage }, true);
    expect(storage.entries.size).toBe(1);
  });

  /** Anything that is not the stored "on" marker reads as not-muted, which is
   * what makes a corrupted or half-written value degrade to the default
   * rather than to an unpredictable state. */
  it.each(["0", "", "true", "yes", "maybe"])("reads %o as not muted", (stored) => {
    expect(readSoundPreference({ localStorage: fakeStorage({ "convite:dice-muted": stored }) })).toBe(false);
  });
});
