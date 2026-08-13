import { DECK_THEME_DEFAULTS } from "@hexdev/spanish-deck-ui";
import { MATCHSTICK_THEME_DEFAULTS } from "./scoreboard.js";

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
  --truco-table-cloth: #123f2f;
  /* --hx-* private token layer (design token-parity, VDS-1): spacing,
   * radii, elevation, type, motion, and private colour, identical to
   * chrome-styles.ts's own .hexdev-gamify-chrome block below (proved by
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
  /* New, unused felt-palette tokens (tasks §3.7 boundary note): PR2 changes
   * --truco-table-cloth's own value above to #123f2f and consumes all four
   * of these together in one vignette gradient. Declaring them here, now,
   * unused, keeps THIS PR a true zero-paint slice -- changing
   * --truco-table-cloth's value itself would repaint the felt before this
   * PR's own "tokens declared, never consumed" claim holds. */
  --truco-cloth-lit: #1d6a4d;
  --truco-cloth-deep: #0d3325;
  --truco-cloth-lane: rgba(0,0,0,.18);
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
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
}
.hexdev-truco-shell-layout > .hexdev-truco-table { flex: 1 1 auto; }

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
  --truco-card-width: 60px;
  /* --hx-felt-gap / --hx-felt-pad (PR3, tasks §3.8): the per-tier scalar
   * pair driving this grid's own gap/padding. Declared HERE, never on :root
   * — design-token-parity.test.ts only scans :root/.hexdev-gamify-chrome,
   * so a felt-only scalar living outside that block cannot trip the parity
   * guard or need a chrome-side twin it has no reason to share. */
  --hx-felt-gap: 8px;
  --hx-felt-pad: 8px;
  /* --hx-band-banner / --hx-band-action / --hx-band-action-total (PR5, tasks
   * §3.8/§9, D-5/D-6, blessed refinement 1 — tasks §1 item 1/§2.2): the two
   * reserved lanes that make the badge/tray axis conflict structurally
   * impossible (the action bar gets its own grid row below the bottom
   * anchor; the banner gets its own padding-top lane on the centre column)
   * instead of patched by repositioning either one. Never on :root — same
   * felt-only-scalar discipline as --hx-felt-gap/--hx-felt-pad above.
   * --hx-band-banner: PR5-T3 MEASUREMENT (real Chromium, real DejaVu-backed
   * font metrics, via a standalone probe/full-mount comparison against
   * renderPendingCallBanner): the design's own <=34px assumption did NOT
   * hold. The common case (level "Truco" + caller "Cantó: Nosotros")
   * measured 46px; the worst realistic case (level "Falta envido" + the same
   * caller) measured 58px. Root cause, not a bug PR5 is scoped to fix (task
   * text: "raise the token value, not the pill's layout"): the pill's
   * absolutely-positioned ancestor (.hexdev-truco-banner-slot) sizes itself
   * shrink-to-fit, which computes an available width narrower than the
   * caller span's own single-line max-content width, so the caller text
   * (and, at the worst-case level label, the level text too) wraps onto a
   * second line inside its own flex item — taller than the design's one-line
   * assumption predicted. Raised to 60px (worst-case 58px + ~2px headroom)
   * so the pill fits without clipping/overlap even at its tallest realistic
   * text combination. --hx-band-action-total: equals --hx-band-action at
   * compact (1 strip, calls+señas share it, tasks §3.8) — the 2v2 two-strip
   * formula only starts at medium (below). */
  --hx-band-banner: 60px;
  --hx-band-action: 40px;
  --hx-band-action-total: var(--hx-band-action);
  position: relative;
  box-sizing: border-box;
  width: 100%;
  /* min-height formula (PR5-T5, tasks §9, design §8.2): the banner lane and
   * the action band are pure constants added to the existing trick-area
   * floor, plus one new grid gap for the new "actions" row. */
  min-height: max(100%, calc((var(--truco-card-width) * 336 / 220) * 3.7 + 32px + var(--hx-band-banner) + var(--hx-band-action-total) + var(--hx-felt-gap)));
  display: grid;
  grid-template-columns: 1fr;
  /* PR5-T1 (tasks §9): the 4th row reserves the action bar's own band, a
   * fixed track (never auto) so the bar can never grow the felt — contents
   * scroll inside it instead (design §7.2). */
  grid-template-rows: auto 1fr auto var(--hx-band-action-total);
  grid-template-areas: "top" "center" "bottom" "actions";
  gap: var(--hx-felt-gap);
  padding: var(--hx-felt-pad);
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
  color: var(--gx-color-on-surface, #f2f2f2);
  overflow: hidden;
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
 * min-height override (stable window height, apply prompt round 5): the
 * 4-seat middle row's own essential need is taller than 2-seat's — the
 * left/right 3-card column reservation (table-styles' own
 * [data-position=left/right] .hexdev-truco-opponent-hand rule) always
 * exceeds the centre column's own trick-area reservation, so it is what
 * actually drives this row's real minimum. */
.hexdev-truco-table[data-seat-count="4"] {
  /* PR5-T5 (tasks §9, design §8.2): the banner term is DELIBERATELY ABSENT
   * here (unlike the 1v1 formula above) — the middle row's essential need is
   * max(3 stacked side cards + gaps, trick + banner lane), and the 3-card
   * column always wins at every tier (compact 3x91.6+8=283 vs
   * 1.7x91.6+40=196; ultra 3x152.7+8=466 vs 260+84=344), so adding the
   * banner term here would over-reserve 40-84px on the seat count that can
   * least afford it. A later card-size change could silently invert this
   * inequality — that is exactly why this comment exists. */
  min-height: max(100%, calc((var(--truco-card-width) * 336 / 220) * 5 + 40px + var(--hx-band-action-total) + var(--hx-felt-gap)));
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
    --truco-card-width: 84px;
    /* Deliberate 2px snap to the --hx-space scale (was 14px under the old
     * @media axis) — covered by table-height-stability's own 700px fence. */
    --hx-felt-gap: 12px;
    --hx-felt-pad: 16px;
    /* PR5-T3/T5 (tasks §3.8/§9): medium-tier band values. --hx-band-banner
     * restores the full three-line pending-call block's own real height
     * (D-6 — the compact one-line pill is compact-only); --hx-band-action is
     * ONE strip's height — --hx-band-action-total below overrides this for
     * 2v2 into the two-strip formula, and, because --hx-band-action-total is
     * itself declared via var(--hx-band-action) (derived, not a fixed
     * literal — same discipline as --hx-play-max's own comment further
     * below), 1v1 automatically keeps its single-strip total at every wider
     * tier without needing its own redeclaration anywhere. */
    --hx-band-banner: 76px;
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
    /* PR5-T5 (tasks §3.8): 2v2 only, from medium onward — two stacked action
     * strips (calls, then señas — design §7.2), not one. Declared ONCE, here
     * — --hx-band-action itself is redeclared at every wider tier below
     * (unscoped, so it applies to 1v1 and 2v2 alike), and because this
     * formula reads --hx-band-action via var() it resolves against
     * whichever value is cascaded for THIS element at used-value time, so it
     * never needs its own redeclaration at wide/ultra. */
    --hx-band-action-total: calc(var(--hx-band-action) * 2 + 4px);
    /* PR5-T3/T7 MEASUREMENT (own zero-overlap "own lane" test finding, not
     * anticipated by tasks §3.8's own per-tier table): 2v2's center grid
     * area is narrower than 1v1's at every tier (the side-seat gutters plus,
     * from 900px on, the log-rail column both eat into it), which — same
     * shrink-to-fit text-wrap mechanism PR5-T3 found at compact — makes the
     * pending-call pill wrap onto MORE lines for 2v2 than for 1v1 at this
     * tier, needing more real height than the shared design-table value
     * (76px) provides. Measured 86px real worst-case at 700px/2v2 (1v1 stays
     * a comfortable 71px here); raised to 94px (~8% headroom, this file's
     * own established convention). This 2v2-only override is MORE specific
     * than the base .hexdev-truco-table rule declaring 76px for everyone
     * else, so it wins regardless of source order.
     *
     * FU-4 RE-MEASURE (94px -> 112px): that 86px measurement was taken
     * against geometry the 414px test viewport had silently masked — under
     * 16vw both gutters floor-clamped to 72px, leaving the center ~500px
     * wide at a 700px container. With honest container-relative gutters
     * (16cqw = 112px per side at 700px) the center narrows to ~420px and
     * the pill wraps to the SAME 101px worst case the wide tier's own
     * comment below already documents — so this lane takes the same 112px
     * (wide-tier precedent, the file's ~8% headroom convention over 101px).
     * In a real full-bleed ~700px browser 16vw and 16cqw are identical, so
     * that 101px-over-94px spill was ALREADY shipping; the vw tracks only
     * hid it from the test environment, never from production. */
    --hx-band-banner: 112px;
  }
  /* PR5-T2 (tasks §9, design §7.2): 2v2 only — the action bar stacks its two
   * strips vertically instead of scrolling one row horizontally; each strip
   * gets a fixed height (one band) with its own horizontal scroller. These
   * three selectors are all MORE specific than their own base-rule
   * counterparts further below (attribute+class beats a bare class), so —
   * unlike the pending-call override that used to live here — source order
   * does not matter for them; specificity alone decides the winner. */
  [data-seat-count="4"] .hexdev-truco-action-bar { flex-direction: column; overflow-x: hidden; }
  [data-seat-count="4"] .hexdev-truco-calls-row,
  [data-seat-count="4"] .hexdev-truco-senas { height: var(--hx-band-action); overflow-x: auto; }
}
@container hexdev-truco-shell (min-width: 900px) {
  .hexdev-truco-table {
    --hx-felt-gap: 16px;
    --hx-felt-pad: 24px;
    /* PR4 (tasks §8/§3.8, D-4/blessed refinement 2 — tasks §1 item 2/§2.1):
     * the call-log rail becomes a real column track at wide/ultra —
     * clamp(min, preferred%, max), never a bare percentage, so it neither
     * collapses on a container that is only barely wide enough nor runs away
     * on an extremely wide one. Declared HERE (on .hexdev-truco-table, inside
     * this @container block), never on :root — design-token-parity.test.ts
     * only scans :root/.hexdev-gamify-chrome, and a felt-only layout
     * constant with no chrome-side twin has no reason to risk tripping that
     * guard (same discipline as --hx-felt-gap/--hx-felt-pad above). */
    --hx-log-rail: clamp(200px, 22%, 280px);
    /* --hx-play-max (tasks §3.8): an INLINE-axis cap only — see its own
     * consumer below — never enters a height-fence formula. Derived from
     * --truco-card-width via calc(), so it automatically tracks whichever
     * tier's card size is in effect on THIS specific element: a custom
     * property's var() reference resolves against the element's own final
     * cascaded value at used-value time, not the value in effect where
     * --hx-play-max itself happened to be declared — so, unlike
     * --hx-log-rail just above (a fixed clamp(), not derived from anything),
     * no separate ultra-tier redeclaration is needed for this one. */
    --hx-play-max: calc(var(--truco-card-width) * 7);
    /* PR5-T3/T5 (tasks §3.8/§9): wide-tier band values. */
    --hx-band-banner: 80px;
    --hx-band-action: 52px;
  }
  /* 1v1 only grows here — the 4-seat felt is already width-constrained by
   * its own side gutters, so 2v2 holds at the medium tier's 84px (no
   * declaration needed: nothing above overrides it for this seat count). */
  .hexdev-truco-table:not([data-seat-count="4"]) { --truco-card-width: 100px; }

  /* PR4-T4 (tasks §8), extended PR5-T1 (tasks §9): the log rail is a real
   * grid column track, in flow, beside the play — structurally what TRZ-1's
   * own "the call-log rail, the felt, and the scoreboard rail each occupy a
   * disjoint horizontal region" scenario needs (tasks §2.1: a rectangle
   * claim, proven by getBoundingClientRect in the test suite, never by DOM
   * parentage). PR5 adds the 4th "log actions" row now that the actions row
   * itself exists — grid STRUCTURE otherwise matches the compact/medium base
   * rules above, with "log" prepended to every row. */
  .hexdev-truco-table {
    grid-template-columns: var(--hx-log-rail) minmax(0, 1fr);
    grid-template-areas: "log top" "log center" "log bottom" "log actions";
  }
  .hexdev-truco-table[data-seat-count="4"] {
    grid-template-columns: var(--hx-log-rail) minmax(72px, 16%) minmax(0, 1fr) minmax(72px, 16%);
    grid-template-areas:
      "log top     top     top"
      "log left    center  right"
      "log bottom  bottom  bottom"
      "log actions actions actions";
    /* PR5-T3/T7 MEASUREMENT (own zero-overlap "own lane" test finding — see
     * the 640px block's own identical-purpose comment above for the full
     * mechanism). At wide the log-rail column reservation narrows 2v2's
     * center area even further than at medium, so the real worst-case grew
     * MORE here, not less: measured 101px (1v1 stays a comfortable 71px at
     * this same width). Raised to 112px (~11% headroom — kept a little
     * wider than the file's usual ~8%, since this value sits closer to its
     * own measured floor than the other bands do). 2v2 at ultra measured
     * only 71px (the felt's own extra ultra-tier width room resolves the
     * wrap this tier and the one below it both hit) — reset back down in
     * the 1280px block below, rather than silently inheriting this 112px
     * forever (D-1: a lane is a fixed, budgeted size, not a worst case that
     * only ever grows). */
    --hx-band-banner: 112px;
  }
  /* FU-1: from wide up the felt grows a log-rail COLUMN, and the popover's
   * containing block is the whole felt — so the compact/medium inset would
   * stretch it across the rail and centre its six signals well to the left of
   * the toggle they belong to. Re-inset to where the "actions" area actually
   * starts: the felt's own padding, plus the rail track, plus the one grid
   * gap between them. 2v2 only in practice (1v1 mounts no picker at all), so
   * the 1v1 play-column cap right below never interacts with this.
   *
   * DISCLOSED IMPRECISION: --hx-log-rail is a clamp() whose middle term is a
   * percentage, and a percentage resolves against the grid's CONTENT box
   * inside grid-template-columns but against the containing block's PADDING
   * box here — bases that differ by exactly 2 x --hx-felt-pad. It cannot
   * matter at any tier this table is tested at (the clamp's own 200px/240px
   * minimum wins on both bases until the felt itself passes ~909px/~1200px of
   * content, which the scoreboard rail keeps it well short of), and where it
   * ever did the popover would sit a bounded ~11-13px off its ideal left
   * edge — never clipped, since the right edge and the felt's own clip box
   * are unaffected.
   *
   * The descendant selector is load-bearing, not decoration: unlike the
   * medium-tier overrides above (attribute+class, so specificity alone
   * decides), this rule's own base counterpart is a BARE class declared LATER
   * in this file, which would win on source order at equal specificity —
   * measured, not assumed: a first draft written as a bare
   * .hexdev-truco-senas-row here had no effect at all at 960px or 1280px.
   * Class+class beats it outright, whatever the order. */
  .hexdev-truco-table .hexdev-truco-senas-row { left: calc(var(--hx-felt-pad) + var(--hx-log-rail) + var(--hx-felt-gap)); }
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
    /* Ultra's own rail width — a distinct clamp(), not derived from
     * --truco-card-width, so (unlike --hx-play-max, declared once at wide
     * above and left alone here) it DOES need its own redeclaration at every
     * tier that changes it. */
    --hx-log-rail: clamp(240px, 20%, 320px);
    /* PR5-T3/T5 (tasks §3.8/§9): ultra-tier band values. */
    --hx-band-banner: 84px;
    --hx-band-action: 56px;
  }
  .hexdev-truco-table:not([data-seat-count="4"]) { --truco-card-width: 108px; }
  /* PR5-T3 MEASUREMENT: resets --hx-band-banner back down to the shared 84px
   * ultra value for 2v2 specifically — without this, the seat-scoped 112px
   * set in the 900px block above would keep cascading forward forever (this
   * selector is MORE specific than the bare .hexdev-truco-table rule just
   * above, which also sets 84px at this same tier, so specificity alone
   * would otherwise keep the stale 112px value pinned here regardless of
   * source order). 2v2 measured 71px at ultra — the felt's own extra
   * ultra-tier width resolves the medium/wide-tier text wrap, so 84px
   * (matching 1v1's own value here) is real headroom again, not a guess. */
  .hexdev-truco-table[data-seat-count="4"] { --truco-card-width: 100px; --hx-band-banner: 84px; }
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
  .hexdev-truco-scoreboard-panel {
    order: 0;
    flex: 0 0 auto;
    width: 168px;
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
  /* PR4-T7 (tasks §8): scoreboard rail width bump — a SHELL-level change. */
  .hexdev-truco-scoreboard-panel { width: 200px; }
}
@container hexdev-truco-shell (min-width: 1280px) {
  /* PR4-T7: ultra's own scoreboard rail width. */
  .hexdev-truco-scoreboard-panel { width: 240px; }
}

