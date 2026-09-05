export const CHROME_STYLE_ID = "convite-chrome-styles";

/**
 * How long one card takes to land, and how long each waits behind the one
 * before it. Exported and interpolated into the rule below rather than
 * written into the CSS as literals, because game-selection.ts has to know
 * exactly when the greeting is over: it stops publishing the elapsed offset
 * at that moment, and a stylesheet that disagreed by so much as a frame would
 * either cut the last card short or leave the class on a finished animation.
 * One pair of numbers, read by the code that animates and by the code that
 * times it.
 */
export const DEAL_DURATION_MS = 460;
export const DEAL_STAGGER_MS = 55;

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
  /* PR-EST gave the lobby a display size at all — its title used to compute
   * to 21.6px, which read as a form, not a front door. PR-VDR (the vidriera
   * pass) HALVED that ceiling: measured on a real render (mahjong-front-
   * door-wide/-narrow, game-list-two-wide/-narrow), 68px of beveled gold left
   * a 3x jump to the next size down (card name, --hx-text-heading, 21.6px)
   * with nothing between. Halved, the hero clears every smaller size even at
   * its own smallest clamp step. cqw, not vw, for the same reason table-
   * styles.ts's FU-4 already argues: read by a descendant of .convite-
   * chrome's own query container, it answers to the widget's box, not to
   * whatever host page it sits in. */
  --hx-text-display-hero: clamp(1.75rem, 3.6cqw, 2.5rem);
  /* Loosened one step from -0.02em along with the shrink: tuned for a 68px
   * ceiling, it read tight rather than sturdy at 40px. */
  --hx-tracking-hero: -0.01em;
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
   * a game-scoped token the chrome is forbidden to read — and the fence that
   * forbids it scans this very comment, which is why it is not named here —
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
  /* THE FELT, and the tenant tints it instead of replacing it — see
   * --hx-felt-base's own note. The vignette is what turns a flat colour into
   * a surface: a table is lit from above, so the centre is where the light
   * falls and the edges fall away. Two layers, not one, because a single
   * radial reads as a spotlight; the second, wider and subtler, is what keeps
   * it looking like cloth. */
  /* Four layers, and the order is the whole trick: weave, weave, light,
   * shadow, colour. The two repeating gradients are a CLOTH, not a pattern —
   * 3px apart and under 3% alpha, so they never resolve into stripes at any
   * zoom, they just stop the felt being a flat fill.
   *
   * Pure CSS rather than an SVG noise data: URI, deliberately: this mounts
   * inside somebody else's page, a strict host CSP can refuse a data: image,
   * and a texture that silently vanishes under exactly the tenants who care
   * most about security is not a texture. */
  /* A FLAT COLOUR UNDER THE GRADIENTS, and it does two jobs.
   *
   * It is the fallback: a browser that cannot paint one of the layers above
   * gets a green table, not a white page with light text on it.
   *
   * And it is the only thing a contrast checker can READ. "background-color"
   * is what walking the ancestor chain finds; a gradient is invisible to it,
   * so without this the whole lobby measures against nothing — which is
   * exactly what happened, and the suite failed with -no painted background
   * anywhere up the ancestor chain- rather than with a bad number.
   *
   * --hx-cloth-LIT and not the mid tone, deliberately: the felt runs light in
   * the centre and dark at the edges, and light text is at risk over the
   * light part. Measuring against the lightest point measures the worst
   * case. */
  background:
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.014) 0 1px, transparent 1px 6px),
    repeating-linear-gradient(-45deg, rgba(0, 0, 0, 0.030) 0 1px, transparent 1px 6px),
    radial-gradient(ellipse 120% 90% at 50% 30%,
      var(--hx-cloth-lit),
      color-mix(in srgb, var(--gx-color-surface, transparent) var(--hx-felt-tint), var(--hx-cloth)) 55%,
      var(--hx-cloth-deep) 100%);
  /* AFTER the shorthand, never before it: "background:" resets
   * background-color to transparent, so a longhand declared above it is
   * discarded — which is exactly how the first attempt at this changed
   * nothing and the contrast suite went on reporting that it could find no
   * painted background at all. */
  background-color: var(--hx-cloth-lit);
  color: var(--hx-felt-ink);
  box-shadow: var(--hx-room);
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
/* CEREMONY, and it is composition rather than decoration. The header block
 * centres and the grid under it does not: centring EVERYTHING turns a lobby
 * into a poster and makes a list of games hard to scan, while centring
 * nothing leaves a dashboard. A centred title over a left-aligned grid is the
 * shape of an entrance with a table behind it.
 *
 * The vertical padding is fluid and generous on purpose — space above the
 * title is most of what separates a front door from a form, and it costs
 * nothing but room this screen has. */
.hexdev-chrome-header {
  text-align: center;
  max-width: 46rem;
  margin: 0 auto;
  padding: clamp(24px, 6vh, 64px) 0 0;
}
/* A HAND, NOT A ROW. Three things make it read as cards somebody is holding
 * rather than four images in a line, and all three are geometry:
 *
 *   1. They OVERLAP (negative margin), because a held hand is fanned from one
 *      corner and cards hide each other.
 *   2. They rotate symmetrically around the centre, ±9° at the edges.
 *   3. They arc: the outer cards sit LOWER than the middle one. Without this
 *      the fan is a windscreen wiper; with it, it is a hand.
 *
 * The rotation is computed from the card's own index against the count, so a
 * game that offers three or five cards fans correctly without this stylesheet
 * knowing how many there are. --i and --n come from the renderer.
 *
 * Each card carries the same contact+ambient pair as every other raised
 * surface here — they are objects on the same table, lit by the same light. */
