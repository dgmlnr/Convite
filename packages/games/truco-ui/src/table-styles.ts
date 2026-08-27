import { DECK_THEME_DEFAULTS } from "@hexdev/spanish-deck-ui";
import { MATCHSTICK_THEME_DEFAULTS } from "./scoreboard.js";

import { DEAL_CARD_MS, DEAL_STEP_MS } from "./deck-marker.js";

export const TABLE_STYLE_ID = "hexdev-truco-table-styles";

function cssDeclarations(defaults: Readonly<Record<string, string>>): string {
  return Object.entries(defaults)
    .map(([token, value]) => `${token}: ${value};`)
    .join(" ");
}

/**
 * The whole "linda y cómoda" table stylesheet, generated as a string rather
 * than a `.css` file: this package builds via plain `tsc -b` (no bundler,
 * design §3), so a `.css` import has nowhere to resolve to at that step —
 * the same reason `card-back.ts`/`embed-shell.ts` already generate their own
 * markup as strings instead. Injected once via `ensureTableStyles`.
 *
 * DESIGN §10 — hybrid theming by zone, mechanically enforced here, not just
 * described: every rule below either (a) reads a `--gx-*` token (chrome,
 * calls, score labels, turn text — the tenant's brand), or (b) reads a
 * `--truco-*`/`--deck-*` token that is NEVER part of the tenant's
 * postMessage-sanitized vocabulary (`THEME_TOKEN_NAMES` in
 * `widget-protocol`) — the table cloth, the matchstick wood/head, and the
 * card back keep their own fixed identity regardless of what a tenant sends.
 */
