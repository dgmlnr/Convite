import { CUP_TAP_MIN, DIE_REST_TILT } from "./geometry.js";
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

  /* ONE COMPOSED SCENE, NOT TWO UNRELATED ELEMENTS. Before this pass, the
     cup and the tray were two plain block-level siblings with no layout
     rule between them at all — on any real viewport that stacks the cup
     above an unrelated row of dice, anchored to opposite corners with
     nothing composing them ("un cubilete de calidad" review, objection 3 —
     see \`art.ts\`'s own header for how that review's later "quiero algo de
     calidad" round replaced the cup's art entirely). \`row\`
     puts the tray beside the cup it was just pressed to empty, the way a
     thrown cup and its dice actually sit on a table together.

     \`inline-flex\`, NOT \`flex\` — a plain block \`flex\` here stretches to
     its containing block's own width (a whole 1280px desktop viewport in
     \`dice.scene.test.ts\`'s own widest scene), left-aligning the composed
     group and leaving the REST of that width as a second, differently-
     coloured empty desert next to it. This piece does not own the page it
     is mounted into (no board exists yet to give it one, \`index.ts\`'s own
     scope note) and should not silently claim more of it than its own
     content needs; \`inline-flex\` shrink-wraps to the cup-plus-tray group,
     same as the cup button inside it already does. */
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 12px;
}

.hexdev-dice-tray {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  justify-content: center;
  align-items: center;
}

/* THE ROLL ANNOUNCER: visually hidden, still announced — the identical
   clip-rect recipe \`truco-ui/table-styles.ts\` names \`.hexdev-truco-
   announcer\` for its own live regions, never \`display: none\` or
   \`visibility: hidden\`, both of which would remove the node from the
   accessibility tree and silence the one thing it exists to do. Its own
   plain-text sentence ("Tirada: 3, 5, 5, 2, 6") was, before this rule
   existed, the ONLY thing in this package painted with no \`--dice-…\`
   token behind it at all — unstyled black-on-whatever-the-page-provides,
   which is also why it read as a stray line of body copy sitting under the
   composed scene rather than as the assistive text it actually is. \`
   position: absolute\` additionally takes it out of the new flex row above,
   so it can never become a visible third box between the cup and the
   tray. */
.hexdev-dice-announcer {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
  min-height: 0;
}

.hexdev-dice-scene {
  /* 110px, NOT 64px — the SAME box \`dice-all-faces\` (\`dice.scene.test.ts\`)
     already renders every face inside via its own inline \`110px\` override,
     looked at and confirmed clean at that size. \`translateZ(50px)\`
     (\`DIE_SIDE_LOCAL_TRANSFORM\`, half of \`DIE_SIZE\`'s 100 SVG-viewBox units
     reused as CSS px) pushes the front facelet — and, once \`.hexdev-dice-
     tilt\` reveals it, a sliver of whichever facelet sits adjacent —
     proportionally far forward against the box. At the OLD 64px size, that
     projection landed partly outside the box; \`overflow: hidden\` (this
     rule's prior fix for the tray) clipped the shortfall, but that shortfall
     included the decided, front-facing facelet's OWN corners, not just the
     adjacent sliver — the regression this box size now fixes by giving the
     projection a box actually large enough to land inside, rather than
     cutting whatever missed. \`overflow: hidden\` stays only as a defensive
     backstop for the mid-toss animation frames (arbitrary intermediate
     rotations, never captured by any at-rest screenshot); at rest, nothing
     here should ever reach that edge. */
  width: 110px;
  height: 110px;
  perspective: 480px;
  overflow: hidden;
}

/* THE COSMETIC CAMERA TILT, applied ONCE here rather than folded into every
   face's own \`--dice-rest-x\`/\`-y\` — \`DIE_REST_TILT\`'s own comment in
   \`geometry.ts\` has the full argument for why nesting is the load-bearing
   choice, not a style preference: composing this element's static rotation
   with the cube's own (arbitrarily large, per-face) rotation is what keeps
   the tilt visually uniform across all six faces, where adding the same two
   degrees into the cube's own numbers instead broke faces 3 and 4 open into
   a two-face "V" (rendered and looked at, not merely reasoned about).
   \`transform-style: preserve-3d\` has to repeat here — it does not
   inherit — or the cube's six facelets would flatten onto this element's
   own plane instead of staying a real cube inside it. */
.hexdev-dice-tilt {
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transform: rotateX(${String(DIE_REST_TILT.rotateX)}deg) rotateY(${String(DIE_REST_TILT.rotateY)}deg);
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

.hexdev-dice-face img {
  /* One rendered WebP per facelet (\`art.ts\`), not a merged svg any more —
     still a plain sizing rule, not a stacking one. \`object-fit: cover\`
     matters here where it did not for the old inline svg: an <img> has no
     viewBox to scale itself by, and this facelet's box (\`DIE_SIZE\` in CSS
     px) and the artwork's own square ratio already match, but cover is the
     one rule that stays correct if that ever stops being exactly true. */
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
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
  /* TIPPED, NOT UPRIGHT — the review's fourth-wall objection was a cup and
     its dice reading as two unrelated shapes; a cup standing perfectly
     vertical beside a horizontal row of dice still reads that way even once
     the tray sits right next to it. A held-still tilt toward the tray is
     what makes it read as the vessel THOSE dice just came out of. This is a
     transform on the real, focusable \`<button>\` — not a rotated inner
     wrapper — so the box WCAG 2.5.5's 44×44 floor is measured against never
     shrinks (a CSS transform changes what is painted, not the element's own
     layout-box dimensions) and \`:focus-visible\`'s outline still traces the
     button it actually protects, tilt and all. */
  transform: rotate(9deg);
  transform-origin: 50% 65%;
}

.hexdev-dice-cup img {
  width: 100%;
  height: 100%;
  display: block;
  /* \`contain\`, not \`cover\`: the rendered cup (\`art.ts\`'s CUP_ART_WIDTH/
     -HEIGHT) and this button's own box (84x99) are close but not
     mathematically forced to match forever, and a cropped cup reads far
     worse than a couple of transparent px of letterboxing would. */
  object-fit: contain;
}

.hexdev-dice-cup:active {
  /* Combined, never a bare \`scale(...)\` that would silently discard the
     rest rule's own \`rotate(9deg)\` for the one moment a player is actually
     pressing it. */
  transform: rotate(9deg) scale(0.95);
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