.hexdev-chrome-fan {
  display: flex;
  justify-content: center;
  align-items: flex-end;
  margin: 0 0 clamp(14px, 3vh, 30px);
  /* The fan overlaps and rotates outside its own box; without this the
     rotated corners are clipped by the header's centring. */
  overflow: visible;
}

.hexdev-chrome-fan-card {
  --mid: calc((var(--n) - 1) / 2);
  --offset: calc(var(--i) - var(--mid));
  width: clamp(64px, 8.5vw, 104px);
  height: auto;
  /* A quarter of the card hidden under its neighbour: enough that the hand is
   * clearly held and not laid out, little enough that every face is still
   * readable. Proportional to the width, so the overlap survives the clamp. */
  margin: 0 calc(clamp(64px, 8.5vw, 104px) * -0.10);
  border-radius: 6px;
  /* The arc without abs(): squaring the offset and dividing gives the same
   * "further from centre, lower down" curve with arithmetic every browser has
   * had for years. abs() is recent enough that relying on it here would drop
   * the arc — and the fan back to a wiper — on the browsers least likely to
   * be tested. */
  transform:
    translateY(calc(var(--offset) * var(--offset) * 2.5px))
    rotate(calc(var(--offset) * 7deg));
  /* The centre sits on top and the stack falls away to both edges, which is
   * how a hand looks from in front. Left to DOM order instead, the leftmost
   * card ends up under every one of its neighbours and disappears entirely —
   * which is what the first version did, and it cost a card without ever
   * looking broken. Squared rather than abs(), same reason as the arc. */
  z-index: calc(10 - var(--offset) * var(--offset));
  box-shadow: var(--hx-lift-contact), var(--hx-lift-ambient);
}

/* THE ONE PIECE OF MOTION ON THIS SCREEN, and it happens once: the hand
 * settles onto the table as the lobby opens. Cards arrive a beat apart
 * (--i * 60ms) from slightly above and slightly flatter, which is what makes
 * it read as dealing rather than as an animation playing.
 *
 * 460ms and then never again. Nothing here loops, pulses or glows — a lobby
 * that keeps moving is a lobby nobody can read, and the point of an effect is
 * to say "this is a table", not to be noticed.
 */
@keyframes hexdev-deal {
  from {
    opacity: 0;
    transform: translateY(calc(var(--offset) * var(--offset) * 4px - 18px)) rotate(calc(var(--offset) * 4deg));
  }
}

.hexdev-chrome-fan--dealing .hexdev-chrome-fan-card {
  animation: hexdev-deal ${DEAL_DURATION_MS}ms var(--hx-ease) backwards;
  /* MINUS how long ago the greeting began (game-selection.ts publishes it on
   * the fan). Every presence broadcast rebuilds these cards, and a rebuilt
   * element restarts its animation at zero, so without this the hand would
   * deal itself again once a second and never finish. A negative delay starts
   * an animation partway through: subtracting the elapsed time puts each
   * rebuilt card exactly where the destroyed one was, which is what makes a
   * hand that is torn down mid-deal look like it was never interrupted. */
  animation-delay: calc(var(--i) * ${DEAL_STAGGER_MS}ms - var(--elapsed, 0ms));
}

/* Not a preference to honour grudgingly: for a vestibular-sensitive player
 * cards flying in is the exact motion that hurts. They get the same fan,
 * already dealt. */
@media (prefers-reduced-motion: reduce) {
  .hexdev-chrome-fan--dealing .hexdev-chrome-fan-card { animation: none; }
}

/* The instruction under the name: gold, small, letterspaced. It is the same
 * marker language the modality labels use, which is deliberate — it tells the
 * player that what follows is a choice, and it does it in the voice this
 * screen already uses for "a choice starts here". */
.hexdev-chrome-instruction {
  margin: 10px 0 0;
  font-size: var(--hx-text-meta);
  font-weight: 700;
  letter-spacing: var(--hx-tracking-label);
  text-transform: uppercase;
  color: var(--hx-gold);
  text-shadow: var(--hx-ink-shadow);
}

.hexdev-chrome-header .hexdev-chrome-tagline {
  margin-inline: auto;
}
/* A rule that ENDS the header rather than divides the screen: it fades out at
 * both ends, so it reads as the edge of the title block and not as a border
 * between two halves. Gold at 40% — visible enough to close the composition,
 * quiet enough that the eye goes to the games and not to a line. */
.hexdev-chrome-header::after {
  content: "";
  display: block;
  width: min(220px, 40%);
  height: 1px;
  margin: var(--hx-space-lg) auto 0;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--hx-gold) 40%, transparent), transparent);
}

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
/* PR-EST: the games grid was flush against the title. A front door needs the
 * heading and the choices to read as two things, and the gap is what does it —
 * --hx-space-xl, one step above the gap BETWEEN cards, so the hierarchy is in
 * the spacing and not only in the type. */
