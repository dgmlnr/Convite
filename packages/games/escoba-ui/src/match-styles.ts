export const MATCH_STYLE_ID = "hexdev-escoba-match-styles";

/**
 * THE GROUND A LIVE ESCOBA MATCH SITS ON — the felt, and nothing else.
 *
 * WHY IT EXISTS. `createEscobaRenderer` (widget-app's `game-ui-registry.ts`)
 * assigns the match container's className outright, exactly as `truco-ui`'s
 * own `table.ts` does, so the match surface does NOT inherit the shell's
 * `.convite-chrome` felt. Truco never noticed because it paints its own
 * cloth; escoba painted nothing, so a live escoba match rendered on the
 * widget document's bare surface — white, for a tenant that sent no
 * `--gx-color-surface` — while truco's rendered on green. Switching games
 * inside one widget changed the whole background. Found by looking at a
 * rendered scene, not by any assertion.
 *
 * WHY NOT JUST WEAR THE SHELL'S CLASS. Adding `.convite-chrome` alongside
 * this one does put the felt back, and it was tried and rendered first: the
 * table cards came out wrapped in pill-shaped outlines, because
 * `.convite-chrome button` (specificity 0,1,1) styles EVERY descendant
 * button — min-height, pill radius, 9px/18px padding, a border and a lift —
 * and beats a card's own `.hexdev-escoba-card--markable` reset (0,1,0). That
 * stylesheet is the CHROME's: it owns the frame, the lobby and the controls,
 * and says in its own words that a future second game must never need to
 * touch it. A game surface living inside it is an arms race over specificity
 * with a file this package is not allowed to depend on anyway.
 *
 * So escoba does what truco does: its own felt, in its own L1 package.
 *
 * THE TOKENS ARE A THIRD COPY, and that is the deliberate cost of the same
 * constraint `truco-ui` pays. `escoba-ui` is L1 — it may not reach into the
 * app shell — so the handful of felt values it reads are declared here
 * literally. Three literal copies only stay one source of truth if something
 * keeps them honest: `apps/widget-app/src/design-token-parity.test.ts` scans
 * this block alongside `truco-ui`'s `:root` and `chrome-styles.ts`'s
 * `.convite-chrome`, and fails the moment this file drops one of them or
 * drifts a value. `buildMatchStylesheet` is exported from the barrel for
 * exactly that reader, the same way `truco-ui` exports its own builder.
 *
 * That test scans the block below with a regex that cannot tell prose from a
 * declaration, which is why the reasoning is up here and the rule itself
 * carries no token name in a comment.
 *
 * ONLY WHAT THE FELT READS. The cloth trio, the recessed rim and the felt's
 * text colour — five values, not the whole `--hx-*` layer. A copy of fifty
 * tokens this package never reads would be a liability the parity guard
 * would then have to maintain forever.
 *
 * NO TENANT TINT, unlike the chrome's otherwise identical gradient. Design
 * §10 puts the game table deliberately outside the tenant vocabulary — the
 * chrome tints because the chrome IS the tenant's zone — and `truco-ui`'s
 * felt makes the same choice one line for one line.
 */
export function buildMatchStylesheet(): string {
  return `
.hexdev-escoba-match {
  --hx-cloth-lit: #1d6a4d;
  --hx-cloth: #123f2f;
  --hx-cloth-deep: #0d3325;
  --hx-rim: inset 0 0 0 1px rgba(255,255,255,.05), inset 0 2px 12px rgba(0,0,0,.35);
  --hx-felt-text: #f2f2f2;
  box-sizing: border-box;
  /* Fills the widget when the host gives it a height, hugs its content when
   * it does not — the scenes mount an auto-height box on purpose, because
   * the real widget document declares no height on html/body either. */
  min-height: 100%;
  /* Three layers, weave over weave over vignette, byte-identical to the two
   * felts already in this repo: two faint diagonal weaves stop the cloth
   * being a flat fill, and the radial vignette (lit centre, deeper edge)
   * reads as a table under a light rather than as a background. The first
   * version of the chrome's felt reinvented these numbers a shade off, which
   * is exactly how two surfaces end up almost matching. */
  background:
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.014) 0 1px, transparent 1px 6px),
    repeating-linear-gradient(-45deg, rgba(0, 0, 0, 0.030) 0 1px, transparent 1px 6px),
    radial-gradient(ellipse 120% 90% at 50% 42%, var(--hx-cloth-lit), var(--hx-cloth) 55%, var(--hx-cloth-deep) 100%);
  /* AFTER the shorthand, never before it: "background:" resets the colour to
   * transparent, so a longhand declared above it is discarded. It is the
   * fallback a browser that cannot paint a layer above falls back to — a
   * green table, not a white page — and the lightest stop is the honest one
   * to fall back to, since light text on it is the worst case. */
  background-color: var(--hx-cloth-lit);
  box-shadow: var(--hx-rim);
  /* Inherited by every child that sets no colour of its own — the scoreboard,
   * the running sum, the hand-end breakdown. None of them declared one, so
   * before this rule they were all painted in the UA default black, which is
   * what made the bare-white surface survivable and the felt mandatory. */
  color: var(--hx-felt-text);
}
`;
}

/** Injects the stylesheet at most once per document — same idempotence as
 * every other `ensure*` helper in this package. */
export function ensureMatchStyles(doc: Document): void {
  if (doc.getElementById(MATCH_STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = MATCH_STYLE_ID;
  style.textContent = buildMatchStylesheet();
  doc.head.appendChild(style);
}
