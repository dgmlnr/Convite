import { CUP_TAP_MIN } from "./geometry.js";
import { DICE_THEME_DEFAULTS } from "./theme-tokens.js";

export const DICE_STYLE_ID = "hexdev-dice-styles";

/**
 * The tray, the cube, the toss, the cup — one stylesheet string, injected
 * once by `ensureDiceStyles`, the same "no bundler to resolve a stylesheet
 * import" arrangement `mahjong-solitaire-ui/board-styles.ts` documents for
 * itself.
 *
 * THE TOSS KEYFRAME'S `from` STATE IS AN OFFSET OF THE SAME TWO CUSTOM
 * PROPERTIES THE RESTING RULE READS, never an independent number. That is
 * the entire reason a landing here cannot be repainted after the fact: the
 * flight pose and the rest pose are the same two `var()` reads, one with
 * extra whole turns added and a lift subtracted at the end. `dice-toss-
 * anchored-to-rest.test.ts` asserts the keyframe's `from` transform contains
 * both `var(--dice-rest-x` and `var(--dice-rest-y` for exactly this reason —
 * a keyframe that hardcoded its own numbers instead would still LOOK like a
 * toss and would have silently broken the one guarantee that matters.
 *
 * `backwards` FILL MODE, NOT `forwards`. `chrome-styles.ts`'s deal animation
 * uses the identical fill mode for the identical reason: with no `to`
 * keyframe, the element's post-animation state is whatever its own base
 * rule already says — here, `.hexdev-dice-cube`'s own `transform:
 * rotateX(var(--dice-rest-x…)) rotateY(var(--dice-rest-y…))` — so the cube
 * needs no second write when the animation ends, and `prefers-reduced-
 * motion: reduce` needs no separate "already landed" branch: turning the
 * animation off leaves exactly that same base rule in effect from frame
 * one.
 */
export function buildDiceStylesheet(): string {
  return `
.hexdev-dice-root {
  /* THE UNTHEMED LOOK, applied here rather than left inert.
     \`mahjong-tile-ui\` can leave \`TILE_THEME_DEFAULTS\` as pure data because a
     board (\`mahjong-solitaire-ui/board-styles.ts\`) always exists to apply
     it; no Generala board exists yet (\`index.ts\`'s own scope note), so a
     die or cup built by THIS package alone would render every \`var(--dice-
     …)\` read as nothing at all without this rule. Custom properties
     inherit down the DOM, so setting them once here reaches the cup, the
     tray and every die inside it — and a future themed board can still
     override any of them by setting the same names on a closer ancestor,
     the identical cascade \`board-styles.ts\`'s own gx-bridge relies on. */
  ${Object.entries(DICE_THEME_DEFAULTS)
    .map(([token, value]) => `${token}: ${value};`)
    .join("\n  ")}
}

.hexdev-dice-tray {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  justify-content: center;
  align-items: center;
}

.hexdev-dice-scene {
  width: 64px;
  height: 64px;
  perspective: 480px;
}

.hexdev-dice-cube {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  /* THE RESTING POSE. Written from \`restingPoseDeclaration(face)\` onto this
     exact element's \`style\` attribute before this class, or this animation,
     ever runs — so the very first frame this rule can ever paint already
     names the real, decided face. */
  transform: rotateX(var(--dice-rest-x, 0deg)) rotateY(var(--dice-rest-y, 0deg));
  animation: hexdev-dice-toss 640ms cubic-bezier(0.22, 0.8, 0.32, 1) backwards;
  /* A small per-die stagger so five dice do not fall as one rigid block —
     cosmetic variety only, the same \`--i\`-keyed idiom \`chrome-styles.ts\`
     uses for its own deal, and it never touches which face lands where. */
  animation-delay: calc(var(--i, 0) * 55ms);
}

.hexdev-dice-face {
  position: absolute;
  inset: 0;
  /* Six opaque facelets close the cube; without this, a facelet whose local
     rotation briefly turns it away from the viewer mid-toss would show its
     own artwork mirrored through from behind. */
  backface-visibility: hidden;
}

.hexdev-dice-face svg {
  /* One merged svg per facelet (\`die-face.ts\`), so this is a plain sizing
     rule, not a stacking one. */
  display: block;
  width: 100%;
  height: 100%;
}

@keyframes hexdev-dice-toss {
  from {
    transform: translateY(-120px)
      rotateX(calc(var(--dice-rest-x, 0deg) + 640deg))
      rotateY(calc(var(--dice-rest-y, 0deg) + 460deg));
  }
}

@media (prefers-reduced-motion: reduce) {
  .hexdev-dice-cube {
    animation: none;
  }
}

.hexdev-dice-cup {
  all: unset;
  box-sizing: border-box;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 84px;
  height: 99px;
  /* WCAG 2.5.5's 44×44 floor, kept as its own declaration rather than baked
     only into the 84×99 above — a future skin that shrinks the cup's visual
     art cannot shrink the tap surface under this without touching this line
     directly, and \`cup-tap-target.test.ts\` asserts these two literal
     properties exist so that could not happen silently. */
  min-width: ${String(CUP_TAP_MIN)}px;
  min-height: ${String(CUP_TAP_MIN)}px;
  transition: transform 120ms ease;
}

.hexdev-dice-cup svg {
  width: 100%;
  height: 100%;
  display: block;
}

.hexdev-dice-cup:active {
  transform: scale(0.95);
}

.hexdev-dice-cup:focus-visible {
  outline: 3px solid var(--dice-cup-bevel-light);
  outline-offset: 3px;
  border-radius: 6px;
}

@media (prefers-reduced-motion: reduce) {
  .hexdev-dice-cup {
    transition: none;
  }
}
`;
}

/** Injects the stylesheet once per document — the same guard
 * `board-styles.ts`'s own `ensureBoardStyles` uses, so mounting a second
 * dice cup on the same page never duplicates the `<style>` tag. */
export function ensureDiceStyles(doc: Document): void {
  if (doc.getElementById(DICE_STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = DICE_STYLE_ID;
  style.textContent = buildDiceStylesheet();
  doc.head.appendChild(style);
}
