import { CUP_TAP_MIN } from "./geometry.js";
import { DICE_THEME_DEFAULTS } from "./theme-tokens.js";

export const DICE_STYLE_ID = "hexdev-dice-styles";

/**
 * THE TOSS'S OWN CLOCK, exported rather than left as three literals buried
 * in the template string below. `dice-toss-filmstrip.scene.test.ts` freezes
 * this exact animation at arbitrary checkpoints via a negative
 * `animation-delay` (the same idiom `chrome-styles.ts`'s `hexdev-deal`
 * already uses to resume a rebuilt card mid-flight, generalized here to
 * "resume" at a screenshot instead of at a rebuild) — a filmstrip built
 * against a SECOND, hand-copied `640`/`55` would silently stop matching the
 * real animation the moment either number changed here, and nothing would
 * fail to say so. One number, read twice, same as `--dice-rest-x`/`-y`
 * already are between the resting rule and the keyframe's `from` state.
 */
export const DICE_TOSS_DURATION_MS = 640;
/**
 * WAS `cubic-bezier(0.22, 0.8, 0.32, 1)` — measured (a bisection solver
 * against this exact curve, not eyeballed) to reach 96% of its own travel by
 * 60% of `DICE_TOSS_DURATION_MS` and 99% by 80%, i.e. the LAST 40% of the
 * toss painted a residual few percent of motion regardless of how large the
 * motion itself was. That is the literal mechanism behind "at 384ms it is
 * already basically still" — not a rotation problem, a PACING problem, and
 * fixing the rotation below without also fixing this would only have made
 * the frozen tail longer (more degrees are still ~0 degrees of visible
 * change). The standard `ease-out` curve below reaches 78%/94% at the same
 * two checkpoints — still a deceleration into the landing (a tossed die
 * SHOULD look like it is slowing down, not travelling at constant speed),
 * just not one that front-loads nearly the entire flight into its first
 * 60%.
 */
export const DICE_TOSS_EASING = "cubic-bezier(0, 0, 0.58, 1)";
export const DICE_TOSS_STAGGER_MS = 55;

/**
 * THE FLIGHT'S OWN BOX — bigger than `.hexdev-dice-cube`'s own 110px
 * (below) ON PURPOSE, and the two are no longer the same number the way they
 * used to be. See `.hexdev-dice-scene`'s own comment in the stylesheet for
 * why a rotating cube needs more room than a resting one, and why that room
 * has to live on the SCENE rather than on the cube itself.
 */
export const DIE_SCENE_SIZE = 210;

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
  /* GREW FROM 110px TO ${String(DIE_SCENE_SIZE)}px (\`DIE_SCENE_SIZE\`) THE DAY SOMEBODY FINALLY
     LOOKED AT THE FLIGHT, NOT JUST THE LANDING. 110px was sized ONLY for the
     resting cube's own perspective enlargement (still true, still math'd
     below) — nobody had a reason to size it for a ROTATING one, because
     before this change nothing rotated: the keyframe's \`from\` state and this
     class's own resting \`transform\` were different-shaped transform lists
     (one carried a bare \`translateY\`, the other did not), which forces every
     browser this ships to away from its normal "interpolate each function's
     own argument" path and into decomposing both ends to a matrix and
     SLERPing between them instead — collapsing whatever multi-turn spin the
     keyframe asked for down to whichever short rotation the two decomposed
     matrices happened to differ by. \`.hexdev-dice-cube\`'s own comment below
     is the other half of the fix (matching that shape back up); this comment
     is about what a GENUINE spin costs once it actually happens: a cube
     rotated to a diagonal orientation projects a screen-space bounding box
     measurably bigger than its own resting footprint (perspective
     foreshortening bulges the far corners outward, not just the near one),
     and five dice mid-toss do not all sit at the same instant of the same
     angle — \`--i\` (below) staggers both the DELAY and the TURN COUNT per
     die. ${String(DIE_SCENE_SIZE)}px is not a guess: it is the smallest size (measured with a
     throwaway Playwright harness against these exact numbers — translateZ
     50px, perspective 480px, a 110px facelet, the keyframe's own -10px
     lift and every \`--i\` in 0..4's own turn count) that keeps EVERY sampled
     instant of EVERY die's flight fully inside this box, at a much finer
     time resolution than any one screenshot could ever catch a violation
     at. \`overflow: hidden\` stays for the reason it always had one: the
     resting front facelet's own perspective enlargement still needs a crop
     boundary, just a much more generous one now that this box no longer
     doubles as the cube's own layout size (see below) — a real, deliberate,
     and previously-untested widening of the rest-pose crop, not merely an
     allowance for the flight. */
  width: ${String(DIE_SCENE_SIZE)}px;
  height: ${String(DIE_SCENE_SIZE)}px;
  perspective: 480px;
  overflow: hidden;
  /* The cube below no longer fills this box (it has its own fixed 110px,
     decoupled on purpose — see its own comment), so it has to be told where
     to sit inside a box that is now much bigger than it is. Flex-centering
     is the plain, ordinary way; \`.hexdev-dice-cup\` two rules down already
     centers its own icon the identical way. */
  display: flex;
  align-items: center;
  justify-content: center;
}

