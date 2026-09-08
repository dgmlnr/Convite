import { CUP_ART_HEIGHT, CUP_ART_WIDTH, getCupArtUrl } from "./art.js";
import type { DieFace } from "./geometry.js";
import { announceRoll, createDiceAnnouncer } from "./dice-announcer.js";
import { ensureDiceStyles } from "./dice-styles.js";
import { createDieSceneElement } from "./die.js";

export interface DiceCupOptions {
  /**
   * Called the instant the cup is pressed. Deliberately the ONLY thing a
   * press does: this package never decides a face itself — no
   * `Math.random`, no `rng()` call anywhere in this file — mirroring the
   * exact split `truco-module/deal.ts` already draws between a module-level
   * function that decides and an engine that only ever receives what was
   * already decided (`sdd/generala-props/explore` §3).
   *
   * WHAT THIS COMMENT USED TO PREDICT, AND WHAT `generala-module` ACTUALLY
   * DOES — corrected against the shipped module rather than re-guessed. It
   * said a future module "calls `rng()` five times, materializes the faces,
   * and hands them to `roll()`", and every clause of that is now wrong:
   *
   * 1. The module exists (`packages/games/generala-module`), so "future" and
   *    "no such module exists yet" are simply out of date.
   * 2. It draws `5 - kept.length` values, not five. Five is only the OPENING
   *    roll; a player who holds two dice re-rolls three, and the number of
   *    `rng()` calls being exactly the number of dice re-rolled is that
   *    package's whole integrity claim, pinned by a counting `RandomSource`.
   * 3. Nothing hands them to `roll()`. `generala-ui/tray.ts` composes the tray
   *    from `createDieSceneElement` itself and calls `roll()` nowhere,
   *    precisely because `roll()` replaces the whole tray (see
   *    `DiceCupHandle.roll`'s own note) and a game with held dice cannot
   *    afford that. Shipped, not predicted.
   *
   * `createDiceCup` is therefore NOT on Generala's path, and is neither
   * deleted nor redesigned for it: it stays the honest way to mount a cup and
   * a tray for a caller — a scene, a demo — that supplies the already-decided
   * faces itself and keeps no die between rolls.
   */
  readonly onPress: () => void;
}

export interface DiceCupHandle {
  /** The whole mounted fragment: cup, tray, announcer. */
  readonly element: HTMLElement;
  readonly cupElement: HTMLButtonElement;
  readonly trayElement: HTMLElement;
  readonly announcerElement: HTMLElement;
  /**
   * Renders `faces`, ALREADY DECIDED, as a toss landing on exactly those
   * values. Every existing die is discarded and rebuilt — a roll replaces
   * the whole tray rather than repositioning five persistent dice, because
   * nothing about a die's identity survives between rolls in this package
   * (`generala-engine` DOES decide otherwise — a held die is the same die
   * afterwards — which is exactly why `generala-ui` builds its own tray out
   * of `createDieSceneElement` instead of calling this; the rules live there
   * and this is the rendering layer).
   *
   * Announces the result the same synchronous call, before the toss
   * animation has played a single frame — a screen-reader user must not
   * wait out ~640ms of motion to learn what a sighted player already sees
   * unfold (`sdd/generala-props/explore` §4).
   */
  roll(faces: readonly DieFace[]): void;
}

/**
 * Builds one cup and its dice tray. The cup is a real `<button>` — native
 * keyboard activation and focus semantics for free — SHAPED as the cup via
 * a rendered WebP (`art.ts`) rather than left as a generic rectangle, per
 * the exploration's own instruction to make the cup itself the pressure
 * surface. `all: unset` in `dice-styles.ts` strips the browser's default
 * button chrome so the image reads as the control, not as a button that
 * happens to contain a picture of one.
 *
 * A REAL IMAGE, NOT INLINE SVG — the flat vector cup this used to mount
 * (`cup-body.ts`, deleted) drew a themeable silhouette; the product owner's
 * "quiero algo de calidad" review rejected exactly that flatness, and the
 * Blender-rendered leather-and-felt cup (`../assets/cup.webp`) that
 * replaces it is not something CSS custom properties can repaint. The
 * button's own `aria-label` below still carries the control's name — the
 * image is decorative, so it gets an empty `alt`, never a duplicate of
 * that label a screen reader would otherwise announce twice.
 *
 * TAP ONLY. No `pointerdown`/`touchstart` shake or drag handling exists
 * anywhere in this file, deliberately: `sdd/generala-props/explore` §2 rules
 * out `DeviceMotionEvent`-based shake-to-roll for v1 on two concrete
 * grounds — iOS requires a user-gesture-triggered permission prompt for it,
 * and inside a cross-origin embed the HOST page would additionally have to
 * delegate the `accelerometer`/`gyroscope` Permissions-Policy, which this
 * product's tenant-embed model cannot guarantee. A click/`Enter`/`Space` on
 * a real button needs none of that.
 */
export function createDiceCup(doc: Document, options: DiceCupOptions): DiceCupHandle {
  ensureDiceStyles(doc);

  const root = doc.createElement("div");
  root.className = "hexdev-dice-root";

  const cup = doc.createElement("button");
  cup.type = "button";
  cup.className = "hexdev-dice-cup";
  cup.setAttribute("aria-label", "Tirar los dados");
  const cupArt = doc.createElement("img");
  cupArt.src = getCupArtUrl().href;
  cupArt.width = CUP_ART_WIDTH;
  cupArt.height = CUP_ART_HEIGHT;
  cupArt.alt = "";
  cup.appendChild(cupArt);
  cup.addEventListener("click", () => {
    options.onPress();
  });

  const tray = doc.createElement("div");
  tray.className = "hexdev-dice-tray";

  const announcer = createDiceAnnouncer(doc);

  root.append(cup, tray, announcer);

  return {
    element: root,
    cupElement: cup,
    trayElement: tray,
    announcerElement: announcer,
    roll(faces: readonly DieFace[]): void {
      tray.replaceChildren(...faces.map((face, index) => createDieSceneElement(doc, face, index)));
      announceRoll(announcer, faces);
    },
  };
}
