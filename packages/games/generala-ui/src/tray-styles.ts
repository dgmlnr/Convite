export const TRAY_STYLE_ID = "hexdev-generala-tray-styles";

/**
 * THE TRAY'S OWN SHEET, AND THE ONLY GEOMETRY IT DECLARES IS AN AXIS.
 *
 * There is no width and no height below. Every die in this tray is a
 * `.hexdev-dice-scene-box` that `dice-ui` sizes, and the whole reason slice 12
 * put that box in `dice-ui` was so that this file would never have a size to
 * get wrong. What IS here beside the button reset, the held cue, the focus
 * ring and the row that wraps is the one thing `dice-ui` structurally cannot
 * provide for itself: a container to measure.
 *
 * THE TWO RESPONSIVE CONVENTIONS IN THIS REPOSITORY ARE ONE DECISION, AND
 * THIS IS WHERE THEY MEET. `escoba-ui` and `truco-ui` switch shape on
 * `@container` and assert of their own stylesheets that they never switch on
 * the viewport; `dice-ui` ships two width `@media` tiers. That looked like
 * the same question answered twice in opposite directions. It is not — it is
 * one rule applied to two structures, and the rule is: THE PACKAGE THAT OWNS
 * THE ROW ESTABLISHES THE CONTAINER AND QUERIES IT; A PACKAGE THAT OWNS ONLY
 * A DIE KEEPS THE VIEWPORT LADDER AS ITS FLOOR.
 *
 * Both halves of that were measured rather than argued.
 *
 * `dice-ui` CANNOT establish one. The only element it always owns above a die
 * is `.hexdev-dice-root`, which is deliberately `inline-flex` and shrink-wraps
 * to its content; `container-type: inline-size` implies `contain: inline-size`,
 * which makes an element's inline size ignore its contents. MEASURED: that
 * root goes from **1218px to 24px** the instant the property is applied — it
 * collapses the very shrink-wrap the rule exists for.
 *
 * And it cannot simply move its ladder onto the container axis either: a
 * `@container` query with NO ancestor container does not match at all.
 * MEASURED with a probe styled only inside one — it kept its unqueried width.
 * So `dice-ui`'s `@media` tiers are not a competing convention, they are the
 * floor for every consumer that establishes no container, starting with its
 * own cup and its own scene gallery.
 *
 * THIS PACKAGE OWNS A ROW, so it can, and the defect it closes is real and
 * measured: at a **1280px viewport with the tray in a 600px board**, the
 * viewport ladder is at its unscaled tier and five dice took **three rows and
 * 638px of height**. On the container axis the same box gives 126px dice, two
 * rows and 256px. A desktop window with a tray beside a planilla is the shape
 * this game is heading for, and it is exactly the case the viewport cannot
 * see.
 *
 * THE TIERS ARE `dice-ui`'S OWN, deliberately — 700 and 375, 0.6 and 0.45 —
 * because this is one ladder read on two axes and not a second ladder that
 * happens to share numbers. The selector is two classes deep so that inside
 * this tray the tray's own box decides, whatever order the two stylesheets
 * were injected in.
 *
 * THE BORDER IS DECLARED ON EVERY DIE, TRANSPARENT WHEN IT IS NOT HELD, and
 * that is deliberate rather than tidy. A border that appears only on the held
 * die would grow the flex item by 4px the instant it is pressed, so the whole
 * row would reflow under the player's finger and the dice beside it would
 * step sideways. Reserving it costs the same 4px on all five, always, which
 * is a layout nobody has to think about.
 *
 * TWO NON-COLOUR CUES FOR "HELD" (WCAG 1.4.1), the same pair
 * `escoba-ui`'s marked card uses and for the same reason: a solid border
 * where there was a transparent one, and a lift. Colour alone would leave a
 * player who cannot see the gold with an `aria-pressed` a screen reader
 * announces and nothing a sighted colour-blind player could read at all.
 */