/* THE SAME BAND THE HEADER LIVES IN. .hexdev-chrome-header above is capped
 * at 46rem and centred with an auto margin; this row had neither, so at wide
 * widths a centred hero sat above content that ran the full container. What a
 * reader sees is the mismatch, before they can say what it is.
 *
 * NOT "the same width as the header" -- that renders at its own content's
 * width (341px measured at a 1024px container), which is a measurement and
 * never a target: a card narrower than the title above it would be worse than
 * the sprawl. What the two share is the CAP and the CENTRE. Each then centres
 * its own content inside the one band. */
.hexdev-chrome-games {
  margin-top: var(--hx-space-lg);
  max-width: 46rem;
  margin-inline: auto;
  display: flex;
  flex-direction: column;
  gap: var(--hx-space-lg);
}

@container hexdev-chrome (min-width: 720px) {
  .hexdev-chrome-games {
    display: grid;
    /* BOUNDED, not 1fr. auto-fit collapses the tracks it does not fill,
     * so with 1fr a lone card inherited the entire row -- 960px beside a
     * 341px header. A 22rem ceiling makes one card the same size as one of
     * two, which is also what keeps the screen from re-laying-out the moment
     * a second game ships. justify-content:center is the other half: with
     * bounded tracks the row now has spare space, and without this the cards
     * would pack against its left edge instead of centring in the band. */
    grid-template-columns: repeat(auto-fit, minmax(320px, 22rem));
    justify-content: center;
    /* PR-EST: cards size to their own content instead of stretching to the
     * tallest sibling. A game with one modality was being given the height of
     * a game with two, and the empty half read as something failing to load.
     * Screen one opts back OUT of this below: there, an uneven row would only
     * say one game has not picked its cards yet. */
    align-items: start;
    gap: var(--hx-space-lg);
  }
}

/* A SHELF: a label, and the band of games under it. Screen one only, and only
 * when there is more than one shelf to tell apart -- one shelf renders no
 * wrapper at all (game-list.ts).
 *
 * IT WRAPS THE BAND, IT DOES NOT REPLACE IT. .hexdev-chrome-games above is
 * edited by zero lines by this whole feature, and that is deliberate: at
 * >=720px it is an auto-fit grid of 22rem tracks, so a heading placed INSIDE
 * it becomes a grid ITEM standing beside a card instead of a label over the
 * row. The heading is a sibling of the band, and the wrapper is what makes
 * them share an edge.
 *
 * The 46rem cap is the header's own (see .hexdev-chrome-header) and the
 * band's own, restated here so the LABEL lands on the same left edge as the
 * cards it names. The nested cap on the band inside is then a no-op, which is
 * the point: neither element had to learn about the other. */
.hexdev-chrome-section {
  width: min(46rem, 100%);
  margin-inline: auto;
}
/* THE SHELVES HANG OFF ONE EDGE, and this was found by looking at the render
   rather than by any assertion. .hexdev-chrome-games is shrink-to-fit -- an
   auto cross-axis margin on a flex item turns stretch off -- so a shelf of
   two games came out 728px wide and a shelf of one came out 352px, each
   centred on its own width. Every measurement passed, because each label DID
   sit over its own cards; the two labels simply landed 188px apart and the
   second shelf read as an accidental indent. A definite width is what makes
   them share an edge. The band nested inside is then an ordinary block and
   fills it, so no rule of its own had to change. */
@container hexdev-chrome (min-width: 720px) {
  /* AND THE CARDS START WHERE THEIR LABEL STARTS. The band centres its tracks
     (see its own rule above) because a bandless screen has a centred title
     over it and nothing else to line up with. A shelf label is exactly that
     something else: with one anchored at the row's left edge, a lone card
     centred 192px away from its own name reads as a gap rather than as a
     group. Scoped to a shelf, so the unheaded one-shelf screen keeps
     centring, untouched. */
  .hexdev-chrome-section > .hexdev-chrome-games {
    justify-content: start;
  }
}
/* THE GROUPING IS IN THE SPACING, or it is only in the type -- the same
   argument the header/games gap already makes one tier up. The content column
   is a flex column with a --hx-space-lg gap of its own, so this ADDS to it:
   shelves end up a clear step further apart than the cards inside one. */
.hexdev-chrome-section + .hexdev-chrome-section {
  margin-top: var(--hx-space-lg);
}
/* START-ALIGNED, NOT CENTRED like .hexdev-chrome-title. Centring everything
   turns a lobby into a poster; a shelf label belongs at the edge its own
   cards begin at, which is what makes it read as a label rather than as a
   second title. Still one step below the game names under it, unchanged by
   the vidriera pass below (1.3rem here, --hx-text-heading's 1.35rem there):
   a shelf names a group of games, it is not one.

   PR-VDR (the vidriera pass): weight, size and colour bumped together —
   on a real render (mahjong-front-door-wide/-narrow) the three were one
   defect, not three: "Cartas"/"Fichas" at 700/1.1rem/--hx-felt-ink-soft read
   as a caption stapled to the row, not as the h2 game-list.ts's own DOM
   actually gives it. --hx-felt-ink, not -soft: the soft ink is for copy that
   should stay quiet, and a shelf heading is the opposite of quiet by design.

   A LITERAL 1.3rem, deliberately not --hx-text-title: that token is the
   FELT's too (table-styles.ts's señas signal, match-over score, leave
   title — all captured by the four committed visual baselines), and
   design-token-parity.test.ts requires it identical in both stylesheets.
   Widening it here would have grown three unrelated felt readouts and moved
   a baseline this change has no business touching. */