.hexdev-truco-anchor { position: relative; display: flex; align-items: center; justify-content: center; gap: 6px; }
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
[data-position="top"] { grid-area: top; align-items: flex-start; flex-wrap: wrap; }
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
  box-shadow: inset 0 0 0 3px var(--gx-color-accent, var(--hx-gold)), 0 0 0 6px rgba(255, 209, 102, 0.28), var(--hx-elev-3);
  border-radius: var(--gx-radius, 12px);
}
.hexdev-truco-turn-badge {
  position: absolute;
  top: -11px;
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
  z-index: 1;
}
[data-position="top"] .hexdev-truco-turn-badge { top: auto; bottom: -11px; }
[data-position="left"] .hexdev-truco-turn-badge,
[data-position="right"] .hexdev-truco-turn-badge {
  top: 50%;
  left: auto;
  right: -6px;
  transform: translate(50%, -50%);
}
[data-position="left"] .hexdev-truco-turn-badge { right: auto; left: -6px; transform: translate(-50%, -50%); }

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
  min-height: calc((var(--truco-card-width) * 336 / 220) * 3 + 4px * 2);
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
.hexdev-truco-trick { position: relative; display: flex; align-items: center; justify-content: center; min-height: calc(var(--truco-card-width) * 336 / 220 * 1.7); width: 100%; }
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
.hexdev-truco-scoreboard-group { display: flex; flex-direction: column; align-items: center; gap: 2px; }
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
 * while a rotated caption spends 13px of width instead. Result: 8+8 padding
 * + two 36.5px rows (rotated Buenas caption is the row's tallest box) + 4px
 * row gap = ~93px, fenced with ~8% headroom by
 * table-height-budget.browser.test.ts's own FU-3 fence.
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
  .hexdev-truco-scoreboard { display: flex; align-items: center; gap: 6px; }
  .hexdev-truco-score-group { flex-direction: row; gap: 3px; }
  /* Reads bottom-to-top — the classic side-label direction: vertical-rl
   * alone would read top-to-bottom, the 180deg turn flips it. transform
   * never moves layout, so the box the flex row sizes stays the same. */
  .hexdev-truco-score-label { writing-mode: vertical-rl; transform: rotate(180deg); }
  .hexdev-truco-score-sticks svg { width: 34px; height: 34px; }
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
  left: 50%;
  transform: translateX(-50%);
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  max-width: 100%;
  /* PR5-T4 (tasks §9, design D-5): the banner's own reserved lane height —
   * paired with .hexdev-truco-center's own padding-top above, which is what
   * actually removes the lane from that column's centering calculation. */
  height: var(--hx-band-banner);
}
/* Change 1: the pending call is the single most important thing on screen
 * while it is open — an opaque, solid-background block in normal document
 * flow (never a modal-style overlay, never anything translucent over the
 * cloth behind it). The data-turn attribute gives "waiting on me" a visibly
 * stronger treatment than "waiting on the opponent", never relying on text alone. */