.hexdev-dice-cube {
  position: relative;
  /* FIXED, NOT \`100%\` OF THE SCENE ANY MORE. Before this change the two were
     the same number by construction (\`.hexdev-dice-scene\` was 110px, so
     \`100%\` of it was too) — that coupling is exactly what would have broken
     had \`.hexdev-dice-scene\` simply grown to ${String(DIE_SCENE_SIZE)}px above: this cube's
     facelets are pushed out by a FIXED \`translateZ(50px)\`
     (\`DIE_SIDE_LOCAL_TRANSFORM\`, calibrated against \`DIE_SIZE\`), and that
     push does not scale with whatever box happens to contain it. A cube
     whose own size tracked the scene's would have its faces pulled apart
     the moment the scene grew, no longer meeting at their shared edges —
     the box was free to grow for the flight's sake ONLY because this
     number was cut loose from it first. 110px is not a new choice — it is
     the exact size this cube already rendered at every day before this
     change, kept byte-for-byte so the resting cube (\`art.ts\`'s own 2.7×
     oversample of it, \`dice.scene.test.ts\`'s own inline 110px override) is
     unaffected in everything but how tightly \`.hexdev-dice-scene\`'s
     \`overflow: hidden\` used to crop its enlarged front facelet — see that
     rule's own comment for why THAT part is a deliberate, known side effect
     of this change rather than an oversight. */
  width: 110px;
  height: 110px;
  transform-style: preserve-3d;
  /* THE RESTING POSE. Written from \`restingPoseDeclaration(face)\` onto this
     exact element's \`style\` attribute before this class, or this animation,
     ever runs — so the very first frame this rule can ever paint already
     names the real, decided face. \`translateY(0px)\` IS LOAD-BEARING, not a
     no-op left in for symmetry: it makes this transform list the same SHAPE
     (same functions, same order — \`translateY\`, \`rotateX\`, \`rotateY\`) as the
     keyframe's own \`from\` state below, which is what lets the browser
     interpolate each matching function's own argument independently instead
     of decomposing both ends to a matrix and slerping — see the keyframe's
     own comment for why that distinction is the entire bug this rewrite
     fixes. Remove this \`translateY(0px)\` and the shapes stop matching again,
     silently, with no error and no failing assertion anywhere in this
     package — only a filmstrip that stops spinning. */
  transform: translateY(0px) rotateX(var(--dice-rest-x, 0deg)) rotateY(var(--dice-rest-y, 0deg));
  animation: hexdev-dice-toss ${String(DICE_TOSS_DURATION_MS)}ms ${DICE_TOSS_EASING} backwards;
  /* Per-die stagger, in BOTH the delay below and the keyframe's own turn
     count now (see \`hexdev-dice-toss\`) — the same \`--i\`-keyed idiom
     \`chrome-styles.ts\` uses for its own deal, and it never touches which
     face lands where: every use of \`--i\` below is added as a WHOLE multiple
     of 360deg, which is the identity rotation, so five different-looking
     spins still converge on the exact same \`--dice-rest-x\`/\`-y\` this rule
     itself declares. */
  animation-delay: calc(var(--i, 0) * ${String(DICE_TOSS_STAGGER_MS)}ms);
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

/**
 * THE ARITHMETIC THAT LETS THIS SPIN AND STILL LAND EXACT.
 *
 * A rolled die's flight has to show the cube actually turning — different
 * faces passing the viewer, not one face tilting and straightening, which is
 * all the OLD \`+ 640deg\`/\`+ 460deg\` ever produced once measured on screen
 * (both numbers were arbitrary, neither a whole number of turns, and the
 * transform-list SHAPE mismatch \`.hexdev-dice-cube\`'s own comment above
 * describes meant the browser never even interpolated them as angles in the
 * first place — it interpolated two decomposed matrices, and a small
 * residual rotation between two ARBITRARY orientations is exactly a "tilts,
 * then straightens" motion, never a spin through other faces). Fixing THAT
 * bug is not "use bigger numbers" — a bigger arbitrary offset still lands on
 * an arbitrary orientation, and \`FACE_ROTATION\` (\`geometry.ts\`) is the only
 * table this package ever lets decide which orientation the cube ends at.
 *
 * The fix is that every offset added here is an EXACT, WHOLE multiple of
 * 360deg. A full turn is the identity rotation — \`rotateX(a + 360·n)\` and
 * \`rotateX(a)\` describe the identical final orientation, for ANY integer
 * \`n\`, not approximately but by the literal definition of degrees. So the
 * \`from\` state below is not "roughly where a toss starts" tuned by eye; it
 * is \`FACE_ROTATION\`'s own \`--dice-rest-x\`/\`-y\` — the exact same two custom
 * properties the resting rule above reads — PLUS whole turns, computed by
 * \`calc()\` rather than pre-added by hand so nobody has to keep a second copy
 * of \`--dice-rest-x\`/\`-y\` in sync. With \`.hexdev-dice-cube\`'s transform list
 * now the same SHAPE at both ends (that rule's own comment), the browser
 * interpolates \`rotateX\`'s and \`rotateY\`'s own arguments independently and
 * linearly (eased by \`DICE_TOSS_EASING\`) from \`rest + 360·n\` down to
 * \`rest + 0\` — which means the angle genuinely SWEEPS through \`360·n\`
 * degrees on the way, passing every other face in between, and still
 * arrives at the exact same orientation \`FACE_ROTATION\` decided, because
 * subtracting a whole number of turns never changed what that orientation
 * was. \`dice-styles.test.ts\` proves the arithmetic half of this (every
 * offset below IS a whole multiple of 360, for every \`--i\`); the visual
 * half — that a real browser actually interpolates the matched-shape lists
 * component-wise rather than falling back to matrix decomposition — was
 * checked directly against a throwaway rendered harness before any of this
 * was written, not assumed from the spec text alone.
 *
 * ROTATING ON TWO AXES, NOT ONE — a spin confined to a single axis only ever
 * cycles through the four faces around that axis (rotateX alone: front, top,
 * back, bottom; the left/right pair never appears), which for some decided
 * faces would still read as "the same two or three faces over and over".
 * \`rotateX\` and \`rotateY\` turning at DIFFERENT rates traces a genuinely
 * mixed path across the cube's faces instead.
 *
 * FIVE DICE, FIVE DIFFERENT SPINS — \`var(--i, 0)\`, the same custom property
 * \`animation-delay\` above already keys its stagger off, ALSO scales each
 * axis's own turn count here: die 0 gets 2 turns of X and 1 of Y, die 1 gets
 * 3 and 2, up through die 4's 6 and 5 — five visibly different tumbles
 * instead of one spin replayed five times with a stagger, at zero cost to
 * the landing (\`var(--i, 0) * 360deg\` is itself always a whole multiple of
 * 360, for every integer \`--i\` \`die.ts\` ever writes, so it composes with
 * the base offset above without disturbing the arithmetic at all). This is
 * COSMETIC VARIETY ONLY, same as the stagger it rides alongside — it never
 * touches which face any die lands on.
 */
@keyframes hexdev-dice-toss {
  from {
    transform: translateY(-10px)
      rotateX(calc(var(--dice-rest-x, 0deg) + 720deg + var(--i, 0) * 360deg))
      rotateY(calc(var(--dice-rest-y, 0deg) + 360deg + var(--i, 0) * 360deg));
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