.hexdev-chrome-section-title {
  margin: 0;
  font-family: var(--gx-font-family, var(--hx-font-display));
  font-size: 1.3rem;
  font-weight: 800;
  letter-spacing: 0.01em;
  text-align: start;
  color: var(--hx-felt-ink);
  text-shadow: var(--hx-ink-shadow);
}
/* THE GAP GETS THE SAME PROMOTION, scoped to the headed case alone: a
   shelf that carries real weight also needs real air between itself and the
   row it names, or the weight reads as a bigger font rather than as a
   separate level. .hexdev-chrome-games's own unheaded default (one tier up)
   stays exactly --hx-space-lg — this is additive to a DIFFERENT selector,
   never a redeclaration of that rule. */
.hexdev-chrome-section-title + .hexdev-chrome-games {
  margin-top: var(--hx-space-xl);
}

@container hexdev-chrome (min-width: 1024px) {
  /* THE ONE THING THIS BLOCK CHANGES: more air around the whole screen when
   * there is room for it. (A second 1024px block exists further down,
   * scoped to screen one's own game-choice cards — a new block on purpose,
   * so this one's own history below, about what NOT to repeat, stays about
   * exactly the rules it still holds.)
   *
   * It used to carry seven more rules -- the header, the fan, the fan's
   * cards, the deal animation and its keyframes, the instruction, the
   * tagline, the header's own rule -- every one of them written out word for
   * word from its base rule above, and therefore changing nothing at all at
   * any width. About a hundred and fifteen lines of override that overrode
   * nothing, left behind by a bad repair.
   *
   * They were not harmless. A rule declared twice drifts: editing the base
   * copy of the deal animation silently did nothing, because the copy down
   * here won on source order. That is how this was found.
   *
   * Cascade note, still true and still the reason this works: identical
   * 0-1-0 specificity to .hexdev-chrome-content's base padding above -- it
   * wins because it is declared LATER in this same stylesheet string, not
   * because of @container nesting. */
  .hexdev-chrome-content {
    padding: var(--hx-space-2xl) var(--hx-space-xl);
  }
}

/* PR8 (WARNING-1/WCR-3 closure): exact match, --hx-text-display-compact. */
/* THE FRONT DOOR, and it used to read as a form label. At
 * --hx-text-display-compact this computed to 21.6px — the same order as the
 * body copy under it — so nothing on the screen said "this is where you
 * arrive". Size is the whole fix; none of the rest of this rule would matter
 * without it.
 *
 * THE SERIF IS A FALLBACK, NEVER AN OVERRIDE. "var(--gx-font-family, ...)"
 * means a tenant that named a font keeps it, exactly as everywhere else in
 * this stylesheet — the display stack only lands when they named none, where
 * the alternative was system-ui at 48px, which is a heading in a vacuum. It
 * is a system stack on purpose: this widget mounts inside somebody else's
 * page and has no business adding a font request they never asked for.
 *
 * PR-VDR (the vidriera pass) REMOVED THE BEVEL. The gradient-clipped,
 * triple-drop-shadow title this rule used to paint read, on a real render
 * (mahjong-front-door-wide/-narrow), as a heading from a more ornamented
 * screen than the flat one under it — cards, shelves and buttons are all
 * flat here, and only the title fought them for attention it did not need,
 * at a size (68px) that left no room to the next size down. Flat --hx-gold
 * and an ordinary text-shadow match that register; --hx-text-display-hero
 * (above) carries the size half of the same argument. */
.hexdev-chrome-title {
  margin: 0;
  font-family: var(--gx-font-family, var(--hx-font-display));
  font-size: var(--hx-text-display-hero);
  font-weight: 800;
  letter-spacing: var(--hx-tracking-hero);
  /* 1.15, not the tighter 1.05 a display line would otherwise want: this
   * rule no longer clips its fill to the glyphs (see the flat colour below,
   * and game-screen.browser.test.ts's "the front-door title is a flat fill,
   * not clipped gold"), so 1.15 is an ordinary comfortable leading, not a
   * height reserved against being cut off. */
  line-height: 1.15;
  color: var(--hx-gold);
  text-shadow: var(--hx-ink-shadow);
}

/* One line under the title, and it earns its place by being the only thing on
 * this screen that is not an instruction. Everything else here tells the
 * player what to do; this says what the place IS.
 *
 * PR-VDR bumped it from --hx-text-body's shared 0.9rem to a literal 1rem —
 * a literal, not a widened token, because that token also sizes every chrome
 * button, the status card and the modality blurb. The real fix was the
 * title SHRINKING (above); this closes the rest of the same "sin escalón
 * intermedio" gap between hero and body copy. */