.hexdev-truco-pending-call:empty { display: none; }
.hexdev-truco-pending-call {
  display: flex;
  /* PR5-T4 (tasks §9, design D-6): compact keeps the language but drops to a
   * one-line pill (level + caller only — the turn line becomes visually
   * hidden below, see .hexdev-truco-pending-call-turn) — it is the same
   * sentence the turn badge already shows on the same screen. Medium+
   * restores the three-line column block (overridden inside the 640px
   * @container block above). */
  flex-direction: row;
  align-items: center;
  gap: 8px;
  padding: 8px 22px;
  border-radius: var(--gx-radius, 12px);
  background: var(--gx-color-primary, #2f6f4f);
  color: var(--gx-color-on-primary, #ffffff);
  /* Elevation (PR2, VDS-4, paint-only): the single most important thing on
   * screen while it is open gets the same depth as a hovered card. */
  box-shadow: var(--hx-elev-3);
  text-align: center;
}
.hexdev-truco-pending-call[data-turn="mine"] {
  background: var(--gx-color-accent, var(--hx-gold));
  color: var(--hx-ink);
  box-shadow: 0 0 0 3px rgba(255, 209, 102, 0.5), var(--hx-elev-3);
}
/* PR8 (WARNING-1 closure): both font-sizes are exact-value matches
 * (1.1rem === --hx-text-title, 0.75rem === --hx-text-meta) -- zero-pixel
 * token swaps, safe even inside the fixed-height banner lane. */
.hexdev-truco-pending-call-level { font-size: var(--hx-text-title); font-weight: 800; text-transform: uppercase; letter-spacing: 0.03em; }
.hexdev-truco-pending-call-caller { font-size: var(--hx-text-meta); }
/* PR5-T4 (tasks §9, design D-6): compact-only, visually hidden but still
 * announced — the exact same clip-path: inset(50%) treatment
 * .hexdev-truco-turn-indicator already uses above. Medium+ restores normal
 * inline flow (the correction block immediately below, per the same
 * cascade-order discipline the PR4 correction established). */
.hexdev-truco-pending-call-turn {
  /* PR8 (WARNING-1 closure): nearest match, --hx-text-meta (0.75rem; was
   * 0.8rem, no exact literal). Safe at both tiers: compact keeps this
   * position: absolute (out of flow); medium+'s position: static
   * override below still nests inside .hexdev-truco-banner-slot, which is
   * itself position: absolute with a fixed height: var(--hx-band-banner)
   * (D-5) — content height changes inside it clip, they never grow the lane
   * or the felt's own measured height. */
  font-size: var(--hx-text-meta);
  font-weight: 700;
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
/* PR5 correction (own cascade-order self-check, same CRITICAL pattern the
 * PR4 correction already fixed once in this file): at equal specificity,
 * the LATER rule in source order wins regardless of @container nesting
 * depth. .hexdev-truco-pending-call and .hexdev-truco-pending-call-turn
 * are both bare-class selectors — the SAME specificity as their own base
 * rules just above — so this medium+ override MUST sit textually AFTER
 * those base rules (it originally lived inside the 640px @container block
 * near the top of the file, BEFORE the base rules, where it would have
 * silently lost every time). Moved here, after the base rules, before ever
 * being relied on by a real test.
 *
 * PR5-T4 (tasks §9, D-6): medium+ restores the three-line pending-call
 * block — row layout and the visually-hidden turn line were compact-only.
 * gap reverts to the original 2px vertical spacing (the base rule's own
 * 8px is for the compact row-pill's level/caller horizontal spacing). */
@container hexdev-truco-shell (min-width: 640px) {
  .hexdev-truco-pending-call { flex-direction: column; gap: 2px; }
  .hexdev-truco-pending-call-turn {
    position: static;
    width: auto;
    height: auto;
    margin: 0;
    padding: 0;
    overflow: visible;
    clip-path: none;
    white-space: normal;
    border: 0;
  }
}

.hexdev-truco-trick-feedback {
  margin: 0;
  min-height: 1.2em;
  text-align: center;
  font-size: 0.85rem;
}
/* Visually hidden, still announced. The per-anchor badge is what a sighted
 * player reads — it says the state and points at the seat — so this line is
 * removed from the visual layout instead of repeating it. Screen readers
 * still get it, and its aria-live means a turn change is spoken rather than
 * silently swapping a badge somewhere on the table. */
.hexdev-truco-turn-indicator {
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
  padding-inline: var(--hx-space-2xs);
  border-radius: var(--gx-radius, var(--hx-radius-md));
  background: var(--truco-cloth-lane);
  box-shadow: var(--hx-relief);
}
.hexdev-truco-action-bar > * { flex: 0 0 auto; }

.hexdev-truco-calls-row { display: flex; flex-direction: column; gap: 6px; align-items: center; align-self: stretch; max-width: 100%; }
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
.hexdev-truco-calls-group { display: flex; flex-wrap: nowrap; overflow-x: auto; gap: 6px; justify-content: center; min-height: 40px; max-width: 100%; }
.hexdev-truco-call {
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
  border: 2px solid var(--gx-color-primary, #2f6f4f);
  color: var(--gx-color-on-surface, #f2f2f2);
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
 * .hexdev-truco-pending-call-turn above — this content mounts inside
 * .hexdev-truco-banner-slot too (design §9.2: mountedHandOutcomeEl
 * "points at handOutcomeBanner inside bannerSlot"), a fixed-height absolute
 * lane, not the felt's own flow. */
.hexdev-truco-hand-outcome-headline { font-size: var(--hx-text-body); text-transform: uppercase; letter-spacing: 0.02em; }
.hexdev-truco-hand-outcome-points { font-size: var(--hx-text-body); opacity: 0.85; }

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
.hexdev-truco-table[data-seat-count="4"] .hexdev-truco-anchor[data-relation="partner"] {
  box-shadow: inset 4px 0 0 0 var(--gx-color-accent, var(--hx-gold));
}
.hexdev-truco-table[data-seat-count="4"] .hexdev-truco-anchor[data-relation="opponent"] {
  box-shadow: inset 4px 0 0 0 rgba(255, 255, 255, 0.35);
}
.hexdev-truco-table[data-seat-count="4"] [data-position="top"].hexdev-truco-anchor[data-relation="partner"] {
  box-shadow: inset 0 -4px 0 0 var(--gx-color-accent, var(--hx-gold));
}
.hexdev-truco-table[data-seat-count="4"] [data-position="top"].hexdev-truco-anchor[data-relation="opponent"] {
  box-shadow: inset 0 -4px 0 0 rgba(255, 255, 255, 0.35);
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
  padding: 1px 6px;
  border-radius: var(--gx-radius, 999px);
  background: rgba(0, 0, 0, 0.4);
  color: var(--gx-color-on-surface, #f2f2f2);
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
  min-height: 40px;
  padding: 6px 16px;
  border: 2px solid var(--gx-color-primary, #2f6f4f);
  border-radius: var(--gx-radius, 999px);
  background: transparent;
  color: var(--gx-color-on-surface, #f2f2f2);
  font-family: inherit;
  font-size: var(--hx-text-body);
  font-weight: 600;
  /* Elevation (PR2, VDS-4, paint-only): the same token .hexdev-truco-call
   * reads, replacing the hardcoded pre-token shadow this rule carried. */
  box-shadow: var(--hx-elev-2);
  cursor: pointer;
}
.hexdev-truco-senas-toggle:hover, .hexdev-truco-senas-toggle:focus-visible { filter: brightness(1.15); }
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
.hexdev-truco-senas { align-self: stretch; max-width: 100%; display: flex; flex-direction: column; align-items: center; }
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
 * slot that renders nothing (.hexdev-truco-pending-call,
 * .hexdev-truco-hand-outcome, .hexdev-truco-match-over) and is REQUIRED here:
 * senas.ts empties this node to close the picker, and an empty out-of-flow
 * box with a background and a shadow would otherwise paint a bare chrome
 * strip over the felt for the whole match. */
.hexdev-truco-senas-row:empty { display: none; }
.hexdev-truco-senas-row {
  position: absolute;
  left: var(--hx-felt-pad);
  right: var(--hx-felt-pad);
  bottom: calc(var(--hx-felt-pad) + var(--hx-band-action-total) + var(--hx-felt-gap));
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
  min-height: 32px;
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

/* The partner's claimed signal -- small, secondary chrome on their own
 * anchor, never on an opponent's (senas.ts's own structural guarantee). */
.hexdev-truco-partner-sena {
  /* PR8 (WARNING-1 closure): exact match, --hx-text-label. */
  font-size: var(--hx-text-label);
  padding: 2px 8px;
  border-radius: var(--gx-radius, 999px);
  background: rgba(0, 0, 0, 0.35);
  color: var(--gx-color-on-surface, #f2f2f2);
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
  grid-area: center;
  position: absolute;
  left: 0;
  bottom: 0;
  max-width: 58%;
  max-height: calc(var(--truco-card-width) * 336 / 220 * 2);
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
    grid-area: log;
    position: static;
  }
}
/* PR8 (WARNING-1 closure): nearest match, --hx-text-label (0.7rem; was
 * 0.6rem, no exact literal). Same call-log height-inertness as the panel's
 * own font-size above. */
.hexdev-truco-call-log-title,
.hexdev-truco-call-log-tantos-title {
  margin: 0;
  font-size: var(--hx-text-label);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  opacity: 0.8;
}
/* The ONLY scroller (design §5.2: the tantos row sits outside this list, so
 * auto-scroll to newest never pushes the tantos row away). flex: 1 1 auto
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
}
.hexdev-truco-call-log-entry,
.hexdev-truco-call-log-tantos-entry {
  display: flex;
  align-items: baseline;
  gap: 4px;
  border-left: 2px solid rgba(255, 255, 255, 0.25);
  padding-left: 4px;
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
`.trim();
}

/** Idempotent injection into `<head>` — safe to call on every render. */
export function ensureTableStyles(doc: Document): void {
  if (doc.getElementById(TABLE_STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = TABLE_STYLE_ID;
  style.textContent = buildTableStylesheet();
  doc.head.appendChild(style);
}
