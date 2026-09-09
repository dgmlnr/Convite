/**
 * WHETHER THE DICE MAKE A NOISE, REMEMBERED BETWEEN LOADS.
 *
 * THE DEFAULT IS ON, AND THAT IS A PRODUCT DECISION RATHER THAN A SHRUG.
 *
 * The obvious argument for OFF is the strongest one anybody makes about
 * embedded widgets, and it is right: a page that starts making noise at
 * somebody who merely loaded it is the most disliked behaviour on the web,
 * and it is the TENANT's reputation that pays for it, not ours. Defaulting a
 * sound to on is normally how that happens.
 *
 * It cannot happen here, and the reason is structural rather than a promise.
 * `dice-sound.ts` never constructs an `AudioContext` except inside
 * `unlock()`, and `tray.ts` calls `unlock()` from exactly two places: the
 * press of a die and the press of the throw control. Both are real user
 * gestures on this widget's own surface. A visitor who scrolled past a game
 * they never touched has no audio context to make a sound through — not
 * because a preference says so, but because nothing ever built one. The
 * browser's own autoplay policy independently enforces the same thing, so
 * this is aligned with it rather than fighting it.
 *
 * What is left, once "makes noise at a stranger" is off the table, is a
 * player who deliberately pressed a cubilete and heard dice. That is the
 * thing that was asked for. Defaulting it off would mean every player gets
 * the silent version and only the ones who go looking find the feature —
 * which for a sound effect on a dice game is the same as not shipping it.
 *
 * SO THE HONEST STATEMENT OF THE DEFAULT IS NOT "ON". It is: SILENT UNTIL
 * YOU TOUCH IT, THEN ON, AND OFF FOR GOOD IN ONE PRESS. The control sits
 * beside the cubilete making the noise, and this module is what makes the
 * "for good" true.
 *
 * `prefers-reduced-motion` DELIBERATELY DOES NOT REACH THIS. That query is
 * about vestibular tolerance and says nothing about noise; a player who
 * suppresses motion has lost MORE of the throw than anybody and has more use
 * for hearing it, not less. Two different needs, two different controls.
 */

/** The shape this needs from `window.localStorage` — the same structural
 * double `identity-storage.ts` declares for itself, and for the same reason:
 * a plain `Map`-backed object satisfies it in a test with no browser. */
export interface SoundStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Namespaced with the same `convite:` prefix `identity-storage.ts` already
 * uses for the anonymous player id, so everything this product leaves in a
 * tenant's storage is findable under one string. */
const MUTED_KEY = "convite:dice-muted";

/**
 * MERELY TOUCHING `window.localStorage` CAN THROW, synchronously, in a
 * browser that blocks storage outright — a "block all site data" setting, or
 * one that treats this widget's own sandboxed cross-origin iframe as
 * permanently denied. `identity-storage.ts` records that at length and
 * absorbs it in one place; this does the same for its own key rather than
 * making every call site carry a `try`.
 *
 * A THIRD-PARTY IFRAME'S STORAGE IS PARTITIONED in every current browser, so
 * what this remembers is scoped to this widget on this tenant's site. That is
 * the correct scope for it and not a limitation to work around: a player who
 * silenced the dice on one site did not thereby ask for silence on another.
 */
export function readSoundPreference(windowLike: { readonly localStorage?: SoundStorage } | null | undefined): boolean {
  try {
    return windowLike?.localStorage?.getItem(MUTED_KEY) === "1";
  } catch {
    // Storage unavailable is never distinguished from "nothing stored yet":
    // the player-facing outcome is identical, which is this load's default.
    return false;
  }
}

/** Best effort. A write that fails — quota, a permission revoked after boot,
 * storage denied outright — degrades exactly like storage never having been
 * available: the choice holds for this load and does not survive a reload.
 * It must never be the thing that breaks a press. */
export function writeSoundPreference(windowLike: { readonly localStorage?: SoundStorage } | null | undefined, muted: boolean): void {
  try {
    windowLike?.localStorage?.setItem(MUTED_KEY, muted ? "1" : "0");
  } catch {
    /* the choice still holds for this load, which is the part that matters now */
  }
}
