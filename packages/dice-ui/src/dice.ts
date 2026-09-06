import type { DieFace } from "./geometry.js";
import { cupBodySvg } from "./cup-body.js";
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
   * already decided (`sdd/generala-props/explore` §3). A future
   * `generala-module` calls `rng()` five times, materializes the faces, and
   * hands them to `roll()`; this handler is where that module's own press-
   * to-roll request would be wired in. No such module exists yet
   * (`src/index.ts`'s own scope note), so a caller today — a scene, a demo —
   * supplies the already-decided faces itself.
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
   * (a future engine may decide otherwise; this is the rendering layer, not
   * the rules).
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
 * `cupBodySvg()` rather than left as a generic rectangle, per the
 * exploration's own instruction to make the cup itself the pressure
 * surface. `all: unset` in `dice-styles.ts` strips the browser's default
 * button chrome so the SVG reads as the control, not as a button that
 * happens to contain a picture of one.
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
  cup.innerHTML = cupBodySvg();
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
