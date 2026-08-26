export const CHROME_STYLE_ID = "convite-chrome-styles";

/**
 * The lobby/selection screen's own stylesheet, generated as a string for the
 * same reason `truco-ui`'s `table-styles.ts` is: this package builds via
 * plain `vite build` for its app bundle, but nothing here needs a `.css`
 * loader either, and keeping the same "one string, injected once" pattern
 * across both presentational layers is deliberate consistency, not
 * incidental duplication.
 *
 * DESIGN §10 — hybrid theming by zone (obs 2955): this whole screen is
 * CHROME (the frame, the lobby, the selection, the controls), so EVERY rule
 * below reads a `--gx-*` tenant token, with a neutral fallback for a tenant
 * that sent none. Nothing here ever reaches for the table's own
 * `--truco-*`/`--deck-*` identity tokens — a strong-branded tenant must see
 * their colors on this screen, and a future second game must never need to
 * touch this file at all.
 */
export function buildChromeStylesheet(): string {
  return `
.convite-chrome {
  box-sizing: border-box;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  font-family: var(--gx-font-family, system-ui, sans-serif);
  color: var(--gx-color-on-surface, #1a1a1a);
  background: var(--gx-color-surface, #ffffff);
  /* --hx-* private token layer (design token-parity, VDS-1), identical to
   * table-styles.ts's own :root declaration (proved by
   * design-token-parity.test.ts). Scoped here, not :root: chrome has no
   * <defs>-sibling problem the way the table's matchstick SVG does, so
   * ordinary descendant scoping is enough. Declared unused in PR1 -- PR6
   * below is this stylesheet's first slice to actually read a --hx-* value
   * (spacing/radii/elevation, on the surfaces this PR repaints). */
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
  /* Consumed by the chrome body-copy rule at the end of this stylesheet
   * (status-card paragraphs, lobby modality paragraphs, empty/loading
   * messages -- FU-5). The felt side declares the same leading token but
   * never reads it; both declarations stay for cross-stylesheet token
   * parity (design-token-parity.test.ts scans both declared sets). */
  --hx-leading: 1.35;
  --hx-motion-fast: 120ms;
  --hx-ease: ease-out;
  --hx-chrome-on-felt: #10312a;
  --hx-gold: #e8c877;
  --hx-gold-edge: #b8923f;
  --hx-ink: #1a1a1a;
  /* Consumed on the FELT side only (table-styles.ts's four cross-zone rules
   * read it; see that declaration for the whole argument and its measured
   * ratios). No chrome rule reads it -- every chrome surface a tenant can see
   * IS a tenant surface, so --gx-color-on-surface is the correct token there
   * and stays. Declared anyway for cross-stylesheet token parity, the mirror
   * image of --hx-leading's own felt-side declaration. */
  --hx-felt-text: #f2f2f2;
  /* Felt-side only too, and for the same reason: the outlined controls this
   * paints sit on the recessed action lane, a surface that exists nowhere in
   * the chrome. Every chrome button's border reads --gx-color-primary against
   * a real tenant surface, where that token is correct. Mirrored for parity. */
  --hx-felt-outline: #65b08a;
}
.convite-chrome * { box-sizing: border-box; }

/* WCR-1 (container query axis, PR6-T1): the same "a size container cannot
 * be styled by its own @container rules" split table-styles.ts's felt
 * already solved (.hexdev-truco-table-shell vs .hexdev-truco-table) --
 * .convite-chrome establishes the inline-size container here, and its
 * descendant .hexdev-chrome-content below is what the @container rules
 * further down actually repaint. A CSS query container can never be
 * targeted by its OWN container query (proven empirically in
 * chrome-styles.browser.test.ts's cascade-order suite: a first attempt at
 * this PR put the wide-tier padding override directly on
 * .convite-chrome, and it silently never engaged at any width -- this
 * is why ALL responsive repainting below targets .hexdev-chrome-content or
 * deeper, never .convite-chrome itself). Gated by [data-chrome-view]
 * (set once by whichever render function owns the screen --
 * game-selection.ts / status-view.ts -- the same data-*-as-contract
 * convention as data-prominent/data-result/data-turn), so this only
 * activates once a screen has genuinely opted in, never on bare class
 * presence alone. Deliberately NOT id-qualified (no #convite-app
 * prefix, even though that is the real production element's id): every
 * other selector in this stylesheet (and table-styles.ts's own) is
 * class-only, and every existing test in this package mounts these render
 * functions into a plain, id-less <div> -- an id-qualified selector would
 * silently defeat this whole container-query axis under every one of those
 * tests, and under any future embedding that reuses these render functions
 * with a differently-id'd root. */
.convite-chrome[data-chrome-view] {
  container-type: inline-size;
  container-name: hexdev-chrome;
}

/* The inner content column: centers at a comfortable reading/grid width
 * (1120px) inside the (often much wider) container a host page gives this
 * widget, owns the vertical gap between its own children (the exact job
 * .convite-chrome's own gap used to do before this split), and now
 * carries ALL of the shell's edge padding too -- moved down from
 * .convite-chrome for the self-query reason above: this element is a
 * genuine DESCENDANT of the query container, so its padding CAN respond to
 * the @container override below, at 24px 16px (nearest --hx-space-* pair to
 * the former hardcoded 20px 16px, a deliberate small snap) by default. */
.hexdev-chrome-content {
  width: min(1120px, 100%);
  margin-inline: auto;
  padding: var(--hx-space-lg) var(--hx-space-md);
  display: flex;
  flex-direction: column;
  gap: var(--hx-space-lg);
}

/* WCR-3 (status/error/unsupported share the language, PR6-T2): these
 * screens are a single centered card, never a top-anchored block -- the
 * lobby's own top-anchored list stays the (unmarked) default. */
.convite-chrome[data-chrome-view="status"],
.convite-chrome[data-chrome-view="error"],
.convite-chrome[data-chrome-view="unsupported"] {
  justify-content: center;
}

/* WCR-2 (lobby wide grid, PR6-T2): flex column by default (narrow/medium --
 * one card per row reads better than a cramped 2-up grid at those widths),
 * a real grid once the container has room. */
.hexdev-chrome-games {
  display: flex;
  flex-direction: column;
  gap: var(--hx-space-lg);
}

@container hexdev-chrome (min-width: 720px) {
  .hexdev-chrome-games {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: var(--hx-space-lg);
  }
}

@container hexdev-chrome (min-width: 1024px) {
  /* Cascade note: identical 0-1-0 specificity to .hexdev-chrome-content's
   * own base padding rule above -- this wins because it is declared LATER
   * in this same stylesheet string, not because of @container nesting (the
   * exact cascade-source-order CRITICAL this chain already hit twice,
   * PR4/PR5). Self-checked: no other rule in this file re-declares padding
   * on .hexdev-chrome-content after this point. */
  .hexdev-chrome-content {
    padding: var(--hx-space-2xl) var(--hx-space-xl);
  }
}

/* PR8 (WARNING-1/WCR-3 closure): exact match, --hx-text-display-compact. */
.hexdev-chrome-title {
  margin: 0;
  font-size: var(--hx-text-display-compact);
  font-weight: 800;
  color: var(--gx-color-on-surface, #1a1a1a);
}

/* WCR-3 (status/error card, PR6-T4): a centered card, not the former
 * edge-to-edge paragraph. "margin: 0 auto" (rather than the parent's
 * align-items) centers it horizontally regardless of the flex parent's own
 * cross-axis alignment -- the [data-chrome-view=...] rule above only ever
 * sets justify-content, the vertical axis. No pulse, no animation
 * (refinement 3/D-7 -- confirmed nothing below this point animates). */
.hexdev-chrome-status {
  margin: 0 auto;
  padding: var(--hx-space-lg);
  border-radius: var(--gx-radius, var(--hx-radius-lg));
  box-shadow: var(--hx-elev-1);
  max-width: 480px;
  background: var(--gx-color-primary, #2f6f4f);
  color: var(--gx-color-on-primary, #ffffff);
}

/* The chrome's live region (status-view.ts, WCAG 4.1.3). Clip-rect hidden,
 * the same declarations as table-styles.ts's own .hexdev-truco-announcer --
 * never display: none or visibility: hidden, which would remove the node from
 * the accessibility tree and defeat its whole purpose. position: absolute is
 * what makes it FREE: out of flow it cannot move the centered card, and
 * clipped to nothing it cannot show up in a visual baseline. */
.hexdev-chrome-announcer {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

.hexdev-game-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border-radius: var(--gx-radius, 14px);
  background: color-mix(in srgb, var(--gx-color-primary, #2f6f4f) 6%, var(--gx-color-surface, #ffffff));
  /* Elevation (PR6-T3, VDS-4, paint-only): --hx-elev-1 + --hx-relief, the
   * same combined-shadow-list convention table-styles.ts's own felt-side
   * surfaces already use for scoreboard-panel/call-log. */
  box-shadow: var(--hx-elev-1), var(--hx-relief);
}
/* PR8 (WARNING-1/WCR-3 closure): exact match, --hx-text-title. */
.hexdev-game-card h2 {
  margin: 0;
  font-size: var(--hx-text-title);
  font-weight: 700;
  color: var(--gx-color-on-surface, #1a1a1a);
}

.hexdev-modality {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: var(--gx-radius, 10px);
  background: color-mix(in srgb, var(--gx-color-on-surface, #1a1a1a) 5%, transparent);
  /* Elevation (PR6-T3): relief only, no --hx-elev-N -- keeps the color-mix
   * tint as the primary depth signal here; [data-prominent] below stays the
   * primary, non-exclusive prominence signal too (VB-6: elevation is
   * additive only, never a replacement). */
  box-shadow: var(--hx-relief);
}
.hexdev-modality p { margin: 0; }
/* B14 (WCAG 1.3.1): the modality's title line became a real <h3>. Styled by
 * CLASS, never by tag, and reset back to exactly what the <p> it replaced
 * computed to -- a heading's UA defaults (bold, 1.17em, block margins) are the
 * whole reason a structural fix like this repaints if left alone. Every
 * property a heading would otherwise contribute is named here, and the
 * --hx-leading list below adds the last one. */
.hexdev-modality-title { margin: 0; font-size: inherit; font-weight: inherit; }
.hexdev-modality-count {
  font-weight: 700;
  color: var(--gx-color-primary, #2f6f4f);
}

.hexdev-bot-row { display: flex; flex-wrap: wrap; gap: 8px; }

.convite-chrome button {
  min-height: 42px;
  padding: 9px 18px;
  border: 2px solid transparent;
  border-radius: var(--gx-radius, 999px);
  font-family: inherit;
  font-weight: 700;
  /* PR8 (WARNING-1/WCR-3 closure): exact match, --hx-text-body. */
  font-size: var(--hx-text-body);
  cursor: pointer;
  background: transparent;
  border-color: var(--gx-color-primary, #2f6f4f);
  color: var(--gx-color-on-surface, #1a1a1a);
}
.convite-chrome button:hover,
.convite-chrome button:focus-visible {
  filter: brightness(1.08);
}

/* An OWNED focus indicator (WCAG 2.4.7) — the chrome half of the rule
 * table-styles.ts declares for the felt. Until this rule, 2.4.7 on the lobby
 * rested entirely on the UA default ring, which one host-page outline reset
 * would erase.
 *
 * currentColor, deliberately, where the felt uses its fixed gold: chrome
 * surfaces are tenant-branded, so NO fixed colour can be proven against an
 * arbitrary tenant surface — but every focusable control here already needs
 * its TEXT readable on that same surface (4.5:1, the contrast suite), so the
 * ring inherits a guarantee the theme cannot ship without: it can only fail
 * where the button label already failed first.
 *
 * :where() is DELIBERATE SPECIFICITY ORDERING, not tidiness: it drops this
 * subject to (0,1,0) so the felt's own (0,2,0) gold rule (table-styles.ts)
 * deterministically wins on every control inside the truco shell — which
 * nests inside this chrome-classed root in the real widget. Without it the
 * two rules tie and the winner depends on stylesheet insertion order,
 * which would silently trade the felt's tenant-proof gold for a
 * tenant-dependent currentColor. Pinned by the precedence test in
 * chrome-styles.browser.test.ts. */
.convite-chrome :where(:focus-visible) {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}

/* WCR-3 (error/retry, PR6-T4) + FU-2 (unsupported/back-to-lobby): ONE rule,
 * TWO emergency exits. Retry on the error card and back-to-lobby on the
 * unregistered-game card (unsupported-game-view.ts) are each the single
 * escape action on a stranded-state card, so both get the same
 * accent-outlined, elevated, centered treatment instead of the plain
 * primary-outlined default every other chrome button gets above -- higher
 * specificity (attribute selector) than the base .convite-chrome
 * button rule, so it wins regardless of source order. margin-inline: auto
 * centers each button horizontally, the same mechanism
 * .hexdev-chrome-status's own "margin: 0 auto" already uses; display: block
 * is what makes that centering real for back-to-lobby, which sits INSIDE
 * the block-level status card, where an inline-block's auto inline margins
 * resolve to zero -- retry is a flex item of .hexdev-chrome-content and
 * already blockified, so display: block is a no-op for it. */
.convite-chrome button[data-action="retry"],
.convite-chrome button[data-action="back-to-lobby"] {
  display: block;
  margin-inline: auto;
  border-color: var(--gx-color-accent, var(--hx-gold));
  box-shadow: var(--hx-elev-2);
}

/* A button INSIDE the status card takes the card's own text colour, not the
 * page's. Every chrome button is transparent, so what shows through it is
 * whatever it sits on -- and .hexdev-chrome-status paints itself
 * --gx-color-primary, the deep green, while the base button rule above
 * hands out --gx-color-on-surface, a near-black meant for the plain
 * surface. On the card that pairing measures 2.91:1, well under the 4.5:1
 * WCAG AA needs for normal text: the back-to-lobby button was genuinely
 * hard to read, reported from a real screenshot.
 *
 * Scoped by the card, deliberately, rather than repainting every chrome
 * button: status-view.ts appends the RETRY button to .hexdev-chrome-content
 * as a sibling of the card, never a child, so retry really does sit on the
 * plain surface where --gx-color-on-surface is the correct token and
 * already passes. chrome-contrast.browser.test.ts asserts both halves, so
 * neither can regress into the other. */
.hexdev-chrome-status button {
  color: var(--gx-color-on-primary, #ffffff);
}

/* The prominent action — vs-person when real players are waiting, vs-bot
 * when the zero-counter UX rule (spec) hides the count instead — gets the
 * solid, filled treatment; the secondary action stays outlined. Driven by
 * data-prominent, set once from the SAME entry.waitingCount/promoteBotFallback
 * value game-selection.ts already receives from deriveLobbyDisplay — never
 * re-decided here, only painted differently. */
.hexdev-modality[data-prominent="person"] button[data-action="vs-person"],
.hexdev-modality[data-prominent="bot"] button[data-action="vs-bot"] {
  background: var(--gx-color-accent, #ffd166);
  border-color: var(--gx-color-accent, #ffd166);
  color: #1a1a1a;
}

.hexdev-chrome-empty,
.hexdev-chrome-loading {
  margin: 0;
  color: var(--gx-color-on-surface, #1a1a1a);
  opacity: 0.75;
}

/* FU-5 (--hx-leading consumed): chrome BODY COPY reads the shared 1.35
 * reading leading -- paragraph-level text only: the status/error card's
 * single-paragraph form (status-view.ts renders the card itself as a <p>),
 * the unsupported-game card's body/meta paragraphs
 * (unsupported-game-view.ts), the lobby modality description/count
 * paragraphs (game-selection.ts), and the empty/loading messages.
 * Deliberately NEVER the .hexdev-chrome-status container itself:
 * line-height inherits, and the unsupported card's own h1 would silently
 * pick it up -- headings, buttons, badges, and label-style text keep their
 * UA/own leading.
 *
 * .hexdev-modality-title is the ONE heading on this list, and it is not an
 * exception to that rule: B14 promoted it from a <p> for STRUCTURE only, and
 * it must keep computing exactly what the paragraph did. Listed by its class,
 * so nothing else inherits the decision. */
p.hexdev-chrome-status,
.hexdev-chrome-status p,
.hexdev-modality p,
.hexdev-modality-title,
.hexdev-chrome-empty,
.hexdev-chrome-loading {
  line-height: var(--hx-leading);
}

/* THE DECK CREDIT (game-selection.ts's renderAbout). Not decoration: the card
 * artwork is CC BY-SA 3.0, so this is the surface that satisfies the license's
 * attribution term, and it has to stay legible and reachable rather than
 * tucked away to a size nobody can hit.
 *
 * A NATIVE <details>, so the marker has to go: every engine draws its own
 * triangle, in its own place, and none of them is the "i" this wants to be.
 * Both selectors are needed -- WebKit only honours the pseudo-element form. */
.hexdev-about {
  margin-top: 24px;
  align-self: flex-start;
}

.hexdev-about-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* 28px, not the 44px touch target the play buttons use: this is a
   * secondary, rarely-pressed affordance and a full-size button beside them
   * reads as another way to start a game. Still comfortably above the 24px
   * WCAG 2.2 minimum for a non-essential control. */
  width: 28px;
  height: 28px;
  border-radius: 999px;
  border: 1px solid var(--gx-color-on-surface, #1a1a1a);
  opacity: 0.55;
  font-size: 0.82rem;
  font-weight: 700;
  font-style: italic;
  line-height: 1;
  cursor: pointer;
  list-style: none;
  color: var(--gx-color-on-surface, #1a1a1a);
  transition: opacity var(--hx-motion-fast) var(--hx-ease);
}

.hexdev-about-toggle::-webkit-details-marker {
  display: none;
}

.hexdev-about-toggle:hover,
.hexdev-about-toggle:focus-visible,
.hexdev-about[open] .hexdev-about-toggle {
  opacity: 1;
}

.hexdev-about-panel {
  margin-top: 10px;
  /* Bounded so a credit never becomes a wall of text across a wide lobby;
   * 46ch is the same order the body copy below already reads at. */
  max-width: 46ch;
  font-size: var(--hx-text-body-compact, 0.85rem);
  line-height: var(--hx-leading);
  color: var(--gx-color-on-surface, #1a1a1a);
  opacity: 0.8;
}

.hexdev-about-title {
  margin: 0 0 4px;
  font-size: inherit;
  font-weight: 700;
  letter-spacing: var(--hx-tracking-label);
  text-transform: uppercase;
}

.hexdev-about-credit {
  margin: 0;
}

.hexdev-about-links {
  margin: 4px 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
}

.hexdev-about-links a {
  color: inherit;
  text-underline-offset: 2px;
}
`.trim();
}

/** Idempotent injection into `<head>` — safe to call on every render, same
 * discipline as `truco-ui`'s `ensureTableStyles`. */
export function ensureChromeStyles(doc: Document): void {
  if (doc.getElementById(CHROME_STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = CHROME_STYLE_ID;
  style.textContent = buildChromeStylesheet();
  doc.head.appendChild(style);
}