export function buildTrayStylesheet(): string {
  return `
.hexdev-generala-tray {
  /* DECLARED, not only read. \`stylesheet-tokens.test.ts\` refuses a
     \`var()\` naming a property nothing in the product has and no namespace
     the reading package owns -- it caught this sheet inventing \`--generala-\`
     out of nothing on its first run. Declaring the gap here is what makes
     \`--generala-\` a namespace this package owns, and it is a real knob
     besides: the one number the row spends between dice. */
  --generala-die-gap: 4px;
  /* THE CONTAINER \`dice-ui\` CANNOT DECLARE FOR ITSELF. Safe here and not
     there because this is a BLOCK-LEVEL flex row: \`contain: inline-size\`
     makes an element's inline size ignore its contents, which is fatal to a
     shrink-wrapping \`inline-flex\` root and is a no-op for a row that was
     always going to fill the box the board gave it. */
  container-type: inline-size;
  container-name: hexdev-generala-tray;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: center;
  gap: var(--generala-die-gap);
}

.hexdev-generala-die {
  appearance: none;
  background: transparent;
  font: inherit;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 10px;
  /* NO \`line-height: 0\` HERE, and its absence was measured rather than
     assumed. It is the reflex declaration for a button wrapping artwork, and
     deleting it moved nothing: this button's only child is the block-level
     \`.hexdev-dice-scene-box\`, so no line box is generated for a line height
     to apply to. It would also be actively wrong the day a visible number
     joined the die. A clause with nothing to observe is not a free belt. */
  cursor: pointer;
}

.hexdev-generala-die[aria-pressed="true"] {
  border-color: var(--gx-color-accent, var(--hx-gold, #e8c877));
  transform: translateY(-6px);
}

.hexdev-generala-die:focus-visible {
  outline: 3px solid var(--generala-focus-ring, #2563eb);
  outline-offset: 2px;
}

/* A die nobody may hold any more still SHOWS what was rolled -- it is what
   the player is about to score -- so it keeps its full contrast and only
   stops inviting a press. Dimming it would hide the five faces the whole
   decision is made from. */
.hexdev-generala-die:disabled {
  cursor: default;
}

.hexdev-generala-die--empty {
  cursor: default;
}

/* THE CONTROL THAT COMMITS. It is the only text on this surface, so it is the
   only place a missing font-family would actually be visible -- the same
   argument \`escoba-ui\`'s own \`.hexdev-escoba-sum\` makes for itself. */
.hexdev-generala-roll {
  appearance: none;
  font: inherit;
  font-family: var(--gx-font-family, system-ui, sans-serif);
  padding: 8px 16px;
  border: 2px solid var(--gx-color-accent, var(--hx-gold, #e8c877));
  border-radius: var(--gx-radius, 12px);
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.hexdev-generala-roll:focus-visible {
  outline: 3px solid var(--generala-focus-ring, #2563eb);
  outline-offset: 2px;
}

.hexdev-generala-roll:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

/* THE LADDER, ON THIS TRAY'S OWN BOX. Same two tiers and same two scales
   \`dice-styles.ts\` ships on the viewport axis, because it is one decision:
   below 700px of TRAY a row of five full-size dice stops being a row, and
   below 375px it stops fitting at any honest size. Two classes deep so that
   inside this tray the tray's box wins over the viewport tier regardless of
   which stylesheet a document happened to inject first. */
@container hexdev-generala-tray (max-width: 700px) {
  .hexdev-generala-tray .hexdev-dice-scene-box {
    --dice-scene-scale: 0.6;
  }
}

@container hexdev-generala-tray (max-width: 375px) {
  .hexdev-generala-tray .hexdev-dice-scene-box {
    --dice-scene-scale: 0.45;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hexdev-generala-die[aria-pressed="true"] {
    transform: none;
  }
}
`;
}

/** Injects the stylesheet at most once per document — the same idempotence
 * guard every `ensure*` helper in this repository uses, so a second tray on
 * the same page never duplicates the `<style>` tag. */
export function ensureTrayStyles(doc: Document): void {
  if (doc.getElementById(TRAY_STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = TRAY_STYLE_ID;
  style.textContent = buildTrayStylesheet();
  doc.head.appendChild(style);
}