.hexdev-chrome-tagline {
  margin: 6px 0 0;
  font-size: 1rem;
  line-height: var(--hx-leading);
  color: var(--hx-felt-ink-soft);
  text-shadow: var(--hx-ink-shadow);
  max-width: 46ch;
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

/* SCREEN ONE: a game card is a real button, so it starts by unlearning the
   browser's button AND this file's own. .convite-chrome button, a few
   hundred lines down is (0,1,1) and was winning outright: the card came out
   with the pill radius and the 34px height of an action button. Measured, not
   guessed -- getComputedStyle read back radius=999px on a card that should
   have been 16. Hence the shell class in front of every selector here.
   Original note follows.

   A game card is a real button, so it starts by unlearning the
 browser's button. Everything visual below is the same panel-on-felt
 construction the modality cards use -- the fill is the felt plus a few per
 cent of white and the hairline draws the edge -- because they are the same
 kind of surface and should not read as two. */
.hexdev-chrome-games:has(.hexdev-game-card--choice) {
align-items: stretch;
}

.convite-chrome .hexdev-game-card--choice {
appearance: none;
border: 0;
font: inherit;
color: inherit;
cursor: pointer;
/* EXPLICIT, not inherited. A button carries a user-agent radius that
   appearance:none does not reliably clear, and the first render of this
   screen came out as stadium-shaped pills. The panel radius is the one the
   modality cards already use. */
border-radius: var(--gx-radius, 14px);
/* Centred, and the same shape whatever a game declares: the art on top, the
   name under it, both on the card's own axis. Left-aligned prose is right
   for a blurb somebody reads; a name under a hand of cards is a label. */
align-items: center;
text-align: center;
justify-content: flex-end;
gap: 10px;
padding: 20px 16px 18px;
/* EQUAL HEIGHT ACROSS THE ROW, unlike the modality cards a tier up, which
   deliberately size to their own content. There the difference means
   something -- a game with one modality genuinely has less to show. Here it
   would only mean one game has not chosen its cards yet, which is not a
   fact about the game and should not make its card look unfinished. */
min-height: 172px;
/* PR-VDR (the vidriera pass): CONTRAST — an OVERRIDE of the base
 * .hexdev-game-card panel further down, never an edit to it: that rule also
 * draws every modality card on screen two (game-screen.ts), untouched here.
 *
 * MEASURED: on a real render (game-list-two-wide/-narrow, mahjong-front-
 * door-wide/-narrow) the base panel's ~5.5% white tint and ~7% inset ring
 * read as barely-there against a similarly green felt — an outline, not an
 * object. Doubled the tint, more than doubled the ring; the lift-* shadow
 * trio is unchanged. */
background: rgba(255, 255, 255, 0.11);
box-shadow: var(--hx-lift-edge), var(--hx-lift-contact), var(--hx-lift-ambient), inset 0 0 0 1px rgba(255, 255, 255, 0.16);
}

/* NOTHING TO RESERVE. The rule above reserves the height a hand of faces
   needs, so that a game which "has not chosen its cards yet" does not look
   unfinished beside one that has. That premise held for as long as every
   game in the catalog was a deck of cards.

   THIS USED TO BE ARGUED FROM THE MAHJONG SOLITAIRE, AND THAT ARGUMENT WAS
   WRONG. A previous version of this comment claimed the solitaire "declares
   no lobby art and never will", because its 42 faces are TRANSPARENT symbols
   with no tile body behind them and a lobby card takes image URLs. The
   premise is still true (mahjong-tile-ui's own license record says the
   transparency is deliberate) — but rendered on its own shelf at 172px with
   NOTHING declared, the card came out as a large empty rectangle with a name
   at the foot, which read on a real screenshot as "the art failed to load",
   not as "this game has no art". game-ui-registry.ts's MAHJONG_FAMILY now
   declares real cardArt — three tiles composed from the same tileBodySvg()
   call the board draws with (mahjong-solitaire-ui's card-art.ts) — so that
   card no longer takes this branch at all.

   The branch itself stays, because the premise it protects is still real for
   a DIFFERENT case: a family that lands in the catalog before any of its faces
   are chosen (game-list.scene.test.ts's own "one game with no art at all"
   fixture is exactly this — see that file's docblock).

   The equal-height intent is untouched, because it was always about a ROW:
   the :has() rule further up stretches a band's items, so an art-less card
   standing beside art-bearing ones still matches their height. This only
   stops a card from reserving space for art that is not coming when there is
   nothing beside it to match. */
.convite-chrome .hexdev-game-card--choice:not(:has(.hexdev-game-card-art)) {
min-height: 0;
}

.convite-chrome .hexdev-game-card--choice:hover,
.convite-chrome .hexdev-game-card--choice:focus-visible {
/* Lifted with light, never with a second colour: the same move the panel
   itself is made of, one step further. */
background: color-mix(in srgb, var(--gx-color-surface, #14231d) 88%, #fff);
}

/* The game's own cards, fanned. Same geometry as the door's hand and a
 smaller clamp: three faces inside a list card, where five would stop
 reading as a hand and become a texture. */
.hexdev-game-card-art {
display: flex;
justify-content: center;
align-items: flex-end;
overflow: visible;
/* Pushes the name to the card's foot whether or not there is art above it,
   so a game without faces keeps the same silhouette as one with them. */
flex: 1 1 auto;
min-height: 0;
}

/* PR-VDR: cqw, not vw — table-styles.ts's own seat gutters (FU-4) already
 * argue the general case. This clamp used to scale against the raw browser
 * viewport, the WRONG box for an embedded widget: a narrow embed on a wide
 * host page grew these faces past the card's own room, and the more common
 * shape — a widget filling most of a narrower host — starved them instead,
 * since 5.5vw of a small viewport floored regardless of the CARD's own
 * width. cqw resolves against .convite-chrome's own inline size, the box
 * this fan actually lives in. */
.hexdev-game-card-face {
--mid: calc((var(--n) - 1) / 2);
--offset: calc(var(--i) - var(--mid));
width: clamp(46px, 5.5cqw, 62px);
height: auto;
margin: 0 calc(clamp(46px, 5.5cqw, 62px) * -0.12);
border-radius: 4px;
/* SQUARED, NOT abs(), and z-index the same way -- both copied from the
   door's own fan a few rules up, including its reasons. abs() is recent
   enough that using it would drop the arc on the browsers least likely to
   be tested, and DOM order alone would bury the leftmost face under every
   neighbour: it cost a card there once without ever looking broken. */
transform:
  translateY(calc(var(--offset) * var(--offset) * 1.5px))
  rotate(calc(var(--offset) * 6deg));
z-index: calc(10 - var(--offset) * var(--offset));
box-shadow: var(--hx-lift-contact), var(--hx-lift-ambient);
}

/* PR-VDR: THE ART GROWS HERE. Screen one's game-choice row and screen two's
 * modality row shared one grid rule (720px tier, above) with no tier past
 * it, so a card at 1024px measured the same 352px as at 720px — the extra
 * 300px+ of a real desktop bought nothing but idle felt, and the FACE inside
 * was additionally capped by the vw-not-cqw defect fixed above. Exactly the
 * inversion the product direction named: "en angosto las tarjetas son altas
 * y el arte se ve grande; en ancho la grilla las achata".
 *
 * SCOPED TO :has(.hexdev-game-card--choice), never a repaint of the shared
 * base rules (720px tier grid; the card's own min-height, above): those also
 * draw screen two's modality row, whose own hard-pixel fence
 * (game-screen.browser.test.ts's "the games row shares the header's band")
 * asserts an EXACT 352px at this same tier.
 *
 * PLACED AFTER EVERY RULE IT OVERRIDES, deliberately: the min-height rule
 * above carries the IDENTICAL selector, same (0,2,0) specificity, so a first
 * attempt at this block placed higher in the file lost the tie to SOURCE
 * ORDER and measured 172px regardless of the @container match — the exact
 * scar the 1024px padding block above already carries once.
 *
 * THE BAND'S CAP GROWS TOO (58rem, up from the 46rem it shares with the
 * header) — deliberate, since the header shrank in this same pass and
 * widening it back would undo that. AND SO DOES THE SHELF WRAPPER'S cap,
 * one rule below: .hexdev-chrome-section sizes itself to min(46rem, 100%) —
 * a real WIDTH, not a max-width — and is .hexdev-chrome-games's PARENT, so
 * raising only the band's own max-width left it capped at 736px regardless.
 * A single, unheaded shelf has no such wrapper and never exposed this;
 * found by measuring the SHELVED scene (mahjong-front-door-wide) rather
 * than the unheaded one. */
@container hexdev-chrome (min-width: 1024px) {
  .hexdev-chrome-games:has(.hexdev-game-card--choice) {
    max-width: 58rem;
    grid-template-columns: repeat(auto-fit, minmax(320px, 28rem));
  }
  .hexdev-chrome-section:has(.hexdev-game-card--choice) {
    width: min(58rem, 100%);
  }
  .convite-chrome .hexdev-game-card--choice {
    min-height: 228px;
  }
  .hexdev-game-card-face {
    width: clamp(64px, 8cqw, 100px);
    margin: 0 calc(clamp(64px, 8cqw, 100px) * -0.12);
  }
}

/* The way back out, and it is deliberately quiet: a player who wants it will
 look for it, and one who does not should read the game's name first. */
.convite-chrome .hexdev-chrome-back {
appearance: none;
border: 0;
background: none;
font: inherit;
color: inherit;
opacity: 0.7;
cursor: pointer;
padding: 4px 8px;
margin-bottom: 8px;
align-self: flex-start;
}

.convite-chrome .hexdev-chrome-back:hover,
.convite-chrome .hexdev-chrome-back:focus-visible {
opacity: 1;
}

/* The foot: where the place names itself, next to what it owes. */
.hexdev-chrome-foot {
margin-top: var(--hx-space-lg);
display: flex;
flex-direction: column;
align-items: center;
gap: 6px;
}

.hexdev-chrome-brand {
margin: 0;
font-size: 12px;
letter-spacing: 0.18em;
text-transform: lowercase;
opacity: 0.55;
}

.hexdev-game-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border-radius: var(--gx-radius, 14px);
  /* A PANEL ON THE FELT, not a white card on a page. Lifted with light rather
   * than with a different colour: the fill is the felt plus a few per cent of
   * white, and the hairline is what actually draws the edge. That is how a
   * surface reads as raised without becoming a second surface — and it is the
   * same construction table-styles.ts uses for the scoreboard and call log,
   * which is why the lobby and the table now look like one place. */
  background: rgba(255, 255, 255, 0.055);
  box-shadow: var(--hx-lift-edge), var(--hx-lift-contact), var(--hx-lift-ambient), inset 0 0 0 1px rgba(255, 255, 255, 0.07);
}
/* PR8 (WARNING-1/WCR-3 closure): exact match, --hx-text-title. */
/* The game's own name, one step up (PR-EST). It shared --hx-text-title with
 * the modality lines under it, so a card announced itself in the same voice it
 * used for its options — every line on the card weighed the same and the eye
 * had nowhere to land first. */
/* TWO SELECTORS, BECAUSE THE NAME'S LEVEL MOVES AND ITS VOICE MUST NOT. Under
 * a shelf heading, screen one steps the card name from <h2> to <h3> so the
 * outline reads h1 -> h2 -> h3 (game-list.ts). Styled by TAG alone, that step
 * silently dropped every declaration below — family, size, weight, tracking,
 * colour, ink shadow — and left the browser's own bold 1.17em. Nothing typed,
 * linted or structurally asserted would have said a word; the card simply
 * came out in a different voice.
 *
 * The second selector is SCOPED to .hexdev-chrome-section rather than being a
 * bare ".hexdev-game-card h3", and that scope is load-bearing: screen two's
 * .hexdev-modality-title is ALSO an <h3> inside a .hexdev-game-card, styled
 * by class a few hundred lines down, and a bare tag selector here would
 * repaint it. Shelves exist on screen one only. */
.hexdev-game-card h2,
.hexdev-chrome-section .hexdev-game-card h3 {
  margin: 0;
  font-family: var(--gx-font-family, var(--hx-font-display));
  font-size: var(--hx-text-heading);
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--hx-felt-ink);
  text-shadow: var(--hx-ink-shadow);
}

/* A SEGMENTED SELECTOR, and the segments have to look like one control with
 * a chosen part — not like three more buttons on a screen that already has
 * plenty. So it is a single inset trough with the pressed segment lifted out
 * of it: the depth vocabulary already in use, saying "this one" instead of a
 * colour saying it. The chosen segment is the only one that gets gold.
 */
.hexdev-modality-picker {
  display: inline-flex;
  align-self: flex-start;
  gap: 4px;
  padding: 4px;
  border-radius: var(--gx-radius, var(--hx-radius-pill));
  background: rgba(0, 0, 0, 0.22);
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.4);
}