export function buildTableStylesheet(): string {
  return `
/* Declared on :root, NOT .hexdev-truco-table: the shared matchstick <defs>
 * block (ensureMatchstickDefs) is appended directly to <body>, a SIBLING of
 * .hexdev-truco-table, not a descendant of it — a custom property scoped
 * only to .hexdev-truco-table would never inherit into that sibling, and an
 * SVG gradient stop's var() reference that resolves to nothing falls back to
 * plain black (Chromium's initial value for 'fill') instead of the intended
 * wood/head colours. Root-scoped avoids that regardless of where any given
 * caller mounts the defs or the table relative to each other. */
:root {
  ${cssDeclarations(DECK_THEME_DEFAULTS)}
  ${cssDeclarations(MATCHSTICK_THEME_DEFAULTS)}
  /* Aliases of the shared cloth above — one source, two surfaces. */
  --truco-table-cloth: var(--hx-cloth);
  /* --hx-* private token layer (design token-parity, VDS-1): spacing,
   * radii, elevation, type, motion, and private colour, identical to
   * chrome-styles.ts's own .convite-chrome block below (proved by
   * design-token-parity.test.ts). This slice only DECLARES these tokens --
   * no rule anywhere above or below reads any of them yet, so it repaints
   * nothing (pnpm test:visual stays at zero baseline diff). Never exposed
   * through widget-protocol's theme-token vocabulary (see the guard in
   * theme-tokens.test.ts). */
  --hx-space-2xs: 4px;
  --hx-space-xs: 8px;
  --hx-space-sm: 12px;
  --hx-space-md: 16px;
  --hx-space-lg: 24px;
  --hx-space-xl: 32px;
  --hx-space-2xl: 48px;
  --hx-radius-sm: 8px;
  --hx-radius-md: 12px;
  --hx-radius-lg: 16px;
  --hx-radius-xl: 22px;
  --hx-radius-pill: 999px;
  --hx-elev-1: 0 1px 2px rgba(0,0,0,.28), 0 2px 6px rgba(0,0,0,.22);
  --hx-elev-2: 0 2px 4px rgba(0,0,0,.30), 0 6px 14px rgba(0,0,0,.26);
  --hx-elev-3: 0 4px 8px rgba(0,0,0,.32), 0 14px 28px rgba(0,0,0,.30);
  --hx-elev-4: 0 8px 16px rgba(0,0,0,.35), 0 28px 56px rgba(0,0,0,.38);
  --hx-relief: inset 0 1px 0 rgba(255,255,255,.06), inset 0 -1px 0 rgba(0,0,0,.25);
  --hx-rim: inset 0 0 0 1px rgba(255,255,255,.05), inset 0 2px 12px rgba(0,0,0,.35);
  --hx-text-display: 1.5rem;
  --hx-text-display-compact: 1.35rem;
  --hx-text-title: 1.1rem;
  --hx-text-body: 0.9rem;
  --hx-text-meta: 0.75rem;
  --hx-text-label: 0.7rem;
  --hx-tracking-label: 0.08em;
  /* PR-EST: the lobby had no display size at all — its title computed to
   * 21.6px, which is why the screen read as a form and not as a front door.
   * Fluid so one token covers a phone and a desktop, and the ceiling is
   * deliberate: 48px is large enough to carry the screen, small enough that a
   * tenant's own page still frames it. Tracking goes NEGATIVE because that is
   * what large type wants — the label tracking below is its mirror image. */
  --hx-text-display-hero: clamp(2rem, 6vw, 4.25rem);
  --hx-tracking-hero: -0.02em;
  /* One step between --hx-text-title and the hero: the game's own name. It was
   * sharing --hx-text-title with everything else, so nothing on the card
   * announced what the card WAS. */
  --hx-text-heading: 1.35rem;
  /* A serif stack, used ONLY where the tenant supplied no font of their own
   * (chrome-styles.ts's title rule). Character without a network request: the
   * widget loads inside somebody else's page and has no business adding a font
   * fetch they never asked for. */
  --hx-font-display: Georgia, "Times New Roman", "Noto Serif", serif;
  /* THE SURFACE IS OURS (PR-EST2), and that is a product decision, not a
   * palette. The lobby used to paint --gx-color-surface directly, so a tenant
   * with a white page got a white lobby — a very tidy FORM, never a table.
   * Quality that any embedder can dissolve is not quality.
   *
   * So the tenant TINTS rather than paints: their surface colour shifts the
   * felt's hue by a bounded amount and the felt stays a felt. That keeps
   * --gx-color-surface meaningful — a token we accepted and then ignored
   * would be a silent no-op, which is worse than not accepting it — while
   * putting a floor under how far it can go. Their primary, accent, radius
   * and font are untouched and still drive every control.
   *
   * --hx-felt-ink is the light-on-dark counterpart the felt needs; the chrome
   * cannot go on reading --gx-color-on-surface, which a tenant sets for THEIR
   * background and not for ours. */
  /* THE CLOTH, promoted to the shared layer (PR-EST3). It lived as
   * --truco-table-cloth and friends, which the chrome is forbidden to read —
   * correctly: a lobby that reaches into a game's tokens stops being a lobby
   * for any other game. So the values move up here, the truco tokens below
   * become aliases of them, and both surfaces are lit by ONE cloth instead of
   * two that drift.
   *
   * That is the whole reason the lobby and the table now look like the same
   * room. The first version of the felt lobby reinvented these numbers a
   * shade off, which is exactly how two surfaces end up almost matching. */
  --hx-cloth-lit: #1d6a4d;
  --hx-cloth: #123f2f;
  --hx-cloth-deep: #0d3325;
  /* DEPTH IS ALWAYS TWO SHADOWS, never one, and that is the single technique
   * that separates a drawn rectangle from an object on a table: a tight
   * CONTACT shadow that says where the thing touches, and a wide AMBIENT one
   * that says how far above the surface it floats. One shadow can do either
   * job and never both — a soft blur alone reads as fog, a hard one as a
   * sticker.
   *
   * --hx-lift-edge is the third member: a hairline of light along the top,
   * which is what a real edge catches from a light source above. Every raised
   * surface in this product gets all three. */
  --hx-lift-contact: 0 3px 6px rgba(0, 0, 0, 0.4);
  --hx-lift-ambient: 0 14px 34px rgba(0, 0, 0, 0.48);
  --hx-lift-edge: inset 0 1px 0 rgba(255, 255, 255, 0.09);
  /* The room's own edges: a gold filet and two deep inset washes. This is
   * what makes a flat felt read as a TABLE — the light falls in the middle
   * and the corners recede. Huge blurs on purpose (120px), because a vignette
   * that you can see the edge of is a border. */
  --hx-room: inset 0 0 0 2px rgba(232, 200, 119, 0.18), inset 0 0 120px rgba(0, 0, 0, 0.5), inset 0 0 44px rgba(0, 0, 0, 0.4);
  /* Copy sitting directly on cloth. One pixel, barely there: it is not a
   * shadow you should notice, it is what stops light text vibrating against a
   * mid-dark texture. */
  --hx-ink-shadow: 0 1px 1px rgba(0, 0, 0, 0.35);
  /* The letterpress under the display type: a hard offset in the cloth's own
   * deepest tone, so the glyphs look pressed INTO the felt rather than laid
   * on it, then two softer casts to lift them off again. Applied as
   * drop-shadow rather than text-shadow because the title is gold clipped to
   * its glyphs, and only drop-shadow follows an alpha mask. */
  --hx-emboss: drop-shadow(0 2px 0 #0a2418) drop-shadow(0 4px 1px rgba(0, 0, 0, 0.45)) drop-shadow(0 10px 18px rgba(0, 0, 0, 0.5));
  --hx-felt-tint: 14%;
  --hx-felt-ink: #f4efe4;
  /* #d8e2da and not the #cdd8cf this wanted to be. Measured against the
   * LIGHTEST point of the felt — the centre, where light text is most at risk
   * — the softer tone lands at 4.45:1, and 1.4.3 asks for 4.5. Four
   * hundredths, and it is still a fail: the line is the line, and "almost"
   * is how quiet copy ends up illegible one small step at a time. This tone
   * clears at 4.91:1 and reads no louder. */
  --hx-felt-ink-soft: #d8e2da;
  /* Consumed on the CHROME side (chrome-styles.ts's body-copy rule reads
   * this leading token for status-card/lobby paragraphs, FU-5); no felt
   * rule reads it, and this declaration stays anyway for cross-stylesheet
   * token parity (design-token-parity.test.ts scans both declared sets). */
  --hx-leading: 1.35;
  --hx-motion-fast: 120ms;
  --hx-ease: ease-out;
  --hx-chrome-on-felt: #10312a;
  --hx-gold: #e8c877;
  --hx-gold-edge: #b8923f;
  --hx-ink: #1a1a1a;
  /* --hx-felt-text (Tanda 3): the text colour for every rule that draws on a
   * background OUTSIDE the tenant vocabulary -- the cloth, the recessed
   * action lane the outlined call buttons and the senas toggle sit
   * transparent on, and the relation label's own fixed black scrim.
   *
   * PRIVATE, fixed, and never a --gx-* token, for exactly the argument the
   * focus ring one section down already makes for --hx-gold (Tanda 2:
   * "--hx-gold, FIXED, not a --gx-* tenant token -- the same decoupling
   * argument the felt itself makes"), and that rule's own comment named this
   * as the coupling Tanda 3 unwinds. Design section 10 puts the game table
   * deliberately outside the tenant vocabulary; its TEXT was still inside it,
   * and a colour is only readable against the thing it is actually painted
   * on. A tenant setting --gx-color-on-surface is describing its OWN surface,
   * which the cloth is not.
   *
   * A pairwise contrast guard structurally cannot catch this, which is why
   * the fix is a token and not a rule: measured with widget-protocol's own
   * contrastRatio, a self-consistent light-brand theme (white surface,
   * near-black #1a1a1a on-surface) passes every pair the tenant vocabulary
   * can form and still rendered felt text at 1.47:1 against the cloth and
   * lane text at 1.28:1. This value renders 10.55:1 and 12.17:1 on those same
   * two backgrounds.
   *
   * ZERO PAINT CHANGE: #f2f2f2 is the exact value all four rules already
   * carried as their own var() fallback, so an untenanted widget -- every
   * widget today -- renders byte-identically. Only the leak is gone. */
  --hx-felt-text: #f2f2f2;
  /* --hx-felt-outline (Tanda 4, WCAG 1.4.11): the BORDER colour for the two
   * outlined controls on the felt -- the opening-call buttons and the senas
   * toggle. Both are transparent, so this 2px edge is the entire boundary of
   * the control; there is no fill to see.
   *
   * It used to read var(--gx-color-primary, #2f6f4f) and measured 2.28:1
   * against the recessed lane and 1.97:1 against bare cloth, under the 3:1
   * non-text floor. Their LABELS always passed (12.17:1, --hx-felt-text right
   * above), so the word stayed readable while the thing that says "this is a
   * button, and it ends here" did not.
   *
   * PRIVATE and fixed, exactly like --hx-felt-text and --hx-gold above (never
   * writing a token name directly followed by a colon inside this block is
   * deliberate -- design-token-parity.test.ts scans it with a regex that
   * cannot tell prose from a declaration, which is why every comment here
   * parenthesises or trails its token names). A tenant's
   * --gx-color-primary describes the tenant's OWN surface, and the lane is not
   * one -- the same cross-zone leak Tanda 3 closed for felt TEXT, one property
   * over, and equally invisible to widget-protocol's pairwise guard.
   *
   * THE BAR IS THE GRADIENT'S BRIGHTEST STOP, not the base cloth tone. The
   * lane is a translucent black over whichever part of the radial gradient the
   * fixed-height action band happens to cover, and a short felt pulls that
   * band toward the bright centre -- so the honest floor is 3:1 against
   * rgba(0,0,0,.18) over --truco-cloth-lit, the lightest background this
   * border can ever sit on. #65b08a measures 3.29:1 there, 5.28:1 over the
   * base tone and 5.96:1 over the deep stop, which clears every tier by
   * construction with no per-breakpoint geometry to re-check. Pinned in
   * felt-outline-contrast.browser.test.ts. */
  --hx-felt-outline: #65b08a;
  /* New, unused felt-palette tokens (tasks §3.7 boundary note): PR2 changes
   * --truco-table-cloth's own value above to #123f2f and consumes all four
   * of these together in one vignette gradient. Declaring them here, now,
   * unused, keeps THIS PR a true zero-paint slice -- changing
   * --truco-table-cloth's value itself would repaint the felt before this
   * PR's own "tokens declared, never consumed" claim holds. */
  --truco-cloth-lit: var(--hx-cloth-lit);
  --truco-cloth-deep: var(--hx-cloth-deep);
  --truco-cloth-lane: rgba(0,0,0,.18);
  /* Scrollbar thumb, for every scroller inside the felt that keeps a VISIBLE
   * bar. A fixed felt token and never --gx-*: these bars sit on the cloth and
   * on the log panel, surfaces no tenant token reaches, so a tenant colour
   * here could land invisible on either. Derived from --hx-felt-outline's own
   * green rather than the gold accent on purpose — a scrollbar is chrome, not
   * an action, and gold is this table's language for "something to do". */
  --hx-scroll-thumb: rgba(101, 176, 138, 0.55);
}
/* The outer shell owns the shell-level layout (felt beside/above its own
 * chrome scoreboard panel — Change 2), and establishes an inline-size
 * containment context so the panel/felt split can be tested against a REAL
 * geometry breakpoint independent of the actual browser viewport: an
 * embedded widget's available width is its OWN container's width, which can
 * legitimately differ from the top-level page's viewport (it sits inside a
 * host page's layout, not full-bleed). A container query answers "is MY box
 * narrow or wide", which is the honest question here — an ordinary viewport
 * media query can only answer "is the whole browser window narrow or wide". */
/* A size container cannot itself be styled by its OWN container query rules
 * — only its descendants (a real, documented CSS Containment limitation, not
 * a typo: verified live, a self-targeting rule on the shell class itself is
 * silently ignored). The container therefore stays a plain, unstyled box;
 * the inner shell-layout element beneath it is the actual flex row/column
 * that the container query below switches. */
.hexdev-truco-table-shell {
  /* THE LANE THE WAY OUT LIVES IN. .hexdev-truco-leave is absolute in this
   * box's own top-right corner, and the rail is at the right too -- so the
   * rail covered it, at every width this repo tests, reported from live play
   * as "el registro de cantos me tapa el boton salir". Reserved once here
   * rather than guessed at twice: the drawer starts below this line and the
   * column pads down past it, both reading the same number. */
  --hx-leave-lane: 44px;
  container-type: inline-size;
  container-name: hexdev-truco-shell;
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  font-family: var(--gx-font-family, system-ui, sans-serif);
}
.hexdev-truco-shell-layout {
  /* The drawer's containing block. Without this the rail resolves against the
   * SHELL, which in fullscreen is the whole viewport -- so on a tall phone the
   * handle centred itself against 844px of shell while the table only occupied
   * the top 504px, and drifted off the cloth onto the empty room below it.
   * Against the layout it tracks the table, which is the thing it opens. */
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  height: 100%;
  min-height: 0;
  /* GROW INTO WHATEVER THE SHELL HAS SPARE, and height: 100% above is exactly
   * why that has to be said out loud.
   *
   * In fullscreen the shell is sized by min-height: 100dvh, which leaves its
   * own height INDEFINITE -- and a percentage height cannot resolve against
   * an indefinite one. So this box quietly fell back to its content and left
   * the rest of the screen as bare cloth: measured in the running widget at
   * 305x568, a 568px shell holding a 489px table and 79px of nothing. Reported
   * looking at it, twice, across two sessions.
   *
   * flex-grow does not care whether a percentage can resolve. It fills what is
   * there. */
  flex: 1 1 auto;
  box-sizing: border-box;
}
.hexdev-truco-shell-layout > .hexdev-truco-table { flex: 1 1 auto; }

/* THE SIDE RAIL: one place for the calls and the tantos, in two shapes.
 *
 * ON A PHONE it is a DRAWER: out of flow, pinned to the felt's top corner,
 * shut until its tab is tapped. Out of flow is the load-bearing part -- a
 * rail in flow at 375px grows as the call chain does and shrinks the felt to
 * match, which is exactly what table-height-stability.browser.test.ts is
 * there to forbid. Neither of these two things has to be on screen while a
 * card is being chosen, so on the screen with the least room neither is.
 *
 * FROM 640 UP it is a COLUMN beside the felt, always open, tab hidden. There
 * is room for it there, and a tanteador off to one side is what a real table
 * looks like.
 *
 * min-height: 0 is load-bearing in both shapes, not defensive: the log
 * inside is a scroller, and a flex item's default min-height: auto refuses
 * to shrink below its content, which would push the tantos out of the rail
 * exactly when a long chain is the reason you opened it. */
/* The width the felt sets aside on its right for the drawer's handle. Zero
 * from 640 up, where the rail is a column in flow and the handle is hidden. */
@container hexdev-truco-shell (width < 640px) {
  .hexdev-truco-table { --hx-rail-handle-lane: 25px; }
}

.hexdev-truco-side-rail {
  position: absolute;
  /* ON THE SIDE EDGE, HALFWAY DOWN, and both halves of that are corrections
   * to a first version pinned to the top-right corner. The corner already
   * belongs to the way out (.hexdev-truco-leave), and a horizontal pill put
   * there ran straight under it -- measured on a 390px phone, the tab and the
   * Salir button overlapped. It also floated in the band above the cloth
   * rather than on it, because this box is positioned against the SHELL and
   * the felt does not start at the shell top on every tier. Anchored to the
   * middle of the right edge, it is beside the play at every tier and can
   * collide with nothing. */
  right: 0;
  top: var(--hx-leave-lane);
  bottom: 8px;
  z-index: 6;
  display: flex;
  flex-direction: row-reverse;
  /* Centred inside the band rather than pinned to its top: the handle should
   * sit halfway down the edge, which is where a hand reaches for it. */
  align-items: center;
  gap: 6px;
  min-height: 0;
  /* The drawer floats over the cloth, so everything it does not actually
   * cover must stay reachable underneath it. */
  pointer-events: none;
}
.hexdev-truco-side-rail > * { pointer-events: auto; }

.hexdev-truco-rail-body {
  align-self: center;
  max-height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  min-width: 0;
  width: min(64vw, 260px);
}
.hexdev-truco-side-rail[data-open="false"] > .hexdev-truco-rail-body { display: none; }
/* SHRINKABLE, and scrolling before it pushes. The tally draws every piece the
 * match can ever hold now -- twelve casitas at 30 points, against four
 * before -- so on a short window (a phone held sideways is 390px tall) it is
 * genuinely taller than the rail. flex: 0 0 auto made that overflow the
 * window and grow the table with it, and both are things this table's own
 * fences forbid outright. It gives way instead, and the run inside scrolls. */
/* BOTH CHILDREN ON A FLEX-BASIS OF ZERO, and the zero is doing the same work
 * twice over. It gives each a height that comes from the RAIL rather than
 * from what it holds -- the fixed boxes that were asked for -- and it keeps
 * either of them from setting the rail's own height, which in a flex row is
 * what decides the whole TABLE's. That second half is not theory: making the
 * tantos bigger, with basis auto, put the table's height back at the mercy of
 * whatever font drew the labels.
 *
 * Roughly three to two, calls over tantos: the calls are the half that grows
 * without limit, and both scroll rather than lose anything. */
.hexdev-truco-rail-body > .hexdev-truco-call-log { flex: 3 1 0; min-height: 0; }
.hexdev-truco-rail-body > .hexdev-truco-scoreboard-panel {
  flex: 2 1 0;
  min-height: 0;
  overflow: hidden;
  /* Centred in whatever share it gets, so a short score does not hang from
   * the top of a tall box. */
  justify-content: center;
}
/* THE TANTOS GET THE ROOM THEY NEED, and the calls get the rest. A rail is
 * mostly empty for most of a hand, and the half of it a player actually reads
 * at a glance -- the score -- was the half drawn smallest: reported as
 * "podria ser un poco mas grande y aprovechar mejor el espacio para que sea
 * mas legible".
 *
 * The score's size is bounded by the RAIL's width rather than by a literal,
 * so it grows with the rail at every tier and can never outgrow it. The calls
 * keep flex-basis zero, which is what lets them yield: they are a scroller,
 * and a scroller that gives up height loses nothing but a look-back. */
/* THE RUN TAKES THE RAIL'S WIDTH. .hexdev-truco-scoreboard sits in a
 * centred column, so it was shrink-to-fit: measured at 98px inside a 216px
 * group inside a 240px rail, which capped every casita at 31px against a 52px
 * ceiling that never got a chance to apply. Reported as the tantos still
 * being small in a panel with room to spare -- and the panel really did have
 * it: the casitas were being sized by a box nobody had told to stretch. */
.hexdev-truco-side-rail .hexdev-truco-scoreboard,
.hexdev-truco-side-rail .hexdev-truco-score-group,
.hexdev-truco-side-rail .hexdev-truco-score-sticks { align-self: stretch; width: 100%; }
.hexdev-truco-side-rail .hexdev-truco-score-sticks svg {
  width: calc((100% - 4px) / 3);
  max-width: 64px;
  height: auto;
}
.hexdev-truco-side-rail .hexdev-truco-team-label {
  font-size: var(--hx-text-title);
  letter-spacing: var(--hx-tracking-label);
}
.hexdev-truco-side-rail .hexdev-truco-score-label { font-size: var(--hx-text-meta); opacity: 1; color: var(--hx-felt-ink-soft); }
.hexdev-truco-side-rail .hexdev-truco-scoreboard-group { gap: 4px; }
.hexdev-truco-side-rail .hexdev-truco-score-group { gap: 3px; }
.hexdev-truco-scoreboard-panel .hexdev-truco-scoreboard { min-height: 0; overflow: auto; }
/* THREE TO A ROW is what the rule above's own width calculation buys, and it
 * is load-bearing rather than tidy: a group holds up to three casitas
 * (fifteen points at five apiece), and at the casita's natural size the third
 * wrapped to a second line -- which doubled the scoreboard's height and,
 * through it, the whole table's. Measured at 88px of variance at 700px,
 * against a table whose height is locked per tier. */

/* The tab. Deliberately quiet: it is a way in, not a call to action, and it
 * sits on the cloth where the loudest thing must always be the cards. */
.hexdev-truco-rail-tab {
  flex: 0 0 auto;
  /* A HANDLE ON THE EDGE, which is what a drawer has. Vertical text keeps it
   * about 26px wide, so the thing it covers of the cloth is a sliver rather
   * than a banner. */
  writing-mode: vertical-rl;
  align-self: center;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-right: 0;
  border-radius: var(--gx-radius, 10px) 0 0 var(--gx-radius, 10px);
  padding: 12px 5px;
  font: inherit;
  font-size: var(--hx-text-label);
  font-weight: 700;
  letter-spacing: var(--hx-tracking-label);
  text-transform: uppercase;
  color: var(--gx-color-on-surface, var(--hx-felt-ink));
  background: rgba(255, 255, 255, 0.09);
  box-shadow: var(--hx-lift-contact);
  cursor: pointer;
}


/* Stable window height (apply prompt, round 5): min-height alone cannot
 * protect this box's own essential content from squeeze-induced clipping,
 * because .hexdev-truco-table's own overflow: hidden below makes it a
 * "scroll container" for CSS Flexbox's own automatic-minimum-size
 * algorithm — per spec, a flex item that is a scroll container gets an
 * automatic minimum size of 0 REGARDLESS of what its children need, unless
 * an EXPLICIT min-height overrides that. Confirmed directly: giving the
 * anchors below back their own real min-content contribution (removing
 * .hexdev-truco-anchor's own min-height: 0 override) was NOT enough on its
 * own — the felt itself kept shrinking to fit whatever the shell-layout's
 * own flex distribution gave it, clipping the now-correctly-sized anchors
 * anyway, confirmed by deliberately squeezing the real ancestor chain
 * (table-shell > shell-layout > table) down to increasingly short heights
 * and watching a hand card's own rect exceed the felt's clip edge below
 * ~400px (1v1) — exactly the mechanism reported: a real card cut by a hard
 * line where the felt ends and the scoreboard begins.
 *
 * The explicit min-height below is this box's own TRUE essential floor —
 * one card row for top/bottom (the row-layout hand cases) plus the trick
 * area's own existing reservation for the centre column (a card genuinely
 * in play must stay whole too, apply prompt's own item 4) — NOT this
 * box's full natural/resting size. Decorative slack (the trick area's own
 * generous offset-positioning room beyond what a single card strictly
 * needs, the banner/calls tray now floating out of flow entirely) still
 * compresses freely under real pressure; only genuinely essential,
 * always-visible content gets a hard floor. This keeps overflow: hidden
 * doing its own real job — clipping content that visually bleeds past the
 * felt's rounded box — without also silently discarding essential content
 * whenever the container around it is shorter than this minimum. */
.hexdev-truco-table {
  /* --truco-card-tier is the WIDTH tier's own choice; --truco-card-width is
   * what everything else reads. They are the same value everywhere except
   * fullscreen, where the rule at the very bottom of this stylesheet caps
   * the tier's choice by the height actually available. Splitting them is
   * what lets that cap exist at all: a custom property cannot be defined in
   * terms of itself, so min(the tier, the fit) needs the tier to still
   * have a name of its own after the @container blocks below have spoken. */
  /* HOW FAR THE TURN RING PAINTS OUTSIDE THE HAND: outline-offset plus the
   * outline itself, matched by the halo's own spread. Declared here so the
   * one row that has to leave space for it can read the same number the ring
   * is drawn with, instead of a literal copied beside it. */
  --hx-ring-reach: 13px;
  --truco-card-tier: 60px;
  --truco-card-width: var(--truco-card-tier);
  /* --hx-felt-gap / --hx-felt-pad (PR3, tasks §3.8): the per-tier scalar
   * pair driving this grid's own gap/padding. Declared HERE, never on :root
   * — design-token-parity.test.ts only scans :root/.convite-chrome,
   * so a felt-only scalar living outside that block cannot trip the parity
   * guard or need a chrome-side twin it has no reason to share. */
  --hx-felt-gap: 8px;
  --hx-felt-pad: 8px;
  /* The BLOCK half of the felt's padding, split out from the uniform value
   * above. On a wide, short desktop window the inline padding is spending
   * space the felt has plenty of, while the block padding is spending the
   * one thing the cards are starved of. Defaulting to --hx-felt-pad keeps
   * every tier that never overrides it byte-identical. */
  --hx-felt-pad-block: var(--hx-felt-pad);
  /* Opponents' face-down backs, as a fraction of a real card. They carry no
   * information, so at the tiers where height is the binding constraint they
   * give some of it back to the cards the player actually reads. 1 until a
   * tier says otherwise. */
  --hx-back-scale: 1;
  /* NOTE on the two tokens above and below: they live on .hexdev-truco-table
   * with the rest of the felt's geometry, but their consumers are rendered
   * STANDALONE by some tests (played-cards.browser.test.ts mounts the trick
   * into a bare div). Out of that scope a bare var() makes the whole calc()
   * invalid at computed-value time and the reservation silently becomes 0 —
   * which is a real 0-height trick area, not a test artefact. Every consumer
   * therefore carries the base value as a var() fallback. */
  /* How many card-heights the trick area reserves. NOT padding: everything
   * beyond one card is the room a play needs to sit NEARER THE SEAT THAT
   * MADE IT, which is how a player reads who played what (see
   * .hexdev-truco-trick's own note). Tunable per tier so a window that is
   * short can let the two plays overlap more without losing the lean. */
  --hx-trick-rows: 1.7;
  /* How many card-heights the felt stacks. ONE owner, read by two places
   * that must agree: this element's own min-height floor below, and the
   * fullscreen fit formula that decides the card width. They used to
   * disagree — the floor hardcoded 3.7 while the fit formula was told
   * something else — so shrinking any reservation grew the card, the floor
   * grew at 3.7x with it, and the felt came out TALLER than before. That is
   * exactly how two attempts to reclaim height ended up overflowing the
   * window instead. */
  --hx-fit-rows: 3.7;
  /* --hx-band-banner / --hx-band-action / --hx-band-action-total (PR5, tasks
   * §3.8/§9, D-5/D-6, blessed refinement 1 — tasks §1 item 1/§2.2): the two
   * reserved lanes that make the badge/tray axis conflict structurally
   * impossible (the action bar gets its own grid row below the bottom
   * anchor; the banner gets its own padding-top lane on the centre column)
   * instead of patched by repositioning either one. Never on :root — same
   * felt-only-scalar discipline as --hx-felt-gap/--hx-felt-pad above.
   * --hx-band-banner: ONE value per SEAT COUNT and none per width, PR5-T3
   * MEASUREMENT re-run in real Chromium after the pending-call pill was
   * withdrawn from this lane (it now paints per-seat, see
   * .hexdev-truco-seat-call). That pill was the only occupant that ever
   * wrapped, and wrapping is what forced the old per-tier ladder
   * (60/76/80/84/112 — five literals for one lane, each arguing about how
   * the pill broke at that width). With it gone the lane holds exactly two
   * things (table.ts mounts nothing else into .hexdev-truco-banner-slot) and
   * neither wraps at any width: the end-of-hand banner measures 29.28px, and
   * the señas strip 50px. 34px here = the 29.28px 1v1 case plus ~16%
   * headroom, which is what absorbs the font variance the line-box fence
   * below describes (both occupants' text is "line-height: normal", answered
   * by whatever font the host actually has); the 2v2 rule after this one
   * carries the strip's own 56px, because the strip only exists when there
   * is a partner to signal to. Raise either ONLY against a fresh measurement
   * of the tallest occupant — never per tier, and never to make room for
   * something that wraps: fix the wrap instead.
   * --hx-band-action-total: equals --hx-band-action at compact (1 strip,
   * calls+señas share it, tasks §3.8) — the 2v2 two-strip formula only
   * starts at medium (below). */
  --hx-band-banner: 34px;
  /* 40px of button plus the lane a thin horizontal scrollbar takes when a
   * call group has to scroll -- measured at 50px for the group's own box, not
   * guessed.
   *
   * It only started needing that lane once the band stopped being a scroller
   * of its own. With the row rigid the scrollbar sat on the BAND, which cost
   * nothing here and cost the player two nested boxes to scroll instead. One
   * scroller, and it gets its lane. */
  --hx-band-action: 50px;
  --hx-band-action-total: var(--hx-band-action);
  position: relative;
  box-sizing: border-box;
  width: 100%;
  /* min-height formula (PR5-T5, tasks §9, design §8.2): the banner lane and
   * the action band are pure constants added to the existing trick-area
   * floor, plus one new grid gap for the new "actions" row.
   *
   * THE DROPPED "100%" (this used to read min-height: max(100%, calc(...)),
   * same at the [data-seat-count="4"] override below). Traced with git log
   * -S: the 100% predates the scoreboard panel entirely — it was written
   * when the felt was the only element in this stylesheet and "fill the
   * shell" and "fill the layout" were the same sentence. They stopped being
   * the same sentence the moment the felt got a sibling.
   *
   * Not load-bearing: .hexdev-truco-shell-layout > .hexdev-truco-table has
   * flex: 1 1 auto (above), which already makes the felt fill the space the
   * layout has left over. That is the correct claim — the REMAINDER. The
   * 100% claimed the WHOLE layout height instead, so the panel below it was
   * pushed out of frame by exactly its own height plus one gap. Measured
   * counterfactual (re-measured here, headed Chromium — the mode this repo
   * calibrates layout against, see vitest.config.ts): a compact-width host
   * with a definite 900px height chain, with the bare calc() below, gives a
   * felt of 799.0625px and a panel whose bottom lands at exactly 900px. The
   * felt still fills everything available; it just no longer claims the part
   * the panel was already standing in (799.0625 + 92.9375 panel + 8 gap =
   * 900).
   *
   * What it cost: where a definite height chain DOES exist, the 100% drove a
   * divergent host/document relay. The felt asks for max(100%, floor), the
   * document measures felt + panel + gap and reports it, the host applies
   * that as the new height, and the 100% re-resolves against it. It does not
   * converge and does not oscillate — it grows without bound, measured
   * 721 -> 822 -> 923 -> 1024 -> ... -> 1428.
   *
   * Honest scope: this is a no-op in production TODAY, and the change is not
   * claimed to fix any shipping symptom. embed-shell.ts declares no height on
   * html/body, so .hexdev-truco-table-shell height: 100% resolves against an
   * auto-height body and computes to auto; the percentage was unresolvable
   * and contributed zero. The loop above is what it costs the first time
   * someone gives this document a definite height chain — which is why it is
   * removed now rather than after. table-panel-in-frame.browser.test.ts is
   * the fence that keeps it removed.
   *
   * WHAT THE 32px IS, AND WHAT IT IS NOT — corrected, because the terms above
   * read like a complete accounting of this box and are not one. The written
   * formula omits the felt's own two paddings, two of its three row gaps, and
   * the trick-feedback line inside the centre column. Measured at the compact
   * tier, where this constant was calibrated: 3.7c + 32 + banner + action +
   * gap = 479.05px against 503.34px of real rendered content — the floor sits
   * 24.29px BELOW what the felt actually draws. The honest constant there is
   * 56.3px (2 x pad(8) + 2 x gap(8), plus the centre column's own 8px gap and
   * 16.3px feedback line).
   *
   * The 32px is nevertheless LEFT ALONE, deliberately. This is a squeeze floor,
   * not a height: real content already exceeds it at every tier, so raising it
   * to 56.3px would change nothing except to start binding at compact by
   * ~0.007px — which Chromium rounds up to a whole 1/64px layout unit, so every
   * compact screenshot baseline in this repo would need recapturing for a floor
   * that protects the same content either way. The number is wrong and this
   * comment now says so, with the measured figure for whoever next needs it to
   * be exact. Note also that it is compact-calibrated: at wider tiers pad and
   * gap both grow, so the same literal under-reserves by more — unchanged from
   * before this note existed, and equally true of the 4-seat formula's own
   * constant inside the 640px block below.
   *
   * SECOND READER, 2v2: from this change on, this formula is ALSO the compact
   * 4-seat floor. The [data-seat-count="4"] rule below no longer overrides it
   * at compact, because the side seats' backs shrank to 45px and the middle
   * row's essential need became the centre column's — the same one this
   * formula's 1.7c + banner term already reserves (215.79px, against the
   * 214.18px a 3-stack of 45px backs needs). */
  min-height: calc((var(--truco-card-width) * 336 / 220) * var(--hx-fit-rows, 3.7) + 32px + var(--hx-band-banner) + var(--hx-band-action-total) + var(--hx-felt-gap));
  display: grid;
  grid-template-columns: 1fr;
  /* PR5-T1 (tasks §9): the 4th row reserves the action bar's own band, a
   * fixed track (never auto) so the bar can never grow the felt — contents
   * scroll inside it instead (design §7.2). */
  grid-template-rows: auto 1fr auto var(--hx-band-action-total);
  grid-template-areas: "top" "center" "bottom" "actions";
  gap: var(--hx-felt-gap);
  /* The right inset carries the drawer's handle lane on top of the felt's own
   * padding. On the tiers where the rail is a drawer, that handle lives on
   * the right edge -- and the right seat's cards ran the full height of it,
   * so the handle was drawn ON the cards. Measured at 375px: 11px of overlap.
   *
   * A reserved lane rather than a cleverer position, because there is no
   * clear stretch of that edge to move it to: the seat's cards occupy y128 to
   * y343 of a 504px felt, the action bar the bottom 40. 25px of a 375px
   * screen is a cheap price for never drawing a control over a card -- and
   * far cheaper than the 84px strip the drawer itself gave back. Zero from
   * 640 up, where the rail is a real column and there is no handle at all. */
  padding: var(--hx-felt-pad-block) calc(var(--hx-felt-pad) + var(--hx-rail-handle-lane, 0px)) var(--hx-felt-pad-block) var(--hx-felt-pad);
  /* Felt palette (PR2, design §10/§3.7): a deterministic CSS vignette, not an
   * image asset — three layers, weave painted ABOVE the vignette (layer
   * order matters: the weaves are listed first, so they composite on top).
   * Two faint diagonal weaves (one lighter, one darker) give the cloth a
   * woven texture; the radial vignette (lit centre fading to a deeper edge)
   * reads as "a table under a light", not a flat colour fill. All four
   * --truco-cloth-* tokens declared unused in PR1 are consumed together
   * here, for the first time. */
  background:
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.014) 0 1px, transparent 1px 6px),
    repeating-linear-gradient(-45deg, rgba(0, 0, 0, 0.030) 0 1px, transparent 1px 6px),
    radial-gradient(ellipse 120% 90% at 50% 42%, var(--truco-cloth-lit), var(--truco-table-cloth) 55%, var(--truco-cloth-deep) 100%);
  /* --hx-rim (VDS-4, paint-only): an inner highlight/shadow pair reading as
   * "a real recessed play surface", never a layout-affecting border. */
  box-shadow: var(--hx-rim);
  /* --hx-felt-text, not --gx-color-on-surface: this colour is inherited by
   * every felt descendant that sets none of its own, and what it is read
   * against is the cloth gradient right above -- not a tenant surface. */
  color: var(--hx-felt-text);
  overflow: hidden;
}

/* The ONE legitimate split of --hx-band-banner, and it is by what the lane
 * HOLDS, never by width. The señas strip is 2v2-only — there is no partner to
 * signal to in 1v1 — so 1v1's lane holds the end-of-hand banner alone, which
 * measures 29.28px at every tier. The base above is sized for that; this is
 * sized for the 50px strip that joins it when there is a fourth seat. Written
 * as an attribute selector rather than a container query on purpose: the
 * ladder this replaced was five width-keyed overrides, and the reason it
 * survived so long is that no single mount could see more than one rung.
 * banner-lane-reserve.browser.test.ts mounts every tier in both seat counts
 * and fails if this token ever varies with width again. */
.hexdev-truco-table[data-seat-count="4"] {
  --hx-band-banner: 56px;
}
.hexdev-truco-table * { box-sizing: border-box; }

/* The hard case (spec): four seats on a phone. Two seats (v1) never touch
 * the side gutters at all — a columnless top/center/bottom stack makes the
 * best use of a narrow screen instead of reserving empty side space for
 * anchors nobody occupies yet. Four seats (v2/2v2) trades some of that width
 * for real side gutters; on a genuinely narrow phone those gutters stay
 * tight (opponent backs stack vertically, shrunk) — a disclosed tradeoff,
 * not a hidden one: 2-seat truco is the common case and stays uncompromised.
 *
 * min-height: this rule NO LONGER overrides the felt's own floor, and that is
 * the whole point of the compact fix below — see the block after this one. */
.hexdev-truco-table[data-seat-count="4"] {
  /* cqw, not vw (FU-4): these gutters are seat furniture of a
   * CONTAINER-driven layout — every other tier decision on this felt already
   * answers to the hexdev-truco-shell @container axis, so the gutters must
   * scale with that same container, never with the viewport. cqw resolves
   * against the nearest ancestor query container (the shell). A widget
   * embedded narrower than the page viewport used to get over-wide gutters
   * here, because 15vw read the host page's window instead of the box the
   * felt actually lives in. */
  grid-template-columns: minmax(34px, 15cqw) 1fr minmax(34px, 15cqw);
  grid-template-areas: "top top top" "left center right" "bottom bottom bottom" "actions actions actions";
}
/* THE INEQUALITY THE OLD COMMENT HERE PREDICTED, deliberately inverted — and
 * this block is the honoured half of that prediction. It used to read: "the
 * 3-card column always wins at every tier (compact 3x91.6+8=283 vs
 * 1.7x91.6+40=196) ... a later card-size change could silently invert this
 * inequality — that is exactly why this comment exists". It was right, and this
 * is that change. It is not silent.
 *
 * THE PROBLEM. At the compact tier the whole widget measured 667.09px for 2v2
 * against a 601px phone viewport (the window this table has been designed
 * against since commit 2ece04e, now asserted as PHONE_VIEWPORT_CEILING in
 * table-height-budget.browser.test.ts rather than merely described). The
 * scoreboard sat below the fold: a player had to scroll to see their own score.
 *
 * WHERE THE HEIGHT WAS. Measured box by box, every part of the compact felt is
 * byte-identical between 1v1 and 2v2 — both card anchors, the panel, the bands,
 * the gaps, the padding. The entire 62.81px difference is the middle row, and
 * the middle row is the two side seats: a 282.91px vertical stack (3 x 91.63 +
 * 2 x 4px gap) whose whole job is to render an integer in 0..3 as full-size card
 * backs the player is forbidden to read. Nothing else about 2v2 costs a pixel.
 *
 * WHY 45px, MEASURED not chosen. The shell total against side-card width:
 * 60 -> 667.09 | 50 -> 621.27 | 48 -> 612.11 | 46 -> 604.28 | 45 -> 604.28.
 * It SATURATES at 46: below that the side column stops driving the middle row
 * and the centre column (trick area + banner lane, identical in both seat
 * counts) takes over, so 2v2 lands on exactly 1v1's own number and cannot go
 * lower by shrinking these backs further. 45 rather than 46 because of the
 * felt's own floor, not its height: the base min-height reserves 1.7 card
 * heights + the banner lane (215.79px) for the middle row, and a 3-stack of
 * 45px backs needs 214.18px — inside it. At 46px the stack needs 218.75px and
 * the floor would quietly stop covering the essential content it exists to
 * protect. Same rendered height, one of the two is honest.
 *
 * AND IT FIXES A SECOND, UNRELATED THING. These backs never fitted their own
 * gutter track: the track is minmax(34px, 15cqw) — 56.25px at a 375px shell,
 * 48px at 320px — and a 60px back centred in it hung 1.88px over each edge at
 * 375px and 6.00px at 320px, leaning into the centre column where the trick is
 * played. At 45px they fit both widths with room to spare. Fenced by
 * table-side-gutters.browser.test.ts, which until now only checked that the
 * TRACK was the right size, never that what stands in it fits.
 *
 * SCOPED TO COMPACT, via the exact complement of the (min-width: 640px) tier
 * below. From 640px up the side cards stay full-tier size and the 3-card column
 * still wins the middle row exactly as the old comment described — which is why
 * the seat-count-4 min-height formula that used to live in the rule above now
 * lives in THAT block instead of this tier: the inequality inverted here and
 * only here. */
@container hexdev-truco-shell (width < 640px) {
  /* THE SEAT ACROSS THE TABLE JOINS THE TWO AT THE SIDES. It was left out of
   * this rule and kept the full-size back -- and being a horizontal row of
   * three, it was the widest thing on a phone's felt. Asked for directly:
   * "podrias hacer mas chicas las cartas del compañero para ganar espacio,
   * las dejas del mismo tamaño que las de los rivales". Nobody reads a card
   * back, so the three seats that only ever show backs can share one size and
   * give the width back to the hand that IS read. */
  .hexdev-truco-table[data-seat-count="4"] [data-position="left"],
  .hexdev-truco-table[data-seat-count="4"] [data-position="right"],
  .hexdev-truco-table[data-seat-count="4"] [data-position="top"] {
    --truco-card-width: 45px;
  }
}
/* Breakpoint axis (PR3, tasks §7/§3.8): the two viewport @media blocks that
 * used to drive --truco-card-width/gap/padding are replaced by the SAME
 * hexdev-truco-shell container the shell-layout row-switch above already
 * established on .hexdev-truco-table-shell — .hexdev-truco-table is a
 * DESCENDANT of that container (unlike the container element itself, which
 * cannot be styled by its own container-query rules, see the comment
 * above), so it is a legal query target. @media now survives only for
 * prefers-reduced-motion (below). Scalar-only: grid STRUCTURE
 * (grid-template-columns/areas) is byte-for-byte what it was under the old
 * @media axis at every tier — the log-rail column and actions row are
 * PR4/PR5 scope, not this one. */
@container hexdev-truco-shell (min-width: 640px) {
  .hexdev-truco-table {
    --truco-card-tier: 84px;
    /* Deliberate 2px snap to the --hx-space scale (was 14px under the old
     * @media axis) — covered by table-height-stability's own 700px fence. */
    --hx-felt-gap: 12px;
    --hx-felt-pad: 16px;
    /* PR5-T3/T5 (tasks §3.8/§9): medium-tier band value. --hx-band-action is
     * ONE strip's height — --hx-band-action-total below overrides this for
     * 2v2 into the two-strip formula, and, because --hx-band-action-total is
     * itself declared via var(--hx-band-action) (derived, not a fixed
     * literal — same discipline as --hx-play-max's own comment further
     * below), 1v1 automatically keeps its single-strip total at every wider
     * tier without needing its own redeclaration anywhere. */
    --hx-band-action: 48px;
  }
  .hexdev-truco-table[data-seat-count="4"] {
    /* cqw, not vw (FU-4) — same container-not-viewport rationale as the
     * compact gutters above: this whole tier only EXISTS because the shell
     * container is at least 640px wide, so sizing its gutters against the
     * viewport contradicted the very axis that selected the rule (a 700px
     * embed inside a narrower host viewport collapsed both gutters to their
     * 72px floor; a narrow embed in a wide viewport over-reserved instead).
     * The wide/ultra tiers below never had this defect — their gutter
     * tracks already use 16%, a grid-relative unit. */
    grid-template-columns: minmax(72px, 16cqw) 1fr minmax(72px, 16cqw);
    /* The 4-seat floor (moved here from the base rule, where it applied at
     * every tier). From 640px up the side cards are still full-tier size, so
     * the middle row's essential need is still max(3 stacked side cards +
     * gaps, trick + banner lane) with the 3-card column winning — medium
     * 3x128.3+8=393 vs 1.7x128.3+76=294; ultra 3x152.7+8=466 vs 260+84=344 —
     * exactly as the base rule's old comment described. At compact that is no
     * longer true (the side backs are 45px there, see the block above), which
     * is why this now lives inside the tier where it holds instead of applying
     * to a tier where it does not: at compact 2v2's essential need became
     * identical to 1v1's, so it uses the base formula, which reserves the same
     * trick + banner middle row for both.
     *
     * The banner term stays deliberately absent from THIS formula, for the
     * original reason: the 3-card column wins here, so adding the banner would
     * over-reserve 76-84px.
     *
     * HONEST CONSTANT, corrected. This literal used to read 40px, and the floor
     * it produced was ~20px BELOW the felt's own real content — the written
     * terms omit the felt's two paddings, two of its three row gaps, and the
     * side anchor's own relation label and gap. Measured at the compact tier
     * (where this formula was originally calibrated): 5c + 40 + action-total +
     * gap = 546.18px against 566.16px of real content. 60px is the honest
     * number there: 2 x pad(8) + 2 x gap(8) + label(14) + label gap(6) + the
     * hand's own 2 x 4px card gaps, less the one felt-gap term the formula
     * already carries. It stays an under-reservation at 640px+ (2 x 16 + 2 x 12
     * + 20 + 8 = 84 at medium) — unchanged from before this correction, and
     * left that way on purpose: this is a squeeze floor, not a height, and
     * raising it at tiers nothing measured would be trading a documented
     * under-reservation for an undocumented over-reservation. */
    min-height: calc((var(--truco-card-width) * 336 / 220) * 5 + 60px + var(--hx-band-action-total) + var(--hx-felt-gap));
  }
  /* THE SECOND STRIP IS GONE, AND SO IS EVERYTHING THAT RESERVED ROOM FOR IT.
   *
   * 2v2 used to carry a señas strip beside the calls, so from 640px up the
   * band stacked the two and --hx-band-action-total booked a double height
   * (one strip x2, plus a 4px seam) that the ultra tier then clawed back by
   * seating them side by side. The señas control lives in the side rail now,
   * the band has exactly one strip at every width, and all of that machinery
   * was reserving felt for something that is not there.
   *
   * Deleted together with the feature rather than left inert: a dead
   * reservation is not free, it is 54px of the one dimension this widget is
   * always short of, silently gone from 640 to 1280. --hx-band-action-total
   * now equals --hx-band-action everywhere, which is what its base
   * declaration already said. */
}
@container hexdev-truco-shell (min-width: 900px) {
  .hexdev-truco-table {
    --hx-felt-gap: 16px;
    --hx-felt-pad: 24px;
    /* --hx-play-max (tasks §3.8): an INLINE-axis cap only — see its own
     * consumer below — never enters a height-fence formula. Derived from
     * --truco-card-width via calc(), so it automatically tracks whichever
     * tier's card size is in effect on THIS specific element: a custom
     * property's var() reference resolves against the element's own final
     * cascaded value at used-value time, not the value in effect where
     * --hx-play-max itself happened to be declared — so, unlike a fixed
     * clamp() derived from nothing, no separate ultra-tier redeclaration is
     * needed for this one. (The retired --hx-log-rail was that other kind,
     * and did need one at every tier that changed it.) */
    --hx-play-max: calc(var(--truco-card-width) * 7);
    /* PR5-T3/T5 (tasks §3.8/§9): wide-tier strip height. Same note as the
     * ultra block below: this lane still tiers by width, the banner's no
     * longer does. */
    --hx-band-action: 52px;
  }
  /* 1v1 only grows here — the 4-seat felt is already width-constrained by
   * its own side gutters, so 2v2 holds at the medium tier's 84px (no
   * declaration needed: nothing above overrides it for this seat count). */
  .hexdev-truco-table:not([data-seat-count="4"]) { --truco-card-tier: 100px; }

  /* PR4-T4 (tasks §8), extended PR5-T1 (tasks §9): the log rail is a real
   * grid column track, in flow, beside the play — structurally what TRZ-1's
   * own "the call-log rail, the felt, and the scoreboard rail each occupy a
   * disjoint horizontal region" scenario needs (tasks §2.1: a rectangle
   * claim, proven by getBoundingClientRect in the test suite, never by DOM
   * parentage). PR5 adds the 4th "log actions" row now that the actions row
   * itself exists — grid STRUCTURE otherwise matches the compact/medium base
   * rules above, with "log" prepended to every row. */
  /* NO LOG COLUMN. The call log moved into the side rail it now shares with
   * the scoreboard (table.ts's own hexdev-truco-side-rail), so the felt
   * keeps its whole width at every tier and the wide/ultra grid is the same
   * shape as the compact/medium one above. What used to be a
   * --hx-log-rail-wide track on the left is play area now. */
  /* The señas popover needs no inset of its own any more: it is positioned
   * against the felt, and the felt no longer has a rail track in front of the
   * actions area. .hexdev-truco-senas-row's own base rule -- left and right
   * at --hx-felt-pad -- is the correct answer at every tier again. The
   * override that used to live here added the log rail's width to that left
   * edge, and carried a documented imprecision about --hx-log-rail being a
   * percentage clamp resolved against two different boxes. Both are gone with
   * the rail. */
  /* PR4-T6 (tasks §8), joined PR5-T6 (tasks §9): 1v1 only — cap and centre
   * the play column (now including the action bar) so a very wide felt does
   * not stretch a 3-card hand across the whole track. */
  .hexdev-truco-table:not([data-seat-count="4"]) > .hexdev-truco-anchor,
  .hexdev-truco-table:not([data-seat-count="4"]) > .hexdev-truco-center,
  .hexdev-truco-table:not([data-seat-count="4"]) > .hexdev-truco-action-bar {
    justify-self: center;
    width: min(100%, var(--hx-play-max));
  }
}
@container hexdev-truco-shell (min-width: 1280px) {
  .hexdev-truco-table {
    --hx-felt-gap: 24px;
    --hx-felt-pad: 32px;
    /* PR5-T3/T5 (tasks §3.8/§9): ultra-tier strip height. --hx-band-banner
     * is deliberately absent from this block and from every other tier —
     * it splits by seat count only, see its own comment on the felt. */
    --hx-band-action: 56px;
  }
  .hexdev-truco-table:not([data-seat-count="4"]) { --truco-card-tier: 108px; }
  .hexdev-truco-table[data-seat-count="4"] { --truco-card-tier: 100px; }
  /* THE SIDE-BY-SIDE RECLAIM IS GONE WITH THE STRIP IT RECLAIMED FROM.
   *
   * This tier used to seat the calls row and the señas strip in one row so
   * --hx-band-action-total could drop back to a single strip, undoing the
   * double booking the 640px block made. With the señas control moved to the
   * side rail there is only ever one strip, the double booking is deleted at
   * its source, and there is nothing left here to claw back.
   *
   * The centring went with it and is not missed: the calls group carries its
   * own auto margins (see the base rule's note on why margins and never
   * justify-content -- centring an OVERFLOWING box pushes its first button out
   * of scroll range, which is what once cut "Quiero" down to "uiero"). */
}

/* Change 2: a side panel that works wide does not fit narrow, so the two
 * widths get genuinely different treatments rather than one compromise.
 * Narrow (< 640 CONTAINER px, e.g. 320/375 phones): the panel is a slim
 * chrome strip stacked ABOVE the felt — no room for a real side column, but
 * still clearly its own boxed space, never inside the play area. Wide: the
 * panel becomes a real side column, beside the felt, matching a real
 * table's tanteador sitting off to one side. */
@container hexdev-truco-shell (min-width: 640px) {
  .hexdev-truco-shell-layout { flex-direction: row; align-items: stretch; }
  /* THE COLUMN SHAPE: in flow, always open, no way in needed -- the drawer
   * the base rule builds for a phone, unfolded. The width lives on the rail
   * and not on the scoreboard inside it: the two things it stacks must line
   * up on one edge, and a width on either child would only ever describe one
   * of them. */
  .hexdev-truco-side-rail {
    position: static;
    flex-direction: column;
    order: 0;
    flex: 0 0 auto;
    width: 168px;
    /* THE RAIL STRETCHES; ITS CONTENT DOES NOT COUNT. In a flex ROW the
     * line's cross size is the tallest item's own content height -- so a rail
     * holding a long call record made the whole TABLE taller, against a table
     * whose height is locked per tier on purpose
     * (table-height-stability.browser.test.ts). Measured before this: 65px of
     * difference between two probe fonts at 700px, purely because the panel's
     * text had grown.
     *
     * TWO WRONG WAYS FIRST, both caught rather than reasoned away. height: 0
     * and expecting align-items: stretch to hand it back: stretch only
     * applies to an item whose cross size is auto, so the rail stayed exactly
     * zero tall and DISAPPEARED -- caught by the wide themed visual baseline.
     * Then taking the body out of flow: that fixed the height but overflowed
     * the fullscreen box by the leave lane, caught by
     * table-viewport-fit.browser.test.ts. What actually works is neither:
     * everything stays in flow, and the PANEL inside gets a flex-basis of
     * zero (below), so its content never sets anyone's height. */
    padding-top: var(--hx-leave-lane);
    min-height: 0;
    align-items: stretch;
    overflow: hidden;
    /* NO pointer-events: auto HERE, and the omission is the fix. The rail's
     * box spans the whole right column -- including the corner the way out
     * sits in, which is absolutely positioned against the shell with a lower
     * z-index than this. Given the events back, the rail sat in front of it
     * and ate every click: reported as "el boton de salir no actua cuando le
     * hago click", and invisible to any fence comparing rectangles, because
     * the two never overlap to the eye.
     *
     * The base rule keeps the events off the rail and hands them to its
     * CHILDREN, which is all that was ever needed. */
  }

  .hexdev-truco-rail-tab { display: none; }
  /* A drawer a player shut on a phone must not stay shut when the same widget
   * is wide enough to have no drawer at all. */
  .hexdev-truco-side-rail[data-open="false"] > .hexdev-truco-rail-body { display: flex; }
  /* align-self back to stretch, undoing the drawer's centring. In the drawer
   * the rail is a ROW, so centring puts the panel halfway down the edge; in
   * the column it works across instead and shrank the panel to its content
   * width -- 99.8px inside a 240px rail, which is the exact shape of the "58%
   * of it" bug the fence below already existed for. Same property, opposite
   * axis, second time in this file: worth naming rather than just fixing. */
  .hexdev-truco-rail-body { width: auto; flex: 1 1 auto; align-self: stretch; max-height: none; min-height: 0; }
  /* FLEX-BASIS ZERO, and the zero is the whole point. The panel takes the
     rail's spare height instead of its own content's -- always the same box,
     in the same place, whatever is in it -- and, because its hypothetical
     size is zero, what it HOLDS never sets the rail's height either. That
     second half is what keeps a long call record from making the whole TABLE
     taller: in a flex row the line's cross size is the tallest item's content
     height, and the table is height-locked per tier on purpose. Measured
     without it: 65px of difference between two probe fonts at 700px. */
  .hexdev-truco-rail-body > .hexdev-truco-call-log { flex: 1 1 0; min-height: 0; }
  .hexdev-truco-scoreboard-panel {
    flex: 0 0 auto;
    flex-direction: column;
    justify-content: flex-start;
  }
}
/* PR4 correction (native review, deterministic CRITICAL): same-specificity
 * rules resolve by SOURCE ORDER regardless of @container nesting depth. These
 * two rail-width bumps used to sit BEFORE the 640px block above (inside the
 * 900/1280 blocks that also style .hexdev-truco-table), so the 168px rule
 * above always won at every width, even >=900px. Moving them here, AFTER the
 * 168px base rule, is what actually lets 900/1280 win. */
@container hexdev-truco-shell (min-width: 900px) {
  /* PR4-T7 (tasks §8): rail width bump — a SHELL-level change. */
  .hexdev-truco-side-rail { width: 200px; }
  /* NO BOTTOM PIN, and that is a correction made by looking. A first version
   * pinned the tantos to the foot of the rail -- "calls at the top, tantos at
   * the bottom" taken literally, and a real tanteador does sit off to one
   * side. On a 1440px screen with no calls yet it read as stranded: a small
   * panel alone at the bottom of a tall empty column. The same build at 820px,
   * where the pin does not apply, stacked both at the top and looked right.
   * They stack from the top at every tier now. The tantos still sit under the
   * calls, which is the order that was actually asked for. */
}
@container hexdev-truco-shell (min-width: 1280px) {
  /* PR4-T7: ultra's own scoreboard rail width. */
  .hexdev-truco-side-rail { width: 240px; }
}

/* THE GAP IS THE RING'S ROOM. .hexdev-truco-relation-label carries order: -1,
 * so it is always the FIRST item in whichever direction this anchor runs --
 * above the cards in the side columns, beside them in the partner's row -- and
 * this gap is what sits between the two.
 *
 * The turn ring is an OUTLINE plus a halo and both paint OUTSIDE the box they
 * belong to, 13px past it, with layout knowing about none of it. At a 6px gap
 * that put 7px of gold straight through the seat's own name. Reported looking
 * at it: "las pils de Rival y Compañero deben estar arriba del contenedor
 * amarillo de las cartas."
 *
 * The same mechanism, and the same fix, as .hexdev-truco-hand's margin-bottom
 * further up -- that one reserved the ring's room BELOW the player's hand,
 * where it was painting over the action bar. Nothing had ever reserved the
 * matching room above a seat's cards.
 *
 * max(), so the token is a floor and never a shrink: if the ring ever reaches
 * less than 6px this gap keeps the 6 it was designed with. And reserved on
 * every anchor whether or not it is that seat's turn, for the reason the hand
 * rule gives for its own -- a table that reflows every time the turn comes
 * round is worse than one that is 7px looser all the time. */
.hexdev-truco-anchor { position: relative; display: flex; align-items: center; justify-content: center; gap: max(6px, var(--hx-ring-reach)); }

/* THE DEAL. Every card arrives from the deck's own corner of the table,
 * seat by seat from the mano, three each -- which is how a hand is actually
 * served. Numbers interpolated from deck-marker.ts so the code that times the
 * deal and this rule can never disagree about when it is over.
 *
 * MINUS how long ago it began. Every broadcast rebuilds this subtree, and a
 * CSS animation on a rebuilt node restarts at zero -- so a deal that merely
 * kept its class would stutter back to the first card once a second. A
 * negative delay starts an animation partway through, which is what lets a
 * repaint land mid-deal and change nothing. Learned the hard way on the
 * lobby's own greeting; the same shape here on purpose. */
@keyframes hexdev-deal-card {
  from {
    opacity: 0;
    transform: translateY(-38px) scale(0.82) rotate(-6deg);
  }
}
.hexdev-truco-table--dealing .hexdev-truco-card {
  animation: hexdev-deal-card ${DEAL_CARD_MS}ms var(--hx-ease) backwards;
  animation-delay: calc((var(--deal-seat, 0) * 3 + var(--deal-i, 0)) * ${DEAL_STEP_MS}ms - var(--elapsed, 0ms));
}
/* Which of the three a card is, without the renderers having to say so. */
.hexdev-truco-hand > .hexdev-truco-card:nth-child(1),
.hexdev-truco-opponent-hand > .hexdev-truco-card:nth-child(1) { --deal-i: 0; }
.hexdev-truco-hand > .hexdev-truco-card:nth-child(2),
.hexdev-truco-opponent-hand > .hexdev-truco-card:nth-child(2) { --deal-i: 1; }
.hexdev-truco-hand > .hexdev-truco-card:nth-child(3),
.hexdev-truco-opponent-hand > .hexdev-truco-card:nth-child(3) { --deal-i: 2; }

/* NOTHING IS PLAYED THROUGH THE DEAL, which is the half that was asked for by
 * name. A card clicked while it is still in the air would be played from a
 * hand the player has not seen yet, and a call answered before the cards land
 * is a decision taken blind. */
.hexdev-truco-table--dealing .hexdev-truco-hand .hexdev-truco-card,
.hexdev-truco-table--dealing .hexdev-truco-action-bar {
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .hexdev-truco-table--dealing .hexdev-truco-card { animation: none; }
}

/* THE DECK, beside the seat that dealt. A stack of three backs offset by a
 * hair each, so it reads as a deck rather than as one more card in play --
 * and at a fraction of a card's size, because it is a MARK about the seat and
 * not something anybody plays. It sits in the seat's own flex row like the
 * hand does, so it can never be drawn over the cards. */
.hexdev-truco-deck {
  /* OUT OF FLOW, BESIDE the seat -- never stacked with it. Three of the four
   * anchors lay their contents out as a COLUMN, so a deck in the flex flow
   * became another row and made the seat taller: measured as the 2v2 table
   * failing its own per-tier height lock and overflowing a phone-sized
   * window. It is a mark ABOUT a seat, so it costs that seat no layout at
   * all, the same choice the turn badge makes for the same reason.
   *
   * UNDER THE TURN BADGE, and that is a priority rather than a detail. Both
   * marks hang in the same strip above the hand -- the badge centred on it,
   * this pinned to its right edge -- and neither is in flow, so nothing keeps
   * them apart. They meet exactly when the badge's text is long enough to
   * reach that edge, which is the moment it matters most: "TU TURNO DE
   * RESPONDER 0:58" is both the longest string it holds and the one carrying a
   * clock. Reported with a screenshot of the deck sitting on the digits.
   *
   * A decorative marker yields to a running clock. Still above the cards,
   * which is what this z-index was for. */
  position: absolute;
  z-index: 1;
  width: calc(var(--truco-card-width) * 0.42);
  height: calc(var(--truco-card-width) * 0.42 * 336 / 220);
}
/* Its containing block is the HAND, so it lands beside the cards rather than
 * at the far edge of a seat that spans the felt. Which side: away from the
 * middle for the two seats laid out across, and toward the middle for the two
 * laid out down -- so it never reaches past the felt's own edge. */
.hexdev-truco-hand,
.hexdev-truco-opponent-hand { position: relative; }
/* THE ROW ACROSS THE TOP KEEPS OUT OF BOTH CORNERS.
 *
 * The way out is drawn in the felt's top-right corner, picked because no
 * tier's layout uses it. That held down to 320px and stopped holding below:
 * measured on a freshly dealt hand, the partner's third card back runs 8px
 * under the button at 300 and 6px at 305 -- which is what a 320px phone really
 * hands a widget once the page has a scrollbar.
 *
 * The top anchor is the ONLY seat laid out across, so it is the only one whose
 * row grows toward a corner as the felt narrows; every other seat is a column
 * against an edge.
 *
 * BOTH corners, not just the one with the door in it, so the row stays centred
 * on the felt rather than shoved off-axis by exactly the width of a button.
 * And unscoped by tier: from 320 up the row is already far narrower than this
 * allows, so the rule resolves to nothing and costs nothing -- it only speaks
 * where the felt has actually run out of room. --hx-leave-lane is the token
 * that already describes that button's own size. */
.hexdev-truco-anchor[data-position="top"] { max-width: calc(100% - var(--hx-leave-lane) * 2); }
/* THE TWO SEATS LAID OUT ACROSS keep the deck at the outer end of their hand,
 * just clear of it -- above for the seat at the bottom, below for the one at
 * the top, both of which face empty cloth.
 *
 * Beside the cards is where it wants to be and where it started. Two
 * measurements moved it. First, the deck is a fraction of a CARD, so once
 * fullscreen began sizing cards from the window it grew with them and walked
 * 10px off the felt at 390x844. Then, pinned to the hand's own right edge
 * instead, it landed ON the third card -- because at that width there are
 * five pixels between the hand and the rail's handle lane, and no amount of
 * anchoring invents room that is not there. Clear of the row is the only
 * direction with space in it. */
.hexdev-truco-anchor[data-position="bottom"] .hexdev-truco-deck {
  left: auto;
  right: 0;
  bottom: 100%;
  margin-bottom: 6px;
}
.hexdev-truco-anchor[data-position="top"] .hexdev-truco-deck {
  left: auto;
  right: 0;
  top: 100%;
  margin-top: 6px;
}
.hexdev-truco-anchor[data-position="left"] .hexdev-truco-deck {
  left: 100%;
  bottom: 0;
  margin-left: 8px;
}
.hexdev-truco-anchor[data-position="right"] .hexdev-truco-deck {
  right: 100%;
  bottom: 0;
  margin-right: 8px;
}
.hexdev-truco-deck-card {
  position: absolute;
  inset: 0;
  /* Each back three pixels down and across from the one under it. A first
   * version used one and a half and read as a single card at this size --
   * looked at, not measured. */
  transform: translate(calc(var(--i) * 3px), calc(var(--i) * -3px));
  border-radius: 2px;
  overflow: hidden;
  box-shadow: var(--hx-lift-contact);
}
.hexdev-truco-deck-card svg { display: block; width: 100%; height: 100%; }
/* THE ONE ROW THAT PAYS FOR THE RING. The ring is an outline plus a halo:
 * both paint outside the box and take no layout space at all, which is what
 * makes the air around the cards free. The cost is that nothing in the
 * layout knows the ring is there -- so the action bar, one grid row below,
 * sat under it. Measured: the ring reaches 13px past the hand and the grid
 * gap is 8px at compact, so 5px of gold was drawn over the buttons.
 * Reported looking at it: "el recuadro dorado de las cartas del jugador se
 * solapa con los botones."
 *
 * Only the shortfall, and only where there is one: at the wide tiers the
 * grid gap is already 16px and 24px, so this resolves to zero and costs no
 * card height at all. Reserved whether or not it is the player's turn, so
 * the table does not jump every time the turn comes round. */
.hexdev-truco-hand { margin-bottom: max(0px, calc(var(--hx-ring-reach) - var(--hx-felt-gap))); }
/* flex-wrap (debt: the repo owner's own screenshot — the partner's three card
 * backs wrapped to 2 + 1 at the top of a 375px felt).
 *
 * MECHANISM, measured rather than guessed. This is the ONLY anchor that stays
 * a flex ROW (bottom/left/right are all flex-direction: column below), and in
 * 2v2 it is the only one carrying three competing children: the relation
 * label, the partner's hand, and the partner's seña chip. As a NOWRAP row it
 * was over-constrained, and the flex algorithm resolves that by SHRINKING its
 * items — the hand included. The hand is itself a wrapping flex container, so
 * every pixel shaved off its width past its own 3-card max-content size came
 * straight out of its third card, which then wrapped to a second line. The
 * cards were never too big for the felt: the hand was handed less width than
 * it asked for. MEASURED at 375px, "As de espada" (the widest of the six
 * closed señas labels): the anchor's content box is 359px, the three
 * children's natural widths total 79.58 + 188 + 106.14 = 373.72px plus 2 x
 * 6px of gap = 385.72px — a 26.72px overrun the hand alone paid for, shrinking
 * to 161.28px and dropping to two rows.
 *
 * WRAP, not shrink: a wrapping flex container breaks lines using each item's
 * own HYPOTHETICAL main size (the hand's full 3-card max-content width), so
 * the chip moves to a second line of the anchor and the hand keeps every pixel
 * it asked for. Adaptive by construction, which is why it is the whole fix
 * rather than a compact-scoped patch: it costs nothing at the widths where all
 * three children already fit on one line (byte-identical there, 1280px
 * included), and no flex-shrink/width/card-size override is stacked on top —
 * the wrap alone is what the measurement justified.
 *
 * WIDER THAN REPORTED, and this is the reason the fix is not tier-scoped: with
 * the WIDEST label the anchor wrapped at 320, 375, 414, 640, 700 AND 960px —
 * everything except 1280px. 640px is the worst tier of all (a 408px anchor:
 * the scoreboard has just become a 168px side column while the cards have just
 * grown 60px -> 84px). Without a chip on the anchor there is no overrun at any
 * width, which is why the height fences never saw this: none of their fixtures
 * sends a seña. See table-zone-overlap.browser.test.ts's own partner-row
 * fence, which asserts a shared top/bottom band at all six of those widths. */
/* A wider gap than the other anchors, and it is the ACTIVE RING that sets
 * it: that ring is drawn as an outline 10px outside the hand plus its own
 * 3px, so a label sitting 6px away was crossed by it whenever the partner's
 * turn came up — measured, with "COMPAÑERO" 6px from a hand whose ring
 * reaches 13. This anchor is the only one laid out as a ROW, so the extra
 * space is spent on the axis the felt has to spare and costs no height. */
/* NOWRAP, AND THE LABEL IS WHAT YIELDS.
 *
 * The wrap above it was written for a row of THREE -- label, hand, and the
 * partner's seña chip -- where wrapping let the CHIP drop to a second line so
 * the hand kept its full width instead of being shrunk until its third card
 * broke away. That chip is gone: a seña is transient now and lives in the
 * banner lane. With two children left, "wrap" means the HAND is what drops,
 * and the mechanism started causing the exact defect it was added to prevent.
 *
 * Found by CI, on the second machine that ever ran this suite. The runner's
 * system-ui resolves to DejaVu Sans, which draws COMPAÑERO seven pixels
 * wider -- enough to break the row and make the whole table 31.9px taller
 * there than here (528.33 against 496.42). The widget cannot answer that by
 * pinning a font: it declares var(--gx-font-family, system-ui, sans-serif) so
 * it inherits the type of the page embedding it, and any host may hand it
 * anything.
 *
 * So the row is pinned as ONE row and the two items are told who pays for a
 * squeeze. The hand never shrinks -- shrinking it is what broke the third card
 * in the first place. The label does, clipping if it must, still whole in the
 * accessibility tree: byte for byte the treatment .hexdev-truco-score-label
 * already carries, for the same reason it carries it. */
[data-position="top"] { grid-area: top; align-items: flex-start; flex-wrap: nowrap; gap: 18px; }
[data-position="top"] .hexdev-truco-opponent-hand { flex: 0 0 auto; }
[data-position="top"] .hexdev-truco-relation-label { min-width: 0; overflow: hidden; }
[data-position="bottom"] { grid-area: bottom; flex-direction: column; }
[data-position="left"] { grid-area: left; flex-direction: column; }
[data-position="right"] { grid-area: right; flex-direction: column; }
.hexdev-truco-anchor:empty { display: none; }
/* Change 3: whose turn it is must be unmistakable at a glance, not just
 * readable in text. A stronger, fully OPAQUE ring (box-shadow paints on top,
 * it never blends the felt through the anchor's own content the way the
 * opacity property would) plus a real, solid-background badge chip
 * pointing at the exact active seat — the piece that keeps meaning "a
 * specific seat" once a fourth anchor exists. */
.hexdev-truco-anchor--active {
  /* Elevation (PR2, VDS-4, paint-only): --hx-elev-3 appended to the existing
   * accent ring — the ring stays the primary "whose turn" signal, elevation
   * only adds depth behind it.
   * PR8 (WARNING-2 closure): the ring's fallback now reads --hx-gold. The
   * 6px glow (rgba(255, 209, 102, 0.28)) is a SEPARATE literal, not one of
   * the 12 var(--gx-color-accent, #ffd166) fallback sites the verify
   * report enumerated — left untouched, out of this fix's scope (see
   * apply-progress for the disposition). */
  border-radius: var(--gx-radius, 12px);
}
/* The ring goes around the CARDS, not around the seat's whole lane.
 *
 * It used to sit on the anchor, which spans the felt: measured at 855px wide
 * around 374px of cards, so most of the "turn" ring was drawn around empty
 * cloth. Reported as exactly that — the container could be narrower, with a
 * little air around the cards.
 *
 * OUTLINE, not padding or a border, and that choice is the whole trick: an
 * outline is painted outside the box and takes NO layout space at all, so
 * the air comes for free. Padding would have grown the hand, which grows the
 * anchor, which grows the felt — and this felt is vertically saturated, so
 * it would have been paid for out of card size.
 *
 * outline-offset is the air. The glow keeps its own literal, unchanged. */
.hexdev-truco-anchor--active .hexdev-truco-hand,
.hexdev-truco-anchor--active .hexdev-truco-opponent-hand {
  outline: 3px solid var(--gx-color-accent, var(--hx-gold));
  outline-offset: calc(var(--hx-ring-reach) - 3px);
  border-radius: var(--gx-radius, 12px);
  /* The glow tracks the offset: 10 of air + 3 of ring = 13, so it still
   * reads as a halo AROUND the ring rather than a second line inside it. */
  box-shadow: 0 0 0 var(--hx-ring-reach) rgba(255, 209, 102, 0.28), var(--hx-elev-3);
}
.hexdev-truco-turn-badge {
  position: absolute;
  /* HANGS ABOVE the seat's box, never into it. It used to sit at
   * top: -11px, which put 11px of a 20px badge above the edge and the other
   * 9px INSIDE — straight over the top of whichever cards were under it. In
   * a Spanish deck the rank index lives in exactly that corner, so the badge
   * was covering the one mark that says which card it is. Reported from real
   * play, then measured at 9px of overlap at every width this repo tests.
   *
   * A bottom of 100% pins the badge's own bottom edge to the anchor's top,
   * whatever the badge's height turns out to be — a fixed negative top
   * offset only ever happens to be right for one font size, and this badge's
   * own font size has already been changed once (PR8).
   *
   * Costs no layout height, which is the constraint that ruled out the
   * obvious alternative: this felt is vertically saturated, and pushing the
   * hand down to make room would have paid for a readable badge with smaller
   * cards. Absolute positioning keeps it out of flow, exactly as before —
   * only where it hangs has changed. */
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  background: var(--gx-color-accent, var(--hx-gold));
  color: var(--hx-ink);
  /* PR8 (WARNING-1 closure): nearest match, --hx-text-label (0.7rem; was
   * 0.65rem, no exact literal). Safe — position: absolute above takes this
   * badge out of flow entirely, so its own box can never move a
   * height-fenced pixel in any ancestor. */
  font-size: var(--hx-text-label);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 3px 10px;
  border-radius: 999px;
  white-space: nowrap;
  /* Elevation (PR2, VDS-4, paint-only), plus PR8's --hx-gold-edge consumer
   * (design §4.6: "1px lower edge on accent surfaces") — the badge is the
   * clearest "gold surface" in the felt (task's own hint), so its inset
   * lower edge gives the solid gold chip a hairline of depth instead of a
   * flat fill. Additive to the existing shadow list, same convention
   * --hx-relief/--hx-rim already use. */
  box-shadow: var(--hx-elev-2), inset 0 -1px 0 var(--hx-gold-edge);
  /* ABOVE THE DECK MARKER, which shares this strip and used to win it. See the
   * deck's own rule for the argument: the clock outranks the ornament. */
  z-index: 2;
}
[data-position="top"] .hexdev-truco-turn-badge { top: auto; bottom: -11px; }
/* THE SIDE SEATS HANG THEIRS ABOVE TOO, and this rule exists to say that the
 * old outer-edge placement is gone on purpose rather than by accident.
 *
 * WHAT BROKE, and it was a regression from this file's own change. These two
 * seats used to pin the badge half-outside their column with a top of 50%,
 * a right of -6px and a 50%/-50% translate, which was a clean override back
 * when the base rule positioned by a top of -11px. The base now hangs the
 * badge by a bottom of 100% (so it can never cover a card's rank index
 * again), and top alone no longer displaces that: with BOTH top and
 * bottom set on an auto-height box, the used height becomes
 * containing-block - top - bottom, which here is 325 - 162.5 - 325. Negative,
 * so it clamps. MEASURED at a 1553px shell: the badge came out 125x6, six
 * pixels of box around 11.2px of text, and hanging 68px past the felt's own
 * right edge into the cloth.
 *
 * Hanging above the seat is what the other three anchors already do (the top
 * seat's own rule below points its badge downward INTO the table, which is
 * the one place an outward badge would leave the felt). It keeps the badge
 * inside the felt, it costs no layout height because the badge is still out
 * of flow, and it means one placement rule instead of three that have to be
 * kept in agreement -- which is precisely what failed here. */
[data-position="left"] .hexdev-truco-turn-badge,
[data-position="right"] .hexdev-truco-turn-badge {
  top: auto;
  bottom: 100%;
  left: 50%;
  right: auto;
  transform: translateX(-50%);
}

/* Slice 4a: the consult badge — same chip, calmer tone. It REPLACES the turn
 * badge for the duration (never a second chip beside it), so a different
 * background is what tells the two states apart at a glance: gold says
 * "act now", this says "a question is in flight". */
.hexdev-truco-turn-badge[data-kind="consult"] {
  background: var(--hx-felt-outline);
}

/* WHO said it, marked on the seat that said it.
 *
 * The centre banner names a TEAM ("Canto: Ellos") and there are three other
 * seats in 2v2, so on its own it could never answer which of them spoke --
 * and consecutive calls replaced each other in that one banner faster than
 * anyone could read them. Reported from real play against bots as exactly
 * that: the calls felt out of control.
 *
 * OVER the cards rather than beside them, because the whole job of this chip
 * is attribution: it has to be impossible to read it as belonging to the
 * neighbouring seat. Absolutely positioned and centred on the anchor, so it
 * costs no layout height anywhere -- the same constraint the turn badge
 * documents just above, and for the same reason: this felt is vertically
 * saturated and anything that took flow space here would be paid for out of
 * card size.
 *
 * pointer-events: none because it sits on top of the local player own hand
 * for its two seconds, and a decoration that eats a click on a card the
 * player is trying to play would be worse than the problem it solves.
 *
 * The empty rule is this package own convention for transient surfaces
 * (the call log, the sena notice and the hand-outcome banner all disappear
 * this way): the renderer empties the host and the stylesheet takes the box
 * out of the picture. */
/* The consult control, beside the señas toggle because the two spend one
 * budget. Same understated treatment as that toggle for the same reason: a
 * player who does not want to ask must not be visually nagged into it. */
.hexdev-truco-consult:empty { display: none; }
.hexdev-truco-consult {
  max-width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
/* AN ITEM INSIDE THE PICKER, alongside the six señas, so it is dressed like
 * one of them rather than like a control of its own. It keeps a heavier
 * border than a plain seña because it is the item with a deadline — a call is
 * waiting on an answer — and it is the only one that ASKS rather than tells. */
.hexdev-truco-consult-toggle {
  min-height: 40px;
  padding: 6px 16px;
  border: 2px solid var(--hx-felt-outline);
  border-radius: var(--gx-radius, 999px);
  background: transparent;
  color: var(--hx-felt-text);
  font-family: inherit;
  font-size: var(--hx-text-body);
  font-weight: 600;
  box-shadow: var(--hx-elev-2);
  cursor: pointer;
  white-space: nowrap;
}
.hexdev-truco-consult-toggle:disabled { cursor: default; font-style: italic; }
/* Slice 4b — the ASK, on the partner's own screen. A row beside the real
 * call buttons, not one of them (spec's own structural isolation): its own
 * question, its own two buttons, dressed like the escalation ladder's own
 * buttons so it reads as "a decision" without reading as "a call". */
.hexdev-truco-consult-ask {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.hexdev-truco-consult-ask-question {
  margin: 0;
  font-size: var(--hx-text-meta);
  font-weight: 600;
}
.hexdev-truco-consult-answer {
  min-height: 40px;
  padding: 6px 16px;
  border: 2px solid var(--hx-felt-outline);
  border-radius: var(--gx-radius, 999px);
  background: transparent;
  color: var(--hx-felt-text);
  font-family: inherit;
  font-size: var(--hx-text-body);
  font-weight: 600;
  cursor: pointer;
}
.hexdev-truco-consult-advice {
  font-size: var(--hx-text-meta);
  font-weight: 700;
  white-space: nowrap;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.4);
  color: var(--hx-felt-text);
}

.hexdev-truco-seat-call {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 3;
  pointer-events: none;
  /* A COLUMN, because one seat can hold two open claims at once: envido is
   * legal on top of an unanswered truco, and the engine freezes that truco
   * rather than cancelling it. Two chips stacked read as two claims; two
   * chips absolutely centred on the same point read as one replacing the
   * other, which is how this was reported. */
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
/* A SIDE SEAT'S CHIP GROWS INWARD. Centred on its seat is right for the two
 * seats with room either side of them; a side seat is 45px wide against a
 * chip near 110, and against the felt's own edge -- so half of it hung off
 * the screen. Measured at 320/375/414px on the left anchor: the chip started
 * at -24.9, -20.7 and -17.8px. Reported from real play, on "No quiero".
 *
 * Pinned to the seat's inner edge instead of its centre, so it opens toward
 * the middle of the table -- the same correction the turn badge took, for the
 * same reason. Nothing about which seat it belongs to changes: it still sits
 * on that seat's own box. */
.hexdev-truco-anchor[data-position="left"] .hexdev-truco-seat-call {
  left: 0;
  transform: translateY(-50%);
  align-items: flex-start;
}
.hexdev-truco-anchor[data-position="right"] .hexdev-truco-seat-call {
  left: auto;
  right: 0;
  transform: translateY(-50%);
  align-items: flex-end;
}

.hexdev-truco-seat-call:empty { display: none; }
.hexdev-truco-seat-call-chip {
  display: block;
  white-space: nowrap;
  text-align: center;
  background: var(--gx-color-accent, var(--hx-gold));
  color: var(--hx-ink);
  font-size: var(--hx-text-body);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 10px 14px;
  border-radius: var(--gx-radius, 12px);
  box-shadow: var(--hx-elev-4), inset 0 -1px 0 var(--hx-gold-edge);
}

/* The per-turn countdown, INSIDE the badge that already names the seat on the
 * clock. Adds no box of its own: it is an inline span in a pill that is
 * already position: absolute and white-space: nowrap, so it widens the pill
 * symmetrically about its centre and cannot move a height fence.
 *
 * tabular-nums is load-bearing, not polish. Proportional digits have
 * different advance widths, so a countdown would make the pill breathe
 * in and out by a pixel or two every single second, right next to the
 * player's own cards. Tabular figures pin every digit to one width, so the
 * pill's width changes only when the MINUTE digit drops a character. */
/* A SIDE SEAT WEARS IT DOWN THE SIDE. Hanging centred above the seat is
 * right for the two seats that have room above them; a side seat is already
 * against the felt's edge, and half of a 125px badge has nowhere to go.
 * Measured at 375px: 23px of it painted outside the cloth, and the reported
 * screenshot read "RNO DEL RIVAL".
 *
 * Turned vertical it is about 24px wide instead of 125, and placed on the
 * INNER side -- toward the middle of the table, never outward past the edge
 * that caused this. It still hangs OUTSIDE the anchor's own box, which is
 * what keeps it off the cards it points at: that was always the rule, and it
 * survives the rotation.
 *
 * Same idea as the rail's own handle, and deliberately so: on this table a
 * label that has to live against an edge runs along it. */
.hexdev-truco-anchor[data-position="left"] .hexdev-truco-turn-badge,
.hexdev-truco-anchor[data-position="right"] .hexdev-truco-turn-badge {
  writing-mode: vertical-rl;
  bottom: auto;
  top: 50%;
  transform: translateY(-50%);
}
.hexdev-truco-anchor[data-position="left"] .hexdev-truco-turn-badge {
  left: 100%;
  right: auto;
}
.hexdev-truco-anchor[data-position="right"] .hexdev-truco-turn-badge {
  left: auto;
  right: 100%;
}


.hexdev-truco-turn-clock {
  margin-left: 6px;
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
  /* Slightly recessive against the label it follows: the seat name is the
   * message, the seconds are the qualifier. */
  opacity: 0.8;
}

.hexdev-truco-center {
  grid-area: center;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 0;
  overflow: hidden;
  /* Banner lane (PR5-T4, tasks §9, design D-5): reserving the banner's own
   * lane as padding-top removes its rectangle from this column's OWN
   * centering calculation entirely, so "the trick area never meets the
   * banner" holds at ANY container height, not only tall ones — unlike
   * offsetting the trick area itself (.hexdev-truco-played--top set to
   * top: var(--hx-band-banner)), which stays correct only while the centre
   * row is tall enough that its own 1fr track does not shrink toward the
   * trick's min-height first. */
  padding-top: var(--hx-band-banner);
}

/* Stable window height (apply prompt): playing the LAST card in hand empties
 * this row entirely (0 cards -> 0 height), a real drop of one full card's
 * own height right at the end of every hand — "cards played" from the
 * acceptance list, not the calls/banners already covered above. Reserving
 * one card row's height, expressed via the same --truco-card-width token
 * the card itself is sized from (matching .hexdev-truco-trick's own calc()
 * convention below), keeps that one-row worst case constant across 3, 2, 1,
 * or 0 remaining cards — for the ROW-layout case (this player's own hand,
 * and a 1v1 opponent / 2v2 partner at top/bottom).
 *
 * WHAT "ONE ROW" ACTUALLY DEPENDS ON (corrected: this comment used to claim
 * "up to 3 cards always fit on one line at every supported width, so the row
 * never needs a second line" — the repo owner's own 2v2 screenshot falsified
 * it, the partner's third card back sitting below the other two). A
 * min-height RESERVES one row; it does not ENFORCE one. flex-wrap: wrap is
 * still on below, and a hand handed less width than its own 3-card
 * max-content size still wraps — min-height only stops this box collapsing,
 * never stops it growing. Width alone was never the binding constraint:
 * three cards are comfortably narrower than the felt everywhere (MEASURED
 * worst case, 640px 2v2 — 260px of cards inside a 408px anchor). The real
 * constraint is the CONTAINING ANCHOR: this row stays one row exactly as long
 * as nothing sharing its flex line squeezes it below that max-content width.
 * Only one anchor has co-tenants at all — the 2v2 top anchor, which also
 * carries the relation label and the partner's seña chip — and it is a
 * WRAPPING flex row for precisely this reason (see [data-position="top"]'s
 * own comment above, and the partner-row fence in
 * table-zone-overlap.browser.test.ts).
 *
 * The column-layout case (a 2v2 left/right opponent) is NOT covered by this
 * rule and needs its own reservation below — a card removed one at a time
 * shrinks a vertical stack continuously, not just at the 1-to-0 edge. */
.hexdev-truco-hand, .hexdev-truco-opponent-hand {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: calc(var(--truco-card-width) * 336 / 220);
}
/* The opponents' row reserves what its BACKS actually are, not what a full
 * card would be. Without this the shared floor above kept the row at a whole
 * card height and --hx-back-scale bought nothing at all: the backs shrank
 * inside a box that did not, and the felt overflowed its window by 38px
 * because the fit formula had already been told to expect the saving. Found
 * running it, not reading it — the fence was measuring the felt's own BOX,
 * which an overflow:hidden keeps honest-looking while its contents spill. */
.hexdev-truco-opponent-hand {
  min-height: calc(var(--truco-card-width) * var(--hx-back-scale, 1) * 336 / 220);
}
/* Stable window height (apply prompt): a 2v2 left/right opponent's hand
 * stacks vertically, so EVERY card played shrinks it, not only the last one
 * — confirmed by measurement, not assumed (a real hand through the real
 * table dropped the felt's own height by ~35px exactly once, right when the
 * first trick fully resolved: that anchor's un-stretched content briefly
 * exceeded the centre column's own reserved height at 3 cards, then fell
 * behind it once the second opponent's hand also dropped to 2). A hand is
 * ALWAYS dealt exactly 3 cards in this engine and only ever loses cards, so
 * reserving 3 stacked cards' worth of height here is not a guessed worst
 * case — it is the true, structural maximum a 2v2 opponent's own hand can
 * ever need, which keeps this column's OWN height constant at every count
 * from 3 down to 0, not merely stable once it happens to fall below the
 * centre column. This selector's higher specificity overrides the shared
 * min-height above. */
[data-position="left"] .hexdev-truco-opponent-hand,
[data-position="right"] .hexdev-truco-opponent-hand {
  flex-direction: column;
  /* Scaled by --hx-back-scale, like every other reservation for face-down
   * backs. Without it this floor reserved three FULL card-heights while the
   * backs inside it were already drawn at 0.75 — measured at 362px for
   * 265px of cards — and since this column is what drives the centre row in
   * 2v2, that 97px of dead reservation came straight out of card size. It
   * is the same shape as the bug the shared floor above already had: a
   * min-height that kept reserving full-size cards after the cards stopped
   * being full size. */
  min-height: calc((var(--truco-card-width) * var(--hx-back-scale, 1) * 336 / 220) * 3 + 4px * 2);
}

/* Explicit height via calc(), not aspect-ratio (apply prompt round 4: a
 * reported clipped hand — every card's own box cut short by ~35%, seen
 * live through pnpm dev:server/dev:host). aspect-ratio derives this box's
 * height from its OWN intrinsic ratio resolution, which — for an element
 * whose width comes from a custom property and whose content is an <img>
 * that table.ts recreates from scratch on every single render
 * (container.replaceChildren()) — depends on the browser reconciling
 * layout, aspect-ratio, and a freshly-mounted image in the right order.
 * Deriving the height directly from the SAME width the card's own layout
 * already has (matching the real 220x336 baraja proportions, same numbers
 * .hexdev-truco-trick's own reservation already uses) makes this box's
 * geometry depend on nothing but its own width — never on image-load
 * timing or aspect-ratio resolution — which is the most robust fix
 * available for the class of bug that mechanism could produce, confirmed
 * or not. See card-render-size.browser.test.ts, the regression test this
 * round adds. */
.hexdev-truco-card {
  width: var(--truco-card-width);
  height: calc(var(--truco-card-width) * 336 / 220);
  border-radius: 6px;
  overflow: hidden;
  padding: 0;
  border: none;
  background: none;
  display: block;
}
.hexdev-truco-card img, .hexdev-truco-card svg { width: 100%; height: 100%; object-fit: contain; display: block; }
/* A face-down back is not a card the player reads — it is a COUNT. Sizing it
 * off --hx-back-scale lets the tiers where height is scarce spend less on it
 * and more on the hand the player is actually deciding from. Same specificity
 * as the rule above, so this must stay AFTER it. */
.hexdev-truco-card-back {
  width: calc(var(--truco-card-width) * var(--hx-back-scale, 1));
  height: calc(var(--truco-card-width) * var(--hx-back-scale, 1) * 336 / 220);
}
.hexdev-truco-card--playable {
  cursor: pointer;
  /* Elevation (PR2, VDS-4, paint-only): resting --hx-elev-2, hover/focus
   * --hx-elev-3 below — box-shadow and transform only, never a property
   * that could move layout (card-render-size.browser.test.ts's own zero
   * height-delta fence proves this). */
  box-shadow: var(--hx-elev-2);
  /* Motion (PR2, VDS-5): capped at --hx-motion-fast/--hx-ease, disabled
   * entirely under prefers-reduced-motion below — "nothing animated at
   * rest" (refinement 3) plus a restrained, capped transition here. */
  transition: transform var(--hx-motion-fast) var(--hx-ease), box-shadow var(--hx-motion-fast) var(--hx-ease);
}
.hexdev-truco-card--playable:hover, .hexdev-truco-card--playable:focus-visible {
  transform: translateY(-10%);
  box-shadow: var(--hx-elev-3);
}
/* VDS-5: a reduced-motion user gets no transition — the hover/focus state
 * still applies instantly (transform/box-shadow still change), only the
 * animated interpolation between states is removed. */
@media (prefers-reduced-motion: reduce) {
  .hexdev-truco-card--playable { transition: none; }
}
/* A card you cannot play right now must read as waiting, not as broken.
 *
 * Deliberately NOT opacity: this sits on green cloth, and opacity lets the
 * cloth through, so the card comes out tinted green rather than dimmed — it
 * reads as a colour problem with the artwork, which is exactly how it was
 * first reported. brightness and saturate dim the card's own pixels and
 * never blend the surface behind it.
 *
 * The previous values (0.55 opacity plus 40% grayscale) also went far past
 * "not now" into "this card is disabled forever". The point is only to make
 * the playable ones stand out.
 *
 * Elevation (PR2, VDS-4): deliberately NO box-shadow here — every other
 * surface in this file gets --hx-elev-1..4, but a locked card gets none at
 * all, so "waiting" never reads as "lifted/interactive" the way a hovered
 * playable card does. */
.hexdev-truco-card--locked {
  filter: brightness(0.80) saturate(0.85);
  cursor: default;
}

/* A single view snapshot never carries more than ONE in-progress-trick play
 * (the engine resolves a trick's second card and clears it atomically — see
 * table.ts's own docstring), so absolute positioning per play is safe: there
 * is never a second card to collide with. The extra height (vs. exactly one
 * card) is what gives the top/bottom offset room to actually read as "closer
 * to that seat" instead of sitting dead-centre regardless of who played it. */
.hexdev-truco-trick { position: relative; display: flex; align-items: center; justify-content: center; min-height: calc(var(--truco-card-width) * 336 / 220 * var(--hx-trick-rows, 1.7)); width: 100%; }
/* Per-seat pile offset (T-8, spec: "Persistent Per-Seat Card Piles").
 * --truco-pile-index is set inline per card by played-cards.ts, one integer
 * per play, counting from 0 within its own seat. The offset leans up and
 * right so a growing pile reads as depth, not as a random jitter; since the
 * multiplier is index 0 for a single-card trick, this transform resolves to
 * a literal zero offset there, which is exactly what keeps a single-card
 * trick byte-identical to the pre-pile rendering. Position stays absolute,
 * so N stacked cards still contribute exactly one card's worth of layout
 * height, same as before this change. No z-index anywhere here: DOM order
 * alone decides which card paints on top, matching played-cards.ts's own
 * chronological append order. */
.hexdev-truco-played {
  position: absolute;
  --truco-pile-index: 0;
  transform: translate(calc(var(--truco-pile-index) * 6px), calc(var(--truco-pile-index) * -6px));
}
.hexdev-truco-played--top { top: 0; }
.hexdev-truco-played--bottom { bottom: 0; }
.hexdev-truco-played--left { left: 15%; }
.hexdev-truco-played--right { right: 15%; }

/* Change 2: the tanteador's own home — chrome, not felt. Its own solid
 * background (a real box, distinct from the play surface) is what makes a
 * 0-0 score read as "an intentional, present scoreboard" rather than loose
 * text floating on cloth; hybrid theming by zone (design §10) means this
 * background/label take the tenant's --gx- tokens, while the matchsticks
 * drawn inside keep their own fixed identity. */
.hexdev-truco-scoreboard-panel {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  justify-content: center;
  flex-wrap: wrap;
  background: var(--gx-color-surface, #26433a);
  color: var(--gx-color-on-surface, #f2f2f2);
  border-radius: var(--gx-radius, 12px);
  padding: 8px 12px;
  /* Elevation (PR2, VDS-4, paint-only): --hx-elev-1 + --hx-relief. */
  box-shadow: var(--hx-elev-1), var(--hx-relief);
}
/* width: 100% so the two teams' blocks are the SAME width and their
 * matchsticks therefore land on the same x. Each group used to size to its
 * own content, and "Nosotros" is a wider word than "Ellos" — measured, the
 * two scoreboards sat 14px apart, which is exactly the misalignment reported.
 * The label no longer decides the block's width, so the words can differ
 * without the score drifting with them. */
.hexdev-truco-scoreboard-group { display: flex; flex-direction: column; align-items: center; gap: 2px; width: 100%; }
/* PR8 (WARNING-1 closure): font-size 0.75rem === --hx-text-meta exactly
 * (zero-pixel token swap). letter-spacing was 0.04em, the nearest existing
 * value below --hx-tracking-label's 0.08em (no exact match anywhere in
 * either stylesheet) -- letter-spacing changes glyph advance width only,
 * never a line box's height, so widening it here cannot move any
 * height-fenced pixel. */
.hexdev-truco-team-label { display: block; font-size: var(--hx-text-meta); font-weight: 700; text-transform: uppercase; letter-spacing: var(--hx-tracking-label); color: var(--gx-color-accent, var(--hx-gold)); text-align: center; }
.hexdev-truco-score-group { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.hexdev-truco-score-label { font-size: 0.65rem; opacity: 0.8; }
.hexdev-truco-score-sticks { display: flex; flex-wrap: wrap; gap: 2px; justify-content: center; }

/* FU-3 (debt: compact scoreboard strip, MEASURED 158.59px at 375px against
 * a ~100px design target). Where the height went, measured piece by piece:
 * .hexdev-truco-scoreboard had NO rule at all — a default block — so the
 * malas and buenas groups stacked vertically, paying the 47.8px casita row
 * height TWICE per team plus two 13px caption lines (16 padding + 15 label
 * + 2 gap + 13+2+47.8 malas + 13+2+47.8 buenas = 158.6). The fix lays each
 * team out as ONE horizontal row: team label inline at the left, malas and
 * buenas side by side, captions rotated vertical beside their sticks.
 * Every lever below is measurement-forced, not taste: 12 worst-case casitas
 * (28-27, target 30) at their natural 47.8px are 573.6px of width against
 * the 351px available inside the panel at 375px, so one sticks row per team
 * (two rows total) is structurally required — and 16px padding + two
 * untouched 47.8px rows alone already exceed the target, so the casitas
 * must also shrink (34px CSS box on the svg overrides its own width/height
 * attributes; strokes scale to ~71%, verified legible against the
 * recaptured baseline). Horizontal captions do not fit either: label 75.8
 * + captions 29.4/36.5 + 6 casitas + gaps = ~379px, over the 351px budget,
 * while a rotated caption spends 13px of width instead. FU-3's result was
 * 8+8 padding + two 36.5px rows (the rotated Buenas caption, NOT the casita,
 * was the row's tallest box) + 4px row gap = ~93px.
 *
 * WHAT THAT ARITHMETIC COST, and what this block now does instead (the phone
 * fold, PHONE_VIEWPORT_CEILING in table-height-budget.browser.test.ts). Two
 * things follow from the caption having been the row's tallest box, and both
 * were live defects:
 *
 * (1) THE CASITA SIZE WAS BUYING NOTHING. FU-3 shrank the casitas to 34px
 *     specifically to buy height, and bought exactly zero of it: at 34px they
 *     were already 2.5px shorter than the 36.5px caption beside them, so the
 *     row height never moved. Any further casita shrink alone would have been
 *     equally free of effect. The caption had to go first.
 *
 * (2) A ROTATED CAPTION CANNOT BE PINNED THE WAY THIS REPO PINS EVERY OTHER
 *     TEXT BOX ON A FIXED BUDGET. .hexdev-truco-trick-feedback and
 *     .hexdev-truco-banner-slot both close exactly this defect class by pinning
 *     line-height, because in both the height at risk is a LINE BOX. Under
 *     writing-mode: vertical-rl the element's PHYSICAL HEIGHT is its INLINE
 *     size — the sum of its glyph advance widths — and line-height controls its
 *     block size, which after the rotation is its physical WIDTH. So the
 *     sibling fix moves the one dimension that was never the problem. Measured
 *     over six probe faces at 375px, worst case: as shipped 92.94..210.70;
 *     captions at 0.5rem 76.00..210.70; captions at 0.5rem WITH every leading
 *     pinned 76.00..150.31. Seventy-four pixels of font-dependence survive the
 *     faithful application of the sibling fix.
 *
 * So the caption leaves the flow entirely: visually hidden, still announced,
 * the same clip-path: inset(50%) treatment .hexdev-truco-announcer
 * already uses — the row's height then falls to
 * the casita SVG, which is pure geometry with no font in the path at all, and
 * the casitas at 28px finally buy the height FU-3 expected of them. Sighted
 * players lose the two words; the malas-then-buenas reading order is the
 * conventional tanteador layout and is unchanged, and a screen reader still
 * gets both labels. The one text box left in the row, the team label, IS a
 * plain line box, so it gets the sibling treatment properly: line-height pinned
 * so it costs one number, and white-space: nowrap so it is one LINE — the wrap
 * axis those two files explicitly leave open, closable here only because this
 * label's whole vocabulary is two fixed words (the same reasoning
 * .hexdev-truco-sena-notice already uses for its own six).
 *
 * Result: 8+8 padding + two 28px casita rows + 4px row gap = 76.00px exactly,
 * on every font, at 320px and 375px, at the 12-casita worst case and at 0-0.
 * Fenced twice: table-height-budget.browser.test.ts's own FU-3 fence for the
 * number, scoreboard-panel-line-box.browser.test.ts for the property that the
 * number means anything.
 *
 * Scoped to the compact tier only via the shell's existing @container axis
 * — (width < 640px) is the exact complement of the (min-width: 640px) block
 * above, where the panel becomes a side COLUMN and none of this applies.
 * Placed AFTER the base rules above because at equal specificity source
 * order wins regardless of @container nesting (this file's own PR4
 * correction note); the disjoint query is what keeps wide tiers untouched.
 * Chrome/felt split (design section 10) unchanged: every rule below is pure
 * geometry — the panel's colors keep reading their --gx- tokens and the
 * matchstick tones stay truco's own. */
@container hexdev-truco-shell (width < 640px) {
  .hexdev-truco-scoreboard-panel { flex-direction: column; align-items: stretch; gap: 4px; }
  .hexdev-truco-scoreboard-group { flex-direction: row; justify-content: center; gap: 6px; }
  /* flex: none — the casitas never pay for the team label's width. Without it
   * the last font-dependence in this panel survived at 320px: a face drawing
   * "NOSOTROS" 2.2x wider over-constrains this row, flex resolves that by
   * shrinking every item including the sticks, and a squeezed sticks box (it is
   * flex-wrap: wrap, deliberately, as a genuine overflow valve) wraps its
   * casitas onto a second 28px line — 76px of panel becoming 106px, by wrap
   * count rather than by line box, which is the same axis pinning a leading
   * cannot reach. Refusing to shrink here moves every pixel of that pressure
   * onto the label instead, which absorbs it below. Inert at normal font
   * widths: nothing here overflows, so nothing shrinks, so nothing moves. */
  .hexdev-truco-scoreboard { display: flex; align-items: center; gap: 6px; flex: none; }
  .hexdev-truco-score-group { flex-direction: row; gap: 3px; }
  /* Visually hidden, never display: none or visibility: hidden — both remove
   * an element from the accessibility tree, and "Malas"/"Buenas" is the only
   * thing telling a screen-reader user which run of casitas is which. Byte-for
   * -byte the treatment .hexdev-truco-announcer already carries. The
   * writing-mode/transform
   * reset is not cosmetic: position: absolute alone would take the caption out
   * of flow but leave it a rotated box to paint, and it is the ROTATION that
   * made this element's physical height a font's advance widths in the first
   * place (see this block's own header). */
  .hexdev-truco-score-label {
    writing-mode: horizontal-tb;
    transform: none;
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }
  /* THE BAND'S WIDTH BUDGET, on the screen with the least of it.
   *
   * Measured at 320px, where the band has 304px to hand out:
   *
   *     Seña/Consulta (3) ..... 162px   53% of the band
   *     every call button ..... 130px   all of them, together
   *
   * And it never yielded a pixel of that at any width from 320 to 1440. What
   * it did to a rival's escalated envido was worse than a tight fit -- the two
   * groups split what was left in proportion to what each WANTED, so the group
   * the player owes an answer to came out behind the one they may skip:
   *
   *     respuesta (Quiero / No quiero) ..... 40px of the 184 it needs
   *     escalada  (Envido envido / ...) .... 82px of the 383 it needs
   *
   * Forty pixels of "Quiero" with a turn clock running.
   *
   * So below 640px the words go, the glyph and the count stay, and the ~114px
   * that frees goes to the calls. Same treatment and same reason as
   * .hexdev-truco-score-label directly above: the clip, NEVER display: none or
   * visibility: hidden, both of which would take "Seña/Consulta" out of the
   * accessible name and leave a screen-reader user with a button called "(3)". */
  .hexdev-truco-senas-toggle-words {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }
  /* Compact only: alone in a drawer the button has room, but the drawer is
   * narrow, so the glyph and the count sit closer together. */
  .hexdev-truco-senas-toggle { gap: 4px; padding: 6px 12px; }
  /* The only text left standing in this row, so it gets the pin the two
   * sibling boxes carry: 1.2 matches their choice exactly (never
   * var(--hx-leading), which is the chrome's 1.35 body-copy rhythm), and
   * nowrap closes the line-COUNT axis they leave open — legitimate here and
   * nowhere else in this panel, because this label only ever holds one of two
   * fixed words. Both together are what let the casita geometry below be the
   * whole of this row's height.
   *
   * min-width: 0 + overflow are the other half of the sibling rule's flex:
   * none above. A nowrap label cannot wrap, so an over-wide one has to be
   * absorbed somewhere; this is where. The label shrinks and clips (still
   * whole in the accessibility tree) rather than squeezing the casitas onto a
   * second row — a truncated word beats a scoreboard that changes height, and
   * of the two things in this row the score is the one a player is reading. */
  .hexdev-truco-team-label { line-height: 1.2; white-space: nowrap; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  /* 34px -> 28px. At 34 this box was 2.5px shorter than the rotated caption
   * beside it and therefore bought no height at all; with the caption out of
   * flow it IS the row, so every pixel here is a pixel of widget. The SVG's own
   * width/height attributes are overridden by this CSS box, strokes scale with
   * it, and 12 of them still fit one row per team inside the 351px available at
   * 375px (and inside 296px at 320px) with no wrap. */
  .hexdev-truco-score-sticks svg { width: 28px; height: 28px; }
}

/* Stable window height (apply prompt, round 3): the pending-call and
 * hand-outcome banners are mutually exclusive in time (a pending call always
 * clears before a hand-outcome event can be derived) but each independently
 * appears/disappears via its own :empty { display: none } rule below. A
 * FIRST fix reserved a shared min-height here so the table never resized as
 * either one appeared or vanished — genuinely eliminated the fluctuation,
 * but at a real, permanent cost: reserving every transient element's worst
 * case made the whole table taller than a real phone's own visible viewport
 * (measured: 739px/859px against a ~530-601px iPhone SE viewport — the "UI
 * linda y cómoda" requirement failing a different way). This slot now floats
 * OVER the felt instead (position: absolute, out of flow entirely, same
 * technique .hexdev-truco-turn-badge and .hexdev-truco-match-over already
 * use) — it cannot affect the table's height at all, at zero permanent
 * cost, rather than merely being sized not to. Non-interactive (no buttons
 * live here), so pointer-events: none guarantees it never swallows a tap
 * meant for anything underneath it. */
.hexdev-truco-banner-slot {
  position: absolute;
  top: 0;
  /* Spans the WHOLE centre column, replacing the old left: 50% +
   * translateX(-50%) anchor. That anchor centred the slot but quietly capped
   * its shrink-to-fit width at HALF the column: an absolutely positioned box
   * with an auto width resolves its available width from its own left edge
   * to the containing block's right edge, so anchoring at 50% halves it
   * before the translate ever runs. At 2v2 the centre column is narrow
   * enough that the pending pill's spans wrapped into extra line boxes
   * inside that halved width and outgrew the lane it floats over — measured
   * worst case 119.78px in a 112px lane at medium (even plain "Truco" from
   * the responder's view came out 113.06px), the top of the level line
   * clipped by .hexdev-truco-center's own overflow: hidden. Pinning both
   * inline edges gives occupants the full column to lay out in before any
   * wrap (worst case drops to 69.89px, under every 2v2 lane), and the
   * justify-content: center below keeps them exactly as centred as the
   * transform did — a flex item still shrink-wraps to its content, only the
   * width it may wrap AT has changed. */
  inset-inline: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  /* Only ever between two SIMULTANEOUS occupants (a pending call and a
   * partner's seña notice, the one non-exclusive pair this lane can hold).
   * A display:none child is not a flex item at all, so with the usual single
   * occupant this declaration changes nothing — no existing capture moves by
   * a pixel because of it. */
  gap: 8px;
  pointer-events: none;
  /* PR5-T4 (tasks §9, design D-5): the banner's own reserved lane height —
   * paired with .hexdev-truco-center's own padding-top above, which is what
   * actually removes the lane from that column's centering calculation. */
  height: var(--hx-band-banner);
  /* Font-independence (banner-lane-line-box.browser.test.ts), the same defect
   * .hexdev-truco-trick-feedback carries its own note about further below.
   * "--hx-band-banner" is a hardcoded pixel constant — the same 56px
   * on every machine — but every line of text this lane holds was
   * "line-height: normal", which each font answers out of its own
   * ascent/descent/line-gap. So the lane was budgeted against one desktop's
   * font and handed to everyone: measured headless at 700px, the pending-call
   * pill came out 78px against its 76px lane and painted over the top of a
   * played card. The lane's own token comment sizes it as "worst-case 58px +
   * ~2px headroom"; ~2px over text with no fixed leading is not headroom.
   *
   * Declared HERE, on the lane, rather than three times on its occupants:
   * "line-height" inherits, and a unitless value inherits as a FACTOR that each
   * descendant recomputes against its own font-size — so one declaration pins
   * the pending-call pill's three spans (1.1rem level, 0.75rem caller, 0.75rem
   * turn), the seña notice's two and the hand-outcome chip's two at once, and a
   * fourth occupant added to this slot later is covered the day it is added.
   * Measured across four faces spanning squat to towering vertical metrics:
   * 30/44/88/172px before, one number after, at every tier and seat count.
   *
   * 1.2, matching the trick-feedback line's own choice, NOT "var(--hx-leading)"
   * (1.35): that is the chrome's body-copy rhythm, and at 1.35 the compact
   * two-line pill alone wants 63.5px of a 60px lane. It also lands within a
   * pixel of what this desktop already drew (69px -> 69.89px at 700px/1v1), so
   * pinning the leading is not also a redesign of how the pill looks.
   *
   * WHAT THIS DOES NOT PIN, deliberately: how MANY line boxes there are. Line
   * count follows glyph advance widths, so a genuinely wider font still wraps
   * differently. Forbidding the wrap ("white-space: nowrap", which the seña
   * notice below does get away with on a closed six-label vocabulary) was
   * measured and rejected here: at 375px/2v2 the widest reachable row-pill
   * needs ~264px against a 223px centre column, trading a vertical overflow for
   * a horizontal one. Lane containment against real text stays
   * table-zone-overlap.browser.test.ts's job. */
  line-height: 1.2;
}
/* Stable window height, font-independence (trick-feedback-line-box.browser.
 * test.ts): this is the one line on the table that is EMPTY for most of a hand
 * and fills the instant a trick resolves, so what it costs filled has to equal
 * what it reserves empty or the whole table steps every time.
 *
 * "min-height" alone only bought half of that. The reservation is a fixed
 * multiple of this element's own font-size — the same on every machine — but
 * with no "line-height" the FILLED line box was "normal", which each font
 * answers out of its own ascent/descent/line-gap. Measured at 0.85rem against
 * this 16.3125px reservation: Liberation Sans 15, Adwaita Sans 16, DejaVu Sans
 * 16, Noto Sans 19. So the table held still for whoever drew it in the first
 * three and grew 2.6875px mid-hand for anyone on the fourth — including this
 * repo's own headless runs, where fontconfig picks exactly that.
 *
 * The two numbers below are therefore ONE number and must stay equal: a
 * unitless "line-height" is the same fraction of font-size that "1.2em" is, so
 * a filled line box lands exactly on the floor for EVERY font instead of
 * clearing it by whatever that font's metrics happen to be. Not
 * "var(--hx-leading)" (1.35): that is the chrome's body-copy rhythm and it
 * would overflow this reservation by design. */
.hexdev-truco-trick-feedback {
  margin: 0;
  min-height: 1.2em;
  line-height: 1.2;
  text-align: center;
  font-size: 0.85rem;
  /* Given the felt's own text colour and a little weight, explicitly. This
   * is the only line on the cloth that reports the RESULT of a trick and it
   * was the faintest thing on screen — neither property can move a
   * height-fenced pixel. */
  color: var(--hx-felt-text);
  font-weight: 600;
  /* TRANSFORM, not margin, and the fence is why. The turn badge hangs off
   * the seat below with its bottom pinned to that seat's top edge, which
   * lands it ONE pixel under this line — measured — so a real message
   * ("Baza parda") read as crowded rather than as information. A
   * margin-bottom was the obvious fix and it cost 8.08px of felt height at
   * 375px, which table-height-stability.browser.test.ts refused immediately:
   * the centre row has no slack to absorb it there. A transform moves the
   * painted line without touching layout at all, so the clearance is free at
   * every tier instead of only the ones with room to spare. */
  transform: translateY(-8px);
}

/* PR5-T2 (tasks §9, design §7.2, D-3/blessed refinement 1 — tasks §1 item 1):
 * the action bar is now a RESERVED GRID ROW below the hand, in flow, at
 * every tier (the .hexdev-truco-table base rule's own "actions" row/
 * --hx-band-action-total track above) — not a floating tray. This is what
 * makes the badge/tray axis conflict structurally impossible: the badge
 * lives at top: -11px of the bottom anchor; the bar is a sibling GRID ROW
 * below that same anchor. Different edges, no shared axis, at any tier —
 * see tasks §2.2 for why no badge-repositioning CSS exists anywhere in this
 * file. The three floating-only rules that no longer apply to an in-flow
 * element are gone: position: absolute, bottom: 100%, and the
 * pointer-events: none / > * { pointer-events: auto } pair (a plain in-flow
 * box does not swallow taps outside its own box; that pairing only existed
 * to protect the space AROUND a floating tray whose own footprint used to
 * cover live cards underneath it).
 *
 * Renamed from .hexdev-truco-action-tray — "tray" named a floating surface
 * that no longer exists. Verified: no test asserts the old class name (only
 * a comment in table-2v2.visual.test.ts, fixed alongside this rename).
 *
 * D-11 (design): this recess is FELT furniture, not chrome — its own
 * background/box-shadow read the private --truco-cloth-lane/--hx-relief
 * tokens, never --gx-*. The BUTTONS inside it (.hexdev-truco-call,
 * .hexdev-truco-senas-toggle, .hexdev-truco-sena) stay chrome and keep
 * reading var(--gx-*, fallback) unchanged. */
.hexdev-truco-action-bar {
  grid-area: actions;
  /* THE ONE ROW THAT TAKES THE HANDLE LANE BACK. The felt reserves a strip on
   * its right so the drawer's handle is never drawn on a card, and every grid
   * row inside that padding pays for it -- including this one, which cost the
   * bar six pixels it did not have: measured at 375px, 340px of buttons in a
   * 334px band, and "Seña/Consulta (3)" was cut. Reported looking at it.
   *
   * This row can take it back because it can never collide with the handle:
   * the handle is centred in the rail's band, well above the action row (at
   * 375px, y197-y344 against a bar starting at y456), and the drawer opens
   * leftward from there. Fenced rather than argued -- the handle-overlap
   * fence in table-zone-overlap.browser.test.ts checks this bar too. */
  margin-right: calc(-1 * var(--hx-rail-handle-lane, 0px));
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--hx-space-2xs);
  min-width: 0;
  /* The band NEVER grows: contents scroll, the track itself is fixed
   * (--hx-band-action-total on the felt's own grid-template-rows). Both axes
   * scroll EXPLICITLY, on purpose: overflow: hidden is a shorthand that sets
   * overflow-y to "hidden", never "visible", so the UA's "one axis
   * non-visible forces the other to auto" coercion this rule used to rely on
   * never actually fires — vertical overflow was silently clipped, not
   * scrollable (PR5 correction, native review CRITICAL). The y-scroller is
   * real, load-bearing work: 1v1's own edge case where two call groups (a
   * response plus an envido escalation) are simultaneously legal inside the
   * single compact/1v1 strip, per envido-chain.ts's own canOpenEnvido rule
   * that envido may still interrupt a pending, unanswered truco call. */
  overflow-x: auto;
  overflow-y: auto;
  /* The x-scrollbar must not be paid for out of the band's own height.
   *
   * This band is a FIXED track, and its compact value (40px) is exactly one
   * button's min-height — there is no slack in it. A classic (non-overlay)
   * scrollbar is ~15px of the CONTENT box, so the moment the row was wide
   * enough to scroll horizontally the band had 25px left for a 40px control
   * and clipped it, which then tripped overflow-y: auto as well: a second,
   * vertical scrollbar caused entirely by the first one. Measured at 375px
   * 2v2, where four buttons genuinely do not fit — see
   * action-bar-fit.browser.test.ts.
   *
   * Reserving the 15px instead was the alternative, and it is not available:
   * compact 2v2 clears PHONE_VIEWPORT_CEILING (601px) by 13.66px, so a
   * taller band would put the widget back below the phone fold — the exact
   * regression table-height-budget.browser.test.ts exists to prevent.
   *
   * Nothing becomes unreachable. The row still scrolls by touch, trackpad
   * and wheel, and Tab moves focus button to button with the browser
   * scrolling each into view — the same affordances a visible bar offers,
   * minus the 15px this band cannot spare. */
  scrollbar-width: none;
  padding-inline: var(--hx-space-2xs);
  border-radius: var(--gx-radius, var(--hx-radius-md));
  background: var(--truco-cloth-lane);
  box-shadow: var(--hx-relief);
}
.hexdev-truco-action-bar > * { flex: 0 0 auto; }

/* ROW, not column — the two groups sit side by side inside the band's single
 * strip.
 *
 * It was a column, and that is what put every escalation button below the
 * fold. The band is ONE fixed track (--hx-band-action-total) and each group
 * carries min-height: 40px, so two stacked groups needed 86px of a 40px
 * strip; .hexdev-truco-action-bar's overflow-y: auto turned the remainder
 * into a scrollbar rather than a visible button. Measured at every width
 * this repo tests, 1v1 and 2v2 alike — see action-bar-fit.browser.test.ts,
 * which failed 16 ways against the column and pins this row.
 *
 * The two groups still never read as one undifferentiated row (the spec's
 * own words): they keep their separate colour treatments below, and the gap
 * here is wider than the 6px INSIDE each group, so the response cluster and
 * the opening cluster remain visibly two clusters. What changes is only that
 * both are reachable at a glance, which for a decision taken on a turn clock
 * is the whole point of showing them. */
/* CENTRED BY AUTO MARGINS, NOT BY justify-content, and the difference is
 * whether the first button can be reached at all. THIS row is the real
 * horizontal scroller -- the tray around it only holds the two groups -- and
 * justify-content: center on a box that OVERFLOWS pushes the start of its
 * content past the left edge and out of the scroll range entirely: there is
 * no scroll position that brings it back. That is what cut "Quiero" down to
 * "uiero" in the reported screenshot, with no way to see the rest of it.
 *
 * Auto margins absorb the free space exactly the same way while there is
 * any, and collapse to zero when there is none -- so the row still centres
 * whenever it fits, and starts at the scroll origin the moment it does not. */
/* flex: 1 1 auto -- GROW as well as shrink, and the growing is what centres the
 * calls under the hand.
 *
 * The auto margins on the two rules below have always been the centring
 * mechanism (never justify-content: centring an OVERFLOWING box pushes its
 * first button out of scroll range, which once cut "Quiero" down to "uiero").
 * But an auto margin can only absorb free space that exists, and at 0 1 auto
 * this row shrank to its content and had none.
 *
 * It never showed while the band carried a second strip beside this one: the
 * two filled it between them. The moment the señas control moved to the side
 * rail, a lone "Truco" sat hard against the left edge with the hand it belongs
 * to centred above it. Measured at a 360px window: the row's centre at x=50,
 * the band's at x=180. Found looking at a real phone render, by which time
 * every assertion in this repo was green. */
.hexdev-truco-calls-row { display: flex; flex-direction: row; gap: var(--hx-space-xs, 12px); align-items: center; justify-content: flex-start; align-self: stretch; min-width: 0; max-width: 100%; flex: 1 1 auto; }
.hexdev-truco-calls-row > :first-child { margin-inline-start: auto; }
.hexdev-truco-calls-row > :last-child { margin-inline-end: auto; }
/* Change 4: answering a pending call reads as a different decision from
 * opening or escalating one — response buttons take the accent treatment
 * (matches the pending-call banner's own "mine" state), opening/escalation
 * buttons stay on the table's primary colour, and the two groups never
 * interleave in one undifferentiated row.
 *
 * flex-wrap: nowrap + overflow-x: auto: several simultaneously-legal
 * buttons (e.g. a full envido escalation) could otherwise wrap to a second
 * line — keeping a group to exactly one horizontally-scrollable row keeps
 * this floating tray compact, so it covers as little of the felt beneath it
 * as possible (still a real, honest mobile pattern now, not only a
 * height-budget trick). */
/* Same styled bar as the log list: this group is a real horizontal scroller
 * whenever a full envido escalation is legal, and the platform default over
 * the recessed lane looked like a scratch on the felt. */
/* CENTRED BY AUTO MARGINS, NOT BY justify-content. Each GROUP is its own
 * horizontal scroller -- measured at 375px with a full envido escalation, the
 * response group held 136px of buttons in 111px and the opening group 247 in
 * 232 -- and justify-content: center on a box that overflows pushes the start
 * of its content past the left edge and out of the scroll range entirely:
 * there is no scroll position that brings it back. That is what cut "Quiero"
 * down to "uiero" in the reported screenshot, with no way to reach the rest.
 *
 * Auto margins absorb the free space the same way while there is any and
 * collapse to zero when there is none, so a group still centres whenever it
 * fits and starts at its scroll origin the moment it does not. */
.hexdev-truco-calls-group { display: flex; flex-wrap: nowrap; overflow-x: auto; gap: 6px; justify-content: flex-start; min-height: 40px; max-width: 100%; scrollbar-width: thin; scrollbar-color: var(--hx-scroll-thumb) transparent; }
/* THE ESCALATION LADDER, FOLDED.
 *
 * A POPOVER ABOVE THE BAND, never more buttons inside it. Unfolded in place it
 * would need room the band has never had -- 184px of owed answer plus 383px of
 * ladder in the 296 a 320px band gets -- so it floats over the felt, wraps onto
 * as many lines as it needs, and leaves the answer underneath reachable the
 * whole time. Same lane, same anchor and same argument as
 * .hexdev-truco-senas-row, the picker this table already opens this way.
 *
 * position: absolute is also what keeps the FOLDED group honest: out of flow,
 * the ladder contributes nothing to the group width, so the band measures one
 * "Subir" and not four buttons pretending to be one. */
.hexdev-truco-calls-ladder {
  position: absolute;
  left: var(--hx-felt-pad);
  right: var(--hx-felt-pad);
  bottom: calc(var(--hx-felt-pad-block) + var(--hx-band-action-total) + var(--hx-felt-gap));
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
}
.hexdev-truco-calls-group[data-open="false"] .hexdev-truco-calls-ladder { display: none; }

/* THE OWED ANSWER IS SERVED FIRST, at every width.
 *
 * A flex item's default is to shrink in proportion to its own base size, which
 * is exactly backwards for these two: it hands the most room to the group that
 * WANTS the most, and the group that wants the most is the optional one.
 * Measured at 320px with a rival's envido escalated, before this rule:
 *
 *     respuesta (Quiero / No quiero) ..... 40px of the 184 it needs
 *     escalada  (Envido envido / ...) .... 82px of the 383 it needs
 *
 * Forty pixels of "Quiero" with a turn clock running. Refusing to shrink is
 * the whole rule -- the escalation ladder beside it keeps the default and
 * absorbs all of the squeeze into the horizontal scroller it already owns and
 * was built for.
 *
 * NOT scoped to a tier, because "answer first" is not a size question. A first
 * version put it in the compact block only and the sweep caught the rest:
 * 640px and 768px still clipped the answer by 52 and 11 pixels.
 *
 * Capped at two buttons by the engine (quiero / no quiero), so this can never
 * become a group that refuses to shrink AND cannot fit. */
.hexdev-truco-calls-group--response { flex-shrink: 0; }
.hexdev-truco-calls-group > :first-child { margin-inline-start: auto; }
.hexdev-truco-calls-group > :last-child { margin-inline-end: auto; }
/* A CALL BUTTON KEEPS ITS OWN WIDTH. The band is a horizontal scroller by
 * design -- the valve for a fully escalated envido chain -- and a flex item's
 * default is to shrink before its container overflows, so the buttons were
 * being squeezed narrower than their labels instead. Measured at 375px with
 * five buttons on screen: three of them broke across two lines, and the
 * reported screenshot read "Envido / envido", "Real / envido", "No / quiero".
 * A button that cannot fit its own name is worse than one you have to scroll
 * to. */
.hexdev-truco-call {
  /* A CALL BUTTON KEEPS ITS OWN WIDTH. The group around it is a horizontal
   * scroller by design -- the valve for a fully escalated envido chain -- but
   * a flex item's default is to SHRINK before its container overflows, so the
   * buttons were being squeezed narrower than their labels and wrapping them
   * instead of ever reaching that scroller. Measured at 375px with five
   * buttons legal at once: "Envido envido", "Real envido" and "No quiero"
   * each drawn across two lines, which is what the reported screenshot shows.
   * A button that cannot fit its own name is worse than one you scroll to. */
  flex: 0 0 auto;
  white-space: nowrap;
  min-height: 40px;
  padding: 6px 16px;
  border: none;
  border-radius: var(--gx-radius, 999px);
  background: var(--gx-color-primary, #2f6f4f);
  color: var(--gx-color-on-primary, #ffffff);
  font-family: inherit;
  font-weight: 600;
  /* PR8 (WARNING-1 closure): nearest match, --hx-text-body (0.9rem; was
   * 0.85rem, no exact literal). Safe: this button's min-height: 40px is an
   * explicit floor, not font-derived, and it lives inside
   * .hexdev-truco-action-bar, whose own box is the fixed --hx-band-action
   * grid row with overflow: hidden (design §7.2: "the band NEVER grows") —
   * a taller line box clips, it does not grow the reserved row. */
  font-size: var(--hx-text-body);
  cursor: pointer;
  /* Elevation (PR2, VDS-4, paint-only). */
  box-shadow: var(--hx-elev-2);
}
.hexdev-truco-call:hover, .hexdev-truco-call:focus-visible { filter: brightness(1.1); }
.hexdev-truco-calls-group--response .hexdev-truco-call {
  background: var(--gx-color-accent, var(--hx-gold));
  color: var(--hx-ink);
}
.hexdev-truco-calls-group--opening .hexdev-truco-call {
  background: transparent;
  /* --hx-felt-text / --hx-felt-outline: transparent here reveals the action
   * bar's own recessed lane (--truco-cloth-lane over the cloth), a fixed
   * surface no tenant token reaches -- so the label AND the border on it must
   * be fixed too. The border additionally has to clear 1.4.11's 3:1: with no
   * fill, it is the whole boundary of this control. */
  border: 2px solid var(--hx-felt-outline);
  color: var(--hx-felt-text);
}

/* Change: a hand ending gets a clear, transient acknowledgement — who won it
 * and how many points, before play moves on (spec). A real, SOLID-background
 * chip, same anti-opacity discipline as everything else that sits on the
 * cloth: opacity here would tint toward the felt instead of standing out.
 * table.ts owns the timed clear; this stylesheet only owns how it looks
 * while present. The :empty selector hides it, matching the pending-call
 * banner's own convention. */
.hexdev-truco-hand-outcome:empty { display: none; }
.hexdev-truco-hand-outcome {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 16px;
  border-radius: var(--gx-radius, 999px);
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
}
.hexdev-truco-hand-outcome[data-result="won"] {
  background: var(--gx-color-accent, var(--hx-gold));
  color: var(--hx-ink);
}
.hexdev-truco-hand-outcome[data-result="lost"] {
  background: #3a3a3a;
  color: #f2f2f2;
}
/* PR8 (WARNING-1 closure): both nearest-match --hx-text-body (0.9rem; were
 * 0.95rem/0.85rem, no exact literal). Same banner-slot safety as
 * the other banner-slot occupants — this content mounts inside
 * .hexdev-truco-banner-slot too (design §9.2: mountedHandOutcomeEl
 * "points at handOutcomeBanner inside bannerSlot"), a fixed-height absolute
 * lane, not the felt's own flow. */
.hexdev-truco-hand-outcome-headline { font-size: var(--hx-text-body); text-transform: uppercase; letter-spacing: 0.02em; }
.hexdev-truco-hand-outcome-points { font-size: var(--hx-text-body); opacity: 0.85; }

/* Change: a partner's seña is TRANSIENT — shown for about two seconds and
 * gone, exactly like the real table ("si no la viste, la perdiste"). Third
 * occupant of the banner lane, on the same :empty convention as the two
 * banners above, and the same anti-opacity rule: a SOLID background, never
 * something translucent that tints toward the felt behind it. table.ts owns
 * the timed clear; this stylesheet only owns how it looks while present.
 *
 * A COLUMN, unlike the hand-outcome chip's baseline row. This is the one lane
 * occupant that is NOT mutually exclusive in time with the pending-call
 * banner (señas stay legal while a call is open), so both can share the lane's
 * flex row at once — stacking these two short lines keeps the chip narrow
 * enough that the pair still fits the narrowest tier side by side, which
 * table-zone-overlap.browser.test.ts fences directly. Its own height stays
 * well inside the lane, and the lane is position: absolute regardless, so
 * nothing here can move the felt.
 *
 * Surface (not primary/accent) on purpose: the pending-call banner owns
 * primary, its waiting-on-me state owns accent, and the hand-outcome chip owns
 * accent/dark-grey. A seña is our team's own private aside, not a call on the
 * table, and it reads as a distinct fourth thing rather than a fifth shade of
 * the same three. */
.hexdev-truco-sena-notice:empty { display: none; }
.hexdev-truco-sena-notice {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 16px;
  border-radius: var(--gx-radius, 999px);
  background: var(--gx-color-surface, #1c1c1c);
  color: var(--gx-color-on-surface, #f2f2f2);
  font-weight: 700;
  text-align: center;
  /* MEASURED, not assumed: allowed to wrap, this chip rendered 86px tall at
   * the compact tier against a 60px lane (and 86px against 84px at ultra) —
   * it wrapped BOTH of its lines once the pending-call banner was sharing the
   * row, and a lane occupant that outgrows its lane is exactly what
   * --hx-band-banner exists to prevent. Safe to forbid wrapping outright
   * because the content is bounded by construction: the señas vocabulary is
   * CLOSED (six labels, widest "As de espada"), so there is no user text here
   * that could ever grow past what the fence measures. */
  white-space: nowrap;
  /* Elevation: the same depth the pending-call banner uses — this chip sits
   * on the cloth in the same lane, so it lifts off it the same way. */
  box-shadow: var(--hx-elev-3);
}
/* Every ARIA live region on this table (announcer.ts): visually hidden, still
 * announced — never display: none or visibility: hidden, both of which remove
 * an element from the accessibility tree and would silence it. This rule is
 * now the single home of that treatment: .hexdev-truco-turn-indicator used to
 * carry a byte-identical copy of it, back when whose-turn was a bespoke
 * element rebuilt inside the render path (and therefore never announced at
 * all); it goes through createAnnouncer now, and its old rule is gone.
 *
 * position: absolute is load-bearing beyond the hiding: these are direct
 * children of the shell (they must outlive the render that rebuilds
 * everything else), so leaving them in flow would put a real box at the top of
 * every mounted table. Out of flow, they contribute nothing to any layout —
 * no capture moves, which is the whole basis for adding them without
 * recapturing a single baseline. */
.hexdev-truco-announcer {
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
/* The house clip-rect treatment as a SHARED, always-on utility class — for
 * text that exists only to be read out (the numeric score total beside the
 * matchstick tally, an opponent's card count beside their decorative backs;
 * scoreboard.ts and opponent-hand.ts). Same declarations as
 * .hexdev-truco-announcer above and the two scoped copies elsewhere in this
 * file (.hexdev-truco-score-label, compact-only) — never display: none or visibility: hidden, which would
 * remove the node from the accessibility tree and defeat its whole purpose.
 * position: absolute is what makes this text FREE: out of flow, it can never
 * move a height fence (table-height-stability.browser.test.ts) and clipped to
 * nothing it can never show up in a visual baseline. Those two scoped copies
 * stay separate rules deliberately: each is half of a compact/medium+ toggle
 * with its own restore block, a lifecycle this unconditional class does not
 * have. */
.hexdev-truco-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

/* An OWNED focus indicator (WCAG 2.4.7). Until this rule, every focus ring on
 * the felt was the UA default — one host-page CSS reset (outline: none on
 * everything, a depressingly common one) and a keyboard player could no
 * longer see where they were standing.
 *
 * --hx-gold, FIXED, not a --gx-* tenant token — the same decoupling argument
 * the felt itself makes: this ring draws on the widget's own identity
 * surfaces (cloth, the recessed action lane, the dark panels), whose colours
 * a tenant cannot touch, and --hx-gold is a PRIVATE token that never entered
 * widget-protocol's theme vocabulary, so no tenant value can ever drag it
 * below 3:1 against those surfaces (measured 7.3:1 against the cloth). A
 * tenant accent here would hand a tenant the power to blind its own keyboard
 * users with one dark hex value.
 *
 * outline, never border or box-shadow: outline paints OUTSIDE the box and
 * occupies no layout space, so the height fences
 * (table-height-stability/table-height-budget) cannot move — a hard
 * invariant of this table. The existing per-control brightness rules above
 * remain as a secondary signal; this ring is the primary one. Known limit,
 * same coupling Tanda 3 unwinds for felt text: the call-log list sits on a
 * panel whose background is a --gx-* surface token (dark by default), so a
 * tenant choosing a very light panel surface weakens THAT one ring's edge
 * contrast against the panel while it stays strong against the cloth around
 * it.
 *
 * Specificity contract with chrome-styles.ts: the shell nests inside the
 * chrome-classed root in the real widget, so BOTH focus-ring rules select a
 * felt control. This rule stays at (0,2,0) while the chrome rule wraps its
 * subject in :where() to sit at (0,1,0) — gold wins here by SPECIFICITY,
 * never by stylesheet insertion order (pinned by the precedence test in
 * chrome-styles.browser.test.ts). */
.hexdev-truco-table-shell :focus-visible {
  outline: 2px solid var(--hx-gold);
  outline-offset: 2px;
}

.hexdev-truco-sena-notice-source { font-size: var(--hx-text-meta); font-weight: 600; opacity: 0.85; }
.hexdev-truco-sena-notice-signal { font-size: var(--hx-text-title); text-transform: uppercase; letter-spacing: 0.02em; color: var(--gx-color-accent, var(--hx-gold)); }

/* Change: a real ending, not a blank error state (spec: "losing should feel
 * like a loss, not like an error message"). A full, SOLID-background overlay
 * over the whole shell — never translucent over the cloth (the exact trap
 * that already caught this project once) — showing who won, the final
 * score, and the play-again path right where the player is looking. */
.hexdev-truco-match-over:empty { display: none; }
.hexdev-truco-match-over {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 24px;
  text-align: center;
  background: var(--gx-color-surface, #1c1c1c);
  color: var(--gx-color-on-surface, #f2f2f2);
}
.hexdev-truco-match-over[data-result="won"] {
  background: var(--gx-color-primary, #1e5c43);
  color: var(--gx-color-on-primary, #ffffff);
}
/* PR8 (WARNING-1 closure): the match-over overlay is position: absolute,
 * out of the felt's own flow and never referenced by table-height-stability/
 * table-height-budget/table-zone-overlap — a font-size change here cannot
 * move any height-fenced pixel, which is why it is the nearest-match site
 * chosen for --hx-text-display. -headline was 1.6rem (nearest to
 * --hx-text-display's 1.5rem; no exact 1.5rem literal exists anywhere in
 * either stylesheet) -- a documented ~1.6px shrink. PR8 correction (native
 * review): the first draft of this comment claimed the shrink was "covered
 * by this PR's own baseline regeneration" -- FALSE: the regeneration pass
 * only rewrites baselines whose diff EXCEEDS the visual suite's 1%
 * tolerance, and this shrink (like the other nearest-match substitutions in
 * this pass) was silently absorbed instead, leaving the affected baselines
 * sub-tolerance stale: green today, but latent drift a future small change
 * could push over the threshold mysteriously. The deliberate force-recapture
 * of every affected baseline ships as this chain's immediate next candidate
 * (the lens-context budget caps how many binary baselines one reviewable
 * candidate can carry, so it cannot ride this one). -score's 1.1rem is an
 * exact match for --hx-text-title (zero-pixel). */
.hexdev-truco-match-over-headline { margin: 0; font-size: var(--hx-text-display); font-weight: 800; }
.hexdev-truco-match-over-score { margin: 0; font-size: var(--hx-text-title); font-weight: 600; }
.hexdev-truco-match-over button[data-action="play-again"] {
  min-height: 46px;
  padding: 10px 28px;
  border: none;
  border-radius: var(--gx-radius, 999px);
  background: var(--gx-color-accent, var(--hx-gold));
  color: var(--hx-ink);
  font-family: inherit;
  font-weight: 800;
  /* PR8 (WARNING-1 closure): nearest match for --hx-text-body (0.9rem); was
   * 1rem, no exact literal existed. Same out-of-flow safety as the two
   * rules above. */
  font-size: var(--hx-text-body);
  cursor: pointer;
  /* Elevation (PR2, VDS-4, paint-only): the strongest depth on the table,
   * matching this control's own weight as the match's one remaining action. */
  box-shadow: var(--hx-elev-4);
}
.hexdev-truco-match-over button[data-action="play-again"]:hover,
.hexdev-truco-match-over button[data-action="play-again"]:focus-visible {
  filter: brightness(1.08);
}

/* 2v2 ONLY -- every selector below is scoped under
 * .hexdev-truco-table[data-seat-count="4"] so the 1v1 (2-seat) felt is
 * BYTE-IDENTICAL to before this block existed, even though every anchor now
 * carries a data-relation attribute regardless of seat count (table.ts's own
 * doc comment): an attribute with no matching selector changes nothing
 * paintable. "Obvious at a glance who you are helping" (spec): a colored
 * left-edge accent on top of the shared anchor treatment, distinct enough
 * between partner and opponent that color alone is not the only signal --
 * the real text label (TABLE_STRINGS.partner/opponent, rendered by a
 * caller of this stylesheet, not by CSS content) carries the rest. */
/* THE ACCENT SITS ON THE LABEL, because an anchor is a LANE and not a seat.
 *
 * The intent stated above is unchanged and still right: a colour that
 * reinforces a text label which carries the real signal. What was wrong was
 * the SCALE it was painted at. The accent used to sit on the anchor itself,
 * and measured at a 1550px shell the top anchor is 955px wide -- so
 * "partner" drew a 4px gold rule clean across the felt, level with the bottom
 * edge of the partner's cards and 13px inside the turn ring's own gold
 * outline, which put two parallel gold lines through the same three cards.
 * Reported from real play in exactly those terms: the yellow lines step on
 * the partner's cards.
 *
 * The side anchors had the quieter version of the same mistake. Their accent
 * landed on the inner edge (measured at x=1052 for the right seat, between
 * the cards and the centre), where it reads as a stray vertical line on the
 * cloth rather than as the edge of anything.
 *
 * The label is the surface that was always meant to carry this: it is the
 * primary signal already, it sits ON the seat instead of across its lane, and
 * it is 42-80px wide rather than 955. Same inset box-shadow technique for the
 * same reason it was picked originally -- it paints and never takes layout
 * space, so no anchor grows and no card pays for it. The extra left padding
 * is the accent's own room; it changes the chip's width only, and the side
 * anchors are flex COLUMNS, so no anchor gets taller and
 * table-height-stability's pinned totals do not move. */
.hexdev-truco-table[data-seat-count="4"] [data-relation="partner"] .hexdev-truco-relation-label,
.hexdev-truco-table[data-seat-count="4"] [data-relation="opponent"] .hexdev-truco-relation-label {
  padding-left: 9px;
}
.hexdev-truco-table[data-seat-count="4"] [data-relation="partner"] .hexdev-truco-relation-label {
  box-shadow: inset 3px 0 0 0 var(--gx-color-accent, var(--hx-gold));
}
.hexdev-truco-table[data-seat-count="4"] [data-relation="opponent"] .hexdev-truco-relation-label {
  box-shadow: inset 3px 0 0 0 rgba(255, 255, 255, 0.55);
}
/* Static flow, NOT absolutely positioned: the top anchor's own box only
 * wraps tightly around its card-back row (min-height: 0), so an absolutely
 * positioned label risked sitting outside that box and clipping against
 * the felt's own overflow:hidden edge (found rendering the actual 2v2
 * baseline, not assumed). A normal block element, ordered FIRST in the
 * anchor via table.ts, is what a reviewer sees intact regardless of anchor
 * height. */
.hexdev-truco-relation-label {
  display: block;
  order: -1;
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  /* The two pins the sibling boxes carry, for the reason they carry them: the
   * side anchors are flex COLUMNS, so this label's own height stacks above the
   * card pile and reaches the table's reported total -- a number
   * table-height-stability.browser.test.ts locks to the hundredth of a pixel.
   * With no line-height the filled line box was "normal", i.e. whatever this
   * font's ascent/descent/line-gap ask for, so that total was really the
   * machine's font talking: measured across probe faces at 700px, 831.42 ..
   * 875.42. 1.2 matches .hexdev-truco-trick-feedback and
   * .hexdev-truco-banner-slot exactly, never var(--hx-leading) (the chrome's
   * 1.35 body-copy rhythm).
   *
   * nowrap closes the line-COUNT axis a leading cannot reach, and it changes
   * no number today -- every face measured wrapped to one line already. It is
   * a fence, not a fix: legitimate here for the same reason
   * .hexdev-truco-team-label gives for its own, that the whole vocabulary is
   * two fixed words (TABLE_STRINGS.partner/opponent) and no third can appear
   * without a source change that has to come past this comment. */
  line-height: 1.2;
  white-space: nowrap;
  padding: 1px 6px;
  border-radius: var(--gx-radius, 999px);
  /* --hx-felt-text: this label paints its OWN fixed scrim right below, so the
   * pairing is entirely ours and the tenant's text colour has no business in
   * it (measured 1.28:1 with a near-black tenant value, 12.17:1 with this). */
  background: rgba(0, 0, 0, 0.4);
  color: var(--hx-felt-text);
}

/* Señas: discoverable without being noisy (spec). The toggle stays SECONDARY
 * -- never the filled primary treatment, so a player who does not care about
 * señas is not visually nagged into opening it.
 *
 * A MEMBER OF THE ACTION-BAR BUTTON SYSTEM, not a smaller cousin of it (debt:
 * the repo owner's own eye review, "que se vea más integrado y estético al
 * resto"). MEASURED, both rendered side by side in the same strip: this button
 * was 59.73x32 against .hexdev-truco-call's 76.36x40 -- min-height 32 vs 40,
 * padding 4px 12px vs 6px 16px, font-size 12px (--hx-text-meta) vs 14.4px
 * (--hx-text-body) -- and it still carried a HARDCODED
 * "0 2px 8px rgba(0,0,0,0.4)" from before the --hx-elev-* scale existed, the
 * last un-migrated shadow on this table. Two buttons on one strip at two
 * different sizes read as two systems, whatever their colours. All five now
 * match the call button exactly.
 *
 * HIERARCHY BY TONE, NOT BY SHRINKING -- which is this file's own established
 * pattern, not a new idea: .hexdev-truco-calls-group--opening
 * .hexdev-truco-call is already an OUTLINED button at the full 40px size,
 * sitting beside the filled response-group buttons. This toggle now wears that
 * exact treatment (transparent fill, 2px primary border, on-surface label), so
 * it is secondary in the same language the strip already speaks.
 *
 * WHY TRANSPARENT IS SAFE HERE, since an earlier round of this rule chose a
 * solid fill for the opposite reason. That decision was about the CSS opacity
 * PROPERTY -- the opacity-over-green-cloth TINTING trap this project was burned
 * by once (.hexdev-truco-card--locked's own history) -- and nothing below uses
 * it. A transparent background is not a blend: it reveals
 * .hexdev-truco-action-bar's own recessed lane (D-11, background:
 * --truco-cloth-lane plus --hx-relief), which is a real, deliberate surface,
 * never bare cloth or a live card. The opening-group call buttons have sat
 * transparent on that same lane since it existed, which is the direct evidence
 * that this is a solved problem here, not a re-opened one. */
.hexdev-truco-senas-toggle {
  /* A ROW OF THREE: glyph, words, count. Inline-flex rather than plain inline
   * text because the glyph has to sit on the words' optical centre, and a
   * baseline-aligned SVG sits on their baseline instead -- half a glyph below
   * where the eye expects it. */
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 6px 16px;
  border: 2px solid var(--hx-felt-outline);
  border-radius: var(--gx-radius, 999px);
  background: transparent;
  /* --hx-felt-text / --hx-felt-outline, same lane and same argument as the
   * opening-group call button this toggle deliberately matches. */
  color: var(--hx-felt-text);
  font-family: inherit;
  font-size: var(--hx-text-body);
  font-weight: 600;
  /* Elevation (PR2, VDS-4, paint-only): the same token .hexdev-truco-call
   * reads, replacing the hardcoded pre-token shadow this rule carried. */
  box-shadow: var(--hx-elev-2);
  cursor: pointer;
}
.hexdev-truco-senas-toggle:hover:not(:disabled), .hexdev-truco-senas-toggle:focus-visible { filter: brightness(1.15); }
/* flex: 0 0 auto -- the glyph is the half that survives the compact tier, so
 * it is the one thing on this button that must never be squeezed. */
.hexdev-truco-senas-icon { flex: 0 0 auto; width: 20px; height: 20px; }
.hexdev-truco-senas-toggle-count { flex: 0 0 auto; }
/* THE SPENT STATE (per-hand cap, truco-engine's MAX_SENAS_PER_HAND). The
 * control stays on the band, disabled, rather than disappearing the moment a
 * player spends their last seña -- a button that vanishes mid-hand reads as a
 * broken UI, never as a rule, and a rule the player cannot see is not one they
 * can play around.
 *
 * filter, NEVER opacity. This is the exact opacity-over-green TINTING trap the
 * project already shipped once (.hexdev-truco-card--locked's own history,
 * further down this file): over the cloth, opacity blends a surface toward the
 * felt instead of dimming it. Nothing to blend here either way -- this button's
 * background is transparent, so brightness dims only its border and its label,
 * which is precisely the present-but-unavailable reading wanted.
 *
 * The hover rule above carries :not(:disabled) rather than leaning on source
 * order to out-cascade it: the two selectors have identical specificity, so
 * whichever came last would win, and that is far too quiet a dependency for a
 * state whose whole job is to look unavailable. :focus-visible needs no such
 * guard -- a disabled button is not focusable at all.
 *
 * cursor: not-allowed, not default: the label says WHAT happened, the pointer
 * says the click will do nothing, and the title attribute senas.ts sets says
 * WHY. No size, padding or border change anywhere here -- this button lives in
 * a fixed-height action band that must never grow, so the spent state is
 * paint-only by construction. */
.hexdev-truco-senas-toggle:disabled {
  filter: brightness(0.6);
  cursor: not-allowed;
}
/* The OPEN toggle wears the same gold its own popover does (FU-1 eye review):
 * the card floats a full band above the button that raised it, so without a
 * shared "live right now" signal the two read as unrelated pieces of chrome.
 * Selects on the aria-expanded senas.ts already maintains — the a11y state IS
 * the style hook, so the two can never drift apart.
 *
 * A gold BORDER now, not the inset ring this rule used to draw. The ring was
 * the right answer while the button had no border of its own; against a real
 * 2px outline a 1px inset ring reads as a muddy double edge rather than a
 * state change. Recolouring the outline the toggle already has is both
 * cleaner and stronger: the whole shape changes colour, it costs no box (the
 * button's own height inside the fixed action band is untouched), and the
 * open toggle's outline now matches the gold edge its popover is ringed with
 * instead of merely alluding to it. Still an OUTLINED button — opening the
 * picker must never promote it to the filled primary treatment. */
.hexdev-truco-senas-toggle[aria-expanded="true"] {
  border-color: var(--gx-color-accent, var(--hx-gold));
  color: var(--gx-color-accent, var(--hx-gold));
}
/* align-self:stretch gives this box the strip's real cross-axis size instead
 * of its own shrink-to-fit width, so the toggle centres across the whole
 * strip at the tiers where the bar is a column (2v2, medium and up). It used
 * to carry a second, load-bearing job — bounding the in-flow six-signal row's
 * unwrapped max-content width, which otherwise overflowed the bar on both
 * sides — that FU-1 retired: the row is out of flow now (see below), so the
 * only thing left in this box is the toggle. */
/* justify-content is not decoration here. This strip is a COLUMN, so
 * align-items centres it horizontally and its main axis is left at
 * flex-start -- which pinned the toggle to the top of its band. Invisible
 * while the two strips were stacked and each owned a full row; the moment
 * they became neighbours in one row it read as the señas button sitting
 * about 8px above the call buttons beside it. Reported as exactly that. */
/* THE STRIP, NOW A CELL IN THE RAIL. It holds ONE toggle and nothing else --
 * the partner's answer used to sit beside it here and floats over the felt now
 * (see .hexdev-truco-consult-advice), because an answer mounted in the rail is
 * an answer inside a shut drawer on a phone.
 *
 * flex: 0 0 auto -- the two scrolling boxes below it in the rail are what
 * absorb the column's height, never this. */
.hexdev-truco-senas { display: flex; flex: 0 0 auto; max-width: 100%; }
/* TWO LINES, and measuring is what said so.
 *
 * The rail is 168px wide and the button planted itself at 194: a flex item's
 * automatic minimum size is its MIN-CONTENT width, and "Seña/Consulta" has no
 * break opportunity a browser takes -- it does not break at "/". min-width: 0
 * on the words changed nothing and the overflow stayed exactly 13px at 640 and
 * 768.
 *
 * Wrapping the button's OWN row is what fits: glyph and words on the first
 * line, the count on the second. Height is what a rail column has to spare and
 * width is what it does not -- the exact opposite of the band this came from,
 * which is the whole reason it moved. */
.hexdev-truco-senas .hexdev-truco-senas-toggle { flex: 1 1 auto; flex-wrap: wrap; justify-content: center; }
/* FU-1: the OPEN picker is a transient ELEVATED POPOVER anchored above the
 * action bar, not a third row inside it.
 *
 * WHY IT HAD TO LEAVE THE BAND. The action bar is a FIXED grid track
 * (--hx-band-action-total on the felt's own grid-template-rows) whose
 * contract is "the band NEVER grows: contents scroll, the track is fixed" —
 * a growing band would shift the felt mid-hand and invalidate every fence in
 * table-height-stability/table-height-budget. Inside that track the row was
 * unusable, measured not assumed: at 375px it collapsed to height 0 inside a
 * 25px client area (0 of its 49px of content painted) and pushed the last
 * three signals past the felt's own right edge; at 700px only 12px of a 34px
 * row survived, and all six buttons landed below the felt's bottom edge.
 * Letting the band grow was rejected for the reason above; scrolling inside a
 * 40px strip was rejected as unusable.
 *
 * WHY THE FELT IS THE POSITIONING CONTEXT, and not the bar or this picker's
 * own box. An absolutely positioned box is still clipped by an ancestor
 * scroller when that scroller is its containing block or an ancestor of it —
 * so making .hexdev-truco-action-bar (overflow-x/y: auto) or
 * .hexdev-truco-senas (overflow-x: auto from medium up) position: relative
 * would have changed nothing: the popover would have been clipped by the very
 * band it needs to escape. Left position: static, both of them sit BELOW the
 * containing block instead, where a scroller does not clip at all, and the
 * nearest positioned ancestor is .hexdev-truco-table itself (position:
 * relative, already, for the banner slot and turn badges) — the same felt
 * whose own overflow: hidden is the edge this popover SHOULD respect. The
 * offsets below are read off that felt's own grid tokens rather than
 * hardcoded, so the popover tracks every tier and both seat counts: bottom =
 * the felt's own padding + the whole action band + one grid gap lands its
 * lower edge exactly one gap above the bar, and the inline pair inset it to
 * the felt's content box.
 *
 * SOLID chrome surface, never opacity over the cloth — the exact
 * opacity-over-green TINTING trap this project has already been burned by
 * once (.hexdev-truco-card--locked's own history), and the same
 * var(--gx-color-surface, ...) pattern .hexdev-truco-senas-toggle uses one
 * rule above. The elevation step is --hx-elev-4, the top of the scale (the
 * rule below carries the full card rationale); it started at --hx-elev-3 and
 * was raised after the FU-1 eye review found the popover did not read as an
 * opened selector at elev-3 alone.
 *
 * z-index: 1 is this file's own existing top layer INSIDE the felt
 * (.hexdev-truco-turn-badge, .hexdev-truco-banner-slot); the felt itself sets
 * no z-index, so it creates no stacking context and those three compete
 * directly. Painting order breaks the tie in the popover's favour: table.ts
 * appends the action bar to the felt AFTER the anchors and the centre column
 * that own the other two. Deliberately NOT 2 — that is
 * .hexdev-truco-match-over's step, and a match that has ended must cover an
 * open picker, never the other way round.
 *
 * flex-wrap: wrap replaces the old nowrap + overflow-x: auto scroller: all
 * six signals are readable at once at every tier, no swipe. MEASURED, not
 * assumed: freed from the old nowrap row's flex-shrink the six take their
 * real max-content widths and total 452px, so at 375px (a 347px content box)
 * they wrap to TWO rows — an 80px popover, all six painted — and from 700px
 * up they fit on one 44px row. Wrapping is the deliberate answer here, not a
 * fallback: the popover is out of flow, so a second row costs the table
 * nothing, whereas a scroller costs a player a signal they cannot see.
 *
 * :empty { display: none } is this file's own established convention for a
 * slot that renders nothing (.hexdev-truco-seat-call,
 * .hexdev-truco-hand-outcome, .hexdev-truco-match-over) and is REQUIRED here:
 * senas.ts empties this node to close the picker, and an empty out-of-flow
 * box with a background and a shadow would otherwise paint a bare chrome
 * strip over the felt for the whole match. */
.hexdev-truco-senas-row:empty { display: none; }
/* display: contents -- the box itself must not exist as far as layout is
 * concerned. It is a wiping handle for the renderer, nothing more: both of its
 * children are absolutely positioned, so neither becomes a grid item of the
 * felt and the felt's height, which is the scarcest thing this widget has, is
 * untouched. */
.hexdev-truco-senas-overlay { display: contents; }
/* THE PARTNER'S ANSWER FLOATS. It used to sit in the band's flow, which meant
 * it competed for width with the calls at the exact moment a player has both a
 * question answered AND a call to answer. Out of flow it costs the band
 * nothing, and it lands in the lane the player was already watching -- the
 * same one the picker opens into, directly above the buttons. */
.hexdev-truco-consult-advice {
  position: absolute;
  left: var(--hx-felt-pad);
  right: var(--hx-felt-pad);
  bottom: calc(var(--hx-felt-pad-block) + var(--hx-band-action-total) + var(--hx-felt-gap));
  z-index: 1;
  text-align: center;
}
.hexdev-truco-senas-row {
  position: absolute;
  left: var(--hx-felt-pad);
  right: var(--hx-felt-pad);
  bottom: calc(var(--hx-felt-pad-block) + var(--hx-band-action-total) + var(--hx-felt-gap));
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  /* Card treatment (FU-1 eye review: "que se note que esta abierto el
   * selector"). A floating strip that merely sits above the bar reads as
   * part of the bar; a CARD reads as something opened ON TOP of the table.
   * Three levers, all from this file's own vocabulary, no new tokens:
   * generous padding so the six signals sit INSIDE a surface instead of
   * filling it edge to edge, the largest radius the felt already uses, and
   * --hx-elev-4 -- the top of the elevation scale, correct here because
   * this is the topmost transient surface a player can raise over the felt
   * (only .hexdev-truco-match-over outranks it, and that one takes the
   * whole felt). The gold inset edge is the same "this is live right now"
   * signal .hexdev-truco-turn-badge already carries, drawn as an inset
   * ring rather than a border so it never changes the box the popover's
   * own anchoring math resolved. Solid surface, never opacity over the
   * cloth -- the tinting trap this file has been burned by once. */
  padding: 10px;
  border-radius: var(--gx-radius, var(--hx-radius-lg));
  background: var(--gx-color-surface, #26433a);
  box-shadow: var(--hx-elev-4), inset 0 0 0 1px var(--hx-gold-edge);
}
.hexdev-truco-sena {
  /* WCAG 2.5.5 (B15): 44px, the floor every other control on this table
   * already meets -- these six were the last 32px targets in the product, on
   * the surface a player uses fastest. Free of the band's own height contract
   * BECAUSE the popover is out of flow (see .hexdev-truco-senas-row above):
   * the strip grows upward over the felt and shifts no in-flow box, which
   * table-zone-overlap.browser.test.ts re-proves at all four tiers. */
  min-height: 44px;
  padding: 4px 10px;
  border: none;
  border-radius: var(--gx-radius, 999px);
  background: var(--gx-color-accent, var(--hx-gold));
  color: var(--hx-ink);
  font-family: inherit;
  /* PR8 (WARNING-1 closure): exact match, --hx-text-meta. */
  font-size: var(--hx-text-meta);
  font-weight: 600;
  cursor: pointer;
}

/* Call-log panel (T-11/T-10, design §5.3: "how it holds by construction").
 *
 * PR4 (tasks §8, D-4/blessed refinement 2 — tasks §1 item 2/§2.1): table.ts
 * now mounts this as a DIRECT CHILD OF THE FELT (.hexdev-truco-table, a grid
 * container, already position: relative; overflow: hidden) — no longer a
 * child of .hexdev-truco-center. grid-area: center below is what makes an
 * absolutely-positioned grid item with a definite grid-area use that AREA
 * (not the whole grid) as its containing block (CSS Grid's own rule, design
 * D-4) — the panel's rect at compact/medium ends up byte-for-byte the SAME
 * rect it had when it was a DOM child of .hexdev-truco-center: today's
 * center-anchored bottom-left corner is exactly that grid area's own
 * bottom-left corner. .hexdev-truco-played's own pile offset above leans
 * up-and-right, so the two floating surfaces lean apart instead of
 * overlapping. max-height is a FIXED length derived from --truco-card-width
 * (this file's own unit convention) -- never vh, never content-driven -- so
 * a long call chain scrolls INSIDE the panel instead of ever growing the
 * felt; not added anywhere to .hexdev-truco-table's own min-height calc, the
 * same out-of-flow discipline .hexdev-truco-banner-slot already uses (PR5:
 * .hexdev-truco-action-bar is no longer part of that group — it became a
 * genuine reserved grid row/track, contributing --hx-band-action-total to
 * the min-height formula on purpose, not floating). Unlike the banner slot,
 * pointer-events stays auto: this is the one floating surface a player
 * actually scrolls (D-9: auto-scroll to newest; manual scroll survives only
 * between renders).
 *
 * Wide/ultra (@container hexdev-truco-shell (min-width: 900px) above)
 * override BOTH grid-area and position — see that block's own PR4-T5
 * comment — to become a real in-flow column child instead; every other
 * declaration below (max-width, max-height, overflow, pointer-events, the
 * elevation) stays exactly as declared here at every tier (design §9.5:
 * "unchanged"). */
.hexdev-truco-call-log:empty { display: none; }
.hexdev-truco-call-log {
  /* IN THE RAIL, NOT ON THE CLOTH. This used to be an absolutely positioned
   * felt child pinned to the bottom-left of the center grid area, floating
   * over the play. It is a rail item now at every tier, which is what lets
   * the felt keep its whole width -- and, on a phone, stops a call chain from
   * covering the cards it is describing.
   *
   * NO HEIGHT CAP OF ITS OWN ANY MORE. It used to be two cards tall
   * (calc(--truco-card-width * 336 / 220 * 2)) -- a number that measured how
   * much of the PLAY the panel was allowed to cover, which is not a question
   * anyone can ask about a panel that no longer sits on the play. The rail is
   * the cap now: the log shrinks inside it (flex: 0 1 auto below) and its own
   * list scrolls, which is what keeps a long chain from pushing the tantos
   * out of the rail. --truco-card-width would not even resolve here -- it is
   * declared on the felt, and the rail is the felt's sibling. */
  flex: 0 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
  overflow: hidden;
  pointer-events: auto;
  border-radius: var(--gx-radius, 10px);
  background: var(--gx-color-surface, rgba(20, 20, 20, 0.72));
  color: var(--gx-color-on-surface, #f2f2f2);
  /* Elevation (PR2, VDS-4, paint-only): --hx-elev-1 + --hx-relief. */
  box-shadow: var(--hx-elev-1), var(--hx-relief);
  /* PR8 (WARNING-1 closure): nearest match, --hx-text-label (0.7rem; was
   * 0.68rem, no exact literal). Safe per this rule's own comment block
   * above: "not added anywhere to .hexdev-truco-table's own min-height calc"
   * — the panel's max-height/overflow: hidden make it height-inert to
   * the felt regardless of tier. */
  font-size: var(--hx-text-label);
}
/* PR4 correction (native review, deterministic CRITICAL): this override used
 * to sit inside the 900px block above (alongside the felt's own grid rules),
 * which put it BEFORE this base rule in source order — same specificity, so
 * the LATER rule always wins regardless of @container nesting, meaning the
 * base rule above always won and the log stayed absolutely positioned and
 * out of flow even at >=900px. This block MUST stay after the base rule.
 *
 * PR4-T5 (tasks §8, D-4): the log's rect stops floating over the felt and
 * becomes a real in-flow grid-column child at wide/ultra — grid-area: log
 * instead of center, position: static instead of absolute. Every other
 * declaration above (max-width, max-height, overflow, pointer-events, the
 * elevation) stays exactly as declared there at every tier (design §9.5). */
@container hexdev-truco-shell (min-width: 900px) {
  .hexdev-truco-call-log {
    /* TWO INHERITED CAPS THAT STOPPED MEANING ANYTHING HERE. Both come from
     * the base rule, written for a log that FLOATED over the felt, where
     * covering as little of the table as possible was the whole point. In a
     * column of its own neither describes anything real any more, and
     * together they were the "floating black box" this rail was reported as.
     *
     * MEASURED at a 1550px shell, 2v2, before this rule: the panel came out
     * 141x333 with ONE entry in it and 141x333 with five. Always 333, because
     * a grid item defaults to align-self: stretch -- so it filled the whole
     * 837px row and the 2-card max-height cut it off there, leaving ~270px of
     * empty panel under a single line of text. align-self: start hands the
     * height back to the content: one entry is one entry tall, and the cap
     * plus the list's own scroller still own the long-chain case exactly as
     * before.
     *
     * The 58% was 58% of the CENTRE when the log overlaid it; against its own
     * 242.8px rail it just left 101px of that rail empty and squeezed the
     * entries into 125px -- narrow enough that they had begun wrapping. The
     * rail is the log's to fill.
     *
     * Scoped to this tier on purpose: below 900px the log still floats over
     * the felt, where both caps are still doing the job they were written
     * for. Same boundary this block already draws for position.
     *
     * TRANSLATED WHEN THE LOG MOVED INTO THE SIDE RAIL: this used to read
     * align-self: start, which gave back the HEIGHT because the log was a
     * grid item and align-self there works down the block axis. In the rail
     * it is a flex item in a column, where that same property works ACROSS
     * the column and would have taken the width instead -- the very thing the
     * paragraph above says the rail is the log's to fill. flex: 0 0 auto is
     * the column-flex way to say the same sentence: height from the content,
     * full width by default -- and shrinking, so a long chain scrolls inside
     * the rail instead of pushing the tantos out of it. */
    max-width: 100%;
  }
}
/* PR8 (WARNING-1 closure): nearest match, --hx-text-label (0.7rem; was
 * 0.6rem, no exact literal). Same call-log height-inertness as the panel's
 * own font-size above. */
.hexdev-truco-call-log-title {
  margin: 0;
  font-size: var(--hx-text-label);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  opacity: 0.8;
}
/* The ONLY scroller, and now genuinely the only one: the tantos used to sit
 * in a pinned block ABOVE this list so auto-scroll could never push them
 * away. They are entries now, hanging off the reveal's own entry, so the
 * panel is one list with one bar over all of it. flex: 1 1 auto
 * plus min-height: 0 is what lets a flex child actually shrink below its own
 * content size and scroll, inside the panel's own fixed max-height above. */
.hexdev-truco-call-log-list {
  list-style: none;
  margin: 0;
  padding: 0;
  min-height: 0;
  flex: 1 1 auto;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  /* This is the ONE scroller a player looks at for minutes at a time, and it
   * was wearing whatever the operating system paints: a pale bar over a
   * near-black panel, the only thing on this felt not reading a token.
   *
   * The STANDARD properties, not ::-webkit-scrollbar. Chromium honours these
   * and, once scrollbar-color is set, ignores the webkit pseudo-elements
   * entirely — so shipping both would mean shipping a block that can never
   * apply and would quietly rot. Transparent track because the panel beneath
   * already carries the surface; a second opaque strip over it reads as a
   * seam down the side of the log. */
  scrollbar-width: thin;
  scrollbar-color: var(--hx-scroll-thumb) transparent;
  /* ONE axis. The entries wrap now, so nothing here needs to scroll
   * sideways — and leaving it possible would let a single long word
   * re-introduce the second scrollbar this panel just lost. */
  overflow-x: hidden;
}
/* WRAP, so a long entry becomes two lines instead of a horizontal scroller.
 * Measured in 2v2, where this panel is only 141px wide: the list's content
 * ran 207px in a 115px box, so "Compañero Quiero" simply scrolled off to the
 * right. A vertical list that also scrolls sideways is a list you have to
 * operate in two axes to read one sentence. */
.hexdev-truco-call-log-entry,
.hexdev-truco-call-log-tantos-entry {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px;
  border-left: 2px solid rgba(255, 255, 255, 0.25);
  padding-left: 4px;
}
/* The reveal's entry carries its own declarations, so it stops being one
 * line and becomes a small block: the phrase on top, the numbers under it.
 * wrap rather than a fixed column so the entry still reads as one row when
 * there is nothing hanging off it. */
.hexdev-truco-call-log-entry--reveal { flex-wrap: wrap; }
.hexdev-truco-call-log-tantos-list {
  list-style: none;
  margin: 2px 0 0;
  padding: 0;
  /* Its own full row inside the wrapping entry, indented under the phrase it
   * belongs to so the grouping is visible without a heading announcing it. */
  flex: 1 0 100%;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-left: 8px;
}
/* A minimal per-speaker tint (project convention: colour is never the ONLY
 * signal -- the speaker span's own text, from call-log.ts's speakerLabel,
 * already carries the rest). Only the viewer's own entries sit at the
 * 'bottom' anchor (resolveSeatPositions always maps mySeat there), so this
 * is the one selector that needs to exist for the accent to reach them. */
.hexdev-truco-call-log-entry[data-position="bottom"],
.hexdev-truco-call-log-tantos-entry[data-position="bottom"] {
  border-left-color: var(--gx-color-accent, var(--hx-gold));
}
.hexdev-truco-call-log-speaker { font-weight: 700; }
.hexdev-truco-call-log-mano-tag {
  /* PR8 (WARNING-1 closure): nearest match, --hx-text-label (0.7rem; was
   * 0.55rem — the largest gap of any substitution in this pass, but still
   * the nearest of the 6 tokens, and the same call-log height-inertness
   * applies). */
  font-size: var(--hx-text-label);
  font-weight: 700;
  text-transform: uppercase;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--gx-color-accent, var(--hx-gold));
  color: var(--hx-ink);
}
.hexdev-truco-call-log-points { margin-left: auto; font-weight: 700; }

/* The way out of a live match.
 *
 * ABSOLUTE, over the shell, and that is the load-bearing part: the felt's
 * height is the scarcest resource this widget has — the FULLSCREEN FIT block
 * below caps it against the viewport, and the phone tier clears its own
 * ceiling by under 14px — so a control that is always on screen earns its
 * place only by costing none of that. A grid row would have had to come out
 * of the cards.
 *
 * Top-RIGHT: the top-left corner is the call log's at every tier, and the
 * bottom edge belongs to the player's own hand and the action band, which is
 * exactly where a stray tap during fast play would land. z-index 1 keeps it
 * over the felt and deliberately UNDER the match-over overlay (z-index 2) —
 * once the match is over, "play again" is the offer, not "leave". */
.hexdev-truco-leave {
  position: absolute;
  top: var(--hx-space-2xs);
  right: var(--hx-space-2xs);
  z-index: 1;
}
/* Asking takes the whole shell. A permanent, irreversible decision does not
 * belong in a corner cluster inches from the buttons a player is hitting on
 * a turn clock — it gets a dialog, a dimmed table behind it, and nothing
 * else to hit by accident. z-index 2 lifts it over the felt; the match-over
 * overlay shares that layer and is appended after, so a match that ENDS
 * while this is open wins, which is the right precedence: there is nothing
 * left to leave. */
.hexdev-truco-leave[data-asking="true"] {
  inset: 0;
  z-index: 2;
  display: grid;
  place-items: center;
  padding: var(--hx-space-2xs);
}
.hexdev-truco-leave-backdrop {
  position: absolute;
  inset: 0;
  /* A real dim, not a tint: the point is that the table is out of play for
   * the moment, so nothing behind reads as still tappable. */
  background: rgba(0, 0, 0, 0.55);
}
.hexdev-truco-leave-dialog {
  position: relative;
  max-width: min(360px, 100%);
  max-height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border-radius: var(--gx-radius, var(--hx-radius-md));
  /* SOLID, never translucent over the cloth — the exact trap the match-over
   * overlay's own comment records this project falling into once. */
  background: var(--hx-ink);
  color: var(--hx-felt-text);
  box-shadow: var(--hx-elev-2);
  text-align: center;
}
.hexdev-truco-leave-title { margin: 0; font-size: var(--hx-text-title); font-weight: 700; }
.hexdev-truco-leave-body { margin: 0; font-size: var(--hx-text-body); line-height: 1.4; opacity: 0.9; }
.hexdev-truco-leave-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.hexdev-truco-leave-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-family: inherit;
  font-size: var(--hx-text-meta);
  font-weight: 600;
  /* Smaller than a call button on purpose. Leaving is not a move in the
   * game, and a control sized like one would read as one. Still clears the
   * 24px minimum for a non-inline target (WCAG 2.5.8). */
  min-height: 32px;
  padding: 6px 12px;
  border-radius: var(--gx-radius, 999px);
  cursor: pointer;
  /* Fixed felt tokens, never --gx-*: the resting control sits on the cloth,
   * a surface no tenant token reaches — same rule the opening call buttons
   * follow. With no fill, the border is the whole boundary of the control
   * and has to carry 1.4.11's 3:1 on its own. */
  background: transparent;
  border: 2px solid var(--hx-felt-outline);
  color: var(--hx-felt-text);
}
.hexdev-truco-leave-button:hover, .hexdev-truco-leave-button:focus-visible { filter: brightness(1.15); }
.hexdev-truco-leave-icon { width: 18px; height: 18px; flex: 0 0 auto; }
/* The resting control is as quiet as a permanently-visible control can be:
 * the glyph carries it, and the word rides along for everyone the glyph
 * alone would fail. Below the medium tier the word steps out — the corner is
 * tightest exactly where the felt is smallest, and a door on its own is the
 * one icon that needs no gloss. The accessible name survives it, which is
 * the whole reason it can go. */
.hexdev-truco-leave-button--rest { background: var(--truco-cloth-lane); box-shadow: var(--hx-relief); opacity: 0.85; }
.hexdev-truco-leave-button--rest:hover, .hexdev-truco-leave-button--rest:focus-visible { opacity: 1; }
@container hexdev-truco-shell (width < 640px) {
  .hexdev-truco-leave-button--rest .hexdev-truco-leave-label {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
}
/* Cancel is the safe answer, so it gets the solid treatment: the one that
 * looks like the default IS the one that keeps you playing. */
.hexdev-truco-leave-button--cancel {
  background: var(--gx-color-accent, var(--hx-gold));
  border-color: transparent;
  color: var(--hx-ink);
}

/* ==========================================================================
 * FULLSCREEN FIT — the widget sizes itself to the window it was given.
 *
 * Until this rule, the felt's height was a pure function of its WIDTH: the
 * @container blocks above pick --truco-card-tier from inline-size alone, and
 * every row is derived from that card. On a wide, short window — an ordinary
 * laptop — that took the LARGEST cards and produced the tallest layout, so
 * the widget measured 910.59px inside an 837px viewport and the player's own
 * hand rendered below the fold of a position:fixed;inset:0 box the host
 * page cannot scroll. Measured live, then pinned by
 * table-viewport-fit.browser.test.ts (12 failing rows before this rule).
 *
 * WHY IT IS SCOPED TO FULLSCREEN, and must stay that way. The widget is
 * "inline that expands" (widget-sdk/src/mount.ts, design §3). INLINE, it
 * measures itself and the host grants that height through a resize message:
 * there is no ceiling to respect, and capping the cards would shrink them for
 * nothing. FULLSCREEN, the container IS the viewport and the widget fits or
 * is clipped. The app already broadcasts that transition to the host
 * (sendLayout); the same call now stamps this attribute on its own document
 * root, so the two can never disagree about which mode is in effect. Every
 * visual baseline and every height fence in this package mounts inline and is
 * therefore untouched — asserted, not assumed, by that same fence file.
 *
 * THE FORMULA is the felt's own row structure solved for the card, using the
 * SAME custom properties the rows are built from, so it tracks each tier
 * automatically instead of restating its constants:
 *
 *     felt = rows x cardHeight + banner + actionBand + 3 gaps + 2 pads + R
 *     cardHeight = cardWidth x 336 / 220   (the baraja española proportion
 *                                           every reservation here uses)
 *
 * --hx-fit-rows is how many card-heights the felt genuinely stacks (top hand,
 * the trick area's own 1.7-card reservation, bottom hand). --hx-fit-residual
 * is the measured remainder that belongs to no row — the same ~24px of real
 * content past the felt's own min-height floor that
 * table-height-budget.browser.test.ts records as open debt; it is rounded up
 * here rather than pretended away, and the fence is what keeps it honest.
 *
 * min() and not a replacement: on a window tall enough for the tier's own
 * card, the tier still wins and nothing about the existing layout changes.
 * ========================================================================== */
:root[data-hexdev-layout="fullscreen"] .hexdev-truco-table {
  --hx-fit-rows: 3.7;
  --hx-fit-residual: 28px;
  /* The residual is exactly the slack, which is what makes it safe to tune.
   * Substituting the card back into the row model collapses to
   *
   *     felt = H - (declared residual) + (real residual)
   *
   * so this value is not a fudge factor whose effect has to be guessed: a
   * declared residual one pixel above the real one leaves one pixel of
   * headroom, and one below overflows by one. Measured real residuals:
   * 1v1 under 28px at every window the fence drives; 2v2 30.19px, from the
   * side seats and the relation label the 1v1 felt never renders (see
   * relation-label-line-box.browser.test.ts). 34px keeps ~4px of headroom
   * for the 2v2 case rather than sitting on the boundary. */
  /* THE TIER IS NOT A CEILING HERE ANY MORE, and dropping it is the whole
   * point of this block. Fullscreen OWNS the window, so the honest size for a
   * card is the largest one the window can actually hold -- and on a tall
   * phone the tier was well under that: measured at 390x844, the height
   * allowed a 119px card and the tier held it at 60, leaving 363px of the
   * screen empty under a small table.
   *
   * Nothing changes where the window was already the binding constraint: at
   * 1440x900 the fit computes 119px against a 170px tier, so the fit was
   * already winning and still is. And nothing changes INLINE, where this rule
   * does not apply at all -- a widget embedded in someone's article does not
   * own the viewport and has no business sizing itself from it.
   *
   * The remaining cap is a plain ceiling for very tall windows, so a card
   * cannot grow past the point where a hand stops fitting across. */
  --truco-card-width: min(
    132px,
    calc(
      (100dvh - var(--hx-band-banner) - var(--hx-band-action-total) - var(--hx-felt-gap) * 3 - var(--hx-felt-pad-block) * 2 - var(--hx-fit-residual)) * 220 / 336 /
        var(--hx-fit-rows)
    )
  );
}
/* RE-MEASURED, 34px -> 38px, when the band stopped booking a strip it no
 * longer has.
 *
 * 2v2's band used to reserve two strips from 640px up, and this formula
 * subtracts that reservation. The residual -- the real content the row model
 * does not account for -- was measured against that doubled subtraction, so
 * part of its true value was hiding inside the band's slack. With the señas
 * strip moved to the side rail the reservation is a single strip again, the
 * formula has 54px more to give the cards, and it gave 3px more than the felt
 * actually had: table-viewport-fit caught it at 844x390, the landscape phone.
 *
 * Raised to the measured value plus a pixel, not to whatever silenced the
 * test. The cards still come out substantially bigger than before -- 54px
 * freed against 4px given back.
 */
:root[data-hexdev-layout="fullscreen"] .hexdev-truco-table[data-seat-count="4"] {
  /* RE-FITTED, 38 -> 44, when the anchor gap grew by 7px to hold the turn ring
   * off each seat's own chip. This rule owns the LANDSCAPE phone (844x390),
   * which is the window that moved -- the portrait one belongs to the compact
   * block further down and did not. Measured there: 5px over, plus one.
   *
   * The subtraction maps to total height 1:1, because the formula divides the
   * remaining height by the row count and the rows multiply it straight back.
   * Fitted against table-viewport-fit, never by arithmetic on the gap -- the
   * same instruction the wide 2v2 block gives about its own value. */
  --hx-fit-residual: 44px;
}

/* WIDE ENOUGH TO SHOW THE WHOLE LADDER, so it is shown.
 *
 * Measured: the fold buys nothing from 900px up -- the band seats the answer
 * and all three raises with room over -- and a player who can see every option
 * at once should not have to tap to find one. So here the ladder unfolds back
 * into the group in flow and the toggle goes.
 *
 * Decided in CSS and not in calls.ts because it is a question about the box's
 * width, and this package has never measured its own box: an embedded widget's
 * available width is its CONTAINER's, which is why every tier switch in this
 * file is a container query (see .hexdev-truco-table-shell's own note).
 *
 * The selectors carry [data-open] deliberately: the folded rule above is
 * attribute-plus-class, so a bare class here would lose the cascade to it and
 * the ladder would stay hidden at every width. Matched specificity, and the
 * ladder ignores the open state entirely up here -- there is no toggle left to
 * change it. */
@container hexdev-truco-shell (min-width: 900px) {
  .hexdev-truco-calls-group[data-open] .hexdev-truco-escalate-toggle { display: none; }
  .hexdev-truco-calls-group[data-open] .hexdev-truco-calls-ladder {
    position: static;
    display: flex;
    flex-wrap: nowrap;
    gap: 6px;
  }
}

/* A PORTRAIT PHONE NEEDS A BIGGER RESIDUAL, and finding that out is what the
 * portrait windows in table-viewport-fit.browser.test.ts are for.
 *
 * The residual is the real content the row model does not account for. It was
 * measured on landscape windows only -- every window that suite drove was
 * wider than it was tall -- and while the per-tier card size capped the fit
 * from above, an under-declared residual could never show. The moment
 * fullscreen started sizing cards from the window itself, a 390x844 phone
 * overflowed: 41px in 1v1, and more in 2v2, which has the side seats and the
 * relation labels on top.
 *
 * Scoped by WIDTH rather than by orientation because that is what the shell
 * can query, and it lands in the right place: a landscape phone is 844px wide
 * and keeps the values above, which its own window has always fitted. */
@container hexdev-truco-shell (width < 640px) {
  :root[data-hexdev-layout="fullscreen"] .hexdev-truco-table { --hx-fit-residual: 76px; }
  :root[data-hexdev-layout="fullscreen"] .hexdev-truco-table[data-seat-count="4"] { --hx-fit-residual: 110px; }
}

/* A DESKTOP WINDOW SPENDS ITS HEIGHT ON THE CARDS.
 *
 * The cap above stops the felt outgrowing the window. Nothing stopped the
 * window being wasted: reported as "la calidad de la imagen de las cartas es
 * pobre", measured as the opposite of a resolution problem — the deck art is
 * 322x520 and was being drawn into a 94x144 box, a 3.6x DOWNSCALE. The cards
 * were small, not soft, and the reason was this felt's own overhead: 304px of
 * an 837px window went to bands, gaps and padding before a card was placed.
 *
 * Three changes, all of them FULLSCREEN-ONLY and all at the wide tier, where
 * the felt has horizontal room to spare and none to spare vertically:
 *
 *   --truco-card-tier      the width tier stops being the ceiling. 170px is
 *                          the ARTWORK's own limit, not a taste: the deck is
 *                          520px tall (tools/process-svg-deck.mjs's
 *                          own resize-to-520), and 170 * 336/220 = 260, exactly
 *                          what a 2x display can draw 1:1. Past this the
 *                          assets must be re-exported before the layout may
 *                          grow, which table-viewport-fit.browser.test.ts
 *                          asserts so it stays a decision.
 *   --hx-back-scale        the opponents' face-down backs give back a
 *                          quarter of their height. They are a COUNT, not a
 *                          card anyone reads.
 *   --hx-felt-pad-block    the block padding drops; the inline padding does
 *                          not. The felt is 1278px wide holding three cards
 *                          — the horizontal air is not what is scarce.
 *
 * --hx-fit-rows follows from the first two: the felt stacks the opponents'
 * row, the trick reservation and the player's own hand, so shrinking the
 * backs takes 0.25 of a card-height out of that sum. Leaving it at 3.7 would
 * have the formula pay for height the layout no longer spends. */
@container hexdev-truco-shell (min-width: 900px) {
  :root[data-hexdev-layout="fullscreen"] .hexdev-truco-table {
    /* The felt's own content-derived floor has NO JOB here, and leaving it
     * armed is what made this fight so long. That floor exists so an inline
     * felt cannot collapse; in fullscreen the shell already hands the felt a
     * definite height, so the floor stops being a safety net and becomes a
     * SECOND, competing height formula — one that hardcodes its own row
     * count. Measured: with the 2v2 card at its correct size the tier floor
     * demanded 948px of an 837px window, purely on its own arithmetic.
     * Zero here leaves exactly one formula deciding the height, which is the
     * fit calculation below. */
    min-height: 0;
    --truco-card-tier: 170px;
    --hx-back-scale: 0.75;
    --hx-felt-pad-block: 20px;
    /* The ultra tier had opened the gap to 24px for breathing room. On a
     * window this shape the felt is not short of room between things — it is
     * short of room for the things themselves, and three of these gaps sit
     * in the block axis. */
    --hx-felt-gap: 16px;
    /* MEASURED, not derived — and the derivation is what went wrong before.
     * The felt at this tier comes to 3.55 card-heights plus 237 fixed px,
     * broken down by reading the live boxes rather than the stylesheet:
     *
     *   0.75  the opponents' backs row
     *   1.70  the trick's own reservation
     *   0.10  the trick-feedback line, which no earlier accounting counted
     *   1.00  the player's own hand
     *   ----
     *   3.55  card-heights
     *
     *   + 84  the banner reservation (padding-top on .hexdev-truco-center;
     *         the banner slot itself is position: absolute and contributes
     *         no layout height at all, so this is pure reservation)
     *   + 56  the action band
     *   + 48  three gaps
     *   + 40  block padding
     *   +  9  the centre's own internal gap
     *
     * It had been 3.45 rows against a 28px residual: TWO errors that
     * cancelled, so the number this produces today is right and every
     * change made from it came out wrong. That is precisely how an attempt
     * to shrink the trick reservation overflowed the window by 33px. */
    /* 1.7 -> 1.35: the two plays overlap more. The LEAN survives, and the
     * lean is the whole signal — a play still sits nearer the seat that made
     * it, which is how a player reads who played what. A flat 1.0 would buy
     * more and cost the signal itself; moving the separation to the
     * horizontal axis (as the side seats already do at left/right 15%) maps
     * naturally for a seat AT a side and arbitrarily for one above or below,
     * so that is not a swap this file gets to make on its own. */
    --hx-trick-rows: 1.35;
    --hx-fit-rows: 3.20;
    --hx-fit-residual: 12px;
  }
  /* 2v2 stacks a different number of card-heights, and the difference is not
   * the seat count — it is the SIDE columns. A left/right opponent lays its
   * three backs out vertically, so that column, not the banner-plus-trick
   * centre, is what sets the middle row's height. Measured at two points
   * (rows 3.7 with full-size backs, then rows 3.45 with 0.75 backs) the 2v2
   * felt comes to ~4.37 card-heights against 1v1's 3.45 — so the same
   * formula with 1v1's multiplier overflowed by 75px, which the fit fence
   * caught immediately. */
  :root[data-hexdev-layout="fullscreen"] .hexdev-truco-table[data-seat-count="4"] {
    /* 2v2 is a DIFFERENT SHAPE, not a bigger 1v1, and the difference is the
     * side columns. A left/right opponent stacks its three backs vertically,
     * so that column — not the banner-plus-trick centre — is what sets the
     * middle row. Measured at this tier with the backs scaled:
     *
     *   0.75  the partner's row above
     *   2.25  the side column (3 backs at --hx-back-scale)
     *   1.00  the player's own hand
     *   ----
     *   4.00  card-heights
     *
     * NEGATIVE RESIDUAL, and it is not a fudge. The shared formula subtracts
     * --hx-band-banner because in 1v1 the banner sits above the trick and
     * genuinely costs height. Here it does not: the side column is taller
     * than the whole banner-plus-trick stack, so the centre row never pays
     * for the banner at all, so the residual hands most of that subtraction
     * back — anything else would mean lying in the rows count instead, which
     * is exactly the kind of two-errors-that-cancel that made every earlier
     * attempt at this file come out wrong.
     *
     * MOST, not all, and the exact amount is FITTED, not derived. An earlier
     * revision of this comment claimed the residual "gives the banner's 84px
     * back", but the number sitting under it was -56px: the formula went on
     * paying 28px of banner, and nobody could tell which of the two was the
     * stale one. Deriving it (calc(6px - var(--hx-band-banner))) was tried
     * and is WRONG — table-viewport-fit caught it overflowing by 21px at
     * 1440x810. What this value really encodes is how much taller the side
     * column is than the banner-plus-trick stack it replaces, which no
     * single token expresses. Measured against that fence: -28px fits at
     * every fullscreen size it checks, -34px already overflows by ~5px. So
     * this layout sits AT its fit limit, and the banner reserve shrinking
     * from 84px to 56px bought 2v2 fullscreen nothing — the residual absorbs
     * it exactly (28 - 56 = -28), which is why the number moved when the
     * banner did. Re-fit it against that fence, never by arithmetic.
     *
     * RE-FITTED, -28 -> -21, when the anchor gap grew by 7px to hold the turn
     * ring off each seat's own chip. Sitting AT the fit limit is exactly what
     * that warning meant: 7px of new gap put every wide fullscreen window 7px
     * over at once.
     *
     * Two other things were tried first and BOTH changed the overflow by zero,
     * which is what said this was the binding constraint: raising the tier
     * residual above (a different rule, overridden here) and lowering the
     * card's 132px ceiling (the card measures 103px at 1550x837 -- nowhere
     * near it). What actually binds is the centre row's own min-content floor:
     * a side column is label + gap + three cards, grid gives that row 1fr with
     * an implicit auto minimum, and the row cannot shrink under it. */
    --hx-fit-rows: 4.0;
    --hx-fit-residual: -21px;
  }
}

/* The other direction: a widget SHORTER than its window still owns the whole
 * window.
 *
 * The cap above stops the felt outgrowing the screen. Nothing stopped it
 * leaving a hole: on a tall, narrow phone the felt is content-sized and does
 * not need the whole height — 587px of an 820px viewport at 400px wide — and
 * the shell painted nothing, so the 233px underneath fell through to the
 * document canvas. The canvas default is WHITE: a bright band under a green
 * table, on a widget that had just taken over the entire screen. The lobby
 * never showed it, because widget-app's own .convite-chrome paints a
 * surface; the match view replaces that element with this shell, which
 * painted none.
 *
 * --truco-cloth-deep, the darkest stop of the felt's own palette, so the
 * spare space reads as the room the table is in. A FIXED truco token and not
 * --gx-color-surface: the cloth keeps truco's identity (design D-11), and
 * that tenant token's own default is the white this rule exists to remove.
 *
 * FULLSCREEN ONLY, and this scope is load-bearing rather than tidiness.
 * Inline, the widget measures itself and the host grants that height
 * (loader.ts's resize path); a shell that always claimed the viewport would
 * report a height it never needed and the iframe could never shrink back —
 * a one-way ratchet on somebody else's page. Fenced in both directions by
 * table-viewport-fit.browser.test.ts.
 *
 * HANGS FROM THE TOP, and that is a correction. This used to be
 * justify-content: center, which put the leftover space above the table as
 * well as below it -- on a phone that was 172px of empty cloth over the
 * partner's seat before anything was even dealt. Reported looking at it:
 * "me gustaria que la alineacion de la mesa sea en el top y no abajo, no me
 * gusta el espacio que queda ahi arriba." The room the table sits in still
 * reads as room; it is all underneath now, where a table's own edge is.
 *
 * The layout child keeps its own content height — a height of 100% against a
 * parent whose own height is still auto resolves to auto — so nothing here
 * stretches the felt, and the cap fences above would fail loudly if it did. */
:root[data-hexdev-layout="fullscreen"] .hexdev-truco-table-shell {
  min-height: 100dvh;
  background: var(--truco-cloth-deep);
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}
`.trim();
}

/** Idempotent injection into <head> — safe to call on every render. */
export function ensureTableStyles(doc: Document): void {
  if (doc.getElementById(TABLE_STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = TABLE_STYLE_ID;
  style.textContent = buildTableStylesheet();
  doc.head.appendChild(style);
}