.convite-chrome .hexdev-modality-option {
  min-height: 34px;
  padding: 6px 12px;
  border: 0;
  border-radius: var(--gx-radius, var(--hx-radius-pill));
  background: transparent;
  box-shadow: none;
  color: var(--hx-felt-ink-soft);
  font-size: var(--hx-text-meta);
  font-weight: 700;
  letter-spacing: var(--hx-tracking-label);
  text-transform: uppercase;
}

.convite-chrome .hexdev-modality-option[aria-pressed="true"] {
  background: rgba(255, 255, 255, 0.10);
  box-shadow: var(--hx-lift-edge), var(--hx-lift-contact);
  color: var(--hx-gold);
  transform: none;
}

/* One line saying what the format is, under its name. --hx-text-body and the
 * soft ink: it is the only prose on the card and it should read like prose,
 * not like another label. */
.hexdev-game-blurb {
  margin: -4px 0 2px;
  font-size: var(--hx-text-body);
  line-height: var(--hx-leading);
  color: var(--hx-felt-ink-soft);
  text-shadow: var(--hx-ink-shadow);
}

.hexdev-modality {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
  padding: 14px;
  border-radius: var(--gx-radius, 10px);
  background: rgba(0, 0, 0, 0.16);
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
/* B14 above explains why every inherited property is named here. PR-EST adds
 * the reason the SIZE changed: "Puntos para ganar: 15" is a section marker,
 * not a sentence, and it appears once per modality — three times on a lobby
 * with two games. Set as a label (small, letterspaced, uppercase, secondary)
 * it stops being read and starts being scanned, which is what a marker is
 * for. The words are untouched: they come from the platform's own labelKey
 * (game-selection.ts's describeModality), and that genericity is deliberate. */
/* VISUALLY GONE, STRUCTURALLY THERE, and only when something else already
 * says it. With a picker above, this heading printed the selected modality a
 * second line under the segment that is already lit — the player reads the
 * same words twice and learns nothing the second time.
 *
 * It stays in the DOM because it is the accessible heading for the block of
 * controls under it (WCAG 1.3.1) and the group's name is built from it. The
 * clip-rect idiom rather than display:none for exactly that reason: hidden
 * from the page, present for a screen reader.
 *
 * Only when a picker is there. A game with ONE modality has no picker, so
 * nothing else names the block and the heading is the only label — which is
 * why this is a sibling selector and not a blanket rule. */
.hexdev-modality-picker + .hexdev-modality .hexdev-modality-title {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.hexdev-modality-title {
  margin: 0;
  font-size: var(--hx-text-label);
  font-weight: 700;
  letter-spacing: var(--hx-tracking-label);
  text-transform: uppercase;
  color: var(--hx-gold);
}
/* ON THE FELT, THE TENANT'S PRIMARY IS THE WRONG COLOUR — this is where that
 * stops being an abstraction. It was painting "2 jugadores esperando" in
 * --gx-color-primary, a colour a tenant picks to read on THEIR page, and on a
 * dark felt the default (#2f6f4f) is dark green on dark green: technically
 * themed, practically invisible.
 *
 * So live presence speaks in the felt's own language. Gold is what this
 * product already uses for "something is happening here" (table-styles.ts's
 * turn badge, the señas control), and it is ours, so no tenant can dim it. */
.hexdev-modality-count {
  font-weight: 700;
  color: var(--hx-gold);
}

/* The cue over a row of controls, and it is deliberately a DIFFERENT REGISTER
 * from .hexdev-modality-title above it. Both were uppercase markers for one
 * revision and the result was two of them stacked with nothing between —
 * hierarchy flattened again, just in small caps this time. So the section gets
 * the marker and the row gets a caption: quiet, sentence case, no tracking.
 * Two labels only read as two things if they are not the same kind of label.
 *
 * Kept rather than deleted, though three buttons under it already say
 * Fácil/Normal/Difícil: it is what tells somebody on a screen reader what
 * those three difficulties are FOR. */
.hexdev-modality-cue {
  font-size: var(--hx-text-meta);
  font-weight: 500;
  /* "Quiet" is a design intention with a FLOOR, and the floor wins. An
   * earlier revision of this had it at 55% of the ink and it measured 3.69:1
   * at 12px — under WCAG 1.4.3's 4.5:1, and 12px is not large text by any
   * reading. On the felt the soft ink clears comfortably; the fence in
   * chrome-contrast.browser.test.ts is what keeps it that way when somebody
   * next wants this a little softer. */
  color: var(--hx-felt-ink-soft);
}

.hexdev-bot-row { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }

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
  /* Same argument as .hexdev-modality-count above: a control sitting on the
   * felt is outlined in the felt's own outline colour, not in a primary a
   * tenant chose for a white page. The tenant still tints it — that is what
   * the color-mix is — but it can only shift the hue, never darken the
   * control into the table. */
  border-color: color-mix(in srgb, var(--gx-color-primary, transparent) 35%, var(--hx-felt-outline));
  color: var(--hx-felt-ink);
  box-shadow: var(--hx-lift-edge), var(--hx-lift-contact);
  transition: background var(--hx-motion-fast) var(--hx-ease), box-shadow var(--hx-motion-fast) var(--hx-ease), transform var(--hx-motion-fast) var(--hx-ease);
}
/* PR-EST: "brightness()" on a TRANSPARENT background changes nothing that can
 * be seen — the default button here has no fill, so the old rule brightened a
 * border and called it feedback. A tint does show, and it is built from the
 * tenant's own primary so it cannot fight a palette this stylesheet has never
 * met. The filter stays for the filled prominent state below, where it was
 * the half that always worked. */
/* Hover LIFTS and press SETTLES — the object moves, the light does not. One
 * pixel up with a deeper ambient shadow, one pixel down with the shadow
 * pulled in. That reads as a thing you can press; a glow reads as a thing
 * that is on. */
.convite-chrome button:hover,
.convite-chrome button:focus-visible {
  background: rgba(255, 255, 255, 0.09);
  transform: translateY(-1px);
  box-shadow: var(--hx-lift-edge), var(--hx-lift-contact), var(--hx-lift-ambient);
}
.convite-chrome button:active {
  transform: translateY(1px);
  box-shadow: var(--hx-lift-edge), 0 1px 2px rgba(0, 0, 0, 0.45);
}
@media (prefers-reduced-motion: reduce) {
  .convite-chrome button:hover,
  .convite-chrome button:focus-visible,
  .convite-chrome button:active {
    transform: none;
  }
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
/* The one filled control on the screen, and it stays filled: prominence is
 * the whole job of this rule. The tenant's accent leads here — this is the
 * place their brand SHOULD show — with gold underneath it, so a tenant that
 * sets none gets the product's own accent rather than a hardcoded yellow that
 * belongs to nobody. */
/* The third value of the same attribute: a one-seat game (game-screen.ts's
   own seat-count gate) offers exactly one control, so that control is the
   prominent one by construction rather than by a count nobody is waiting
   in. Same treatment, same token, no second rule — a solitaire's only
   button must not read as the SECONDARY action on its own card. */
.hexdev-modality[data-prominent="person"] button[data-action="vs-person"],
.hexdev-modality[data-prominent="bot"] button[data-action="vs-bot"],
.hexdev-modality[data-prominent="solo"] button[data-action="play-solo"] {
  background: var(--gx-color-accent, var(--hx-gold));
  border-color: var(--gx-color-accent, var(--hx-gold));
  color: var(--hx-ink);
  /* The halo is the accent's OWN colour, so a tenant that rebrands the CTA
   * rebrands its glow with it — a fixed gold halo under a red button would
   * read as a rendering bug. */
  box-shadow: var(--hx-lift-edge), var(--hx-lift-contact), 0 6px 20px color-mix(in srgb, var(--gx-color-accent, var(--hx-gold)) 30%, transparent);
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

/** Idempotent injection into <head> — safe to call on every render, same
 * discipline as truco-ui's ensureTableStyles. */
export function ensureChromeStyles(doc: Document): void {
  if (doc.getElementById(CHROME_STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = CHROME_STYLE_ID;
  style.textContent = buildChromeStylesheet();
  doc.head.appendChild(style);
}
